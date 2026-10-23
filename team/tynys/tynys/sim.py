"""«Истинная» модель рудника: физика, диспетчеризация мощности, склады, флот.

Контроллер (V0/V1/V2) каждый час выдаёт уставки. Модель применяет их к
ФАКТИЧЕСКОЙ погоде и фактической твёрдости руды, которых контроллер точно
не знает. Если мощности не хватает, срабатывает защита: сначала снижается
зарядка самосвалов, затем нагрузка мельниц; линия, опустившаяся ниже
минимума, аварийно отключается.
"""
from dataclasses import dataclass, field, asdict
import math
import numpy as np
from .params import Params, DOMAINS, P80_MODES
from . import physics as ph
from . import weather as wx
from .fleet import Fleet, dispatch, group_view
from .assets import (equipment_state, prepare_equipment, finish_equipment,
                     auxiliary_coefficients, load_coefficients, process_factor,
                     mining_capacity, shovel_for, charger_for, N_GROUPS, N_CHARGER_GROUPS)


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
    bess_down: tuple = ()                              # (t0,t1)

    equipment_down: dict = field(default_factory=dict)  # {asset: [(start, end), ...]}
    equipment_maintenance: dict = field(default_factory=dict)

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

    equipment: dict = field(default_factory=dict)
    materials: dict = field(default_factory=dict)
    fleet: Fleet | None = None


def init_state(p: Params) -> State:
    return State(
        pile={d: p.pile_cap_t * p.pile_init_frac for d in DOMAINS},
        fleet_e=0.6 * p.n_trucks * p.truck_batt_mwh,
        bess_e=0.5 * p.bess_mwh,
        line_on=[True] * p.n_lines,
        line_lock=[0] * p.n_lines,
        bwi_est=dict(p.bwi),
        equipment=equipment_state(p),
        fleet=Fleet.from_total(0.6 * p.n_trucks * p.truck_batt_mwh),
    )


