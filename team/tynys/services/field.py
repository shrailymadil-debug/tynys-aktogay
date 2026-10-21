#!/usr/bin/env python3
"""«Поле»: имитация реального рудника Актогай в ускоренном времени.

Каждый модельный час:
  1. публикует состояние рудника в двойники (MQTT telemetry/<twin> → Ditto);
  2. ждёт уставки от координатора — читает двойник kz.tynys:coordinator из Ditto;
     если координатор не ответил, работает по простому правилу V1 (как АСУ при
     потере связи) и честно пишет это в двойник;
  3. применяет уставки к ФАКТИЧЕСКОЙ погоде и твёрдости руды (модель sim.step);
  4. параллельно считает два «теневых» рудника — V0 (как сейчас) и V1
     (простые правила) — на той же погоде, чтобы экран показывал разницу.
Сценарии what-if приходят только через двойник kz.tynys:scenario.
"""
import copy, datetime as dt, json, logging, math, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from tynys.live import build_env, dumps, state_to_dict
from tynys.sim import init_state, step
from tynys.controllers import V0Traditional, V1Reactive
from tynys.params import P80_MODES
from tynys import physics as ph
from tynys.metrics import grid_adjusted
from tynys.fleet import Fleet, step_fleet, group_view, N_GROUPS
from platform_client import Bus, get_things, prop, wait_ditto

HOUR_S = float(os.environ.get("HOUR_SECONDS", "6"))      # реальных секунд на модельный час
DECIDE_TIMEOUT = float(os.environ.get("DECIDE_TIMEOUT", "4"))
SEED = int(os.environ.get("SIM_SEED", "7"))
log = logging.getLogger("field")


def start_clock(environ=None):
    """Use the same hour index for model weather, controllers and the clock."""
    settings = os.environ if environ is None else environ
    day = int(settings.get("START_DOY", dt.date.today().timetuple().tm_yday))
    hour = int(settings.get("START_HOUR", "9"))
    if not 1 <= day <= 366 or not 0 <= hour <= 23:
        raise ValueError("START_DOY must be 1..366; START_HOUR must be 0..23")
    return day, hour


