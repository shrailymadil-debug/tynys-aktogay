"""Звенья электросамосвалов: заряд каждого звена отдельно.

Модель рудника (sim.step) считает энергию парка одним числом st.fleet_e.
Здесь эта энергия раскладывается по 14 звеньям (по n_trucks/14 самосвалов):
- энергия, отданная зарядными станциями за час, достаётся звеньям с самым низким
  зарядом (до максимального заряда звена);
- энергия, израсходованная на рейсы, списывается с остальных звеньев поровну,
  но не ниже минимального заряда;
- остаток расхождения (ограничения модели) раскладывается так, чтобы сумма по
  звеньям в точности равнялась st.fleet_e.
Поэтому заряды звеньев различаются из‑за того, кто стоял на зарядке, а кто возил.
"""
from dataclasses import dataclass, field
from typing import List

N_GROUPS = 14


@dataclass
class Fleet:
    e: List[float]                      # МВт·ч в каждом звене
    charging: List[bool] = field(default_factory=lambda: [False] * N_GROUPS)
    starved: List[bool] = field(default_factory=lambda: [False] * N_GROUPS)
    util: float = 1.0                   # загрузка хода самосвалов, 0..1

    @classmethod
    def from_total(cls, total):
        return cls(e=[total / N_GROUPS] * N_GROUPS)


def group_caps(p):
    k = p.n_trucks / N_GROUPS
    cap = k * p.truck_batt_mwh
    return k, cap, cap * p.fleet_soc_min, cap * p.fleet_soc_max


def step_fleet(p, fl: Fleet, prev_total, rec, new_total):
    """Обновить звенья за модельный час. rec — запись sim.step."""
    k, cap, lo, hi = group_caps(p)
    charged = max(0.0, rec["charge"]) * p.eta_charge * p.dt_h
    consumed = max(0.0, prev_total + charged - new_total)
    per_group_charge = k * p.charger_mw * p.eta_charge * p.dt_h
    max_groups = int(p.charger_n // k)
    # 1) зарядка: сначала самые разряженные звенья. Звено дозаряжается за минуты
    #    (станция 3 × 6 МВт), поэтому за час через станции проходит несколько звеньев;
    #    «на зарядке» на экране — те, кто получил больше всего (не больше числа мест).
    got = [0.0] * N_GROUPS
    left = charged
    for i in sorted(range(N_GROUPS), key=lambda j: fl.e[j]):
        if left <= 1e-9:
            break
        add = min(left, per_group_charge, max(0.0, hi - fl.e[i]))
        fl.e[i] += add; left -= add; got[i] = add
    top = sorted(range(N_GROUPS), key=lambda j: -got[j])[:max_groups]
    fl.charging = [(i in top and got[i] > 0.05 * cap) for i in range(N_GROUPS)]
    # 2) расход на рейсы: звенья, которые не заряжались, возят весь час; заряжавшиеся —
    #    остаток часа. Расход делим пропорционально запасу над минимумом, сначала
    #    между возившими, затем (если их запаса не хватило) — с заряжавшихся.
    fl.starved = [False] * N_GROUPS
    need = consumed
    for group in ([i for i in range(N_GROUPS) if got[i] <= 0], [i for i in range(N_GROUPS) if got[i] > 0]):
        avail = {i: max(0.0, fl.e[i] - lo) for i in group}
        tot = sum(avail.values())
        if need <= 1e-9 or tot <= 1e-9:
            continue
        take_all = min(need, tot)
        for i in group:
            fl.e[i] -= take_all * avail[i] / tot
        need -= take_all
    for i in range(N_GROUPS):
        fl.starved[i] = (not fl.charging[i]) and fl.e[i] <= lo + 0.02 * cap
    # 3) точное сохранение энергии парка (ограничения модели): сначала за счёт запаса
    #    над минимумом / до максимума, и только потом — ниже минимума
    diff = new_total - sum(fl.e)
    for bound in ((lo, hi), (0.0, cap)):
        if abs(diff) <= 1e-9:
            break
        room = [max(0.0, bound[1] - x) for x in fl.e] if diff > 0 else [max(0.0, x - bound[0]) for x in fl.e]
        tot = sum(room)
        if tot <= 1e-12:
            continue
        d = diff if abs(diff) <= tot else tot * (1 if diff > 0 else -1)
        fl.e = [x + d * r / tot for x, r in zip(fl.e, room)]
        diff -= d
    cap_tph = (p.n_trucks - rec["charge"] / p.charger_mw) * p.truck_tph
    fl.util = min(1.0, rec["mine"] * (1 + p.strip_ratio) / max(cap_tph, 1e-6))
    return fl


def group_view(p, fl: Fleet, i, phase):
    """Состояние звена для двойника. phase — только анимационная фаза рейса (0..1)."""
    k, cap, lo, hi = group_caps(p)
    if fl.charging[i]:
        state = "charging"
    elif fl.starved[i]:
        state = "waiting"           # заряд на минимуме — ждёт зарядки
    else:
        state = "loaded" if phase < 0.5 else "empty"
    payload = k * p.truck_payload_t * fl.util if state == "loaded" else 0.0
    return {"state": state, "soc": round(100 * fl.e[i] / cap, 1), "energy_mwh": round(fl.e[i], 3),
            "payload_t": round(payload, 1), "route_pos": round(phase, 3)}
