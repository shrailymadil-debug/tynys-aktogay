"""«Истинная» модель рудника: физика, диспетчеризация мощности, склады, флот.

Контроллер (V0/V1/V2) каждый час выдаёт уставки. Модель применяет их к
ФАКТИЧЕСКОЙ погоде и фактической твёрдости руды, которых контроллер точно
не знает. Если мощности не хватает, срабатывает защита: сначала снижается
зарядка самосвалов, затем нагрузка мельниц; линия, опустившаяся ниже
минимума, аварийно отключается.
"""
from dataclasses import dataclass, field
import math
import numpy as np
from .params import Params, DOMAINS, P80_MODES
from . import physics as ph
from . import weather as wx


@dataclass
class Scenario:
    name: str = "base"
    start_doy: int = 15
    days: int = 30
    wind_mult: dict = field(default_factory=dict)      # {(t0,t1): mult}
    grid_cap: dict = field(default_factory=dict)       # {(t0,t1): MW}
    grid_cap_notice_h: int = 24                        # за сколько часов известно об ограничении
    line_down: dict = field(default_factory=dict)      # {line: (t0,t1)}
    hard_frac_shift: dict = field(default_factory=dict)  # {t0: new_base}
    mine_mult: dict = field(default_factory=dict)      # {(t0,t1): mult}
    truck_mult: dict = field(default_factory=dict)     # {(t0,t1): исправная доля самосвалов}
    grade_mult: dict = field(default_factory=dict)     # {(t0,t1): множитель содержания меди}
    tariff_mult: dict = field(default_factory=dict)    # {(t0,t1): множитель тарифа}
    bess_down: tuple = ()                              # (t0,t1)

    def n(self):
        return self.days * 24


class Env:
    """Экзогенные ряды для сценария: погода, план горных работ, ограничения сети."""

    def __init__(self, p: Params, sc: Scenario, seed: int):
        self.p, self.sc, self.seed = p, sc, seed
        n = sc.n()
        self.w = wx.generate(p, sc.start_doy, sc.days, seed)
        mult = np.ones(n)
        for (a, b), m in sc.wind_mult.items():
            mult[a:b] *= m
        self.w["wind_pu"] = self.w["wind_pu"] * mult
        self.wind_mult = mult
        self.grid_cap = np.full(n, p.grid_cap_mw)
        for (a, b), c in sc.grid_cap.items():
            self.grid_cap[a:b] = c
        rng = np.random.default_rng(seed + 7)
        hf = np.empty(n)
        base = p.hard_frac_base
        for t in range(n):
            if t in sc.hard_frac_shift:
                base = sc.hard_frac_shift[t]
            hf[t] = base + p.hard_frac_amp * math.sin(2 * math.pi * t / (p.hard_frac_period_d * 24))
        hf = np.clip(hf + 0.05 * rng.standard_normal(n), 0.05, 0.95)
        self.hard_frac = hf
        mm = np.ones(n)
        for (a, b), m in sc.mine_mult.items():
            mm[a:b] *= m
        self.mine_plan = p.mine_ore_tph * mm
        self.truck_mult = np.ones(n)
        for (a, b), m in sc.truck_mult.items():
            self.truck_mult[a:b] *= m
        self.grade_mult = np.ones(n)
        for (a, b), m in sc.grade_mult.items():
            self.grade_mult[a:b] *= m
        self.tariff_mult = np.ones(n)
        for (a, b), m in sc.tariff_mult.items():
            self.tariff_mult[a:b] *= m
        # фактическая твёрдость: BWi домена × (1 + AR(1)-шум) — контроллеру неизвестна
        self.bwi_true = {}
        for i, d in enumerate(DOMAINS):
            r = np.random.default_rng(seed * 31 + i)
            e = np.zeros(n)
            for t in range(1, n):
                e[t] = p.bwi_noise_phi * e[t - 1] + math.sqrt(1 - p.bwi_noise_phi ** 2) * p.bwi_noise_sd * r.standard_normal()
            self.bwi_true[d] = p.bwi[d] * (1 + e)
        self.line_avail = np.ones((p.n_lines, n), dtype=bool)
        for l, (a, b) in sc.line_down.items():
            self.line_avail[l, a:b] = False
        self.bess_avail = np.ones(n, dtype=bool)
        if sc.bess_down:
            self.bess_avail[sc.bess_down[0]:sc.bess_down[1]] = False

    def known_grid_cap(self, t0, horizon):
        """Что контроллер знает об ограничениях сети: о событии известно заранее
        (за grid_cap_notice_h часов), иначе — номинал."""
        out = np.full(horizon, self.p.grid_cap_mw)
        n = len(self.grid_cap)
        for h in range(horizon):
            t = t0 + h
            if t >= n:
                out[h] = self.grid_cap[-1]
                continue
            if self.grid_cap[t] != self.p.grid_cap_mw and h <= self.sc.grid_cap_notice_h:
                out[h] = self.grid_cap[t]
            elif h == 0:
                out[h] = self.grid_cap[t]
        return out