class Totals:
    def __init__(self):
        self.cu = self.grid = self.co2 = self.curt = self.renew = self.cost = self.feed = self.hours = self.cu_adj = self.co2_adj = 0.0
        self.pile0 = None

    def add(self, p, r, st=None):
        if st is not None:
            if self.pile0 is None:
                self.pile0 = {d: p.pile_cap_t * p.pile_init_frac for d in st.pile}   # все варианты стартуют с init_state
            self.cu_adj = self.cu + r["cu_t"] + sum((st.pile[d] - self.pile0[d]) * p.cu_grade[d] * p.r150[d] for d in st.pile)
        self.cu += r["cu_t"]; self.grid += r["grid"]; self.co2 += r["grid"] * p.grid_co2_t_mwh
        self.curt += r["curtail"]; self.renew += r["renew"] - r["curtail"]; self.cost += r["grid"] * r["price"]
        self.feed += r["feed"]; self.hours += 1
        if st is not None:   # CO₂ с учётом запасов: склады и заряд батарей в сравнении с началом (metrics.grid_adjusted)
            d_pile = sum(st.pile[d] - self.pile0[d] for d in st.pile)
            self.co2_adj = grid_adjusted(p, self.grid, self.feed, d_pile,
                                         st.fleet_e - 0.6 * p.n_trucks * p.truck_batt_mwh,
                                         st.bess_e - 0.5 * p.bess_mwh) * p.grid_co2_t_mwh

    def feats(self):
        return {"cu_t": round(self.cu, 1), "cu_adj_t": round(self.cu_adj, 1), "grid_mwh": round(self.grid, 1), "co2_t": round(self.co2, 1), "co2_adj_t": round(self.co2_adj, 1),
                "curtail_mwh": round(self.curt, 1), "renew_used_mwh": round(self.renew, 1),
                "grid_cost_mkzt": round(self.cost / 1e6, 2), "ore_fed_kt": round(self.feed / 1000, 2),
                "co2_per_t_cu": round(self.co2_adj / self.cu_adj, 3) if self.cu_adj else 0.0}


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s field %(message)s")
    wait_ditto()
    bus = Bus("tynys-field")
    start_doy, start_hour = start_clock()
    events, ev_rev = [], None
    p, env = build_env(events, start_doy, SEED)
    st = {k: init_state(p) for k in ("v2", "v0", "v1")}
    ctl = {"v0": V0Traditional(), "v1": V1Reactive()}
    tot = {k: Totals() for k in st}
    # Fresh inventories at 09:00 by default. No production is invented for
    # hours before startup; all three controllers use this same weather index.
    t, last = start_hour, {}
    fleet = Fleet.from_total(st["v2"].fleet_e)
    while True:
        t_hour0 = time.time()
        if t >= env.sc.n():   # год прошёл — начинаем заново
            t, st, tot = start_hour, {k: init_state(p) for k in st}, {k: Totals() for k in st}
            fleet = Fleet.from_total(st["v2"].fleet_e)
        # --- сценарий из двойника ---
        try:
            sc = get_things(["scenario"])["scenario"]
            rev = prop(sc, "rev", 0)
            if rev != ev_rev:
                events = json.loads(prop(sc, "events", "[]") or "[]")
                p, env = build_env(events, start_doy, SEED)
                ev_rev = rev
                log.info("scenario rev %s: %s", rev, [e["kind"] for e in events])
        except Exception as e:
            log.warning("scenario read failed: %s", e)
        # --- 1. состояние → двойник site, запрос решения ---
        sim_time = dt.datetime(2026, 1, 1) + dt.timedelta(days=start_doy - 1, hours=t)
        bus.send("site", {"sim_hour": t, "sim_time": sim_time.strftime("%Y-%m-%d %H:00"),
                          "start_doy": start_doy, "start_hour": start_hour, "elapsed_hours": int(tot["v2"].hours),
                          "seed": SEED, "scenario_rev": ev_rev or 0,
                          "state_json": dumps(state_to_dict(st["v2"])), **tot["v2"].feats()})
        # Итоги теней и V2 охватывают одни часы: start_hour..t-1.
        for k in ("v0", "v1"):
            bus.send(f"shadow-{k}", {**tot[k].feats(), **last.get(k, {})})
        # --- 2. ждём координатора ---
        dec, source = None, "fallback_v1"
        deadline = time.time() + DECIDE_TIMEOUT
        while time.time() < deadline:
            try:
                c = get_things(["coordinator"])["coordinator"]
                if prop(c, "for_t") == t and prop(c, "scenario_rev") == (ev_rev or 0):
                    dec = {"x": json.loads(prop(c, "x_json")), "charge_mw": float(prop(c, "charge_mw")),
                           "bess_mw": float(prop(c, "bess_mw"))}
                    source = "coordinator"; break
            except Exception:
                pass
            time.sleep(0.25)
        if dec is None:
            dec = V1Reactive().decide(p, env, st["v2"], t)
            log.warning("t=%d: no coordinator decision, V1 fallback", t)
        # --- 3. шаг «правды» и теней ---
        e_before = st["v2"].fleet_e
        rec = step(p, env, st["v2"], t, dec, True)
        step_fleet(p, fleet, e_before, rec, st["v2"].fleet_e)
        tot["v2"].add(p, rec, st["v2"])
        for k in ("v0", "v1"):
            r = step(p, env, st[k], t, ctl[k].decide(p, env, st[k], t), ctl[k].segregated)
            tot[k].add(p, r, st[k])
            last[k] = {"grid_mw": round(r["grid"], 1), "curtail_mw": round(r["curtail"], 1), "feed_tph": round(r["feed"])}
        publish_hour(bus, p, env, st["v2"], rec, t, source, fleet)
        # --- 4. анимация самосвалов до конца часа ---
        sub = 0
        while time.time() - t_hour0 < HOUR_S:
            time.sleep(max(0.0, min(1.0, HOUR_S - (time.time() - t_hour0))))
            sub += 1
            publish_trucks(bus, p, fleet, t + sub / max(HOUR_S, 1))
        t += 1


