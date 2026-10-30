(() => {
'use strict';
const $ = id => document.getElementById(id);
document.body.classList.add('pitch');
const slides = [...document.querySelectorAll('.ps')];
const N = slides.length;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* таблица «сколько строить» — data/sizing.csv, вариант V0, CO₂ с учётом запасов */
(() => {
  const PV = [0, 125, 250, 375, 500], WIND = [0, 150, 300, 450, 600];
  const CO2 = [[1661, 1499, 1339, 1210, 1134], [1443, 1283, 1134, 1022, 956], [1254, 1111, 978, 874, 813], [1169, 1034, 905, 806, 749], [1110, 979, 853, 757, 702]];
  let h = '<div class="h">ВЭС</div>' + PV.map(p => `<div class="h">СЭС ${p}</div>`).join('');
  WIND.forEach((w, i) => { h += `<div class="h">${w}</div>`; CO2[i].forEach((v, j) => { const t = (v - 702) / (1661 - 702); const d = Math.round(100 * (v - 1661) / 1661); h += `<div class="c${i === 2 && j === 2 ? ' sel' : ''}" style="background:hsl(${168 - t * 160},${52 + t * 18}%,${62 - t * 8}%)">${v.toLocaleString('ru-RU')}<small>${d ? String(d).replace('-', '−') + ' %' : 'сегодня'}</small></div>`; }); });
  $('pheat').innerHTML = h;
})();

/* снимки экранов стенда и точки на них (доли ширины и высоты снимка) */
const SHOTS = {
  pult: {src: window.PITCH_IMG.pult, dots: [[.902, .274], [.129, .45], [.686, .45], [.871, .45], [.536, .76], [.82, .914]]},
  futures: {src: window.PITCH_IMG.futures, dots: [[.142, .256], [.43, .133], [.79, .133], [.61, .83]]},
};

/* навигация */
const dots = $('pdots');
slides.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', `Слайд ${i + 1}: ${s.getAttribute('aria-label')}`); b.onclick = () => go(i); dots.appendChild(b); });
let cur = 0, autoTimer = null, ready = null;
function go(i, fromHash) {
  i = Math.max(0, Math.min(N - 1, i));
  slides[cur].classList.remove('on'); cur = i; slides[cur].classList.add('on');
  [...dots.children].forEach((b, k) => { b.classList.toggle('on', k === cur); b.classList.toggle('done', k < cur); });
  $('pcount').innerHTML = `<b>${String(cur + 1).padStart(2, '0')}</b> / ${N}`;
  $('pnext').textContent = cur === N - 1 ? 'Сначала ↺' : 'Далее →';
  if (!fromHash) { try { history.replaceState(null, '', '#slide-' + (cur + 1)); } catch (e) {} }
  if (ready) ready(slides[cur].dataset.k);
}
$('pprev').onclick = () => go(cur - 1);
$('pnext').onclick = () => go(cur === N - 1 ? 0 : cur + 1);
$('pauto').onclick = () => { const on = $('pauto').getAttribute('aria-pressed') !== 'true'; $('pauto').setAttribute('aria-pressed', on); clearInterval(autoTimer); if (on) autoTimer = setInterval(() => go(cur === N - 1 ? 0 : cur + 1), 13000); };
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,select,textarea')) return;
  if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); go(cur + 1); }
  if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(cur - 1); }
  if (e.key === 'Home') go(0); if (e.key === 'End') go(N - 1);
}, true);
let wheelLock = 0;
$('pstage').addEventListener('wheel', e => { const s = slides[cur]; if (s.scrollHeight > s.clientHeight + 4) return; if (Date.now() < wheelLock || Math.abs(e.deltaY) < 30) return; wheelLock = Date.now() + 900; go(cur + (e.deltaY > 0 ? 1 : -1)); }, {passive: true});
let tx = null;
$('pstage').addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, {passive: true});
$('pstage').addEventListener('touchend', e => { if (tx === null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 60) go(cur + (dx < 0 ? 1 : -1)); tx = null; }, {passive: true});

