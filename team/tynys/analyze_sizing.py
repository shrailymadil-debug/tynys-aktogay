"""Сводка по data/sizing.csv: все числа для текстов SUBMISSION/README.
CO₂ — с учётом запасов в конце прогонов (co2_adj_kt, см. tynys/metrics.grid_adjusted).
Запуск: python analyze_sizing.py"""
import pandas as pd

d = pd.read_csv("data/sizing.csv")
w = d.pivot_table(index=["wind_mw", "pv_mwp"], columns="variant", values=["co2_adj_kt", "cu_adj_t", "curtail_mwh"])
pct = lambda a, b: 100 * (a - b) / b
out = pd.DataFrame({
    "co2_V2_vs_V0_%": pct(w.co2_adj_kt.V2, w.co2_adj_kt.V0),
    "co2_green_vs_V0_%": pct(w.co2_adj_kt.V2green, w.co2_adj_kt.V0),
    "co2_fixed_vs_V0_%": pct(w.co2_adj_kt.V2fixed, w.co2_adj_kt.V0),
    "cu_V2_vs_V0_%": pct(w.cu_adj_t.V2, w.cu_adj_t.V0),
    "cu_green_vs_V0_%": pct(w.cu_adj_t.V2green, w.cu_adj_t.V0),
    "cu_fixed_vs_V0_%": pct(w.cu_adj_t.V2fixed, w.cu_adj_t.V0),
    "curt_V0_gwh": w.curtail_mwh.V0 / 1000, "curt_V2_gwh": w.curtail_mwh.V2 / 1000,
    "curt_green_gwh": w.curtail_mwh.V2green / 1000, "curt_fixed_gwh": w.curtail_mwh.V2fixed / 1000,
})
pd.set_option("display.width", 200)
print(out.round(2).to_string())
print("\nДиапазоны по 25 сочетаниям (мин … макс):")
for c in out.columns:
    if c.endswith("%"):
        print(f"  {c:20s} {out[c].min():+.1f} … {out[c].max():+.1f}   (сочетаний с ростом: {(out[c] > 0).sum()})")
has = out[out.curt_V0_gwh > 0]
print(f"\nСброс ВИЭ там, где он есть у V0 ({len(has)} сочетаний), доля от V0:")
for c in ("curt_V2_gwh", "curt_green_gwh", "curt_fixed_gwh"):
    r = 100 * has[c] / has.curt_V0_gwh
    print(f"  {c:16s} {r.min():.0f} … {r.max():.0f} %")
base = d[(d.wind_mw == 0) & (d.pv_mwp == 0) & (d.variant == "V0")].iloc[0]
for wm, pv in ((300, 250),):
    print(f"\nВЭС {wm} + СЭС {pv}:")
    for v in ("V0", "V2fixed", "V2", "V2green"):
        r = d[(d.wind_mw == wm) & (d.pv_mwp == pv) & (d.variant == v)].iloc[0]
        print(f"  {v:8s} CO2 {r.co2_adj_kt:7.1f} кт ({pct(r.co2_adj_kt, base.co2_adj_kt):+.1f} % к «сегодня»)  медь {r.cu_adj_t/1000:6.1f} кт  сброс {r.curtail_mwh/1000:5.1f} ГВт·ч")
print(f"\n«Сегодня» (V0, 0/0): CO2 {base.co2_adj_kt:.1f} кт, медь {base.cu_adj_t/1000:.1f} кт, сеть {base.grid_mwh/1000:.1f} ГВт·ч")