@dataclass
class State:
    pile: dict            # тонны по доменам; при blended — общий склад хранится в обоих ключах пропорционально
    fleet_e: float        # МВт·ч в батареях самосвалов
    bess_e: float
    line_on: list
    line_lock: list       # часов до снятия блокировки после аварийного отключения
    bwi_est: dict         # оценка твёрдости (виртуальный датчик по мощности мельниц)


def init_state(p: Params) -> State:
    return State(
        pile={d: p.pile_cap_t * p.pile_init_frac for d in DOMAINS},
        fleet_e=0.6 * p.n_trucks * p.truck_batt_mwh,
        bess_e=0.5 * p.bess_mwh,
        line_on=[True] * p.n_lines,
        line_lock=[0] * p.n_lines,
        bwi_est=dict(p.bwi),
    )


def step(p: Params, env: Env, st: State, t: int, dec: dict, segregated: bool):
    """Один час работы рудника. dec: {'x': [l][d][g] т/ч, 'charge_mw', 'bess_mw'(+разряд/−заряд)}."""
    hod = (t + 0) % 24
    rec = {"t": t}
    wind = env.w["wind_pu"][t] * p.wind_mw
    pv = env.w["pv_pu"][t] * p.pv_mwp
    renew = wind + pv
    gcap = env.grid_cap[t]
    bess_ok = env.bess_avail[t]

    # ---------- добыча и перевозка ----------
    haul_e_t = ph.haul_mwh_per_t_ore(p)
    charge_req = float(np.clip(dec["charge_mw"], 0, p.charge_mw_max))
    trucks_hauling = p.n_trucks - charge_req / p.charger_mw
    haul_cap_ore = trucks_hauling * p.truck_tph * env.truck_mult[t] / (1 + p.strip_ratio)
    mine_plan = env.mine_plan[t]
    mine = min(mine_plan, haul_cap_ore)
    # энергия батарей: если не хватает, добыча останавливается пропорционально
    hf = env.hard_frac[t]
    mined = {"soft": mine * (1 - hf), "hard": mine * hf}

    # ---------- питание мельниц (ограничено наличием руды на складе) ----------
    x = [[[0.0] * len(P80_MODES) for _ in DOMAINS] for _ in range(p.n_lines)]
    for l in range(p.n_lines):
        if not env.line_avail[l, t] or st.line_lock[l] > 0:
            continue
        for di in range(len(DOMAINS)):
            for gi in range(len(P80_MODES)):
                x[l][di][gi] = max(0.0, dec["x"][l][di][gi])
    if not segregated:
        # общий склад: состав питания = состав склада (идеальное перемешивание)
        tot_pile = sum(st.pile.values())
        frac = {d: (st.pile[d] / tot_pile if tot_pile > 0 else 0.5) for d in DOMAINS}
        for l in range(p.n_lines):
            for gi in range(len(P80_MODES)):
                tot = sum(x[l][di][gi] for di in range(len(DOMAINS)))
                for di, d in enumerate(DOMAINS):
                    x[l][di][gi] = tot * frac[d]
    for di, d in enumerate(DOMAINS):
        want = sum(x[l][di][gi] for l in range(p.n_lines) for gi in range(len(P80_MODES)))
        have = st.pile[d] + mined[d] * 0.5   # половина часовой добычи успевает пройти
        if want > have and want > 0:
            k = have / want
            for l in range(p.n_lines):
                for gi in range(len(P80_MODES)):
                    x[l][di][gi] *= k

    def mill_mw(l):
        return sum(x[l][di][gi] * ph.bond_kwh_t(p, env.bwi_true[d][t], P80_MODES[gi])
                   for di, d in enumerate(DOMAINS) for gi in range(len(P80_MODES))) / 1000.0

    def line_q(l):
        return sum(x[l][di][gi] for di in range(len(DOMAINS)) for gi in range(len(P80_MODES)))

    # ограничение мощности привода линии
    for l in range(p.n_lines):
        pm = mill_mw(l)
        if pm > p.line_p_max_mw:
            k = p.line_p_max_mw / pm
            for di in range(len(DOMAINS)):
                for gi in range(len(P80_MODES)):
                    x[l][di][gi] *= k
    # линия ниже минимума не работает (контролируемый останов)
    for l in range(p.n_lines):
        if 0 < line_q(l) < p.line_q_min * 0.999:
            for di in range(len(DOMAINS)):
                for gi in range(len(P80_MODES)):
                    x[l][di][gi] = 0.0

    def demand():
        q = sum(line_q(l) for l in range(p.n_lines))
        return (p.base_load_mw + p.crush_kwh_t * mine / 1000.0
                + sum(mill_mw(l) for l in range(p.n_lines)) + p.flot_kwh_t * q / 1000.0)

    # ---------- диспетчеризация мощности ----------
    bess_set = float(dec.get("bess_mw", 0.0)) if bess_ok else 0.0
    eta = math.sqrt(p.bess_eta_rt)
    dis_max = min(p.bess_mw, max(0.0, (st.bess_e - p.bess_e_min) * eta)) if bess_ok else 0.0
    chg_max = min(p.bess_mw, max(0.0, (p.bess_e_max - st.bess_e) / eta)) if bess_ok else 0.0
    bess_set = float(np.clip(bess_set, -chg_max, dis_max))
    charge = charge_req
    load = demand() + charge
    resid = load - renew - bess_set
    shed_charge = 0.0
    tripped = []
    if resid > gcap:
        # 1) добрать из накопителя
        extra = min(dis_max - bess_set, resid - gcap)
        bess_set += extra
        resid -= extra
    if resid > gcap:
        # 2) снизить зарядку самосвалов
        cut = min(charge, resid - gcap)
        charge -= cut
        shed_charge = cut
        resid -= cut
    if resid > gcap:
        # 3) снизить нагрузку мельниц пропорционально; ниже минимума — аварийное отключение
        # Автоматика линий: сначала разгрузка линий до минимума (пропорционально
        # запасу над минимумом), и только если этого мало — отключение одной линии.
        deficit = resid - gcap

        def line_mw(l):
            return mill_mw(l) + p.flot_kwh_t * line_q(l) / 1000.0

        def scale_line(l, k):
            for di in range(len(DOMAINS)):
                for gi in range(len(P80_MODES)):
                    x[l][di][gi] *= k

        on_lines = [l for l in range(p.n_lines) if line_q(l) > 0]
        head = {l: line_mw(l) * (1 - p.line_q_min / line_q(l)) for l in on_lines}
        reducible = sum(head.values())
        if on_lines and deficit <= reducible:
            for l in on_lines:
                q = line_q(l)
                cut_mw = deficit * head[l] / reducible if reducible > 0 else 0.0
                scale_line(l, max(0.0, 1 - cut_mw / line_mw(l)))
        elif on_lines:
            for l in on_lines:
                scale_line(l, p.line_q_min / line_q(l))
            rest = deficit - reducible
            while rest > 1e-6 and on_lines:
                l = min(on_lines, key=line_q)
                rest -= line_mw(l)
                scale_line(l, 0.0)
                tripped.append(l)
                on_lines.remove(l)
        load = demand() + charge
        resid = load - renew - bess_set
    unserved = 0.0
    if resid > gcap:
        unserved = resid - gcap   # теоретически не должно случаться (база < сети)
        resid = gcap
    curtail = 0.0
    if resid < 0:
        # излишек: зарядить накопитель, остальное — ограничение ВИЭ
        add = min(-resid, max(0.0, bess_set + chg_max))
        bess_set -= add
        resid += add
        if resid < 0:
            curtail = -resid
            resid = 0.0
    grid = max(0.0, resid)

    # ---------- обновление состояний ----------
    if bess_set >= 0:
        st.bess_e -= bess_set / eta
    else:
        st.bess_e += -bess_set * eta
    st.bess_e = float(np.clip(st.bess_e, 0, p.bess_mwh))
    # энергия флота: зарядка в течение часа доступна; если после фактической
    # (возможно, урезанной) зарядки батарей не хватает — часть рейсов не выполняется
    fe_new = st.fleet_e + charge * p.eta_charge - mine * haul_e_t
    if fe_new < p.fleet_e_min:
        cut = (p.fleet_e_min - fe_new) / haul_e_t
        cut = min(cut, mine)
        mine -= cut
        for d in DOMAINS:
            mined[d] = mine * (hf if d == "hard" else 1 - hf)
        fe_new = st.fleet_e + charge * p.eta_charge - mine * haul_e_t
    st.fleet_e = float(np.clip(fe_new, 0, p.n_trucks * p.truck_batt_mwh))

    fed = {d: sum(x[l][di][gi] for l in range(p.n_lines) for gi in range(len(P80_MODES)))
           for di, d in enumerate(DOMAINS)}
    spilled = 0.0
    for d in DOMAINS:
        st.pile[d] += mined[d] - fed[d]
        st.pile[d] = max(st.pile[d], 0.0)
    if segregated:
        for d in DOMAINS:
            if st.pile[d] > p.pile_cap_t:
                spilled += st.pile[d] - p.pile_cap_t
                st.pile[d] = p.pile_cap_t
    else:
        tot = sum(st.pile.values())
        cap = 2 * p.pile_cap_t
        if tot > cap:
            spilled = tot - cap
            for d in DOMAINS:
                st.pile[d] *= cap / tot
    mine_eff = mine - spilled  # руда, которую некуда положить, не добывается (простой забоя)

    # медь: R = R∞(P80) · кинетика(нагрузка линии)
    cu = 0.0
    q_tot = 0.0
    e_mill = 0.0
    for l in range(p.n_lines):
        q = line_q(l)
        q_tot += q
        kf = ph.kinetic_factor(p, q)
        for di, d in enumerate(DOMAINS):
            for gi, g in enumerate(P80_MODES):
                if x[l][di][gi] > 0:
                    cu += x[l][di][gi] * p.cu_grade[d] * env.grade_mult[t] * ph.recovery_inf(p, d, g) * kf
        e_mill += mill_mw(l)
    feed_cu = sum(fed[d] * p.cu_grade[d] * env.grade_mult[t] for d in DOMAINS)

    # виртуальный датчик твёрдости: по фактической мощности мельниц уточняем BWi (фильтр)
    for di, d in enumerate(DOMAINS):
        qd = fed[d]
        if qd > 50 and segregated:
            # доля мощности этого домена при известном распределении по P80
            num = sum(x[l][di][gi] * ph.bond_kwh_t(p, env.bwi_true[d][t], P80_MODES[gi])
                      for l in range(p.n_lines) for gi in range(len(P80_MODES)))
            den = sum(x[l][di][gi] * ph.bond_kwh_t(p, 1.0, P80_MODES[gi])
                      for l in range(p.n_lines) for gi in range(len(P80_MODES)))
            meas = num / den * (1 + 0.01 * np.random.default_rng(t).standard_normal())
            st.bwi_est[d] = 0.8 * st.bwi_est[d] + 0.2 * meas

    restarts = 0
    for l in range(p.n_lines):
        on_now = line_q(l) > 0
        if on_now and not st.line_on[l]:
            restarts += 1
        st.line_on[l] = on_now
        st.line_lock[l] = max(0, st.line_lock[l] - 1)
    for l in tripped:
        st.line_lock[l] = p.trip_lockout_h

    p80_avg = (sum(x[l][di][gi] * P80_MODES[gi] for l in range(p.n_lines)
                   for di in range(len(DOMAINS)) for gi in range(len(P80_MODES))) / q_tot) if q_tot > 0 else float("nan")
    rec.update(
        hod=hod, wind=wind, pv=pv, renew=renew, grid=grid, grid_cap=gcap, curtail=curtail,
        bess=bess_set, bess_e=st.bess_e, bess_available=bool(bess_ok), charge=charge, shed_charge=shed_charge,
        fleet_e=st.fleet_e, mine=mine_eff, mine_plan=mine_plan, spilled=spilled,
        feed=q_tot, feed_soft=fed["soft"], feed_hard=fed["hard"],
        pile_soft=st.pile["soft"], pile_hard=st.pile["hard"],
        mill_mw=e_mill, load=demand() + charge, cu_t=cu, feed_cu_t=feed_cu,
        p80=p80_avg, trips=len(tripped), restarts=restarts, unserved=unserved,
        price=p.price_kzt_mwh(hod) * env.tariff_mult[t], tariff_mult=env.tariff_mult[t],
        grade_mult=env.grade_mult[t], truck_availability=env.truck_mult[t], hard_frac=env.hard_frac[t],
        line0=line_q(0), line1=line_q(1) if p.n_lines > 1 else 0.0,
        bwi_est_soft=st.bwi_est["soft"], bwi_est_hard=st.bwi_est["hard"],
    )
    rec["flex_down_mw"], rec["flex_down_h"] = flexibility(p, st, rec)
    return rec


