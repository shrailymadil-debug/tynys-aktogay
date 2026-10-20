"""Три варианта управления рудником при одинаковом оборудовании и условиях.

V0  «Традиционный»   — постоянная номинальная загрузка, общий склад, фиксированный помол.
V1  «Гибкий без ИИ»  — реактивные правила: разгон мельниц на излишке ВИЭ, плавное
                        снижение при дефиците. Без прогноза, без сортировки руды.
V2  «Тыныс»          — планировщик со скользящим горизонтом (MPC, MILP, 24 ч):
                        прогноз погоды, арбитраж твёрдости, эластичный помол,
                        управление зарядкой флота и накопителем.
Абляции V2 (для оценки вклада каждого механизма) задаются флагами.
"""
import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds
from scipy.sparse import coo_matrix
from .params import Params, DOMAINS, P80_MODES
from . import physics as ph
from . import weather as wx

NG = len(P80_MODES)
G150 = P80_MODES.index(150)


def _empty_x(p):
    return [[[0.0] * NG for _ in DOMAINS] for _ in range(p.n_lines)]


def _line_ok(env, st, l, t):
    return env.line_avail[l, t] and st.line_lock[l] == 0


def _fleet_charge_rule(p, env, st, t):
    """Зарядка «по потребности»: держим флот около 60 % заряда."""
    target = 0.6 * p.n_trucks * p.truck_batt_mwh
    use = env.mine_plan[t] * ph.haul_mwh_per_t_ore(p)
    return float(np.clip((target - st.fleet_e) + use, 0, p.charge_mw_max))


class V0Traditional:
    name = "V0 Традиционный"
    segregated = False

    def decide(self, p, env, st, t):
        x = _empty_x(p)
        for l in range(p.n_lines):
            if _line_ok(env, st, l, t):
                x[l][0][G150] = p.line_q_nom
        return {"x": x, "charge_mw": _fleet_charge_rule(p, env, st, t), "bess_mw": 0.0}


class V1Reactive:
    name = "V1 Гибкий без оптимизации"
    segregated = False

    def decide(self, p, env, st, t):
        charge = _fleet_charge_rule(p, env, st, t)
        renew = env.w["wind_pu"][t] * p.wind_mw + env.w["pv_pu"][t] * p.pv_mwp
        tot = sum(st.pile.values())
        fs = st.pile["soft"] / tot if tot > 0 else 0.5
        e = fs * ph.bond_kwh_t(p, p.bwi["soft"], 150) + (1 - fs) * ph.bond_kwh_t(p, p.bwi["hard"], 150)
        e_t = (e + p.flot_kwh_t) / 1000.0  # МВт·ч/т
        other = p.base_load_mw + p.crush_kwh_t * env.mine_plan[t] / 1000.0 + charge
        lines = [l for l in range(p.n_lines) if _line_ok(env, st, l, t)]
        q_nom = p.line_q_nom * len(lines)
        q_max = min(p.line_q_max, p.line_p_max_mw / (e / 1000.0)) * len(lines)
        bess_dis = min(p.bess_mw, max(0.0, st.bess_e - p.bess_e_min))
        d_nom = other + q_nom * e_t
        surplus = renew - d_nom
        fill = tot / (2 * p.pile_cap_t)
        if surplus > 0 and fill > 0.3:
            q = q_nom + surplus / e_t
        elif renew + env.grid_cap[t] + bess_dis < d_nom:
            q = (renew + env.grid_cap[t] + bess_dis - other) / e_t
        else:
            q = q_nom
        if fill > 0.85:  # склад переполняется — разгоняемся за счёт сети
            q = max(q, min(q_max, (renew + env.grid_cap[t] + bess_dis - other) / e_t))
        if fill < 0.10:
            q = min(q, env.mine_plan[t])
        q = float(np.clip(q, 0, q_max))
        x = _empty_x(p)
        if len(lines) >= 2 and q >= 2 * p.line_q_min:
            for l in lines:
                x[l][0][G150] = q / len(lines)
        elif lines and q >= p.line_q_min:
            x[lines[0]][0][G150] = min(q, q_max / len(lines))
        return {"x": x, "charge_mw": charge, "bess_mw": 0.0}


