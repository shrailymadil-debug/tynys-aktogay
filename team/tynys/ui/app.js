// Экран «Тыныс»: все данные — из двойников Eclipse Ditto (через прокси /ditto).
const NS = 'kz.tynys';
const NAMES = ['site','pit','plant','energy','coordinator','scenario','shadow-v0','shadow-v1','pile-soft','pile-hard',
  'line-1','line-2','flotation','wind','pv','bess','substation', ...Array.from({length:14},(_,i)=>`truck-${String(i+1).padStart(2,'0')}`)];
const EVENTS = {lull:['Штиль на сутки',3,24], line_trip:['Авария линии 2',0,8], kegoc:['Запрос KEGOC: −80 МВт',2,4],
  hard_ore:['Пошла твёрдая руда',0,72], plan_up:['План добычи +10 %',0,48], bess_fault:['Отказ накопителя',0,12]};
const $ = id => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
let T = {};
const v = (n, f, d = 0) => { try { return T[n].features[f].properties.value; } catch (e) { return d; } };
const fmt = (x, k = 0) => (x == null || isNaN(x)) ? '—' : Number(x).toLocaleString('ru-RU', {maximumFractionDigits: k, minimumFractionDigits: k});

async function api(method, path, body) {
  const r = await fetch('ditto/api/2/' + path, {method, headers: {'Content-Type': 'application/json'}, body: body ? JSON.stringify(body) : undefined});
  if (!r.ok && r.status !== 204) throw new Error(r.status);
  return r.status === 204 ? null : r.json().catch(() => null);
}

// ---------- статичные элементы ----------
const road = $('road'), roadLen = road.getTotalLength();
const trucksG = $('trucks');
for (let i = 0; i < 14; i++) { const c = document.createElementNS(SVGNS, 'rect'); c.setAttribute('width', 14); c.setAttribute('height', 9); c.setAttribute('rx', 2); trucksG.appendChild(c); }
for (let i = 0; i < 6; i++) {
  const g = document.createElementNS(SVGNS, 'g'); g.setAttribute('transform', `translate(${(i % 3) * 32},${Math.floor(i / 3) * 52})`);
  g.innerHTML = `<line x1="0" y1="0" x2="0" y2="45" stroke="#cfd8e0" stroke-width="2"/><g transform="translate(0,0)"><g class="rot"><path d="M0,0 L-2,-18 L2,-18Z M0,0 L15,9 L13,12Z M0,0 L-15,9 L-13,12Z" fill="#e6edf3"/></g></g>`;
  $('windfarm').appendChild(g);
}
for (let i = 0; i < 8; i++) { const r = document.createElementNS(SVGNS, 'rect');
  r.setAttribute('x', (i % 4) * 20); r.setAttribute('y', Math.floor(i / 4) * 22); r.setAttribute('width', 17); r.setAttribute('height', 18);
  r.setAttribute('fill', '#2b4b78'); r.setAttribute('class', 'pvp'); $('pvfield').appendChild(r); }
for (const [k, [title]] of Object.entries(EVENTS)) {
  const b = document.createElement('button'); b.textContent = title; b.onclick = () => addEvent(k); $('btns').appendChild(b);
}

// ---------- what-if через двойник scenario ----------
async function writeScenario(events, goal) {
  const rev = (v('scenario', 'rev', 0) || 0) + 1;
  await api('PUT', `things/${NS}:scenario/features`, {events: {properties: {value: JSON.stringify(events)}},
    rev: {properties: {value: rev}}, goal: {properties: {value: goal || v('scenario', 'goal', 'copper')}}});
  await poll();
}
function curEvents() { try { return JSON.parse(v('scenario', 'events', '[]') || '[]'); } catch (e) { return []; } }
async function addEvent(kind) {
  const [, lead, dur] = EVENTS[kind]; const t = v('site', 'sim_hour', 0);
  await writeScenario([...curEvents().filter(e => e.t0 + e.dur > t), {kind, t0: t + 1 + lead, dur, id: Date.now()}]);
}
async function cancelEvent(id) { await writeScenario(curEvents().filter(e => e.id !== id)); }

