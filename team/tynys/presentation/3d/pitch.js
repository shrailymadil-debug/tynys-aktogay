(() => {
'use strict';
const $ = id => document.getElementById(id);
document.body.classList.add('pitch');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- данные карточек: только из репозитория ----------
   sizing.csv (V0, CO₂ с учётом запасов), economics.json, flex.csv, regress.py, отчёт отбора */
const PV_COLS = [0, 125, 250, 375, 500], WIND_ROWS = [0, 150, 300, 450, 600];
const CO2 = [[1661, 1499, 1339, 1210, 1134], [1443, 1283, 1134, 1022, 956], [1254, 1111, 978, 874, 813], [1169, 1034, 905, 806, 749], [1110, 979, 853, 757, 702]];
function heatHTML() {
  let h = '<div class="h">ВЭС</div>' + PV_COLS.map(p => `<div class="h">СЭС ${p}</div>`).join('');
  WIND_ROWS.forEach((w, i) => { h += `<div class="h">${w}</div>`; CO2[i].forEach((v, j) => { const t = (v - 702) / (1661 - 702); const d = Math.round(100 * (v - 1661) / 1661); h += `<div class="c${i === 2 && j === 2 ? ' sel' : ''}" style="background:hsl(${168 - t * 160},${52 + t * 18}%,${66 - t * 8}%)">${v.toLocaleString('ru-RU')}<small>${d ? String(d).replace('-', '−') + ' %' : 'сегодня'}</small></div>`; }); });
  return `<div class="heat2">${h}</div>`;
}
const SHOTS = {
  pult: {src: window.PITCH_IMG.pult, dots: [[.902, .274], [.129, .45], [.686, .45], [.871, .45], [.536, .76], [.82, .914]]},
  futures: {src: window.PITCH_IMG.futures, dots: [[.142, .256], [.43, .133], [.79, .133], [.61, .83]]},
};

/* ---------- шаги показа ---------- */
const STEPS = [
  {k: 'intro', hero: true, labels: false, chip: ['Тыныс', 'дышащий рудник Актогай'], pill: 'OpenEgiz · запись стенда',
   cap: 'Здравствуйте! Мы команда «Суперкрошки». «Тыныс» — цифровой двойник настоящего медного рудника Актогай.'},
  {k: 'site', chip: ['Актогай', 'KAZ Minerals · область Абай'], pill: 'Реальный объект', tags: true,
   tiles: [['58,3 млн т', 'руды переработано за 2024 год', 'KAZ Minerals, Annual Report 2024'], ['221 тыс. т', 'меди выпущено за 2024 год', 'там же'], ['0,43 %', 'меди в руде', 'там же']],
   cap: 'Это реальный рудник. Карьер, отвалы, выщелачивание, фабрика и хвостохранилище стоят в сцене так же, как на спутниковом снимке.'},
  {k: 'problem', chip: ['Проблема', 'так сейчас'], pill: 'Реальные данные', pillCls: 'bad', labels: false,
   tiles: [['≈ 230 МВт', 'рудник берёт из сети круглые сутки', 'отчёт 2024: ≈ 2 030 ГВт·ч в год', 'bad'], ['66 %', 'электроэнергии Казахстана — уголь', 'Agora Energiewende, 2023', 'bad'], ['1,66 млн т', 'CO₂ в год из-за энергии рудника', 'модель «как сейчас»', 'bad']],
   cap: 'Рудник круглые сутки берёт из сети около 230 мегаватт. Две трети электричества Казахстана — уголь. Дым на горизонте густеет вместе с нагрузкой.'},
  {k: 'waste', chip: ['Ветер дует не по расписанию', 'ВЭС 300 + СЭС 250 МВт'], pill: 'Модель · погода 2024', pillCls: 'warn',
   tiles: [['94 ГВт·ч', 'ветра и солнца в год пропадает без координации', 'sizing.py · год на погоде ERA5 2024', 'cu']],
   cap: 'Если просто построить ветряки и солнечные панели, рудник всё равно работает ровно. Когда ветра больше, чем нужно руднику, лишняя энергия просто сбрасывается.'},
  {k: 'idea', chip: ['Идея', 'рудник дышит вместе с ветром и солнцем'], pill: 'Координатор · каждый час', side: 'left',
   card: () => `<h3 id="modeT">Режим координатора</h3><p class="meta">запись стенда · обновляется каждый модельный час</p>
     <div class="breath2"><div class="in" id="pin"><h4>ВДОХ</h4><p>энергии много: мелем твёрдую руду, заряжаем самосвалы и накопитель</p></div><div class="out" id="pout"><h4>ВЫДОХ</h4><p>энергии мало: мелем мягкую, твёрдую копим на складе</p></div></div>
     <div class="why2"><span id="pwhy">…</span><small>«Почему так» — объяснение координатора из записи стенда</small></div>`,
   cap: 'Когда ветра много — рудник делает вдох: мелет твёрдую руду и заряжает самосвалы. Когда мало — выдох. Каждый час координатор строит план на сутки и объясняет его словами.'},
  {k: 'trucks', chip: ['Самосвалы — тоже батарея', 'карьер Актогай'], pill: 'Модель · из двойников',
   tiles: [['42', 'электросамосвала в 14 звеньях', 'допущение «Тыныс»'], ['12', 'зарядных станций в 4 группах', 'допущение «Тыныс»'], ['×6', 'движение по дороге ускорено', 'заряд и груз — из модели']],
   cap: 'Электросамосвалы заряжаются, когда дует ветер, и возят руду на заряде, когда ветра нет. Над каждым звеном — его заряд из двойника.'},
  {k: 'real', chip: ['Сверено с отчётом', 'модель «как сейчас» против KAZ Minerals 2024'], pill: 'Реальные данные', side: 'left',
   card: () => `<h3>Модель сходится с отчётом</h3><p class="meta">вариант «как сейчас» · год на погоде 2024</p><div class="vs">
     <div><h4>Медь с учётом склада <span>тыс. т в год</span></h4><div class="trk"><span>модель</span><i style="width:99.1%"></i><em>219,1</em></div><div class="trk"><span>отчёт</span><i class="r" style="width:100%"></i><em>221</em></div></div>
     <div><h4>Электроэнергия <span>ГВт·ч в год · калибровка</span></h4><div class="trk"><span>модель</span><i style="width:100%"></i><em>2 031</em></div><div class="trk"><span>отчёт</span><i class="r" style="width:99.95%"></i><em>≈ 2 030</em></div></div>
     <div><h4>Удельный расход <span>кВт·ч на тонну руды</span></h4><div class="trk"><span>модель</span><i style="width:100%"></i><em>36,3</em></div><div class="trk"><span>отчёт</span><i class="r" style="width:96.4%"></i><em>≈ 35</em></div></div></div>
     <p class="src">Медь модель считает сама: погода ERA5 2024 в точке рудника, твёрдость из 60 проб GeoMet. Энергия — калибровка: 83 МВт вспомогательных потребителей. regress.py</p>`,
   cap: 'Мы проверили модель по годовому отчёту компании. Меди модель дала 219 тысяч тонн, в отчёте — 221.'},
  {k: 'platform', chip: ['51 двойник', 'все данные идут через OpenEgiz'], pill: 'Проверено в CI', side: 'left',
   card: () => `<h3>Как устроен стенд</h3><p class="meta">51 двойник и 28 типов · карьер 25 · фабрика 12 · энергия 5 · службы 8</p>
     <div class="flow2"><span>модель рудника</span><b>→</b><span>MQTT</span><b>→</b><span class="k">Eclipse Ditto</span><b>→</b><span>Telegraf</span><b>→</b><span>InfluxDB</span><b>→</b><span>Grafana</span></div>
     <div class="live2" id="plivegrid"></div>
     <p class="src">Цифры — текущий час записи стенда. make tynys поднимает всё с нуля за 200 секунд (GitHub Actions, 2 CPU, 7 ГБ).</p>`,
   cap: 'Каждое оборудование — двойник на платформе OpenEgiz. Экскаватор грузит самосвал, самосвал везёт руду на дробилку — эти связи записаны в двойниках.'},
  {k: 'pult', screen: 'pult', chip: ['Пульт энергетика', 'localhost:8095/dashboard.html'], pill: 'Снимок стенда', labels: false, side: 'left',
   card: () => `<h3>Что видит энергетик</h3><p class="meta">снимок пульта со стенда в GitHub Actions</p><ol class="leg2">
     <li><b>Вдох / выдох</b> — режим, который выбрал координатор</li><li><b>CO₂ из сети сейчас</b> — тонн в час</li><li><b>Медь к «как сейчас»</b> — с учётом склада</li>
     <li><b>Резерв для KEGOC</b> — МВт на следующий час</li><li><b>Линии мельниц</b> — подача и загрузка из двойников</li><li><b>Ремонт на выдохе</b> — окно ТО по прогнозу энергии</li></ol>`,
   cap: 'Заглянем в пульт. Энергетик видит режим, выбросы, медь, резерв для энергосистемы и объяснение каждого решения.'},
  {k: 'sizing', chip: ['Сколько строить', 'решение руководства раз в год'], pill: 'Модель · 25 сочетаний', pillCls: 'warn', side: 'left',
   card: () => `<h3>ВЭС 300 + СЭС 250 МВт: −41 % CO₂</h3><p class="meta">CO₂ без координатора, тыс. т в год · строки — ВЭС, столбцы — СЭС, МВт</p>${heatHTML()}
     <p>Меди столько же — 219,1 тыс. т. Но 94 ГВт·ч ветра и солнца в год пропадает.</p><p class="src">sizing.py · 25 сочетаний × 4 способа управления · 4 сезона × 14 суток ERA5 2024</p>`,
   cap: 'Мы посчитали целый год для 25 сочетаний. Ветряки на 300 мегаватт и солнечные панели на 250 снижают выбросы на 41 процент.'},
  {k: 'result', chip: ['Что добавляет «Тыныс»', 'ВЭС 300 + СЭС 250 · сцена: как сейчас ↔ с «Тыныс»'], pill: 'Модель · экономика', toggle: true, labels: false,
   tiles: [['−4,4 %', 'CO₂ с целью «CO₂»; сброс 94 → 49 ГВт·ч; медь −1 %', 'как ≈ 89 МВт ветряков', 'good'], ['+22 млн $', 'в год с целью «медь»: +2 076 т меди', 'медь 14 441 $/т, LME 21.10.2026', 'cu'], ['≈ 4,4 года', 'окупаемость «медь» + ещё 150 МВт ВЭС: больше меди и меньше CO₂', 'economics.py · ВЭС 1 041 $/кВт, IRENA']],
   cap: 'Сам координатор вдвое сокращает потери ветра и солнца. Цель «CO₂» снижает выбросы ещё на 4,4 процента, цель «медь» даёт плюс 22 миллиона долларов в год. Цель выбирает человек.'},
  {k: 'futures', screen: 'futures', ov: 'kegoc', chip: ['Запрос KEGOC', 'два будущих рудника рядом'], pill: 'Модель · проверка до решения', labels: false, side: 'left',
   card: () => `<h3>Выдержит ли рудник?</h3><p class="meta">«Два будущих» · из одного снимка рудника</p><ol class="leg2">
     <li><b>Запрос</b> — лимит сети −80 МВт на 4 часа</li><li><b>Обычное управление</b> — те же запасы и ограничения</li><li><b>С планом «Тыныс»</b> — подготовка, событие, восстановление</li><li><b>Шкала</b> — 4 часа ограничения и 24 часа после</li></ol>
     <p class="src">Резерв на следующий час — в среднем 51 МВт (flex.csv, ВЭС 300 + СЭС 250). Это оценка в модели, а не гарантия.</p>`,
   cap: 'Если оператор сети просит снизить нагрузку, рудник может отдать в среднем около 50 мегаватт. Двойник заранее показывает, чего это будет стоить.'},
  {k: 'scen', cycle: true, chip: ['16 сценариев «что если»', 'сейчас на сцене: <span id="pscen">штиль</span>'], pill: 'Проверено в CI · whatif_check.py', side: 'left',
   card: () => `<h3>Сценарии прямо на стенде</h3><p class="meta">включаются одной кнопкой · отменяются одной кнопкой</p><div class="chips2" id="pscenchips">
     <span data-s="lull">Штиль на сутки</span><span data-s="trip">Авария линии 2</span><span data-s="kegoc">Запрос KEGOC −80 МВт</span><span data-s="hard">Твёрдая руда</span><span data-s="crusher">Отказ дробилки</span>
     <span>План добычи +10 %</span><span>Отказ накопителя</span><span>Отказ экскаватора</span><span>Отказ конвейера</span><span>Отказ водовода</span><span>Отказ зарядки</span><span>ТО дробилки</span><span>Поломка самосвалов</span><span>Поломка экскаватора</span><span>Падение содержания меди</span><span>Смена тарифа</span></div>`,
   cap: 'На стенде 16 сценариев. Штиль останавливает ветряки, авария линии останавливает мельницу, отказ дробилки — весь карьер. Всё видно сразу.'},
  {k: 'jury', chip: ['Отборочный этап', 'ИИ-жюри конкурса'], pill: '8 место из 46', side: 'left',
   tiles: [['77,5', 'балла из 100 — среднее трёх судей', 'qualifying-results · team-084'], ['20 / 20', 'за правдоподобие у всех трёх судей', 'судьи сами пересчитали руду, медь и энергию', 'good']],
   card: () => `<h3>Баллы по критериям</h3><p class="meta">среднее трёх судей</p><div class="crit2">
     <div><span>Правдоподобие</span><i><u style="width:100%"></u></i><em>20 / 20</em></div><div><span>Модули</span><i><u style="width:91.7%"></u></i><em>4,6 / 5</em></div>
     <div><span>Сценарии</span><i><u style="width:83.3%"></u></i><em>8,3 / 10</em></div><div><span>Модель рудника</span><i><u style="width:75%"></u></i><em>18,8 / 25</em></div>
     <div><span>Концепция</span><i><u style="width:75%"></u></i><em>11,3 / 15</em></div><div><span>Визуализация</span><i><u class="lo" style="width:58.3%"></u></i><em>14,6 / 25</em></div></div>
     <p class="src">Куда растём: рельеф и скважины Актогая, каждая машина отдельно, сравнение «до и после» у сценариев.</p>`,
   cap: 'В отборочном этапе мы заняли 8 место из 46. Все три судьи поставили максимум за правдоподобие: цифры модели сошлись.'},
  {k: 'final', chip: ['Тыныс', 'рудник, который дышит вместе с ветром и солнцем'], pill: 'Спасибо', side: 'left',
   card: () => `<h3>Три решения — один двойник</h3><p class="meta">команда «Суперкрошки» · OpenEgiz v1.0.4</p><div class="three2">
     <div><p class="eb">руководству</p><b>Сколько строить</b><span>ВЭС 300 и СЭС 250 МВт снимают 41 % выбросов CO₂</span></div>
     <div><p class="eb">энергетику</p><b>Что делать каждый час</b><span>какую руду молоть и когда заряжать — с объяснением</span></div>
     <div><p class="eb">энергосистеме</p><b>Чего стоит помощь</b><span>ответ на запрос KEGOC, проверенный в модели</span></div></div>
     <p class="thanks2"><em>Спасибо!</em></p>`,
   cap: 'Руководству — сколько строить. Энергетику — что делать каждый час. Энергосистеме — честный ответ на запрос. Спасибо!'},
];
const N = STEPS.length;

/* ---------- прогресс и управление ---------- */
const prog = $('prog');
STEPS.forEach((s, i) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', `Шаг ${i + 1}: ${s.chip[0]}`); b.title = `${i + 1}. ${s.chip[0]}`; b.onclick = () => go(i); prog.appendChild(b); });
let cur = 0, ready = null;
function startIdx() { const m = /^#slide-(\d+)$/.exec(location.hash); return m ? Math.min(N, Math.max(1, +m[1])) - 1 : 0; }
function go(i, fromHash) {
  cur = Math.max(0, Math.min(N - 1, i));
  [...prog.children].forEach((b, k) => { b.classList.toggle('on', k === cur); b.classList.toggle('done', k < cur); });
  $('pcount').textContent = `${String(cur + 1).padStart(2, '0')} / ${N}`;
  $('pnext').textContent = cur === N - 1 ? 'Сначала ↺' : 'Далее →';
  document.body.classList.toggle('first', cur === 0);
  if (!fromHash) { try { history.replaceState(null, '', '#slide-' + (cur + 1)); } catch (e) {} }
  stepT0 = performance.now(); [...prog.children].forEach((b, k) => b.style.setProperty('--fill', k === cur && playing ? 0 : 1));
  render(STEPS[cur]);
  if (ready) ready(STEPS[cur]);
}
$('pprev').onclick = () => { stopPlay(); go(cur - 1); };
/* автопоказ: шаг держится столько, сколько читается субтитр */
let playing = false, stepT0 = performance.now();
const stepDur = i => Math.max(8000, STEPS[i].cap.length * 68 + 3000);
function stopPlay() { playing = false; $('pplay').setAttribute('aria-pressed', 'false'); $('pplay').textContent = '▶ Смотреть'; prog.children[cur]?.style.setProperty('--fill', 1); }
$('pplay').onclick = () => { if (playing) return stopPlay(); playing = true; $('pplay').setAttribute('aria-pressed', 'true'); $('pplay').textContent = '❚❚ Пауза'; if (cur === N - 1) go(0); stepT0 = performance.now(); };
(function tickPlay(now) {
  const b = prog.children[cur];
  if (playing && b) { const k = Math.min(1, (now - stepT0) / stepDur(cur)); b.style.setProperty('--fill', k.toFixed(3)); if (k >= 1) { if (cur === N - 1) stopPlay(); else go(cur + 1); } }
  requestAnimationFrame(tickPlay);
})(performance.now());
$('pnext').onclick = () => go(cur === N - 1 ? 0 : cur + 1);
addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,select,textarea')) return;
  const k = e.key;
  if (['ArrowRight', 'PageDown', 'Enter'].includes(k)) { e.preventDefault(); e.stopImmediatePropagation(); go(cur + 1); }
  else if (k === ' ') { e.preventDefault(); e.stopImmediatePropagation(); $('pplay').click(); }
  else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); stopPlay(); go(cur - 1); }
  else if (k === 'Home') go(0); else if (k === 'End') go(N - 1);
  else if (k === 'f' || k === 'F' || k === 'а' || k === 'А') { const el = document.documentElement; (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.())?.catch?.(() => {}); }
  else if (k === 't' || k === 'T' || k === 'е' || k === 'Е') document.body.classList.toggle('nocap');
}, true);