class _VarIndex:
    def __init__(self):
        self.n = 0
        self.lb, self.ub, self.c, self.integ = [], [], [], []

    def add(self, lb, ub, c=0.0, integ=0):
        i = self.n
        self.n += 1
        self.lb.append(lb); self.ub.append(ub); self.c.append(c); self.integ.append(integ)
        return i


class V2Tynys:
    """Скользящий горизонт: каждый час решается MILP на H часов вперёд, применяется первый шаг."""

    def __init__(self, segregation=True, elastic_grind=True, use_forecast=True, name=None, explain=False, grind_modes=None):
        # grind_modes: допустимые P80 (мкм); «зелёный» режим = не тоньше 150 мкм
        self.grind_modes = grind_modes
        self.explain = explain
        self.last_plan = None
        self.segregated = segregation
        self.elastic_grind = elastic_grind
        self.use_forecast = use_forecast
        self.name = name or "V2 Тыныс"
        self.solve_times = []

    def decide(self, p, env, st, t):
        import time
        H = min(p.mpc_horizon_h, env.sc.n() - t)
        H = max(H, 1)
        # ---- прогнозы ----
        if self.use_forecast:
            wf, pf = wx.forecast(env.w, t, H, env.seed)
            wf = wf * env.wind_mult[np.minimum(np.arange(t, t + H), len(env.wind_mult) - 1)]
        else:  # «наивный» прогноз: текущий час повторяется
            wf = np.full(H, env.w["wind_pu"][t]); pf = np.full(H, env.w["pv_pu"][t])
        renew = wf * p.wind_mw + pf * p.pv_mwp
        gcap = env.known_grid_cap(t, H)
        idx = np.minimum(np.arange(t, t + H), env.sc.n() - 1)
        mplan = env.mine_plan[idx]
        hf = env.hard_frac[idx]
        mpd = {"soft": mplan * (1 - hf), "hard": mplan * hf}
        price = np.array([p.price_kzt_mwh((t + h) % 24) + p.co2_price_kzt_t * p.grid_co2_t_mwh for h in range(H)])
        bwi = st.bwi_est if self.segregated else p.bwi
        grinds = ([g for g in range(NG) if P80_MODES[g] in self.grind_modes] if self.grind_modes else range(NG)) if self.elastic_grind else [G150]
        e = {(d, g): ph.bond_kwh_t(p, bwi[d], P80_MODES[g]) for d in DOMAINS for g in range(NG)}
        R = {(d, g): ph.recovery_inf(p, d, P80_MODES[g]) for d in DOMAINS for g in range(NG)}
        V = p.cu_value_kzt_t
        haul = ph.haul_mwh_per_t_ore(p)
        eta_b = np.sqrt(p.bess_eta_rt)
        val_t = V * np.mean([p.cu_grade[d] * p.r150[d] for d in DOMAINS])  # ценность тонны руды
        # Руда на складе в конце горизонта будет переработана позже: её ценность =
        # ценность тонны − средняя энергия на её помол, с небольшим дисконтом за риск.
        e_avg_cost = np.mean([ph.bond_kwh_t(p, p.bwi[d], 150) + p.flot_kwh_t for d in DOMAINS]) * (p.tariff_kzt_kwh + p.co2_price_kzt_t * p.grid_co2_t_mwh / 1000)
        lamS_end = 0.97 * val_t - e_avg_cost
        lamS, Cspill = 0.3 * val_t, 0.8 * val_t   # lamS — штраф за уход ниже страхового запаса
        # Заряд флота в конце горизонта нужен, чтобы возить руду завтра: нехватка 1 МВт·ч
        # = ~1/haul тонн недобытой руды. Остаток заряда оценивается по цене восполнения.
        lamF = 0.8 * val_t / haul
        lamB = 1.2 * p.tariff_kzt_kwh * 1000
        lamF_end, lamB_end = 1.5 * p.tariff_kzt_kwh * 1000, 0.8 * p.tariff_kzt_kwh * 1000
        Cun = 1e7

        # известная недоступность линий
        avail = np.ones((p.n_lines, H), dtype=bool)
        for l in range(p.n_lines):
            if not env.line_avail[l, t]:
                h = 0
                while h < H and t + h < env.sc.n() and not env.line_avail[l, t + h]:
                    avail[l, h] = False
                    h += 1
            if st.line_lock[l] > 0:
                avail[l, :st.line_lock[l]] = False

        vi = _VarIndex()
        X, ON, SU, CH, BC, BD, GR, CU, UN, MS, S, F, B = ({} for _ in range(13))
        PB = {}
        XO = {}
        # Перегрузка линии выше номинала сокращает время флотации: предельные тонны
        # дают меньше меди. Линеаризация: q·kf(q) между номиналом и максимумом.
        kf_max = ph.kinetic_factor(p, p.line_q_max)
        marg = (p.line_q_max * kf_max - p.line_q_nom) / (p.line_q_max - p.line_q_nom)
        ovl_cost = (1 - marg) * V * np.mean([p.cu_grade[d] * p.r150[d] for d in DOMAINS])
        for h in range(H):
            for l in range(p.n_lines):
                for d in DOMAINS:
                    for g in range(NG):
                        ub = p.line_q_max if (avail[l, h] and g in grinds) else 0.0
                        X[l, d, g, h] = vi.add(0, ub, -V * p.cu_grade[d] * R[d, g])
                ON[l, h] = vi.add(0, 1 if avail[l, h] else 0, 0, 1)
                XO[l, h] = vi.add(0, p.line_q_max - p.line_q_nom, ovl_cost)
                SU[l, h] = vi.add(0, 1, p.restart_cost_kzt)
            CH[h] = vi.add(0, p.charge_mw_max)
            BC[h] = vi.add(0, p.bess_mw if env.bess_avail[min(t + h, env.sc.n() - 1)] else 0)
            BD[h] = vi.add(0, p.bess_mw if env.bess_avail[min(t + h, env.sc.n() - 1)] else 0)
            GR[h] = vi.add(0, gcap[h], price[h])
            CU[h] = vi.add(0, np.inf, 1.0)
            UN[h] = vi.add(0, np.inf, Cun)
            for d in DOMAINS:
                MS[d, h] = vi.add(0, mpd[d][h], Cspill)
                capd = p.pile_cap_t if self.segregated else 2 * p.pile_cap_t
                S[d, h] = vi.add(0, capd)
            F[h] = vi.add(p.fleet_e_min, p.fleet_e_max, -lamF_end if h == H - 1 else 0.0)
            B[h] = vi.add(p.bess_e_min, p.bess_e_max, -lamB_end if h == H - 1 else 0.0)
        devS = {d: vi.add(0, np.inf, lamS) for d in DOMAINS}
        # Вогнутая ценность запаса на конец горизонта: «дыханию» нужен запас в обе
        # стороны, поэтому тонны выше середины склада ценятся меньше (их некуда
        # будет «выдохнуть»).
        mid = 0.5 * p.pile_cap_t  # на домен; для общего склада — суммарно 50 %
        SL = {d: vi.add(0, mid, -lamS_end) for d in DOMAINS}
        SHI = {d: vi.add(0, np.inf, -(0.75 * val_t - e_avg_cost)) for d in DOMAINS}
        devF = vi.add(0, np.inf, lamF)
        devB = vi.add(0, np.inf, lamB)

        rows, cols, vals, lo, hi = [], [], [], [], []
        r = [0]

        def con(terms, l_, u_):
            for j, v in terms:
                rows.append(r[0]); cols.append(j); vals.append(v)
            lo.append(l_); hi.append(u_)
            r[0] += 1

        tot_pile = sum(st.pile.values())
        phi = st.pile["soft"] / tot_pile if tot_pile > 0 else 0.5
        for h in range(H):
            for l in range(p.n_lines):
                xs = [X[l, d, g, h] for d in DOMAINS for g in range(NG)]
                con([(j, 1) for j in xs] + [(ON[l, h], -p.line_q_max)], -np.inf, 0)
                con([(j, -1) for j in xs] + [(ON[l, h], p.line_q_min)], -np.inf, 0)
                con([(j, 1) for j in xs] + [(ON[l, h], -p.line_q_nom), (XO[l, h], -1)], -np.inf, 0)
                con([(X[l, d, g, h], e[d, g] / 1000) for d in DOMAINS for g in range(NG)]
                    + [(ON[l, h], -p.line_p_max_mw)], -np.inf, 0)
                prev = (1.0 if st.line_on[l] else 0.0)
                if h == 0:
                    con([(ON[l, h], 1), (SU[l, h], -1)], -np.inf, prev)
                else:
                    con([(ON[l, h], 1), (ON[l, h - 1], -1), (SU[l, h], -1)], -np.inf, 0)
                if not self.segregated:
                    for g in range(NG):
                        con([(X[l, "soft", g, h], 1 - phi), (X[l, "hard", g, h], -phi)], 0, 0)
            # склады
            for d in DOMAINS:
                terms = [(S[d, h], 1), (MS[d, h], 1)] + [(X[l, d, g, h], 1) for l in range(p.n_lines) for g in range(NG)]
                if h > 0:
                    terms.append((S[d, h - 1], -1))
                    rhs = mpd[d][h]
                else:
                    rhs = mpd[d][h] + st.pile[d]
                con(terms, rhs, rhs)
            if not self.segregated:
                con([(S["soft", h], 1), (S["hard", h], 1)], -np.inf, 2 * p.pile_cap_t)
            # перевозка: самосвалы на зарядке не возят
            mt = mplan[h]
            con([(MS[d, h], -(1 + p.strip_ratio)) for d in DOMAINS] + [(CH[h], p.truck_tph / p.charger_mw)],
                -np.inf, p.n_trucks * p.truck_tph - (1 + p.strip_ratio) * mt)
            # флот
            terms = [(F[h], 1), (CH[h], -p.eta_charge)] + [(MS[d, h], -haul) for d in DOMAINS]
            rhs = -haul * mt
            if h > 0:
                terms.append((F[h - 1], -1))
            else:
                rhs += st.fleet_e
            con(terms, rhs, rhs)
            # накопитель
            terms = [(B[h], 1), (BC[h], -eta_b), (BD[h], 1 / eta_b)]
            rhs = 0.0
            if h > 0:
                terms.append((B[h - 1], -1))
            else:
                rhs = st.bess_e
            con(terms, rhs, rhs)
            # баланс мощности
            terms = [(GR[h], 1), (BD[h], 1), (UN[h], 1), (CH[h], -1), (BC[h], -1), (CU[h], -1)]
            terms += [(X[l, d, g, h], -(e[d, g] + p.flot_kwh_t) / 1000) for l in range(p.n_lines) for d in DOMAINS for g in range(NG)]
            terms += [(MS[d, h], p.crush_kwh_t / 1000) for d in DOMAINS]
            rhs = p.base_load_mw + p.crush_kwh_t * mt / 1000 - renew[h]
            PB[h] = r[0]
            con(terms, rhs, rhs)
        # терминальные цели (запас «дыхания» на конец горизонта)
        Hl = H - 1
        for d in DOMAINS:
            con([(S[d, Hl], 1), (SL[d], -1), (SHI[d], -1)], 0, 0)
        safe = 0.25
        if self.segregated:
            for d in DOMAINS:
                con([(devS[d], 1), (S[d, Hl], 1)], safe * p.pile_cap_t, np.inf)
        else:
            con([(devS["soft"], 1), (S["soft", Hl], 1), (S["hard", Hl], 1)], 2 * safe * p.pile_cap_t, np.inf)
        con([(devF, 1), (F[Hl], 1)], 0.5 * p.n_trucks * p.truck_batt_mwh, np.inf)
        con([(devB, 1), (B[Hl], 1)], 0.5 * p.bess_mwh, np.inf)

        A = coo_matrix((vals, (rows, cols)), shape=(r[0], vi.n)).tocsr()
        t0 = time.time()
        res = milp(c=np.array(vi.c), constraints=LinearConstraint(A, lo, hi),
                   integrality=np.array(vi.integ), bounds=Bounds(vi.lb, vi.ub),
                   options={"time_limit": 10, "mip_rel_gap": 2e-3, "disp": False})
        self.solve_times.append(time.time() - t0)
        x = _empty_x(p)
        if res.x is None:
            # запасной вариант — правило V1
            return V1Reactive().decide(p, env, st, t)
        s = res.x
        for l in range(p.n_lines):
            for di, d in enumerate(DOMAINS):
                for g in range(NG):
                    x[l][di][g] = float(s[X[l, d, g, 0]])
        if self.explain:
            self.last_plan = self._plan(p, s, A, lo, hi, vi, H, X, ON, CH, BD, BC, GR, CU, S, F, B, PB, renew, gcap, price)
        return {"x": x, "charge_mw": float(s[CH[0]]), "bess_mw": float(s[BD[0]] - s[BC[0]])}

    def _plan(self, p, s, A, lo, hi, vi, H, X, ON, CH, BD, BC, GR, CU, S, F, B, PB, renew, gcap, price):
        """План на горизонт + теневая цена энергии (двойственная оценка баланса мощности
        при зафиксированных включениях линий) — «сколько стоит лишний МВт·ч в этот час»."""
        from scipy.optimize import linprog
        lo, hi = np.asarray(lo), np.asarray(hi)
        lb, ub = np.array(vi.lb, float), np.array(vi.ub, float)
        integ = np.array(vi.integ) == 1
        lb[integ] = np.round(s[integ]); ub[integ] = np.round(s[integ])
        eq = np.isclose(lo, hi)
        A = A.tocsr()
        Aub = [];  bub = []
        fin_hi = (~eq) & np.isfinite(hi)
        fin_lo = (~eq) & np.isfinite(lo)
        from scipy.sparse import vstack
        A_ub = vstack([A[fin_hi], -A[fin_lo]]) if (fin_hi.any() or fin_lo.any()) else None
        b_ub = np.concatenate([hi[fin_hi], -lo[fin_lo]]) if A_ub is not None else None
        eq_idx = np.where(eq)[0]
        res = linprog(np.array(vi.c), A_ub=A_ub, b_ub=b_ub, A_eq=A[eq], b_eq=lo[eq],
                      bounds=list(zip(lb, ub)), method="highs")
        shadow = [float("nan")] * H
        if res.status == 0:
            pos = {row: k for k, row in enumerate(eq_idx)}
            for h in range(H):
                # знак: рост правой части (= рост нетто-нагрузки) увеличивает затраты
                shadow[h] = float(res.eqlin.marginals[pos[PB[h]]])
        feed = [sum(s[X[l, d, g, h]] for l in range(p.n_lines) for d in DOMAINS for g in range(NG)) for h in range(H)]
        p80 = [(sum(s[X[l, d, g, h]] * P80_MODES[g] for l in range(p.n_lines) for d in DOMAINS for g in range(NG)) / feed[h]) if feed[h] > 1 else None for h in range(H)]
        hard = [sum(s[X[l, "hard", g, h]] for l in range(p.n_lines) for g in range(NG)) for h in range(H)]
        return {
            "renew_mw": [float(v) for v in renew], "grid_cap_mw": [float(v) for v in gcap],
            "feed_tph": feed, "hard_tph": hard, "p80_um": p80,
            "charge_mw": [float(s[CH[h]]) for h in range(H)],
            "bess_mw": [float(s[BD[h]] - s[BC[h]]) for h in range(H)],
            "grid_mw": [float(s[GR[h]]) for h in range(H)],
            "curtail_mw": [float(s[CU[h]]) for h in range(H)],
            "pile_soft_t": [float(s[S["soft", h]]) for h in range(H)],
            "pile_hard_t": [float(s[S["hard", h]]) for h in range(H)],
            "fleet_mwh": [float(s[F[h]]) for h in range(H)],
            "bess_mwh": [float(s[B[h]]) for h in range(H)],
            "shadow_kzt_mwh": shadow,
            "lines_on": [[int(round(s[ON[l, h]])) for h in range(H)] for l in range(p.n_lines)],
        }
