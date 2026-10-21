"""«Тыныс‑резерв» по сезонам: распределение flex_down_mw и flex_down_h.
Координатор V2 (цель «медь», как на стенде по умолчанию), параметры aktogay(),
реальная погода 2024, 4 сезона × 14 суток. Результат — data/flex.csv.
Запуск: PYTHONPATH=. python flex_stats.py"""
import math
import pandas as pd
from tynys.params import aktogay
from tynys.sim import Scenario, Env, init_state, step
from tynys.controllers import V2Tynys
from tynys import physics as ph

SEASONS = {15: "зима (с 15 янв)", 105: "весна (с 15 апр)", 196: "лето (с 15 июл)", 288: "осень (с 15 окт)"}
p = aktogay()
frames = []
for doy, name in SEASONS.items():
    env, st, c, recs = Env(p, Scenario(start_doy=doy, days=14), 7), init_state(p), V2Tynys(), []
    for t in range(14 * 24):
        r = step(p, env, st, t, c.decide(p, env, st, t), True)
        # какой запас ограничил длительность (те же формулы, что в sim.flexibility)
        bess_usable = (max(0.0, st.bess_e - p.bess_e_min) * math.sqrt(p.bess_eta_rt)
                       if r.get("bess_available", True) else 0.0)
        bess_dis = min(p.bess_mw, bess_usable)
        h_fleet = max(0.0, st.fleet_e - p.fleet_e_min) / max(
            ph.haul_mwh_per_t_ore(p) * max(r["mine"], 1.0), 1e-6)
        h = {"самосвалы": h_fleet if r["charge"] > 0 else 48.0,
             "склады": (2 * p.pile_cap_t - sum(st.pile.values())) / max(1.0, r["mine"] - p.n_lines * p.line_q_min),
             "накопитель": bess_usable / bess_dis if bess_dis > 0 else 48.0, "предел 48 ч": 48.0}
        if not math.isclose(min(h.values()), r["flex_down_h"], rel_tol=1e-10, abs_tol=1e-10):
            raise AssertionError("Расчёт ограничивающего запаса разошёлся с sim.flexibility")
        r["limit"] = min(h, key=h.get); recs.append(r)
    r = pd.DataFrame(recs); r["season"] = name; frames.append(r)
df = pd.concat(frames)
rows = []
for name, g in list(df.groupby("season", sort=False)) + [("весь год (4 × 14 сут)", df)]:
    rows.append({"season": name,
                 "mw_mean": g.flex_down_mw.mean(), "mw_p10": g.flex_down_mw.quantile(0.1), "mw_p90": g.flex_down_mw.quantile(0.9),
                 "h_mean": g.flex_down_h.mean(), "h_median": g.flex_down_h.median(), "mw_median": g.flex_down_mw.median(), "h_p10": g.flex_down_h.quantile(0.1), "h_p90": g.flex_down_h.quantile(0.9)})
out = pd.DataFrame(rows).round(1)
out.to_csv("data/flex.csv", index=False)
print(out.to_string(index=False))
print("что ограничивает длительность, доля часов:")
print((df.limit.value_counts(normalize=True) * 100).round(1).to_string())