/* ---------- числа «набегают» при появлении ---------- */
function countUp(el) {
  const m = /^([^\d]*?)(\d{1,3}(?: \d{3})*|\d+)(?:,(\d+))?(.*)$/.exec(el.textContent); if (!m || reduce) return;
  const [, pre, int, dec = '', post] = m, target = Number(int.replace(/ /g, '') + (dec ? '.' + dec : '')), k = dec.length, t0 = performance.now(), dur = 1100;
  const fmtN = v => v.toLocaleString('ru-RU', {minimumFractionDigits: k, maximumFractionDigits: k}).replace(/\u00a0/g, ' ');
  (function tick(now) { const x = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - x, 3); el.textContent = pre + fmtN(target * e) + post; if (x < 1) requestAnimationFrame(tick); else el.textContent = pre + int + (dec ? ',' + dec : '') + post; })(t0);
}

/* ---------- отрисовка шага (HTML) ---------- */
let chipTimer = null;
function render(s) {
  const chip = $('chip'); chip.classList.add('swap'); clearTimeout(chipTimer);
  chipTimer = setTimeout(() => { $('chipN').textContent = String(cur + 1).padStart(2, '0'); $('chipT').textContent = s.chip[0]; $('chipS').innerHTML = s.chip[1]; chip.classList.remove('swap'); }, 260);
  const pill = $('pill'); pill.textContent = s.pill; pill.className = 'pill2' + (s.pillCls ? ' ' + s.pillCls : '');
  $('hero').classList.toggle('out', !s.hero);
  const card = $('card');
  if (s.card) { card.className = 'card2 hide ' + (s.side || 'left'); card.hidden = false; card.innerHTML = s.card(); requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove('hide'))); }
  else { card.classList.add('hide'); setTimeout(() => { if (!STEPS[cur].card) card.hidden = true; }, 600); }
  const tiles = $('tiles');
  if (s.tiles) {
    tiles.hidden = false; tiles.classList.toggle('left', false);
    tiles.innerHTML = s.tiles.map(([b, sp, sm, cls]) => `<div class="tile2"><b class="${cls || ''}">${b}</b><span>${sp}</span>${sm ? `<small>${sm}</small>` : ''}</div>`).join('');
    [...tiles.children].forEach((t, i) => setTimeout(() => { t.classList.add('on'); countUp(t.querySelector('b')); }, 300 + i * 180));
  } else tiles.hidden = true;
  $('cap').innerHTML = `<span>${s.cap}</span>`;
}