/* ждём сцену стенда */
const t0 = performance.now();
(function wait() {
  const S = window.__tynys, T = window.__THREE;
  if (!S || !T || !S.source || S.source === 'connecting' || S.source === 'unknown') { if (performance.now() - t0 < 20000) return setTimeout(wait, 150); }
  if (!S || !T) { $('pv-loading').textContent = '3D НЕДОСТУПНО — СЛАЙДЫ РАБОТАЮТ БЕЗ СЦЕНЫ'; setTimeout(() => $('pv-loading').classList.add('gone'), 1600); ready = () => {}; go(startIdx(), true); return; }
  setup(S, T);
})();
function startIdx() { const m = /^#slide-(\d+)$/.exec(location.hash); return m ? Math.min(N, Math.max(1, +m[1])) - 1 : 0; }

function setup(S, T) {
  const intro = document.getElementById('intro'); if (intro) intro.classList.add('hide');
  const {scene, camera, controls} = S;
  controls.autoRotateSpeed = .35;
  /* день и ночь */
  let dayMode = null, cycleHour = 6;
  const DAY = {morning: 7, day: 12.5, sunset: 19.2, night: 22.5};
  document.querySelectorAll('#pday button').forEach(b => b.onclick = () => {
    const m = b.dataset.d; dayMode = m === 'slide' ? null : m;
    document.querySelectorAll('#pday button').forEach(x => x.setAttribute('aria-pressed', x === b));
    if (m === 'slide') S.setLightingHour(null);
    else if (m === 'cycle') cycleHour = 6;
    else S.setLightingHour(DAY[m]);
  });

  /* два экрана над рудником: пульт и «Два будущих» */
  const screens = {};
  const loader = new T.TextureLoader();
  function makeScreen(key, pos) {
    const g = new T.Group(); g.position.copy(pos); g.scale.setScalar(.001); g.visible = false; scene.add(g);
    const tex = loader.load(SHOTS[key].src); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
    const W = 128, H = 80;
    const frame = new T.Mesh(new T.BoxGeometry(W + 6, H + 6, 3), new T.MeshStandardMaterial({color: 0x0b1420, metalness: .6, roughness: .35}));
    const glow = new T.Mesh(new T.PlaneGeometry(W + 14, H + 14), new T.MeshBasicMaterial({color: 0x6fd9c9, transparent: true, opacity: .22, depthWrite: false}));
    glow.position.z = -2;
    const screen = new T.Mesh(new T.PlaneGeometry(W, H), new T.MeshBasicMaterial({map: tex, toneMapped: false}));
    screen.position.z = 1.6;
    const stand = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 60, 8), new T.MeshStandardMaterial({color: 0x39424a}));
    stand.position.set(0, -H / 2 - 30, -1);
    g.add(glow, frame, screen, stand);
    screens[key] = {g, pos, W, H, show: 0, target: 0};
  }
  makeScreen('pult', new T.Vector3(-60, 205, -150));
  makeScreen('futures', new T.Vector3(250, 205, -150));

  /* сценарии на сцене: подменяем текущий кадр записи (только в этой презентации) */
  const OV = {
    lull: d => { ev(d, {kind: 'lull'}); set(d, 'wind', {cf_pct: 2, power_mw: 6}); const e = d.energy || {}; set(d, 'energy', {renew_mw: Math.max(0, (e.renew_mw || 0) - (d.wind?.power_mw || 0)), grid_mw: Math.min(260, (e.grid_mw || 0) + 180), curtail_mw: 0}); set(d, 'substation', {grid_mw: Math.min(260, (d.substation?.grid_mw || 0) + 180)}); },
    trip: d => { ev(d, {kind: 'line_trip', line: 2}); set(d, 'line-2', {available: false, state: 'fault', running: false, feed_tph: 0, speed_rpm: 0, power_mw: 0, mill_mw: 0}); },
    kegoc: d => { ev(d, {kind: 'kegoc', grid_drop_mw: 80}); set(d, 'substation', {grid_cap_mw: 180}); },
    hard: d => { ev(d, {kind: 'hard_ore'}); set(d, 'pit', {hard_frac: .8}); },
    crusher: d => { ev(d, {kind: 'crusher_fault'}); set(d, 'crusher', {available: false, state: 'fault', throughput_tph: 0, power_mw: 0}); set(d, 'pit', {ore_tph: 0}); },
  };
  function ev(d, e) { const h = Number(d.site?.sim_hour || 0); d.scenario = Object.assign({}, d.scenario, {events: JSON.stringify([Object.assign({t0: h - 2, dur: 24, id: 1}, e)])}); }
  function set(d, k, o) { d[k] = Object.assign({}, d[k], o); }
  let overlay = null;
  window.__pitchOverride = frame => { if (!overlay) return frame; const d = Object.assign({}, frame); OV[overlay](d); return d; };

  /* кадры камеры по слайдам */
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const SH = {
    title:    {p: V(300, 280, 460), t: V(20, -20, -20), view: 'tynys', hour: 10, auto: true},
    problem:  {p: V(1150, 300, -620), t: V(1500, 120, -1100), view: 'now', hour: 8, labels: false},
    waste:    {p: V(330, 200, -60), t: V(130, 80, -400), view: 'now', hour: 12},
    idea:     {p: V(-40, 120, -190), t: V(70, 0, 0), view: 'tynys', hour: 12},
    trucks:   {p: V(80, 55, 200), t: V(10, 0, 110), view: 'tynys', hour: 11},
    real:     {p: V(270, 110, 160), t: V(120, 10, -5), view: 'tynys', hour: 14},
    platform: {p: V(430, 380, 560), t: V(0, -20, 0), view: 'tynys', hour: 13, auto: true},
    pult:     {screen: 'pult', view: 'tynys', hour: 12, labels: false},
    sizing:   {p: V(150, 150, -110), t: V(-60, 45, -380), view: 'tynys', hour: 13},
    result:   {p: V(420, 260, 330), t: V(80, 0, -20), view: 'tynys', hour: 12, labels: false, toggle: true},
    futures:  {screen: 'futures', view: 'tynys', hour: 15, labels: false, ov: 'kegoc'},
    scen:     {p: V(270, 250, 340), t: V(0, -20, 0), view: 'tynys', hour: 12, cycle: true},
    jury:     {p: V(0, 760, 260), t: V(0, 0, -20), view: 'tynys', hour: 12, labels: false, auto: true},
    final:    {p: V(300, 280, 460), t: V(20, -20, -20), view: 'tynys', hour: 20.6, auto: true},
  };
  const SCEN = [['lull', 'штиль — ветряки встали, из сети больше'], ['trip', 'авария линии 2 — мельница стоит'], ['kegoc', 'запрос KEGOC — предел 260 → 180 МВт'], ['hard', 'твёрдая руда — самый твёрдый забой GeoMet'], ['crusher', 'отказ дробилки — карьер встал']];
  let shotKey = null, fly = null, curShot = null, toggleT = 0, cycleT = 0, cycleI = -1, shotTimer = null;

  function screenCam(key) {
    const s = screens[key], aspect = innerWidth / innerHeight;
    const fov = T.MathUtils.degToRad(camera.fov), wide = innerWidth > 760;
    const tn = Math.tan(fov / 2);
    const d = wide ? Math.max((s.H / 2) / tn / .64, (s.W / 2) / (tn * aspect) / .55) : (s.W / 2) / (tn * aspect) / .94;
    const dx = wide ? -.3 * d * tn * aspect : 0;
    const dy = wide ? 0 : -.5 * d * tn;
    return {p: V(s.pos.x + dx, s.pos.y + dy, s.pos.z + d), t: V(s.pos.x + dx, s.pos.y + dy, s.pos.z)};
  }
  function apply(k) {
    const sh = SH[k]; curShot = sh;
    S.setView(sh.view); if (!dayMode) S.setLightingHour(null);
    document.body.classList.toggle('nolabels', sh.labels === false);
    overlay = sh.ov || null; cycleI = -1; cycleT = 0; toggleT = 0;
    Object.entries(screens).forEach(([key, s]) => { s.target = sh.screen === key ? 1 : 0; if (s.target) s.g.visible = true; });
    hideShot(); shotKey = null;
    let dst = sh.screen ? screenCam(sh.screen) : {p: sh.p.clone(), t: sh.t.clone()};
    if (!sh.screen && innerWidth <= 760) { dst.p.sub(dst.t).multiplyScalar(1.3).add(dst.t); }
    controls.autoRotate = false;
    fly = {from: {p: camera.position.clone(), t: controls.target.clone()}, to: dst, start: performance.now(), dur: reduce ? 1 : 3200, auto: !!sh.auto || !sh.screen};
    if (sh.screen) fly.shot = sh.screen;
    if (k === 'idea' || k === 'platform') readLive();
  }
  function showShot(key) {
    const box = $('pshot'), img = $('pshotimg'), hot = $('pshothot');
    img.src = SHOTS[key].src; hot.innerHTML = SHOTS[key].dots.map(([x, y], i) => `<span class="dot" style="left:${x * 100}%;top:${y * 100}%;animation-delay:${i * .15}s">${i + 1}</span>`).join('');
    box.hidden = false; placeShot(key); requestAnimationFrame(() => box.classList.add('show'));
  }
  // снимок ложится ровно на 3D-экран: проецируем его углы на окно
  function placeShot(key) {
    const s = screens[key]; if (!s) return;
    const pts = [[-1, 1], [1, -1]].map(([sx, sy]) => new T.Vector3(s.pos.x + sx * s.W / 2, s.pos.y + sy * s.H / 2, s.pos.z + 1.6).project(camera));
    const w = innerWidth, h = innerHeight;
    const x0 = (pts[0].x + 1) / 2 * w, y0 = (1 - pts[0].y) / 2 * h, x1 = (pts[1].x + 1) / 2 * w, y1 = (1 - pts[1].y) / 2 * h;
    Object.assign($('pshotbox').style, {position: 'fixed', left: x0 + 'px', top: y0 + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px', aspectRatio: 'auto'});
  }
  function hideShot() { const box = $('pshot'); box.classList.remove('show'); setTimeout(() => { if (!box.classList.contains('show')) box.hidden = true; }, 900); }

  /* живые числа из записи стенда */
  const fmt = (x, k = 0) => Number.isFinite(Number(x)) ? Number(x).toLocaleString('ru-RU', {maximumFractionDigits: k, minimumFractionDigits: k}) : '—';
  function readLive() {
    let D; try { D = S.data; } catch (e) { return; }
    const mode = D.coordinator?.mode || '', why = D.coordinator?.why || '';
    const pm = $('pmode'); const inhale = /вдох/.test(mode);
    pm.textContent = inhale ? 'вдох · энергии много' : 'выдох · энергии мало'; pm.classList.toggle('out', !inhale);
    $('pin').classList.toggle('live', inhale); $('pout').classList.toggle('live', !inhale);
    if (why) $('pwhy').textContent = '«' + why + '»';
    $('plivegrid').innerHTML = [
      [D.site?.sim_time || '—', 'модельное время'], [fmt(D.energy?.load_mw) + ' МВт', 'нагрузка рудника'],
      [fmt(D.energy?.renew_share_pct) + ' %', 'доля ветра и солнца'], [fmt(D.substation?.grid_mw) + ' МВт', 'из сети'],
      [fmt(D.plant?.feed_tph) + ' т/ч', 'переработка руды'], [fmt(D.coordinator?.charge_mw) + ' МВт', 'зарядка самосвалов']
    ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
    $('plive').textContent = `● запись стенда · ${D.site?.sim_time || ''} · самосвалы ×6`;
  }
  setInterval(readLive, 1500);

  const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (dayMode === 'cycle') { cycleHour = (cycleHour + dt * .4) % 24; S.setLightingHour(cycleHour); const hh = Math.floor(cycleHour), mm = Math.floor((cycleHour - hh) * 60); $('pdayclock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
    if (fly) {
      const k = Math.min(1, (now - fly.start) / fly.dur), e = ease(k);
      controls.enabled = false;
      camera.position.lerpVectors(fly.from.p, fly.to.p, e);
      // дуга: в середине пути камера поднимается — облёт, а не прямой наезд
      camera.position.y += Math.sin(Math.PI * e) * Math.min(160, fly.from.p.distanceTo(fly.to.p) * .18);
      controls.target.lerpVectors(fly.from.t, fly.to.t, e);
      if (k >= 1) { controls.enabled = true; controls.autoRotateSpeed = curShot && curShot.auto ? .35 : .12; controls.autoRotate = fly.auto && !reduce; const sk = fly.shot; fly = null; if (sk) { shotKey = sk; setTimeout(() => { if (shotKey === sk) showShot(sk); }, 250); } }
    }
    if (shotKey && !$('pshot').hidden) { camera.updateMatrixWorld(); placeShot(shotKey); }
    Object.values(screens).forEach(s => { s.show += (s.target - s.show) * Math.min(1, dt * 3); const sc = Math.max(.001, s.show); s.g.scale.setScalar(sc); s.g.rotation.y = (1 - s.show) * .6; if (s.show < .01 && !s.target) s.g.visible = false; });
    if (curShot?.toggle) { toggleT += dt; const v = Math.floor(toggleT / 4.5) % 2 ? 'tynys' : 'now'; if (document.body.dataset.view !== v) { S.setView(v); $('pview').textContent = v === 'now' ? 'как сейчас' : 'с «Тыныс» — СЭС, накопитель, зарядки'; } }
    if (curShot?.cycle) { cycleT += dt; const i = Math.floor(cycleT / 5.5) % SCEN.length; if (i !== cycleI) { cycleI = i; overlay = SCEN[i][0]; $('pscen').textContent = SCEN[i][1]; document.querySelectorAll('#pscenchips .chip').forEach(c => c.classList.toggle('hot', c.dataset.s === SCEN[i][0])); } }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  ready = apply;
  camera.position.set(1400, 900, 1700); controls.target.set(60, 0, -40);
  go(startIdx(), true);
  if (fly) fly.dur = reduce ? 1 : 6500;
  addEventListener('hashchange', () => { const m = /^#slide-(\d+)$/.exec(location.hash); if (m && +m[1] - 1 !== cur) go(+m[1] - 1, true); });
  addEventListener('resize', () => { if (curShot && curShot.screen && !fly) { const d = screenCam(curShot.screen); camera.position.copy(d.p); controls.target.copy(d.t); camera.updateMatrixWorld(); placeShot(curShot.screen); } });
  setTimeout(() => $('pv-loading').classList.add('gone'), 600);
}
})();