$('g-copper').onclick = () => writeScenario(curEvents(), 'copper');
$('g-green').onclick = () => writeScenario(curEvents(), 'green');

// ---------- отрисовка ----------
let rot = 0;
function render() {
  const t = v('site', 'sim_hour', null); if (t == null) return;
  $('clock').textContent = `модельное время ${v('site', 'sim_time', '')} · час ${t}`;
  const mode = v('coordinator', 'mode', '—');
  $('mode-t').textContent = mode === 'вдох' ? 'ВДОХ · копим энергию' : mode === 'выдох' ? 'ВЫДОХ · экономим' : '—';
  $('mode').className = 'mode ' + (mode === 'вдох' ? 'inhale' : 'exhale');
  $('whybox').className = 'panel why ' + (mode === 'вдох' ? '' : 'exhale');
  // главные показатели
  const cu0 = v('shadow-v0', 'cu_adj_t'), cu2 = v('site', 'cu_adj_t');
  $('k-co2').textContent = fmt(v('substation', 'co2_t_h'));
  $('k-ren').textContent = fmt(v('energy', 'renew_share_pct')) + ' %';
  $('k-cur').textContent = fmt(v('energy', 'curtail_mw'));
  $('k-cu').textContent = cu0 > 0 ? (cu2 >= cu0 ? '+' : '') + fmt(100 * (cu2 - cu0) / cu0, 1) + ' %' : '—';
  $('k-res').textContent = fmt(v('substation', 'flex_down_mw'));
  $('why').textContent = v('coordinator', 'why', '—');
  $('src').textContent = v('plant', 'decision_source') === 'coordinator'
    ? `решение MPC за ${v('coordinator', 'solve_ms', 0)} мс · теневая цена энергии ${fmt(v('coordinator', 'shadow_kzt_kwh'), 1)} ₸/кВт·ч`
    : 'координатор не ответил — работает запасное правило V1';
  // карьер, склады, линии
  $('t-pit').textContent = `${fmt(v('pit', 'ore_tph'))} т/ч руды · твёрдой ${fmt(100 * v('pit', 'hard_frac'))} %`;
  for (const [d, id, tid, name] of [['soft', 'pile-soft', 't-ps', 'мягкая'], ['hard', 'pile-hard', 't-ph', 'твёрдая']]) {
    const f = v(id, 'fill_pct', 0) / 100; $(id).firstElementChild.setAttribute('transform', `scale(${0.3 + 0.9 * f})`);
    $(tid).textContent = `${name} ${fmt(v(id, 'tonnes') / 1000)} кт (${fmt(100 * f)} %)`;
  }
  for (let l = 0; l < 2; l++) {
    const n = `line-${l + 1}`, g = $('line' + l), q = v(n, 'feed_tph', 0);
    g.querySelector('.t').textContent = !v(n, 'available', true) ? 'АВАРИЯ' : q > 0 ? `${fmt(q)} т/ч · ${fmt(v(n, 'load_pct'))} %` : 'остановлена';
    g.querySelector('rect').setAttribute('stroke', !v(n, 'available', true) ? '#e0675a' : q > 0 ? '#4fd18b' : '#3d5a78');
    g.dataset.q = q;
  }
  $('t-flot').textContent = `${fmt(v('flotation', 'cu_tph'), 1)} т меди/ч · извл. ${fmt(v('flotation', 'recovery'), 1)} %`;
  // энергия
  $('t-wind').textContent = `${fmt(v('wind', 'power_mw'))} из 300 МВт`;
  $('t-pv').textContent = `${fmt(v('pv', 'power_mw'))} из 250 МВт`;
  const soc = v('bess', 'soc', 0); $('bessbar').setAttribute('y', 54 - 0.48 * soc); $('bessbar').setAttribute('height', 0.48 * soc);
  $('t-bess').textContent = v('bess', 'available', true) ? `${fmt(soc)} %` : 'ОТКАЗ';
  $('t-grid').textContent = `${fmt(v('substation', 'grid_mw'))} / ${fmt(v('substation', 'grid_cap_mw'))} МВт`;
  $('t-charge').textContent = `${fmt(v('energy', 'charge_mw'))} МВт`;
  $('t-curt').textContent = v('energy', 'curtail_mw', 0) > 1 ? `сброс ВИЭ ${fmt(v('energy', 'curtail_mw'))} МВт` : '';
  document.querySelectorAll('.pvp').forEach(r => r.setAttribute('fill', v('pv', 'power_mw', 0) > 5 ? '#4a7fc0' : '#22334a'));
  $('flow-grid').setAttribute('stroke-width', 1 + v('substation', 'grid_mw', 0) / 30);
  $('flow-ren').setAttribute('stroke-width', 1 + (v('wind', 'power_mw', 0) + v('pv', 'power_mw', 0)) / 50);
  // KPI
  const cols = ['shadow-v0', 'shadow-v1', 'site'];
  const rows = [['Медь, т', 'cu_t', 0], ['Медь с учётом склада, т', 'cu_adj_t', 0], ['Из сети, МВт·ч', 'grid_mwh', 0], ['CO₂ из сети, т', 'co2_t', 0], ['CO₂ с учётом запасов, т', 'co2_adj_t', 0], ['CO₂ на т меди (с учётом запасов)', 'co2_per_t_cu', 2],
    ['Сброс ВИЭ, МВт·ч', 'curtail_mwh', 0], ['Оплата сети, млн ₸', 'grid_cost_mkzt', 0]];
  const CU_MKZT = 9500 * 480 * 0.85 / 1e6;   // оплачиваемая медь, млн ₸/т (допущение, params.py)
  const margin = c => v(c, 'cu_adj_t') * CU_MKZT - v(c, 'grid_cost_mkzt');
  const best = Math.max(...cols.map(margin));
  rows.push(['<b>Медь − энергия, млн ₸</b>', null, 0]);
  $('kt').innerHTML = rows.map(([lbl, f, k]) => f === null
    ? `<tr><td>${lbl}</td>${cols.map(c => `<td style="${margin(c) === best ? 'color:var(--v2);font-weight:700' : ''}">${fmt(margin(c))}</td>`).join('')}</tr>`
    : `<tr><td>${lbl}</td>${cols.map(c => `<td>${fmt(v(c, f), k)}</td>`).join('')}</tr>`).join('');
  $('flex').textContent = fmt(v('substation', 'flex_down_mw')); $('flexh').textContent = fmt(v('substation', 'flex_down_h'), 1);
  const now = [['Нагрузка', fmt(v('energy', 'load_mw')) + ' МВт'], ['ВИЭ', fmt(v('energy', 'renew_mw')) + ' МВт'],
    ['Доля ВИЭ', fmt(v('energy', 'renew_share_pct')) + ' %'], ['Сеть', fmt(v('energy', 'grid_mw')) + ' МВт'],
    ['CO₂ сейчас', fmt(v('substation', 'co2_t_h')) + ' т/ч'], ['Переработка', fmt(v('plant', 'feed_tph')) + ' т/ч'],
    ['Твёрдость (оценка)', `${fmt(v('pile-soft', 'bwi_est'), 1)} / ${fmt(v('pile-hard', 'bwi_est'), 1)} кВт·ч/т`]];
  $('now').innerHTML = now.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  const goal = v('scenario', 'goal', 'copper');
  $('g-copper').className = goal === 'copper' ? 'on' : ''; $('g-green').className = goal === 'green' ? 'on' : '';
  $('g-note').textContent = goal === 'green'
    ? 'Мелем не тоньше 150 мкм: энергия идёт на то, чтобы не сбрасывать ветер и солнце, а не на лишнюю медь.'
    : 'Мелем тоньше, когда это окупается медью: больше меди, но и больше энергии.';
  // события
  const evs = curEvents();
  $('events').innerHTML = evs.length ? '' : '<span class="mute">Сценариев нет — обычная работа.</span>';
  for (const e of evs) {
    const d = document.createElement('div');
    const st = t < e.t0 ? `через ${e.t0 - t} ч` : t < e.t0 + e.dur ? `идёт, ещё ${e.t0 + e.dur - t} ч` : 'завершён';
    d.innerHTML = `<span>${EVENTS[e.kind][0]} <span class="mute">· ${st}</span></span>`;
    const b = document.createElement('button'); b.textContent = 'отменить'; b.onclick = () => cancelEvent(e.id); d.appendChild(b);
    $('events').appendChild(d);
  }
  drawPlan();
}