def flexibility(p: Params, st: State, rec):
    """«Тыныс‑резерв»: на сколько МВт рудник может снизить потребление из сети
    и сколько часов удержать это снижение целиком, не теряя добычу и не
    останавливая мельницы.

    Снижение = зарядка самосвалов + разряд накопителя + сброс мельниц до минимума
    (при грубом помоле). Длительность — минимум из трёх запасов:
      h_fleet — сколько часов самосвалы возят руду без зарядки;
      h_pile  — сколько часов склады принимают добытую, но не переработанную руду;
      h_bess  — сколько часов накопитель держит свою долю разряда.
    Верхняя граница — 48 ч.
    """
    active = sum(1 for k in ("line0", "line1") if rec.get(k, 0) > 0)
    e_coarse = ph.bond_kwh_t(p, p.bwi["soft"], max(P80_MODES)) + p.flot_kwh_t
    mills_now = rec["mill_mw"] + p.flot_kwh_t * rec["feed"] / 1000.0
    mills_to_min = max(0.0, mills_now - active * p.line_q_min * e_coarse / 1000.0)
    eta = math.sqrt(p.bess_eta_rt)
    bess_available = rec.get("bess_available", True)
    bess_usable = max(0.0, st.bess_e - p.bess_e_min) * eta if bess_available else 0.0
    bess_dis = min(p.bess_mw, bess_usable)
    down_mw = rec["charge"] + bess_dis + mills_to_min
    haul_e = ph.haul_mwh_per_t_ore(p) * max(rec["mine"], 1.0)
    h_fleet = max(0.0, st.fleet_e - p.fleet_e_min) / max(haul_e, 1e-6)
    free = 2 * p.pile_cap_t - (st.pile["soft"] + st.pile["hard"])
    surplus_rate = max(1.0, rec["mine"] - p.n_lines * p.line_q_min)
    h_pile = free / surplus_rate
    h_bess = bess_usable / bess_dis if bess_dis > 0 else 48.0
    # Это мгновенная оценка, не обещание: совместно заявленная мощность
    # заканчивается, когда исчерпан хотя бы один из использованных резервов.
    return down_mw, float(min(h_fleet if rec["charge"] > 0 else 48.0, h_pile, h_bess, 48.0))


def run(p: Params, sc: Scenario, controller, seed: int):
    env = Env(p, sc, seed)
    st = init_state(p)
    recs = []
    for t in range(sc.n()):
        dec = controller.decide(p, env, st, t)
        recs.append(step(p, env, st, t, dec, controller.segregated))
    return recs
