'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const frame = $('scene');
  $('fullscreen').addEventListener('click', async () => {
    try { await frame.requestFullscreen(); } catch (_) { $('runtime-state').textContent = 'Полноэкранный режим недоступен'; }
  });

  // Активные сценарии — только чтение двойников scenario и site через тот же прокси Ditto.
  const NAMES = {lull:'Штиль', line_trip:'Авария линии', kegoc:'Ограничение KEGOC', hard_ore:'Твёрдая руда',
    plan_up:'План добычи +10 %', bess_fault:'Отказ накопителя', crusher_fault:'Отказ дробилки',
    shovel_fault:'Отказ экскаватора 1', conveyor_fault:'Отказ конвейера питания', water_fault:'Отказ водовода',
    charger_fault:'Отказ зарядной группы 1', crusher_service:'ТО дробилки', truck_failure:'Поломка самосвала',
    excavator_failure:'Поломка экскаватора', grade_drop:'Падение содержания меди', tariff_change:'Смена тарифа сети'};
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]);
  async function readValue(thing, feature) {
    const r = await fetch(`ditto/api/2/things/kz.tynys:${thing}/features/${feature}/properties/value`, {cache: 'no-store'});
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }
  async function strip() {
    const box = $('strip-events');
    try {
      const [hour, raw] = await Promise.all([readValue('site', 'sim_hour'), readValue('scenario', 'events')]);
      const events = (Array.isArray(raw) ? raw : JSON.parse(raw || '[]')).filter(e => Number(e.t0) + Number(e.dur) > Number(hour));
      if (!events.length) {
        box.textContent = 'Сейчас сценариев нет — рудник работает в обычном режиме. Запустите штиль, аварию или ограничение KEGOC и смотрите последствия в сцене.';
      } else {
        box.innerHTML = events.map(e => {
          const name = esc(NAMES[e.kind] || e.kind), t0 = Number(e.t0), end = t0 + Number(e.dur);
          const when = Number(hour) < t0 ? `начнётся через ${t0 - Number(hour)} ч` : `ещё ${end - Number(hour)} ч`;
          return `<b>${name}</b> · ${when}`;
        }).join(' &nbsp;·&nbsp; ');
      }
    } catch (_) {
      box.textContent = 'Нет связи с двойниками Ditto: сценарии можно посмотреть и запустить на пульте.';
    }
  }
  strip();
  setInterval(strip, 6000);
})();
