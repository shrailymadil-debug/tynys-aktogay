"""Решение руководства: сколько ВЭС и СЭС строить у Актогая.

Для каждой комбинации мощностей прогоняется координатор V2 на реальной погоде
2024 г. (4 сезона × 14 суток) и V0 (как сейчас) для сравнения. Результат —
data/sizing.csv, его показывает экран (блок «Сколько строить»).
"""
import itertools, os, sys
from dataclasses import replace
import pandas as pd
from tynys.params import aktogay
from tynys.sim import Scenario, run
from tynys.controllers import V0Traditional, V2Tynys
from tynys.metrics import summarize

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
    winds, pvs = (0, 150, 300, 450, 600), (0, 125, 250, 375, 500)
    for w, s in itertools.product(winds, pvs):
        p = replace(aktogay(), wind_mw=w, pv_mwp=s)
        for name, ctl in (("V0", V0Traditional()), ("V2", V2Tynys())):
            a = evaluate(p, ctl)
            rows.append({"wind_mw": w, "pv_mwp": s, "variant": name, **{k: round(v, 1) for k, v in a.items()}})
            print(rows[-1], flush=True)
    os.makedirs("data", exist_ok=True)
    pd.DataFrame(rows).to_csv("data/sizing.csv", index=False)


if __name__ == "__main__":
    main()