def publish_hour(bus, p, env, st, r, t, source, fleet):
    feed = max(r["feed"], 1e-6)
    rec_pct = 100 * r["cu_t"] / max(r["feed_cu_t"], 1e-9) if r["feed"] > 0 else 0.0
    bus.send("pit", {"ore_tph": round(r["mine"]), "ore_plan_tph": round(r["mine_plan"]),
                     "hard_frac": round(r["hard_frac"], 3), "spilled_tph": round(r["spilled"], 1)})
    bus.send("plant", {"feed_tph": round(r["feed"]), "feed_soft_tph": round(r["feed_soft"]),
                       "feed_hard_tph": round(r["feed_hard"]), "p80_um": round(r["p80"], 1) if r["feed"] > 0 else 0,
                       "cu_tph": round(r["cu_t"], 2), "mill_mw": round(r["mill_mw"], 1),
                       "decision_source": source})
    for d in ("soft", "hard"):
        bus.send(f"pile-{d}", {"tonnes": round(st.pile[d]), "fill_pct": round(100 * st.pile[d] / p.pile_cap_t, 1),
                               "bwi_est": round(st.bwi_est[d], 2), "bwi_true": round(float(env.bwi_true[d][t]), 2)})
    for l in range(p.n_lines):
        q = r[f"line{l}"]
        bus.send(f"line-{l + 1}", {"feed_tph": round(q), "running": bool(q > 0),
                                   "available": bool(env.line_avail[l, t]), "lock_h": st.line_lock[l],
                                   "load_pct": round(100 * q / p.line_q_nom, 1)})
    bus.send("flotation", {"recovery": round(rec_pct, 2), "cu_tph": round(r["cu_t"], 2),
                           "feed_cu_tph": round(r["feed_cu_t"], 2)})
    bus.send("wind", {"power_mw": round(r["wind"], 1), "capacity_mw": p.wind_mw,
                      "cf_pct": round(100 * r["wind"] / p.wind_mw, 1)})
    bus.send("pv", {"power_mw": round(r["pv"], 1), "capacity_mw": p.pv_mwp})
    bus.send("bess", {"soc": round(100 * st.bess_e / p.bess_mwh, 1), "power_mw": round(r["bess"], 1),
                      "available": bool(env.bess_avail[t])})
    bus.send("substation", {"grid_mw": round(r["grid"], 1), "grid_cap_mw": round(r["grid_cap"], 1),
                            "grid_nominal_mw": p.grid_cap_mw,
                            "price_kzt_mwh": round(r["price"]), "co2_t_h": round(r["grid"] * p.grid_co2_t_mwh, 1),
                            "flex_down_mw": round(r["flex_down_mw"], 1), "flex_down_h": round(r["flex_down_h"], 1)})
    bus.send("energy", {"load_mw": round(r["load"], 1), "renew_mw": round(r["renew"], 1),
                        "curtail_mw": round(r["curtail"], 1), "grid_mw": round(r["grid"], 1),
                        "charge_mw": round(r["charge"], 1), "unserved_mw": round(r["unserved"], 1),
                        "renew_share_pct": round(100 * (r["renew"] - r["curtail"]) / max(r["load"], 1e-6), 1)})
    ch_per = r["charge"] / p.charger_n
    for i in range(1, p.charger_n // 3 + 1):
        bus.send(f"charger-{i}", {"power_mw": round(min(ch_per * 3, 18.0), 1)})
    for i in (1, 2):
        bus.send(f"shovel-{i}", {"state": "digging" if r["mine"] > 50 else "idle",
                                 "rate_tph": round(r["mine"] * (1 + p.strip_ratio) / 2)})
    publish_trucks(bus, p, fleet, t)


def publish_trucks(bus, p, fleet, tf):
    """Заряд, состояние и груз звена — из модели (tynys/fleet.py).
    route_pos — только анимационная фаза рейса для экрана: модель часовая и
    положение самосвала на дороге не считает."""
    for i in range(N_GROUPS):
        phase = (tf * 1.7 + i / N_GROUPS) % 1.0      # АНИМАЦИЯ, не модель
        bus.send(f"truck-{i + 1:02d}", group_view(p, fleet, i, phase))


if __name__ == "__main__":
    main()
