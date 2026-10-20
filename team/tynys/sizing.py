"""Решение руководства: сколько ВЭС и СЭС строить у Актогая.

Для каждой комбинации мощностей прогоняются на реальной погоде 2024 г.
(4 сезона × 14 суток) четыре варианта управления:
  V0      — как сейчас (без координации), P80 150 мкм;
  V2      — координатор, цель «медь» (P80 120–250 мкм);
  V2green — координатор, цель «CO₂» (P80 не тоньше 150 мкм);
  V2fixed — координатор с P80 = 150 мкм, как у V0: отделяет эффект
            адаптации к ВИЭ от эффекта более тонкого помола. Результат —
data/sizing.csv, его показывает экран (блок «Сколько строить»).
"""
import itertools, os, sys
from dataclasses import replace
import pandas as pd
from tynys.params import aktogay
from tynys.sim import Scenario, run
from tynys.controllers import V0Traditional, V2Tynys
from tynys.metrics import summarize

GREEN = (150, 200, 250)   # «зелёная» цель: не молоть тоньше обычного

SEASONS = (15, 105, 196, 288)
DAYS = 14


def evaluate(p, ctl):
    agg = {}
    for doy in SEASONS:
        r = pd.DataFrame(run(p, Scenario(start_doy=doy, days=DAYS), ctl, 7))
        s = summarize(p, r, p.pile_cap_t * p.pile_init_frac)
        for k in ("cu_adj_t", "cu_t", "grid_mwh", "curtail_mwh", "renew_share_pct"):
            agg[k] = agg.get(k, 0) + s[k] / len(SEASONS) * (1 if k == "renew_share_pct" else 365 / DAYS)
    agg["co2_kt"] = agg["grid_mwh"] * p.grid_co2_t_mwh / 1000
    return agg


def main():
    rows = []
    only = sys.argv[1:]  # можно пересчитать только часть вариантов
    winds, pvs = (0, 150, 300, 450, 600), (0, 125, 250, 375, 500)
    for w, s in itertools.product(winds, pvs):
        p = replace(aktogay(), wind_mw=w, pv_mwp=s)
        for name, ctl in (("V0", V0Traditional()), ("V2", V2Tynys()), ("V2green", V2Tynys(grind_modes=GREEN)),
                          ("V2fixed", V2Tynys(elastic_grind=False))):   # тот же MPC, P80 = 150 мкм как у V0
            if only and name not in only:
                continue
            a = evaluate(p, ctl)
            rows.append({"wind_mw": w, "pv_mwp": s, "variant": name, **{k: round(v, 1) for k, v in a.items()}})
            print(rows[-1], flush=True)
    os.makedirs("data", exist_ok=True)
    out = pd.DataFrame(rows)
    if only and os.path.exists("data/sizing.csv"):
        old = pd.read_csv("data/sizing.csv")
        out = pd.concat([old[~old.variant.isin(only)], out])
    out.to_csv("data/sizing.csv", index=False)


if __name__ == "__main__":
    main()
