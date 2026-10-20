"""Регрессия базовой модели: V0 без ВИЭ на реальной погоде 2024 (4 сезона × 14 суток, как sizing.py).
Эталон — data/sizing.csv (V0, 0/0) до правок 20.10.2026: медь с учётом склада 222 131 т/год, сеть 2 013,9 ГВт·ч/год, 34,53 кВт·ч/т. Допуск 0,5 %.
Запуск: PYTHONPATH=. python regress.py"""
from dataclasses import replace
import sys
import pandas as pd
from tynys.params import aktogay
from tynys.sim import Scenario, run
from tynys.controllers import V0Traditional
from tynys.metrics import summarize

REF = {"cu_adj_t": 222131.2, "grid_gwh": 2013.9, "kwh_t": 34.53}
p = replace(aktogay(), wind_mw=0, pv_mwp=0)
cu = grid = load = feed = 0.0
for doy in (15, 105, 196, 288):
    r = pd.DataFrame(run(p, Scenario(start_doy=doy, days=14), V0Traditional(), 7))
    cu += summarize(p, r, p.pile_cap_t * p.pile_init_frac)["cu_adj_t"]; grid += r.grid.sum(); load += r.load.sum(); feed += r.feed.sum()
out = {"cu_adj_t": cu * 365 / 56, "grid_gwh": grid * 365 / 56 / 1000, "kwh_t": 1000 * load / feed}
bad = False
for key, ref in REF.items():
    dev = 100 * (out[key] - ref) / ref
    bad |= abs(dev) > 0.5
    print(f"{key:9s} {out[key]:12.1f}   эталон {ref:10.1f}   {dev:+.2f} %")
print("РЕГРЕССИЯ:", "НАРУШЕНА" if bad else "в норме (±0,5 %)")
sys.exit(1 if bad else 0)