/* ---------- ждём сцену стенда ---------- */
const t0 = performance.now();
(function wait() {
  const S = window.__tynys, T = window.__THREE;
  if ((!S || !T || !S.source || S.source === 'connecting') && performance.now() - t0 < 20000) return setTimeout(wait, 150);
  if (!S || !T) { $('pv-loading').innerHTML = '<b>ТЫНЫС</b><span>3D недоступно — шаги работают без сцены</span>'; setTimeout(() => $('pv-loading').classList.add('gone'), 1800); go(startIdx(), true); return; }
  setup(S, T);
})();

function setup(S, T) {
  const intro = document.getElementById('intro'); if (intro) intro.classList.add('hide');
  const {scene, camera, controls} = S;
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const PIT = V(-130, 0, 10), PIT_D = 78;

  /* --- Актогай по спутниковому снимку: синие крыши, отвалы, выщелачивание, хвостохранилище --- */
  const Mt = (c, o = {}) => new T.MeshStandardMaterial(Object.assign({color: c, roughness: .95, metalness: .02}, o));
  const add = (geo, mat, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.receiveShadow = true; m.castShadow = true; scene.add(m); return m; };
  const dumpsOld = []; let dumpMat = null;
  const TH = window.__terrainH || (() => 0);
  if (scene.fog) scene.fog.density = 0.00024;
  scene.traverse(o => {
    if (!o.isMesh || !o.material || !o.material.color) return;
    const hex = o.material.color.getHex();
    if (hex === 0x3d8f86 && o.position.y < -60) o.material = o.material.clone(), o.material.color.setHex(0x3fae6a);   // зелёное озеро в карьере
    if (hex === 0xd8c7ad && o.parent && o.parent !== scene && !o.parent.userData.old) { o.parent.userData.old = true; dumpsOld.push(o.parent); dumpMat = dumpMat || o.material; }
    if (o.geometry && o.geometry.type === 'RingGeometry' && o.material.map && hex === 0xffffff) { o.material = o.material.clone(); o.material.color.setHex(0xffe3b0); }  // степь теплее
  });
  // отвалы Актогая — широкие, светлые, с плоским верхом и уступами
  dumpsOld.forEach(g => g.visible = false);
  const dm = (dumpMat ? dumpMat.clone() : Mt(0xffffff)); dm.color.setHex(0xe2cba2);
  for (const [x, z, r, h] of [[-350, -170, 95, 36], [-390, 160, 80, 30], [-90, -260, 66, 26]]) {
    const R = r * 1.3, H = h * 1.15;
    for (let k = 0; k < 3; k++) { const rb = R * (1 - k * 0.16), rt = rb - 9; add(new T.CylinderGeometry(rt, rb, H / 3, 64), dm, x, H / 6 + k * H / 3, z); }
  }
  add(new T.CircleGeometry(8, 36).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({color: 0x1f78d1, roughness: .08, metalness: .4}), PIT.x - 12, -PIT_D + .35, PIT.z + 10).castShadow = false;  // синее озеро в глубокой части
  // кучное выщелачивание окисленной руды — ярусы с сеткой
  const gcv = document.createElement('canvas'); gcv.width = gcv.height = 128; const gx = gcv.getContext('2d');
  gx.fillStyle = '#d9b884'; gx.fillRect(0, 0, 128, 128); gx.strokeStyle = 'rgba(140,96,52,.6)'; gx.lineWidth = 3; for (let i = 0; i <= 128; i += 32) { gx.beginPath(); gx.moveTo(i, 0); gx.lineTo(i, 128); gx.stroke(); gx.beginPath(); gx.moveTo(0, i); gx.lineTo(128, i); gx.stroke(); }
  const gtex = new T.CanvasTexture(gcv); gtex.wrapS = gtex.wrapT = T.RepeatWrapping; gtex.repeat.set(5, 3); gtex.colorSpace = T.SRGBColorSpace;
  const HEAP = V(175, 0, -200);
  [[160, 104, 0], [136, 84, 6], [112, 64, 12]].forEach(([w, d, y]) => add(new T.BoxGeometry(w, 6, d), Mt(0xffffff, {map: gtex}), HEAP.x, y + 3, HEAP.z));
  add(new T.BoxGeometry(26, .6, 14), new T.MeshStandardMaterial({color: 0x2bb0d6, roughness: .1, metalness: .3}), HEAP.x + 100, .4, HEAP.z + 30);
  // хвостохранилище: большой веер на дамбе, бирюзовый пруд, пульпопровод от сгустителя
  const TAIL = V(362, 0, 44), TS = 1.2;
  const pts = [[-78, -48], [-30, -72], [30, -76], [78, -50], [92, 10], [80, 62], [36, 88], [-20, 84], [-62, 60], [-88, 12]].map(([x, z]) => [x * TS, z * TS]);
  let base = 0; for (const [x, z] of pts) base = Math.max(base, TH(TAIL.x + x, TAIL.z + z)); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) base = Math.max(base, TH(TAIL.x + i * 60, TAIL.z + j * 60));
  const TOP = base + 7;
  const sh = new T.Shape(); sh.moveTo(pts[0][0], -pts[0][1]); sh.splineThru([...pts.slice(1), pts[0]].map(([x, z]) => new T.Vector2(x, -z)));
  const tg = new T.ExtrudeGeometry(sh, {depth: TOP + 30, bevelEnabled: true, bevelThickness: 3, bevelSize: 7, bevelSegments: 3, curveSegments: 48}); tg.rotateX(-Math.PI / 2);
  const tcv = document.createElement('canvas'); tcv.width = tcv.height = 256; const tx = tcv.getContext('2d');
  const grd = tx.createRadialGradient(40, 40, 10, 140, 140, 260); grd.addColorStop(0, '#f2f1ea'); grd.addColorStop(.55, '#c9cbc6'); grd.addColorStop(1, '#a9aeab'); tx.fillStyle = grd; tx.fillRect(0, 0, 256, 256);
  tx.strokeStyle = 'rgba(255,255,255,.35)'; tx.lineWidth = 2; for (let k = 0; k < 14; k++) { tx.beginPath(); tx.moveTo(30, 30); tx.lineTo(256, k * 22); tx.stroke(); }
  const ttex = new T.CanvasTexture(tcv); ttex.colorSpace = T.SRGBColorSpace;
  const tail = new T.Mesh(tg, [Mt(0xffffff, {map: ttex}), Mt(0xb08d62)]); tail.position.set(TAIL.x, -33, TAIL.z); tail.receiveShadow = true; scene.add(tail);
  tg.computeBoundingBox(); const bb = tg.boundingBox, uvA = tg.attributes.uv, pA = tg.attributes.position; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, (pA.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pA.getZ(i) - bb.min.z) / (bb.max.z - bb.min.z));
  const pond = add(new T.CircleGeometry(36, 48).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({color: 0x19c2b0, roughness: .05, metalness: .25, emissive: 0x0a5c55, emissiveIntensity: .35}), TAIL.x + 30, TOP + .6, TAIL.z + 22); pond.scale.set(1.25, 1, .85); pond.castShadow = false;
  const pipe = new T.CatmullRomCurve3([V(158, 3, 64), V(205, 4, 44), V(TAIL.x - 112, 5, TAIL.z - 6), V(TAIL.x - 92, TOP + 2, TAIL.z - 8), V(TAIL.x - 50, TOP + 2, TAIL.z - 18)]);
  add(new T.TubeGeometry(pipe, 80, 1.6, 8, false), Mt(0xff8a3d, {roughness: .5, emissive: 0x5a2400, emissiveIntensity: .3}), 0, 0, 0);
  const slurry = new T.InstancedMesh(new T.SphereGeometry(1.9, 8, 6), new T.MeshBasicMaterial({color: 0xffd2a8}), 18); scene.add(slurry);
  // здания SX-EW и посёлок — синие крыши
  for (let i = 0; i < 4; i++) { const x = 300 + (i % 2) * 40, z = -122 + Math.floor(i / 2) * 26; add(new T.BoxGeometry(32, 9, 14), Mt(0xe4e9ee), x, 4.5, z); add(new T.BoxGeometry(33, 1.2, 15), Mt(0x2d73c9, {metalness: .3, roughness: .5}), x, 9.6, z); }
  // технологические дороги от борта карьера к отвалам
  for (const [x, z] of [[-350, -170], [-390, 160], [-90, -260]]) {
    const dir = V(x - PIT.x, 0, z - PIT.z).normalize(), a = PIT.clone().addScaledVector(dir, 104), b = V(x, 0, z).addScaledVector(dir, -100), L = a.distanceTo(b);
    if (L < 10) continue;
    const r = add(new T.BoxGeometry(14, .5, L), Mt(0xb8ab95), (a.x + b.x) / 2, .3, (a.z + b.z) / 2); r.lookAt(b.x, .3, b.z); r.castShadow = false;
  }
  // подписи объектов (только на шаге «Актогай»)
  const TAGS = [[PIT.clone().setY(30), 'Карьер', 'медно-порфировое месторождение'], [V(-90, 48, -260), 'Отвалы', 'пустая порода'], [V(HEAP.x, 30, HEAP.z), 'Выщелачивание', 'окисленная руда · в модели нет'], [V(126, 74, -5), 'Обогатительная фабрика', 'две линии · сульфидная руда'], [V(TAIL.x + 20, TOP + 26, TAIL.z + 10), 'Хвостохранилище', 'хвосты флотации'], [V(-40, 70, -420), 'ВЭС 300 МВт', 'допущение «Тыныс»']];
  const tagLayer = document.createElement('div'); tagLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:7'; document.body.appendChild(tagLayer);
  const tags = TAGS.map(([p, a, b]) => { const el = document.createElement('div'); el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);background:#fbfcfd;color:#0f1c2c;border-radius:7px;padding:6px 10px;font:600 12.5px var(--k-body);box-shadow:0 6px 24px rgba(0,0,0,.3);white-space:nowrap;opacity:0;transition:opacity .6s'; el.innerHTML = `${a}` + (innerWidth > 900 ? `<small style="display:block;font:400 10.5px var(--k-body);color:#4d5d6f">${b}</small>` : ''); tagLayer.appendChild(el); return {p, el}; });
  let tagsOn = false;

  /* --- подсветка: пульсирующие кольца на земле показывают, о чём шаг --- */
  const COL = {teal: 0x22d3b6, red: 0xff4b3a, gold: 0xffb627, violet: 0x8b7bff, green: 0x37d67a, orange: 0xff7a2f, blue: 0x3d9bff};
  const ringPool = [0, 1, 2].map(() => {
    const g = new T.Group(); g.visible = false; scene.add(g);
    const mk = (geo, o) => { const m = new T.Mesh(geo, new T.MeshBasicMaterial({color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, fog: false})); m.renderOrder = 6; g.add(m); return m; };
    return {g, r1: mk(new T.RingGeometry(.9, 1, 96).rotateX(-Math.PI / 2)), r2: mk(new T.RingGeometry(.96, 1, 96).rotateX(-Math.PI / 2)), disc: mk(new T.CircleGeometry(.9, 64).rotateX(-Math.PI / 2)), op: 0, target: 0, ph: Math.random()};
  });
  const FOCUS = {
    problem: [[1500, -1100, 190, 'red']], waste: [[183, -428, 300, 'gold']],
    idea: [[126, -5, 80, 'green'], [40, -15, 52, 'violet']], trucks: [[10, 120, 70, 'teal'], [-130, 10, 118, 'gold']],
    real: [[126, -5, 80, 'violet']], platform: [[-130, 10, 118, 'teal'], [126, -5, 80, 'teal'], [244, 69, 40, 'teal']],
    sizing: [[183, -428, 300, 'gold'], [190, 235, 150, 'blue']], result: [[190, 235, 150, 'blue'], [244, 69, 42, 'green'], [10, 120, 70, 'teal']],
    futures: [[260, -60, 45, 'orange']], final: [[126, -5, 80, 'green']],
  };
  const SCEN_FOCUS = {lull: [183, -428, 300, 'gold'], trip: [86, -19, 30, 'red'], kegoc: [260, -60, 45, 'orange'], hard: [-130, 10, 118, 'violet'], crusher: [10, -10, 34, 'red']};
  function setRing(i, f) {
    const R = ringPool[i]; if (!f) { R.target = 0; return; }
    const [x, z, r, c] = f; R.g.position.set(x, Math.max(0, TH(x, z)) + 1.4, z); R.g.scale.setScalar(r); R.g.visible = true; R.target = 1;
    [R.r1, R.r2, R.disc].forEach(m => m.material.color.setHex(COL[c] || c));
  }
  function focus(k) { const f = FOCUS[k] || []; ringPool.forEach((_, i) => setRing(i, f[i])); mapFocus(f); breath.target = k === 'idea' ? 1 : k === 'final' || k === 'intro' ? .55 : 0; breath.big = k !== 'idea'; if (k !== 'idea') { domeMat.color.setHex(COL.teal); domeEdge.material.color.setHex(COL.teal); } }

  /* --- рудник «дышит»: полупрозрачный купол медленно вдыхает и выдыхает --- */
  const breath = {target: 0, op: 0, big: false, col: new T.Color(COL.green)};
  const domeMat = new T.MeshBasicMaterial({color: COL.green, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, fog: false});
  const dome = new T.Mesh(new T.SphereGeometry(1, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), domeMat); dome.renderOrder = 7; dome.visible = false; scene.add(dome);
  const domeEdge = new T.Mesh(new T.TorusGeometry(1, .012, 8, 128).rotateX(Math.PI / 2), new T.MeshBasicMaterial({color: COL.green, transparent: true, opacity: 0, depthWrite: false, fog: false})); dome.add(domeEdge);

  /* --- облака высоко в небе и их тени, бегущие по руднику --- */
  const puff = document.createElement('canvas'); puff.width = 256; puff.height = 128; const px = puff.getContext('2d');
  for (let i = 0; i < 9; i++) { const x = 50 + Math.random() * 156, y = 54 + Math.random() * 26, r = 26 + Math.random() * 30, g = px.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); px.fillStyle = g; px.fillRect(0, 0, 256, 128); }
  const puffTex = new T.CanvasTexture(puff); puffTex.colorSpace = T.SRGBColorSpace;
  const shc = document.createElement('canvas'); shc.width = shc.height = 128; const sx = shc.getContext('2d'); const sg = sx.createRadialGradient(64, 64, 4, 64, 64, 64); sg.addColorStop(0, 'rgba(20,30,50,.9)'); sg.addColorStop(1, 'rgba(20,30,50,0)'); sx.fillStyle = sg; sx.fillRect(0, 0, 128, 128);
  const shTex = new T.CanvasTexture(shc);
  const clouds = Array.from({length: 14}, (_, i) => {
    const sp = new T.Sprite(new T.SpriteMaterial({map: puffTex, transparent: true, depthWrite: false, fog: false, opacity: .9}));
    const w = 420 + Math.random() * 380; sp.scale.set(w, w * .42, 1); sp.position.set(-1400 + Math.random() * 2800, 980 + Math.random() * 180, -1600 + Math.random() * 3200); scene.add(sp);
    const shd = new T.Mesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({map: shTex, transparent: true, depthWrite: false, opacity: 0})); shd.scale.set(w * .55, 1, w * .32); shd.renderOrder = 4; scene.add(shd);
    return {sp, shd, v: 9 + Math.random() * 7};
  });

  /* --- мини-схема рудника: где камера и что подсвечено (север вверху: −x сцены) --- */
  const SVGNS = 'http://www.w3.org/2000/svg', msvg = $('mapsvg');
  const mp = (x, z) => [-z, x];
  const el = (tag, attrs, parent = msvg) => { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
  el('rect', {x: -440, y: -540, width: 980, height: 1080, rx: 40, class: 'm-bg'});
  [[-350, -170, 124], [-390, 160, 104], [-90, -260, 86]].forEach(([x, z, r]) => { const [a, b] = mp(x, z); el('circle', {cx: a, cy: b, r, class: 'm-dump'}); });
  { const [a, b] = mp(175, -200); el('rect', {x: a - 52, y: b - 80, width: 104, height: 160, rx: 6, class: 'm-heap'}); }
  { const [a, b] = mp(362, 44); el('ellipse', {cx: a, cy: b, rx: 108, ry: 100, class: 'm-tail'}); el('ellipse', {cx: a - 26, cy: b + 30, rx: 38, ry: 30, class: 'm-pond'}); }
  { const [a, b] = mp(-130, 10); el('circle', {cx: a, cy: b, r: 100, class: 'm-pit'}); el('circle', {cx: a, cy: b, r: 55, class: 'm-pit2'}); }
  { const [a, b] = mp(126, -5); el('rect', {x: a - 50, y: b - 32, width: 100, height: 64, rx: 6, class: 'm-plant'}); }
  { const [a, b] = mp(60, 180); el('rect', {x: -320, y: b, width: 130, height: 260, rx: 6, class: 'm-pv'}); }
  for (let i = 0; i < 14; i++) { const [a, b] = mp(-60 + (i % 7) * 75 + (Math.floor(i / 7) % 2) * 37, -380 - Math.floor(i / 7) * 95); el('circle', {cx: a, cy: b, r: 11, class: 'm-wind'}); }
  { const [a, b] = mp(260, -60); el('rect', {x: a - 16, y: b - 16, width: 32, height: 32, class: 'm-sub'}); }
  el('text', {x: 330, y: 525, class: 'm-t'}).textContent = 'ТЭС ↘';
  [['карьер', -130, 10], ['фабрика', 126, -5], ['ВЭС', 140, -430], ['хвосты', 362, 44]].forEach(([t, x, z]) => { const [a, b] = mp(x, z); el('text', {x: a, y: b + 22, class: 'm-l'}).textContent = t; });
  const mFocus = el('g', {}), mCone = el('path', {class: 'm-cone'}), mCam = el('circle', {r: 16, class: 'm-cam'});
  function mapFocus(f) { mFocus.innerHTML = ''; f.forEach(([x, z, r, c]) => { const [a, b] = mp(Math.min(x, 520), Math.max(z, -600)); el('circle', {cx: a, cy: b, r: Math.min(r, 300), class: 'm-focus', style: `stroke:#${(COL[c] || 0xffffff).toString(16).padStart(6, '0')}`}, mFocus); }); }
  const camDir = new T.Vector3();
  function mapCam() {
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const [cx, cy] = mp(camera.position.x, camera.position.z), [tx, ty] = mp(controls.target.x, controls.target.z);
    const ax = clamp(cx, -420, 520), ay = clamp(cy, -520, 520), ang = Math.atan2(ty - cy, tx - cx), L = 170, s = .42;
    mCam.setAttribute('cx', ax); mCam.setAttribute('cy', ay);
    mCone.setAttribute('d', `M${ax},${ay} L${ax + Math.cos(ang - s) * L},${ay + Math.sin(ang - s) * L} A${L},${L} 0 0 1 ${ax + Math.cos(ang + s) * L},${ay + Math.sin(ang + s) * L} Z`);
  }

  /* --- экраны над рудником: пульт и «Два будущих» --- */
  const screens = {};
  const loader = new T.TextureLoader();
  function makeScreen(key, pos) {
    const g = new T.Group(); g.position.copy(pos); g.scale.setScalar(.001); g.visible = false; scene.add(g);
    const tex = loader.load(SHOTS[key].src); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
    const W = 128, H = 80;
    const frame = new T.Mesh(new T.BoxGeometry(W + 6, H + 6, 3), new T.MeshStandardMaterial({color: 0x0b1420, metalness: .6, roughness: .35}));
    const glow = new T.Mesh(new T.PlaneGeometry(W + 14, H + 14), new T.MeshBasicMaterial({color: 0x7fe3d4, transparent: true, opacity: .22, depthWrite: false})); glow.position.z = -2;
    const screen = new T.Mesh(new T.PlaneGeometry(W, H), new T.MeshBasicMaterial({map: tex, toneMapped: false})); screen.position.z = 1.6;
    const stand = new T.Mesh(new T.CylinderGeometry(1.2, 1.2, 60, 8), new T.MeshStandardMaterial({color: 0x39424a})); stand.position.set(0, -H / 2 - 30, -1);
    g.add(glow, frame, screen, stand);
    screens[key] = {g, pos, W, H, show: 0, target: 0};
  }
  makeScreen('pult', V(-60, 205, -150));
  makeScreen('futures', V(250, 205, -150));

  /* --- сценарии на сцене: подмена текущего кадра записи (только в показе) --- */
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
  /* у каждого шага — свой отрезок записи стенда (часы, когда видно то, о чём говорим); свет и цифры идут вместе */
  const TR = Array.isArray(window.TYNYS_TRACE) && window.TYNYS_TRACE.length === 96 ? window.TYNYS_TRACE : null;
  const FRAMES = {intro: [11, 17], site: [12, 17], problem: [57, 60], waste: [36, 41], idea: [35, 42], trucks: [83, 90], real: [12, 17], platform: [84, 90], pult: [13, 17], sizing: [37, 41], result: [87, 91], futures: [61, 65], scen: [59, 66], jury: [85, 91], final: [21, 23]};
  let fr = {a: 11, b: 17, t0: performance.now()};
  window.__pitchOverride = frame => {
    let d = frame;
    if (TR && !dayModeFree()) d = TR[Math.min(fr.b, fr.a + Math.floor((performance.now() - fr.t0) / 5000))];
    if (!overlay) return d; d = Object.assign({}, d); OV[overlay](d); return d;
  };
  function dayModeFree() { return dayMode === 'cycle'; }

  /* --- кадры камеры --- */
  const SH = {
    intro:    {p: V(300, 280, 460), t: V(20, -20, -20), view: 'tynys', auto: true},
    site:     {p: V(-150, 540, 700), t: V(190, -10, 20), view: 'now', auto: true},
    problem:  {p: V(1150, 300, -620), t: V(1500, 120, -1100), view: 'now'},
    waste:    {p: V(330, 200, -60), t: V(130, 80, -400), view: 'now'},
    idea:     {p: V(-40, 120, -190), t: V(70, 0, 0), view: 'tynys'},
    trucks:   {p: V(80, 55, 200), t: V(10, 0, 110), view: 'tynys'},
    real:     {p: V(270, 110, 160), t: V(120, 10, -5), view: 'tynys'},
    platform: {p: V(430, 380, 560), t: V(0, -20, 0), view: 'tynys', auto: true},
    pult:     {screen: 'pult', view: 'tynys'},
    sizing:   {p: V(150, 150, -110), t: V(-60, 45, -380), view: 'tynys'},
    result:   {p: V(420, 260, 330), t: V(80, 0, -20), view: 'tynys'},
    futures:  {screen: 'futures', view: 'tynys'},
    scen:     {p: V(270, 250, 340), t: V(0, -20, 0), view: 'tynys'},
    jury:     {p: V(0, 760, 260), t: V(0, 0, -20), view: 'tynys', auto: true},
    final:    {p: V(300, 280, 460), t: V(20, -20, -20), view: 'tynys', auto: true},
  };
  const SCEN = [['lull', 'штиль'], ['trip', 'авария линии 2'], ['kegoc', 'запрос KEGOC'], ['hard', 'твёрдая руда'], ['crusher', 'отказ дробилки']];
  let fly = null, curStep = null, shotKey = null, toggleT = 0, cycleT = 0, cycleI = -1;

  /* --- день и ночь --- */
  let dayMode = null, cycleHour = 6;
  const DAY = {morning: 7, day: 12.5, sunset: 19.2, night: 22.5};
  document.querySelectorAll('#pday button').forEach(b => b.onclick = () => {
    const m = b.dataset.d; dayMode = m === 'slide' ? null : m;
    document.querySelectorAll('#pday button').forEach(x => x.setAttribute('aria-pressed', x === b));
    if (m === 'slide') lightForStep(); else if (m === 'cycle') cycleHour = 6; else S.setLightingHour(DAY[m]);
  });
  function lightForStep() { if (dayMode) return; S.setLightingHour(curStep && SH[curStep.k].night ? 21.5 : null); }

  function screenCam(key) {
    const s = screens[key], aspect = innerWidth / innerHeight, fov = T.MathUtils.degToRad(camera.fov), tn = Math.tan(fov / 2), wide = innerWidth > 900;
    const d = wide ? Math.max((s.H / 2) / tn / .64, (s.W / 2) / (tn * aspect) / .55) : (s.W / 2) / (tn * aspect) / .94;
    const dx = wide ? -.28 * d * tn * aspect : 0, dy = wide ? 0 : -.45 * d * tn;
    return {p: V(s.pos.x + dx, s.pos.y + dy, s.pos.z + d), t: V(s.pos.x + dx, s.pos.y + dy, s.pos.z)};
  }
  function apply(step) {
    const sh = SH[step.k]; curStep = step;
    S.setView(sh.view); lightForStep();
    document.body.classList.toggle('nolabels', step.labels === false || !!step.tags);
    focus(step.k);
    if (FRAMES[step.k]) fr = {a: FRAMES[step.k][0], b: FRAMES[step.k][1], t0: performance.now()};
    overlay = step.ov || null; cycleI = -1; cycleT = 0; toggleT = 0; tagsOn = !!step.tags;
    Object.entries(screens).forEach(([key, s]) => { s.target = step.screen === key ? 1 : 0; if (s.target) s.g.visible = true; });
    hideShot(); shotKey = null;
    const dst = step.screen ? screenCam(step.screen) : {p: sh.p.clone(), t: sh.t.clone()};
    if (!step.screen && innerWidth <= 900) dst.p.sub(dst.t).multiplyScalar(1.3).add(dst.t);
    controls.autoRotate = false;
    fly = {from: {p: camera.position.clone(), t: controls.target.clone()}, to: dst, start: performance.now(), dur: reduce ? 1 : 3400, auto: !step.screen, fast: !!sh.auto, shot: step.screen || null};
    if (step.k === 'idea' || step.k === 'platform') readLive();
  }
  function showShot(key) {
    const box = $('pshot'), img = $('pshotimg'), hot = $('pshothot');
    img.src = SHOTS[key].src; hot.innerHTML = SHOTS[key].dots.map(([x, y], i) => `<span class="dot" style="left:${x * 100}%;top:${y * 100}%;animation-delay:${i * .15}s">${i + 1}</span>`).join('');
    box.hidden = false; placeShot(key); requestAnimationFrame(() => box.classList.add('show'));
  }
  function placeShot(key) {
    const s = screens[key]; if (!s) return;
    const p = [[-1, 1], [1, -1]].map(([sx, sy]) => V(s.pos.x + sx * s.W / 2, s.pos.y + sy * s.H / 2, s.pos.z + 1.6).project(camera));
    const w = innerWidth, h = innerHeight, x0 = (p[0].x + 1) / 2 * w, y0 = (1 - p[0].y) / 2 * h, x1 = (p[1].x + 1) / 2 * w, y1 = (1 - p[1].y) / 2 * h;
    Object.assign($('pshotbox').style, {left: x0 + 'px', top: y0 + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px'});
  }
  function hideShot() { const box = $('pshot'); box.classList.remove('show'); setTimeout(() => { if (!box.classList.contains('show')) box.hidden = true; }, 900); }

  /* --- живые числа из записи стенда --- */
  const fmt = (x, k = 0) => Number.isFinite(Number(x)) ? Number(x).toLocaleString('ru-RU', {maximumFractionDigits: k, minimumFractionDigits: k}) : '—';
  function readLive() {
    let D; try { D = S.data; } catch (e) { return; }
    $('clock2').textContent = `запись стенда · ${D.site?.sim_time || ''} · самосвалы ×6`;
    const inhale = /вдох/.test(D.coordinator?.mode || '');
    if (curStep && curStep.k === 'idea') { const c = inhale ? COL.green : COL.orange; [ringPool[0].r1, ringPool[0].r2, ringPool[0].disc].forEach(m => m.material.color.setHex(c)); domeMat.color.setHex(c); domeEdge.material.color.setHex(c); }
    if ($('pin')) { $('pin').classList.toggle('live', inhale); $('pout').classList.toggle('live', !inhale); $('modeT').textContent = inhale ? 'Сейчас: вдох — энергии много' : 'Сейчас: выдох — энергии мало'; }
    if ($('pwhy') && D.coordinator?.why) $('pwhy').textContent = '«' + D.coordinator.why + '»';
    if ($('plivegrid')) $('plivegrid').innerHTML = [[D.site?.sim_time || '—', 'модельное время'], [fmt(D.energy?.load_mw) + ' МВт', 'нагрузка рудника'], [fmt(D.energy?.renew_share_pct) + ' %', 'доля ветра и солнца'], [fmt(D.substation?.grid_mw) + ' МВт', 'из сети'], [fmt(D.plant?.feed_tph) + ' т/ч', 'переработка руды'], [fmt(D.coordinator?.charge_mw) + ' МВт', 'зарядка самосвалов']].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');
  }
  setInterval(readLive, 1500);

  const tmpP = new T.Vector3(), m4 = new T.Matrix4();
  const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    if (dayMode === 'cycle') { cycleHour = (cycleHour + dt * .4) % 24; S.setLightingHour(cycleHour); const hh = Math.floor(cycleHour), mm = Math.floor((cycleHour - hh) * 60); $('pdayclock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
    if (fly) {
      const k = Math.min(1, (now - fly.start) / fly.dur), e = ease(k);
      controls.enabled = false;
      camera.position.lerpVectors(fly.from.p, fly.to.p, e);
      camera.position.y += Math.sin(Math.PI * e) * Math.min(160, fly.from.p.distanceTo(fly.to.p) * .18);
      controls.target.lerpVectors(fly.from.t, fly.to.t, e);
      if (k >= 1) { controls.enabled = true; controls.autoRotateSpeed = fly.fast ? .35 : .12; controls.autoRotate = fly.auto && !reduce; const sk = fly.shot; fly = null; if (sk) { shotKey = sk; setTimeout(() => { if (shotKey === sk) showShot(sk); }, 250); } }
    }
    if (shotKey && !$('pshot').hidden) { camera.updateMatrixWorld(); placeShot(shotKey); }
    Object.values(screens).forEach(s => { s.show += (s.target - s.show) * Math.min(1, dt * 3); s.g.scale.setScalar(Math.max(.001, s.show)); s.g.rotation.y = (1 - s.show) * .6; if (s.show < .01 && !s.target) s.g.visible = false; });
    if (curStep?.toggle) { toggleT += dt; const v = Math.floor(toggleT / 4.5) % 2 ? 'tynys' : 'now'; if (document.body.dataset.view !== v) S.setView(v); $('chipS').textContent = v === 'now' ? 'ВЭС 300 + СЭС 250 · сцена: как сейчас' : 'ВЭС 300 + СЭС 250 · сцена: с «Тыныс» — СЭС, накопитель, зарядки'; }
    if (curStep?.cycle) { cycleT += dt; const i = Math.floor(cycleT / 5.5) % SCEN.length; if (i !== cycleI) { cycleI = i; overlay = SCEN[i][0]; setRing(0, SCEN_FOCUS[overlay]); const ps = $('pscen'); if (ps) ps.textContent = SCEN[i][1]; document.querySelectorAll('#pscenchips span').forEach(c => c.classList.toggle('hot', c.dataset.s === SCEN[i][0])); } }
    const ts = now / 1000;
    let dk = 1; try { dk = S.dayK; } catch (e) {}
    clouds.forEach(c => { c.sp.position.z += c.v * dt * 3; if (c.sp.position.z > 1700) c.sp.position.z = -1700; c.sp.material.opacity = .25 + .65 * dk; const p = c.sp.position; c.shd.position.set(p.x - 120, 1.6 + Math.max(0, TH(p.x - 120, p.z)), p.z); c.shd.material.opacity = .17 * dk; });
    breath.op += (breath.target - breath.op) * Math.min(1, dt * 2);
    if (breath.op > .01) { dome.visible = true; const b = .5 + .5 * Math.sin(ts * 2 * Math.PI / 5); const R = breath.big ? 430 : 92; const sc = R * (.88 + .14 * b); dome.scale.set(sc, sc * (breath.big ? .32 : .62), sc); dome.position.set(breath.big ? 40 : 126, 0, breath.big ? -10 : -5); domeMat.opacity = breath.op * (.08 + .1 * b); domeEdge.material.opacity = breath.op * (.35 + .4 * b); } else dome.visible = false;
    mapCam();
    ringPool.forEach(R => { R.op += (R.target - R.op) * Math.min(1, dt * 2.5); if (R.op < .01 && !R.target) { R.g.visible = false; return; } const k = ((ts * .55 + R.ph) % 1); R.r1.material.opacity = R.op * .9; R.r2.scale.setScalar(1 + k * .45); R.r2.material.opacity = R.op * (1 - k) * .8; R.disc.material.opacity = R.op * (.14 + .06 * Math.sin(ts * 3)); });
    for (let i = 0; i < 18; i++) { pipe.getPointAt((ts * .05 + i / 18) % 1, tmpP); m4.makeTranslation(tmpP.x, tmpP.y + .4, tmpP.z); slurry.setMatrixAt(i, m4); } slurry.instanceMatrix.needsUpdate = true;
    const w = innerWidth, h = innerHeight, tmp = new T.Vector3();
    tags.forEach(t => { const on = tagsOn && !fly; if (on) { tmp.copy(t.p).project(camera); const vis = tmp.z < 1 && Math.abs(tmp.x) < 1 && Math.abs(tmp.y) < 1; t.el.style.left = ((tmp.x + 1) / 2 * w) + 'px'; t.el.style.top = ((1 - tmp.y) / 2 * h) + 'px'; t.el.style.opacity = vis ? 1 : 0; } else t.el.style.opacity = 0; });
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  ready = apply;
  camera.position.set(1400, 900, 1700); controls.target.set(60, 0, -40);
  go(startIdx(), true);
  if (fly) fly.dur = reduce ? 1 : 6500;
  addEventListener('hashchange', () => { const m = /^#slide-(\d+)$/.exec(location.hash); if (m && +m[1] - 1 !== cur) go(+m[1] - 1, true); });
  addEventListener('resize', () => { if (curStep && curStep.screen && !fly) { const d = screenCam(curStep.screen); camera.position.copy(d.p); controls.target.copy(d.t); camera.updateMatrixWorld(); placeShot(curStep.screen); } });
  setTimeout(() => $('pv-loading').classList.add('gone'), 700);
}
})();
