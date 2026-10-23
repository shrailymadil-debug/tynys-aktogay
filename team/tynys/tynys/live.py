"""Связь модели с платформой: сценарий what-if ⇄ события, состояние ⇄ двойники.

И «поле» (field.py), и «мозг» (coordinator.py) строят одну и ту же среду Env
детерминированно из (seed, start_doy, список событий), поэтому прогноз мозга и
«правда» поля согласованы, а события what-if приходят только через двойник
kz.tynys:scenario в Ditto.
"""
import json
from dataclasses import asdict
from .assets import Equipment, equipment_to_dict
from .fleet import Fleet
from .params import aktogay, DOMAINS
from .sim import Scenario, Env, State

DAYS = 365

# Типы событий what-if. dur — длительность (ч), lead — через сколько часов начнётся.
EVENTS = {
    "lull":       {"title": "Штиль на сутки",          "lead": 3, "dur": 24},
    "line_trip":  {"title": "Авария линии 2",          "lead": 0, "dur": 8},
    "kegoc":      {"title": "Запрос KEGOC: −80 МВт",   "lead": 2, "dur": 4},
    "hard_ore":   {"title": "Пошла твёрдая руда",      "lead": 0, "dur": 72},
    "plan_up":    {"title": "План добычи +10 %",       "lead": 0, "dur": 48},
    "bess_fault": {"title": "Отказ накопителя",        "lead": 0, "dur": 12},
    "crusher_fault": {"title": "Отказ дробилки", "lead": 0, "dur": 8},
    "shovel_fault": {"title": "Отказ экскаватора 1", "lead": 0, "dur": 8},
    "conveyor_fault": {"title": "Отказ конвейера питания", "lead": 0, "dur": 4},
    "water_fault": {"title": "Отказ водовода", "lead": 0, "dur": 4},
    "charger_fault": {"title": "Отказ зарядной группы 1", "lead": 0, "dur": 8},
    "crusher_service": {"title": "ТО дробилки", "lead": 2, "dur": 4},
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
            sc.grid_cap[(a, b)] = p.grid_cap_mw - 80.0
        elif k == "hard_ore":
            sc.hard_frac_shift[a] = 0.8
            sc.hard_frac_shift[b] = p.hard_frac_base
        elif k == "plan_up":
            sc.mine_mult[(a, b)] = 1.10
        elif k == "bess_fault":
            sc.bess_down = (a, b)
        equipment = {"crusher_fault": "crusher", "shovel_fault": "shovel-1",
                     "conveyor_fault": "conveyor-feed", "water_fault": "water",
                     "charger_fault": "charger-1", "line_trip": "line-2", "bess_fault": "bess"}
        if k in equipment:
            sc.equipment_down.setdefault(equipment[k], []).append((a, b))
        elif k == "crusher_service":
            sc.equipment_maintenance.setdefault("crusher", []).append((a, b))
    return sc


def build_env(events, start_doy, seed, p=None):
    p = p or aktogay()
    return p, Env(p, scenario_from_events(p, events, start_doy), seed)


def state_to_dict(st: State):
    return {"pile": {k: float(x) for k, x in st.pile.items()}, "fleet_e": float(st.fleet_e), "bess_e": float(st.bess_e),
            "line_on": [bool(x) for x in st.line_on], "line_lock": [int(x) for x in st.line_lock],
            "bwi_est": {k: float(x) for k, x in st.bwi_est.items()},
            "equipment": equipment_to_dict(st), "materials": dict(st.materials),
            "fleet": asdict(st.fleet) if st.fleet else None}


def state_from_dict(d):
    return State(pile={k: float(d["pile"][k]) for k in DOMAINS}, fleet_e=float(d["fleet_e"]),
                 bess_e=float(d["bess_e"]), line_on=[bool(x) for x in d["line_on"]],
                 line_lock=[int(x) for x in d["line_lock"]], bwi_est={k: float(d["bwi_est"][k]) for k in DOMAINS},
                 equipment={k: Equipment(**v) for k, v in d.get("equipment", {}).items()},
                 materials={k: float(v) for k, v in d.get("materials", {}).items()},
                 fleet=Fleet(**d["fleet"]) if d.get("fleet") else None)


def _plain(o):
    """numpy-скаляры → обычные числа Python (json их не знает)."""
    if hasattr(o, "item"):
        return o.item()
    raise TypeError(type(o).__name__)


def dumps(o):
    return json.dumps(o, ensure_ascii=False, separators=(",", ":"), default=_plain)
