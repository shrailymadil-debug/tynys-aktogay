"""Физические зависимости модели «Тыныс». Все формулы открыты и проверяемы."""
import math
from .params import Params

G = 9.81


def bond_kwh_t(p: Params, bwi: float, p80_um: float) -> float:
    """Удельная энергия измельчения по закону Бонда с поправкой на SAG.

    E = EF · 10 · Wi · (1/√P80 − 1/√F80), кВт·ч/т   (F. C. Bond, 1952)
    """
    return p.sag_ef * 10.0 * bwi * (1.0 / math.sqrt(p80_um) - 1.0 / math.sqrt(p.F80_um))


def recovery_inf(p: Params, domain: str, p80_um: float) -> float:
    """Предельное извлечение как функция крупности помола (линейная аппроксимация
    потери раскрытия минералов; наклон — параметр чувствительности)."""
    return p.r150[domain] - p.recovery_slope_per_100um * (p80_um - 150.0) / 100.0


def kinetic_factor(p: Params, q_line_tph: float) -> float:
    """Флотация 1-го порядка: R = R∞·(1 − e^(−kτ)); τ обратно пропорционально нагрузке.
    Возвращает поправку относительно номинальной нагрузки линии."""
    if q_line_tph <= 0:
        return 0.0
    tau = p.tau_nom_min * p.line_q_nom / q_line_tph
    nom = 1.0 - math.exp(-p.k_flot_per_min * p.tau_nom_min)
    return (1.0 - math.exp(-p.k_flot_per_min * tau)) / nom


def haul_kwh_per_t(p: Params, lift_m: float, haul_km: float) -> float:
    """Энергия рейса аккумуляторного самосвала на тонну груза.

    Гружёный подъём:  (m_груз+m_тары)·g·(h + Crr·L) / η_привода
    Порожний спуск:   m_тары·g·(Crr·L − h); если < 0 — рекуперация с η_рекуп
    """
    L = haul_km * 1000.0
    m_loaded = (p.truck_payload_t + p.truck_tare_t) * 1000.0
    m_empty = p.truck_tare_t * 1000.0
    e_up = m_loaded * G * (lift_m + p.crr * L) / p.eta_drive
    w_down = m_empty * G * (p.crr * L - lift_m)
    e_down = w_down / p.eta_drive if w_down > 0 else w_down * p.eta_regen
    joules = (e_up + e_down) * p.haul_aux_factor
    return joules / 3.6e6 / p.truck_payload_t


def haul_mwh_per_t_ore(p: Params) -> float:
    """Энергия перевозки на тонну РУДЫ с учётом вскрыши (коэффициент вскрыши)."""
    ore = haul_kwh_per_t(p, p.ore_lift_m, p.ore_haul_km)
    waste = haul_kwh_per_t(p, p.waste_lift_m, p.waste_haul_km)
    return (ore + p.strip_ratio * waste) / 1000.0


def trucks_needed(p: Params, ore_tph: float) -> float:
    return ore_tph * (1.0 + p.strip_ratio) / p.truck_tph
