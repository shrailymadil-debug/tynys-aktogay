#!/usr/bin/env python3
"""Создаёт двойники рудника Актогай в Eclipse Ditto (идемпотентные PUT).

Иерархия (attributes._parents): site → pit / plant / energy → оборудование.
"""
import sys, time
from platform_client import http, NS, wait_ditto  # noqa

SITE = "Актогай (KAZ Minerals), обл. Абай — режим «Тыныс»"


def t(name, title, kind, parent=None, feats=None, **attrs):
    a = {"name": title, "kind": kind, "_isType": False, **attrs}
    if parent:
        a["_parents"] = f"{NS}:{parent}"
    return name, {"policyId": "default:basic_policy", "attributes": a,
                  "features": {k: {"properties": {"value": v}} for k, v in (feats or {}).items()}}


def twins():
    out = [
        t("site", SITE, "mine", None, {"sim_hour": 0, "cu_t": 0.0}, lat=46.95, lon=79.86,
          source="KAZ Minerals Annual Report 2024; Open-Meteo ERA5"),
        t("pit", "Карьер Актогай", "pit", "site", {"ore_tph": 0.0, "hard_frac": 0.5}),
        t("plant", "Обогатительные фабрики (Сульфидная‑1 и ‑2)", "plant", "site", {"feed_tph": 0.0}),
        t("energy", "Энергосистема рудника", "energy", "site", {"load_mw": 0.0}),
        t("coordinator", "Координатор «Тыныс» (MPC 24 ч)", "coordinator", "site", {"for_t": -1}),
        t("scenario", "Сценарии what-if", "scenario", "site", {"events": "[]", "rev": 0}),
        t("shadow-v0", "Тень V0: как сейчас (без координации)", "shadow", "site", {"cu_t": 0.0}),
        t("shadow-v1", "Тень V1: простые правила", "shadow", "site", {"cu_t": 0.0}),
    ]
    out += [t(f"shovel-{i}", f"Экскаватор {i}", "shovel", "pit", {"state": "digging"}) for i in (1, 2)]
    out += [t(f"truck-{i:02d}", f"Звено электросамосвалов {i:02d} (3 × 240 т)", "truck", "pit",
              {"state": "hauling", "soc": 60.0}) for i in range(1, 15)]
    out += [t(f"charger-{i}", f"Зарядная станция {i} (3 × 6 МВт)", "charger", "pit", {"power_mw": 0.0}) for i in range(1, 5)]
    out += [t("pile-soft", "Склад мягкой руды", "stockpile", "plant", {"tonnes": 0.0}, domain="soft"),
            t("pile-hard", "Склад твёрдой руды", "stockpile", "plant", {"tonnes": 0.0}, domain="hard"),
            t("line-1", "Линия измельчения 1 (Сульфидная‑1)", "mill_line", "plant", {"feed_tph": 0.0}),
            t("line-2", "Линия измельчения 2 (Сульфидная‑2)", "mill_line", "plant", {"feed_tph": 0.0}),
            t("flotation", "Флотация", "flotation", "plant", {"recovery": 0.0}),
            t("wind", "ВЭС 300 МВт (допущение)", "wind_farm", "energy", {"power_mw": 0.0}),
            t("pv", "СЭС 250 МВт (допущение)", "pv_farm", "energy", {"power_mw": 0.0}),
            t("bess", "Накопитель 60 МВт / 120 МВт·ч (допущение)", "bess", "energy", {"soc": 50.0}),
            t("substation", "Подстанция 220 кВ — связь с KEGOC", "substation", "energy", {"grid_mw": 0.0})]
    return dict(out)


def main():
    for name, body in twins().items():
        for attempt in range(40):
            try:
                st, _ = http("PUT", f"/api/2/things/{NS}:{name}", body)
                print(("created " if st == 201 else "updated ") + name); break
            except Exception as e:
                if attempt == 39:
                    print("FAILED", name, e, file=sys.stderr); return 1
                time.sleep(3)
    print(len(twins()), "twins ready")
    return 0


if __name__ == "__main__":
    sys.exit(main())