function drawPlan() {
  let P; try { P = JSON.parse(v('coordinator', 'plan_json', '{}')); } catch (e) { return; }
  if (!P.renew_mw) return;
  const H = P.renew_mw.length, W = 640, Hh = 170, bw = W / H;
  const max = Math.max(300, ...P.renew_mw, ...P.grid_cap_mw);
  const y = x => Hh - (x / max) * (Hh - 10);
  let s = '';
  for (let h = 0; h < H; h++) {
    const x = h * bw;
    s += `<rect x="${x + 1}" y="${y(P.renew_mw[h])}" width="${bw / 2 - 1}" height="${Hh - y(P.renew_mw[h])}" fill="var(--wind)" opacity=".8"/>`;
    s += `<rect x="${x + bw / 2}" y="${y(P.grid_mw[h])}" width="${bw / 2 - 1}" height="${Hh - y(P.grid_mw[h])}" fill="var(--grid)" opacity=".8"/>`;
    const hf = P.feed_tph[h] ? P.hard_tph[h] / P.feed_tph[h] : 0;
    s += `<rect x="${x + 1}" y="${Hh + 6}" width="${bw - 2}" height="10" fill="var(--hard)" opacity="${0.15 + 0.85 * hf}"/>`;
  }
  const cap = P.grid_cap_mw.map((c, h) => `${h ? 'L' : 'M'}${h * bw},${y(c)} L${(h + 1) * bw},${y(c)}`).join(' ');
  s += `<path d="${cap}" stroke="#e0675a" stroke-dasharray="4 3" fill="none"/>`;
  const sm = Math.max(1, ...P.shadow_kzt_kwh.filter(x => x != null));
  const sp = P.shadow_kzt_kwh.map((c, h) => `${h ? 'L' : 'M'}${h * bw + bw / 2},${Hh - ((c ?? 0) / sm) * (Hh - 20)}`).join(' ');
  s += `<path d="${sp}" stroke="#fff" stroke-width="2" fill="none"/>`;
  for (const h of [0, 6, 12, 18]) s += `<text x="${h * bw + 2}" y="198" class="lbl">+${h} ч</text>`;
  $('plan').innerHTML = s;
}

