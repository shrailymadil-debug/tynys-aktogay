"""Связь модели с платформой: сценарий what-if ⇄ события, состояние ⇄ двойники.

И «поле» (field.py), и «мозг» (coordinator.py) строят одну и ту же среду Env
детерминированно из (seed, start_doy, список событий), поэтому прогноз мозга и
«правда» поля согласованы, а события what-if приходят только через двойник
kz.tynys:scenario в Ditto.
"""
import json
from .params import aktogay, DOMAINS
from .sim import Scenario, Env, State

DAYS = 365

# Типы событий what-if. dur — длительность (ч), lead — через сколько часов начнётся.
EVENTS = {
    "lull":       {"title": "Штиль на сутки",          "lead": 3, "dur": 24},
    "line_trip":  {"title": "Авария линии 2",          "lead": 0, "dur": 8},
    "kegoc":      {"title": "Запрос KEGOC: −60 МВт",   "lead": 2, "dur": 4},
    "hard_ore":   {"title": "Пошла твёрдая руда",      "lead": 0, "dur": 72},
    "plan_up":    {"title": "План добычи +10 %",       "lead": 0, "dur": 48},
    "bess_fault": {"title": "Отказ накопителя",        "lead": 0, "dur": 12},
}


def scenario_from_events(p, events, start_doy):
    sc = Scenario(name="live", start_doy=start_doy, days=DAYS)
    for ev in events:
        k, a = ev["kind"], int(ev["t0"])
        b = a + int(ev.get("dur", EVENTS[k]["dur"]))
        if k == "lull":
            sc.wind_mult[(a, b)] = 0.08
        elif k == "line_trip":
            sc.line_down[1] = (a, b)
        elif k == "kegoc":
            sc.grid_cap[(a, b)] = p.grid_cap_mw - 60.0
        elif k == "hard_ore":
            sc.hard_frac_shift[a] = 0.8
            sc.hard_frac_shift[b] = p.hard_frac_base
        elif k == "plan_up":
            sc.mine_mult[(a, b)] = 1.10
        elif k == "bess_fault":
            sc.bess_down = (a, b)
    return sc


def build_env(events, start_doy, seed, p=None):
    p = p or aktogay()
    return p, Env(p, scenario_from_events(p, events, start_doy), seed)


def state_to_dict(st: State):
    return {"pile": st.pile, "fleet_e": st.fleet_e, "bess_e": st.bess_e,
            "line_on": st.line_on, "line_lock": st.line_lock, "bwi_est": st.bwi_est}


def state_from_dict(d):
    return State(pile={k: float(d["pile"][k]) for k in DOMAINS}, fleet_e=float(d["fleet_e"]),
                 bess_e=float(d["bess_e"]), line_on=[bool(x) for x in d["line_on"]],
                 line_lock=[int(x) for x in d["line_lock"]], bwi_est={k: float(d["bwi_est"][k]) for k in DOMAINS})


def dumps(o):
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"))