def step(p: Params, env: Env, st: State, t: int, dec: dict, segregated: bool):
    """One hour, with causal equipment, ore/copper/water and power balances."""
    if p.dt_h != 1:
        raise ValueError("The mine model uses one-hour steps (dt_h=1)")
    factors = prepare_equipment(p, env, st, t)
    for l in range(p.n_lines):
        if st.line_lock[l] > 0:
            factors[f"line-{l+1}"] = 0.0
    if st.fleet is None:
        st.fleet = Fleet.from_total(st.fleet_e)  # migration of old snapshots
    if abs(sum(st.fleet.e) - st.fleet_e) > 1e-6:
        raise ValueError("Fleet group energies do not match fleet_e")
    x = np.asarray(dec["x"], dtype=float).copy()
    if x.shape != (p.n_lines, len(DOMAINS), len(P80_MODES)) or not np.isfinite(x).all():
        raise ValueError("Invalid mill setpoints")
    x = np.maximum(x, 0)
    for key in ("charge_mw", "bess_mw"):
        if not math.isfinite(float(dec.get(key, 0))):
            raise ValueError(f"Invalid {key}")
    if not segregated:
        total = sum(st.pile.values())
        for di, d in enumerate(DOMAINS):
            # preserve the requested total before replacing either domain
            if di == 0:
                requested = x.sum(axis=1).copy()
            x[:, di, :] = requested * (st.pile[d] / total if total else 0.5)
    energy = np.array([[ph.bond_kwh_t(p, env.bwi_true[d][t], g) / 1000
                        for g in P80_MODES] for d in DOMAINS])
    downstream = process_factor(factors)
    for l in range(p.n_lines):
        factor = min(factors[f"line-{l+1}"], downstream)
        if st.line_lock[l] > 0:
            factor = 0
        q, mw = x[l].sum(), (x[l] * energy).sum()
        scale = min(1.0, p.line_q_max * factor / q if q else 1,
                    p.line_p_max_mw * factor / mw if mw else 1)
        x[l] *= scale
    # Only opening stock is available to the mills. Today's mined ore enters
    # the piles at hour end; no assumed half-hour feed can create phantom ore.
    for di, d in enumerate(DOMAINS):
        want = x[:, di, :].sum()
        if want > st.pile[d]:
            x[:, di, :] *= st.pile[d] / want
    for l in range(p.n_lines):
        if x[l].sum() < p.line_q_min * .999:
            x[l] = 0

    charge_request = float(np.clip(dec["charge_mw"], 0, p.charge_mw_max))
    requested_charge = charge_request
    hf = float(env.hard_frac[t])
    fractions = {"soft": 1-hf, "hard": hf}
    haul = ph.haul_mwh_per_t_ore(p)
    mine_max = min(float(env.mine_plan[t]), mining_capacity(p, factors))
    mine_max *= min(factors["pit-services"], 1.0)
    mine_power_limit = mine_max
    fixed, mine_coef, feed_coef = load_coefficients(p, factors)

    def flows():
        fed = {d: float(x[:, di, :].sum()) for di, d in enumerate(DOMAINS)}
        if segregated:
            room = min((p.pile_cap_t - st.pile[d] + fed[d]) / fractions[d] for d in DOMAINS)
        else:
            room = 2*p.pile_cap_t - sum(st.pile.values()) + sum(fed.values())
        fleet = dispatch(p, st.fleet, factors, charge_request, min(mine_power_limit, max(0, room)), haul)
        mine, charge = sum(fleet.ore_tph), sum(fleet.charge_mw)
        line_q = x.sum(axis=(1, 2))
        mill = (x * energy).sum(axis=(1, 2))
        cu_lines = [sum(x[l, di, gi] * p.cu_grade[d] * ph.recovery_inf(p, d, g)
                        for di, d in enumerate(DOMAINS) for gi, g in enumerate(P80_MODES))
                    * ph.kinetic_factor(p, line_q[l]) for l in range(p.n_lines)]
        return dict(fed=fed, fleet=fleet, mine=mine, charge=charge,
                    q=float(line_q.sum()), line_q=line_q, mill=mill, cu_lines=cu_lines,
                    load=fixed + mine_coef*mine + feed_coef*line_q.sum() + mill.sum() + charge,
                    room=room)

    wind = float(env.w["wind_pu"][t] * p.wind_mw * factors["wind"])
    pv = float(env.w["pv_pu"][t] * p.pv_mwp * factors["pv"])
    renew = wind + pv
    gcap = float(env.grid_cap[t] * factors["substation"])
    eta = math.sqrt(p.bess_eta_rt)
    bess_ok = factors["bess"] > 0
    dis_max = min(p.bess_mw*factors["bess"], max(0, st.bess_e-p.bess_e_min)*eta)
    chg_max = min(p.bess_mw*factors["bess"], max(0, p.bess_e_max-st.bess_e)/eta)
    bess_set = float(np.clip(dec.get("bess_mw", 0), -chg_max, dis_max))
    f = flows()
    bess_set += min(dis_max-bess_set, max(0, f["load"]-renew-bess_set-gcap))
    tripped = []
    # Recompute all flows after each protection action; reducing charge may
    # remove haulage energy, and reducing mill feed may fill a stockpile.
    for _ in range(20):
        deficit = f["load"] - renew - bess_set - gcap
        if deficit <= 1e-8 or charge_request <= 1e-9:
            break
        charge_request = max(0, min(charge_request, f["charge"]) - deficit)
        f = flows()
    for _ in range(p.n_lines + 2):
        deficit = f["load"] - renew - bess_set - gcap
        if deficit <= 1e-8:
            break
        active = [l for l in range(p.n_lines) if f["line_q"][l] > 0]
        if not active:
            break
        head = {l: (f["mill"][l] + feed_coef*f["line_q"][l]) *
                   max(0, 1-p.line_q_min/f["line_q"][l]) for l in active}
        reducible = sum(head.values())
        if reducible > 1e-8:
            share = min(1, deficit/reducible)
            for l in active:
                x[l] *= 1 - share * max(0, 1-p.line_q_min/f["line_q"][l])
        else:
            l = min(active, key=lambda l: f["line_q"][l])
            x[l] = 0
            tripped.append(l)
        f = flows()
    # If even mining auxiliaries cannot be supplied, stop/reduce extraction.
    deficit = f["load"] - renew - bess_set - gcap
    if deficit > 1e-8:
        mine_power_limit = max(0, f["mine"] - deficit / max(mine_coef, 1e-9))
        f = flows()
    resid = f["load"] - renew - bess_set
    unserved = max(0, resid-gcap)
    if resid < 0:
        add = min(-resid, bess_set+chg_max)
        bess_set -= add
        resid += add
    curtail = max(0, -resid)
    grid = min(gcap, max(0, resid))
    st.bess_e += -bess_set/eta if bess_set >= 0 else -bess_set*eta
    st.fleet = f["fleet"]
    st.fleet_e = sum(st.fleet.e)
    mine, q, fed = f["mine"], f["q"], f["fed"]
    for d in DOMAINS:
        st.pile[d] += mine*fractions[d] - fed[d]
    cu = float(sum(f["cu_lines"]))
    feed_cu = sum(fed[d]*p.cu_grade[d] for d in DOMAINS)
    concentrate = cu / p.concentrate_grade
    tailings = q - concentrate
    waste = mine*p.strip_ratio
    process_water = q*p.process_water_m3_t
    recycle_water = process_water*p.recycle_water_fraction
    fresh_water = process_water-recycle_water
    for key, value in {"waste_t": waste, "tailings_t": tailings, "concentrate_t": concentrate,
                       "tailings_cu_t": feed_cu-cu, "fresh_water_m3": fresh_water,
                       "retained_water_m3": fresh_water}.items():
        st.materials[key] = st.materials.get(key, 0.0) + value
    for di, d in enumerate(DOMAINS):
        if fed[d] > 50 and segregated:
            measured_mwh = float((x[:, di, :] * energy[di]).sum())
            per_bwi = sum(x[l, di, gi] * ph.bond_kwh_t(p, 1., g)/1000
                          for l in range(p.n_lines) for gi, g in enumerate(P80_MODES))
            measured_bwi = measured_mwh/per_bwi * (1+.01*np.random.default_rng(t).standard_normal())
            st.bwi_est[d] = .8*st.bwi_est[d] + .2*float(measured_bwi)
    restarts = 0
    for l in range(p.n_lines):
        on = bool(f["line_q"][l] > 0)
        restarts += int(on and not st.line_on[l])
        st.line_on[l] = on
        st.line_lock[l] = p.trip_lockout_h if l in tripped else max(0, st.line_lock[l]-1)

    assets = {name: {"power_mw": a + b*mine + c*q, "active": a+b*mine+c*q > 0}
              for name, (a, b, c) in auxiliary_coefficients(p, factors).items()}
    for name in ("shovel-1", "shovel-2"):
        ore = sum(st.fleet.ore_tph[i] for i in range(N_GROUPS) if shovel_for(i) == name)
        # Assign actual loading work, including waste, to the responsible shovel.
        assets[name].update(ore_tph=ore, waste_tph=ore*p.strip_ratio, rate_tph=ore*(1+p.strip_ratio),
                            capacity_tph=p.mine_ore_tph*(1+p.strip_ratio)*p.shovel_capacity_factor/2,
                            power_mw=.08*p.auxiliary_nominal_mw*ore/p.mine_ore_tph, active=ore > 0)
    assets["crusher"] = {"throughput_tph": mine, "capacity_tph": p.mine_ore_tph*p.crusher_capacity_factor,
                         "power_mw": p.crush_kwh_t*mine/1000, "active": mine > 0}
    assets["conveyor-crushed"].update(throughput_tph=mine)
    assets["conveyor-feed"].update(throughput_tph=q)
    assets["waste-dump"] = {"inflow_tph": waste, "tonnes": st.materials["waste_t"], "power_mw": 0, "active": waste > 0}
    assets["tailings"].update(inflow_tph=tailings, tonnes=st.materials["tailings_t"],
                              cu_tph=feed_cu-cu, cu_t=st.materials["tailings_cu_t"],
                              retained_water_m3=st.materials["retained_water_m3"])
    assets["concentrate"].update(inflow_tph=concentrate, tonnes=st.materials["concentrate_t"],
                                 cu_tph=cu, grade_pct=100*p.concentrate_grade)
    assets["water"].update(flow_m3_h=process_water, fresh_m3_h=fresh_water,
                           recycle_m3_h=recycle_water, fresh_water_m3=st.materials["fresh_water_m3"])
    for l in range(p.n_lines):
        ql = float(f["line_q"][l])
        assets[f"line-{l+1}"] = {"feed_tph": ql, "power_mw": float(f["mill"][l]),
                                   "mill_mw": float(f["mill"][l]), "running": ql > 0,
                                   "speed_rpm": p.mill_speed_rpm if ql else 0.,
                                   "p80_um": float((x[l]*np.array(P80_MODES)).sum()/ql) if ql else 0,
                                   "cu_tph": float(f["cu_lines"][l]), "lock_h": st.line_lock[l],
                                   "load_pct": 100*ql/p.line_q_nom, "active": ql > 0}
    assets["flotation"] = {"feed_tph": q, "power_mw": p.flot_kwh_t*q/1000,
                            "recovery": 100*cu/feed_cu if feed_cu else 0,
                            "cu_tph": cu, "feed_cu_tph": feed_cu, "active": q > 0}
    for j in range(N_CHARGER_GROUPS):
        name = f"charger-{j+1}"
        power = sum(st.fleet.charge_mw[i] for i in range(N_GROUPS) if charger_for(i) == name)
        assets[name] = {"power_mw": power, "capacity_mw": p.charge_mw_max/N_CHARGER_GROUPS,
                         "groups_served": sum(st.fleet.charge_mw[i] > 0 for i in range(N_GROUPS) if charger_for(i) == name),
                         "active": power > 0}
    for i in range(N_GROUPS):
        assets[f"truck-{i+1:02d}"] = {**group_view(p, st.fleet, i, 0),
                                      "active": st.fleet.ore_tph[i] > 0 or st.fleet.charge_mw[i] > 0}
    assets["wind"] = {"power_mw": wind, "capacity_mw": p.wind_mw,
                        "cf_pct": 100*wind/p.wind_mw if p.wind_mw else 0, "active": wind > 0}
    assets["pv"] = {"power_mw": pv, "capacity_mw": p.pv_mwp, "active": pv > 0}
    assets["bess"] = {"power_mw": bess_set, "soc": 100*st.bess_e/p.bess_mwh if p.bess_mwh else 0,
                        "active": abs(bess_set) > 0}
    assets["substation"] = {"grid_mw": grid, "grid_cap_mw": gcap, "grid_nominal_mw": p.grid_cap_mw,
                              "price_kzt_mwh": p.price_kzt_mwh(t%24), "co2_t_h": grid*p.grid_co2_t_mwh,
                              "active": grid > 0}
    finish_equipment(p, env, st, t, assets, factors)
    for l in range(p.n_lines):
        if st.line_lock[l] > 0:
            assets[f"line-{l+1}"].update(state="lockout", available=False)
    # Keep transport/animation state separate from maintenance state.
    for i in range(N_GROUPS):
        name = f"truck-{i+1:02d}"
        assets[name]["equipment_state"] = assets[name]["state"]
        if factors[name] > 0:
            assets[name]["state"] = group_view(p, st.fleet, i, 0)["state"]
    rec = dict(t=t, hod=t%24, wind=wind, pv=pv, renew=renew, grid=grid, grid_cap=gcap, curtail=curtail,
               bess=bess_set, bess_e=st.bess_e, bess_available=bess_ok, charge=f["charge"],
               shed_charge=max(0, requested_charge-f["charge"]), fleet_e=st.fleet_e,
               mine=mine, mine_plan=float(env.mine_plan[t]), spilled=max(0, mine_max-f["room"]),
               feed=q, feed_soft=fed["soft"], feed_hard=fed["hard"],
               pile_soft=st.pile["soft"], pile_hard=st.pile["hard"], mill_mw=float(f["mill"].sum()),
               load=float(f["load"]), cu_t=cu, feed_cu_t=feed_cu,
               p80=float((x*np.array(P80_MODES)).sum()/q) if q else 0,
               trips=len(tripped), restarts=restarts, unserved=unserved, price=p.price_kzt_mwh(t%24),
               hard_frac=hf, bwi_est_soft=st.bwi_est["soft"], bwi_est_hard=st.bwi_est["hard"],
               waste_tph=waste, tailings_tph=tailings, concentrate_tph=concentrate,
               fresh_water_m3_h=fresh_water, assets=assets, fleet=asdict(st.fleet))
    rec.update({f"line{l}": float(f["line_q"][l]) for l in range(p.n_lines)})
    rec["flex_down_mw"], rec["flex_down_h"] = flexibility(p, st, rec)
    assets["substation"].update(flex_down_mw=rec["flex_down_mw"], flex_down_h=rec["flex_down_h"])
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
    process_kwh_t = 1000*load_coefficients(p)[2]
    e_coarse = ph.bond_kwh_t(p, p.bwi["soft"], max(P80_MODES)) + process_kwh_t
    mills_now = rec["mill_mw"] + process_kwh_t * rec["feed"] / 1000.0
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