function animate(ts) {
  rot = (rot + 0.4 + 6 * v('wind', 'cf_pct', 0) / 100) % 360;
  document.querySelectorAll('.rot').forEach(g => g.setAttribute('transform', `rotate(${rot})`));
  let slotC = 0, slotW = 0;
  for (let i = 0; i < 14; i++) {
    const n = `truck-${String(i + 1).padStart(2, '0')}`, r = trucksG.children[i], st = v(n, 'state', 'empty');
    let x, y;
    if (st === 'charging' || st === 'waiting') { const k = st === 'charging' ? slotC++ : 7 + (slotW++ % 7); x = 304 + (k % 7) * 19; y = st === 'charging' ? 474 : 496; }
    else { const ph = (i / 14 + ts / 1000 / 90) % 1;   // анимация: полный рейс за 90 с const f = ph < 0.5 ? ph * 2 : 2 - ph * 2;
      const p = road.getPointAtLength(f * roadLen); x = p.x - 7; y = p.y - 4 + (ph < 0.5 ? -7 : 7); }
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('fill', st === 'charging' ? '#5ec8e5' : st === 'waiting' ? '#ebcb88' : st === 'loaded' ? '#6ce0cc' : '#9aa6b2');
  }
  requestAnimationFrame(animate);
}

async function poll() {
  try {
    const data = await api('GET', `things?ids=${NAMES.map(n => NS + ':' + n).join(',')}&fields=thingId,features`);
    T = {}; for (const t of data) T[t.thingId.split(':')[1]] = t;
    render();
    $('connection').dataset.state = 'online'; $('conn-t').textContent = 'Ditto · подключено';
  } catch (e) { $('connection').dataset.state = 'offline'; $('conn-t').textContent = 'нет связи с Ditto'; }
}
// ---------- «сколько строить»: результаты расчёта из атрибута двойника energy ----------
let SZ = [];
function drawSizing() {
  if (!SZ.length) return;
  const w = +$('sz-w').value, p = +$('sz-p').value;
  const base = SZ.find(r => r.wind_mw == 0 && r.pv_mwp == 0 && r.variant == 'V0');
  const a = SZ.find(r => r.wind_mw == w && r.pv_mwp == p && r.variant == 'V0');
  const b = SZ.find(r => r.wind_mw == w && r.pv_mwp == p && r.variant == 'V2');
  const g = SZ.find(r => r.wind_mw == w && r.pv_mwp == p && r.variant == 'V2green');
  const x = SZ.find(r => r.wind_mw == w && r.pv_mwp == p && r.variant == 'V2fixed');
  if (!base || !a || !b) return;
  const cs = [base, a, ...(x ? [x] : []), b, ...(g ? [g] : [])];
  const row = (lbl, f, k) => [lbl, ...cs.map(r => fmt(f(r), k))];
  const rows = [['', 'Сегодня', 'ВИЭ', ...(x ? ['+ Тыныс, P80 150'] : []), '+ Тыныс: медь', ...(g ? ['+ Тыныс: CO₂'] : [])],
    row('CO₂ в год, тыс. т', r => r.co2_kt, 0),
    row('Медь в год, тыс. т', r => r.cu_adj_t / 1000, 1),
    row('CO₂ на т меди, т', r => r.co2_kt * 1000 / r.cu_adj_t, 2),
    row('Доля ВИЭ, %', r => r.renew_share_pct, 0),
    row('Сброс ВИЭ, ГВт·ч', r => r.curtail_mwh / 1000, 0)];
  $('sizing').innerHTML = rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${c}</td>` : `<th>${c}</th>`).join('')}</tr>`).join('');
}
async function loadSizing() {
  try { SZ = await api('GET', `things/${NS}:energy/attributes/sizing`) || []; } catch (e) { return setTimeout(loadSizing, 5000); }
  if (!SZ.length) return;
  const uniq = k => [...new Set(SZ.map(r => r[k]))].sort((a, b) => a - b);
  $('sz-w').innerHTML = uniq('wind_mw').map(x => `<option ${x == 300 ? 'selected' : ''}>${x}</option>`).join('');
  $('sz-p').innerHTML = uniq('pv_mwp').map(x => `<option ${x == 250 ? 'selected' : ''}>${x}</option>`).join('');
  $('sz-w').onchange = $('sz-p').onchange = drawSizing; drawSizing();
}
loadSizing();
async function loadFlex() {
  try {
    const F = await api('GET', `things/${NS}:substation/attributes/flex_stats`) || [];
    const y = F.find(r => r.season.startsWith('весь год')); if (!y) return;
    $('flexstat').textContent = `За год на реальной погоде 2024 (предрасчёт flex_stats.py, 4 × 14 суток): медиана ${fmt(y.mw_median ?? y.mw_mean)} МВт ` +
      `(p10–p90: ${fmt(y.mw_p10)}–${fmt(y.mw_p90)}) на ${fmt(y.h_median ?? y.h_mean, 1)} ч (p10–p90: ${fmt(y.h_p10, 1)}–${fmt(y.h_p90, 1)}). ` +
      `Чаще всего длительность ограничивает накопитель (69 % часов), реже — заряд самосвалов (31 %).`;
  } catch (e) { setTimeout(loadFlex, 5000); }
}
loadFlex();
poll(); setInterval(poll, 1000); requestAnimationFrame(animate);
