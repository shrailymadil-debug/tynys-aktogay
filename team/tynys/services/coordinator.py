#!/usr/bin/env python3
"""«Мозг» Тыныс: координатор с прогнозирующей моделью (MPC, горизонт 24 ч).

Читает состояние рудника и сценарий из двойников Ditto, каждый модельный час
решает задачу смешанного целочисленного программирования (HiGHS через SciPy):
сколько и какой руды молоть на каждой линии и с какой крупностью, когда
заряжать самосвалы и накопитель, — и пишет план, уставки, теневую цену
энергии и объяснение «почему» обратно в двойник kz.tynys:coordinator.
"""
import json, logging, os, sys, time
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from tynys.live import build_env, dumps, state_from_dict
from tynys.controllers import V2Tynys
from platform_client import Bus, get_things, prop, wait_ditto

log = logging.getLogger("coord")


def explain(p, st, dec, plan, t):
    """Короткое объяснение решения на человеческом языке."""
    sh = plan["shadow_kzt_mwh"][0]
    tariff = p.tariff_kzt_kwh * 1000
    renew0 = plan["renew_mw"][0]
    ren_next = float(np.mean(plan["renew_mw"][1:13])) if len(plan["renew_mw"]) > 1 else renew0
    x = np.array(dec["x"])                      # [линия][домен][P80]
    hard = float(x[:, 1, :].sum()); soft = float(x[:, 0, :].sum()); feed = hard + soft
    p80 = plan["p80_um"][0] or 0
    cheap = (sh is not None and not np.isnan(sh) and sh < 0.5 * tariff)
    mode = "вдох" if cheap else "выдох"
    why = []
    if cheap:
        why.append(f"Энергии с избытком (ВИЭ {renew0:.0f} МВт) — МВт·ч почти ничего не стоит, «вдыхаем»:")
        if hard > 0.55 * feed:
            why.append(f"мелем твёрдую руду ({hard:.0f} т/ч из {feed:.0f}),")
        if p80 and p80 < 145:
            why.append(f"мелем тоньше (P80 {p80:.0f} мкм) — больше меди извлекается,")
        if dec["charge_mw"] > 5:
            why.append(f"заряжаем самосвалы {dec['charge_mw']:.0f} МВт,")
        if dec["bess_mw"] < -5:
            why.append(f"заряжаем накопитель {-dec['bess_mw']:.0f} МВт.")
    else:
        why.append(f"Энергия дорогая (теневая цена {sh / 1000:.0f} ₸/кВт·ч) — «выдыхаем»:")
        if soft > 0.55 * feed:
            why.append(f"мелем мягкую руду ({soft:.0f} т/ч), твёрдую копим на складе до ветра,")
        if p80 and p80 > 160:
            why.append(f"помол крупнее (P80 {p80:.0f} мкм) — меньше кВт·ч на тонну,")
        if dec["charge_mw"] < 5:
            why.append("самосвалы ездят на заряде, не заряжаем,")
        if dec["bess_mw"] > 5:
            why.append(f"накопитель отдаёт {dec['bess_mw']:.0f} МВт.")
    if ren_next > renew0 * 1.5 and ren_next > 100:
        why.append(f"Через несколько часов ждём ветер/солнце ~{ren_next:.0f} МВт — готовимся.")
    elif ren_next < renew0 * 0.5 and renew0 > 100:
        why.append(f"По прогнозу ВИЭ упадут до ~{ren_next:.0f} МВт — запасаемся сейчас.")
    if min(plan["grid_cap_mw"]) < p.grid_cap_mw - 1:
        h = int(np.argmin(plan["grid_cap_mw"]))
        why.append(f"Через {h} ч сеть ограничена до {min(plan['grid_cap_mw']):.0f} МВт (KEGOC) — план учитывает.")
    if not any(st.line_lock) and sum(plan["lines_on"][l][0] for l in range(p.n_lines)) < p.n_lines:
        why.append("Одна линия остановлена: так дешевле, чем молоть на минимуме.")
    return mode, " ".join(why).rstrip(",") 


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s coord %(message)s")
    wait_ditto()
    bus = Bus("tynys-coordinator")
    ctl = V2Tynys(explain=True)
    cache = {}
    last_t = None
    while True:
        try:
            th = get_things(["site", "scenario"])
        except Exception as e:
            log.warning("ditto read: %s", e); time.sleep(1); continue
        site, sc = th.get("site"), th.get("scenario")
        t = prop(site, "sim_hour"); sj = prop(site, "state_json")
        rev_site = prop(site, "scenario_rev", 0); rev = prop(sc, "rev", 0)
        if t is None or sj is None or t == last_t or rev_site != rev:
            time.sleep(0.2); continue
        key = (rev, prop(site, "start_doy"), prop(site, "seed"))
        if key not in cache:
            cache.clear()
            cache[key] = build_env(json.loads(prop(sc, "events", "[]") or "[]"), key[1], key[2])
        p, env = cache[key]
        st = state_from_dict(json.loads(sj))
        t0 = time.time()
        dec = ctl.decide(p, env, st, t)
        plan = ctl.last_plan or {}
        ms = (time.time() - t0) * 1000
        mode, why = explain(p, st, dec, plan, t) if plan else ("выдох", "MILP не решилась — правило V1")
        r = lambda a, k=1: [None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), k) for v in a]
        compact = {k: r(plan[k]) for k in ("renew_mw", "grid_cap_mw", "feed_tph", "hard_tph", "p80_um", "charge_mw",
                                         "bess_mw", "grid_mw", "curtail_mw", "fleet_mwh", "bess_mwh")} if plan else {}
        if plan:
            compact["shadow_kzt_kwh"] = r(np.array(plan["shadow_kzt_mwh"], float) / 1000, 2)
            compact["pile_soft_kt"] = r(np.array(plan["pile_soft_t"]) / 1000)
            compact["pile_hard_kt"] = r(np.array(plan["pile_hard_t"]) / 1000)
        sh0 = compact.get("shadow_kzt_kwh", [None])[0]
        bus.send("coordinator", {"for_t": t, "scenario_rev": rev, "x_json": dumps(dec["x"]),
                                 "charge_mw": round(dec["charge_mw"], 2), "bess_mw": round(dec["bess_mw"], 2),
                                 "mode": mode, "why": why, "shadow_kzt_kwh": sh0 if sh0 is not None else 0.0,
                                 "solve_ms": round(ms), "plan_json": dumps(compact),
                                 "feed_plan_tph": round(sum(map(sum, map(lambda l: map(sum, l), dec["x"]))))})
        log.info("t=%s %s %.0f ms  %s", t, mode, ms, why[:90])
        last_t = t


if __name__ == "__main__":
    main()
