// «Тыныс 3D»: трёхмерная сцена рудника Актогай. Все числа — из двойников Eclipse Ditto
// (через прокси экрана /ditto); геометрия — схематичная, масштаб ~1 ед. = 10 м.
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from './vendor/CSS2DRenderer.js';

const NS = 'kz.tynys';
const NAMES = ['site', 'pit', 'plant', 'energy', 'coordinator', 'scenario', 'shadow-v0', 'pile-soft', 'pile-hard', 'line-1', 'line-2',
  'flotation', 'wind', 'pv', 'bess', 'substation', ...Array.from({ length: 14 }, (_, i) => `truck-${String(i + 1).padStart(2, '0')}`)];
let T = {};
const v = (n, f, d = 0) => { try { const x = T[n].features[f].properties.value; return x ?? d; } catch (e) { return d; } };
const fmt = (x, k = 0) => (x == null || isNaN(x)) ? '—' : Number(x).toLocaleString('ru-RU', { maximumFractionDigits: k, minimumFractionDigits: k });
const $ = id => document.getElementById(id);

// ---------- рендер ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const labels = new CSS2DRenderer();
labels.domElement.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2';
document.body.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9fb4c4, 350, 1100);
const camera = new THREE.PerspectiveCamera(45, 1, 1, 4000);
const HOME = { pos: new THREE.Vector3(170, 230, 330), tgt: new THREE.Vector3(10, -10, 0) };
camera.position.copy(HOME.pos);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.tgt); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 40; controls.maxDistance = 900;

const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b5a45, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -350, right: 350, top: 350, bottom: -350, far: 1500 });
scene.add(sun, sun.target);

function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); labels.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = scene) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
function label(html, x, y, z, parent = scene) {
  const d = document.createElement('div'); d.className = 'lbl'; d.innerHTML = html;
  const o = new CSS2DObject(d); o.position.set(x, y, z); parent.add(o); return d;
}

// ---------- земля с карьером ----------
const PIT = new THREE.Vector3(-130, 0, 10), PIT_R = 95, PIT_D = 66, BENCH = 11;
{
  const shape = new THREE.Shape(); shape.moveTo(-1500, -1500); shape.lineTo(1500, -1500); shape.lineTo(1500, 1500); shape.lineTo(-1500, 1500);
  const hole = new THREE.Path(); hole.absarc(PIT.x, -PIT.z, PIT_R, 0, Math.PI * 2, true); shape.holes.push(hole);
  const g = new THREE.ShapeGeometry(shape, 64); g.rotateX(-Math.PI / 2);
  mesh(g, M(0xb59d74, { roughness: 1 })).castShadow = false;
  // уступы карьера: профиль «полка — откос», вращённый вокруг оси
  const prof = [new THREE.Vector2(0, -PIT_D)];
  const n = Math.round(PIT_D / BENCH);
  for (let i = 0; i <= n; i++) {
    const y = -PIT_D + i * BENCH, r0 = 28 + i * (PIT_R - 28) / n;
    prof.push(new THREE.Vector2(r0, y), new THREE.Vector2(r0 + 3.5, Math.min(0, y + BENCH)));
  }
  prof.push(new THREE.Vector2(PIT_R, 0));
  const lg = new THREE.LatheGeometry(prof, 96);
  const col = [], pos = lg.attributes.position, c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = -pos.getY(i), t = y / PIT_D;   // 0 — борт, 1 — дно
    const band = Math.floor(y / BENCH) % 3, onBench = (y % BENCH) < 0.6;
    c.setHSL([0.07, 0.05, 0.09][band] - 0.03 * t, 0.3 + 0.12 * band, (onBench ? 0.55 : 0.4) - 0.18 * t); col.push(c.r, c.g, c.b);
  }
  lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const pit = mesh(lg, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.BackSide, roughness: 1, flatShading: true }), PIT.x, 0, PIT.z);
  pit.castShadow = false;
  mesh(new THREE.CircleGeometry(28, 48).rotateX(-Math.PI / 2), M(0x4a3a2c), PIT.x, -PIT_D + 0.1, PIT.z);
  // зелёная вода на дне — как в настоящих карьерах после дождя
  mesh(new THREE.CircleGeometry(9, 32).rotateX(-Math.PI / 2), M(0x3f8f7a, { roughness: 0.2, metalness: 0.3 }), PIT.x + 10, -PIT_D + 0.25, PIT.z - 8);
  // отвалы пустой породы
  for (const [x, z, r, h] of [[-280, -90, 70, 28], [-300, 110, 60, 22], [-60, -160, 55, 20]]) {
    const g2 = new THREE.CylinderGeometry(r * 0.7, r, h, 40, 1); mesh(g2, M(0x9a8466, { roughness: 1 }), x, h / 2, z);
  }
  // далёкие холмы
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2, R = 700 + 120 * Math.sin(i * 3.1);
    const h = 40 + 30 * Math.sin(i * 1.7) ** 2;
    mesh(new THREE.ConeGeometry(160, h, 24), M(0xa89272, { roughness: 1 }), Math.cos(a) * R, h / 2 - 2, Math.sin(a) * R).castShadow = false;
  }
}
label('<b>Карьер Актогай</b><span id="l-pit">—</span>', PIT.x, 18, PIT.z - PIT_R);

// ---------- дорога: спираль в карьере + дорога к складам ----------
const PILES = new THREE.Vector3(30, 0, -15);
const roadPts = [];
for (let i = 0; i <= 60; i++) {
  const s = i / 60, a = -0.6 + s * Math.PI * 2.1, r = 30 + s * (PIT_R - 30);
  roadPts.push(new THREE.Vector3(PIT.x + Math.cos(a) * r, -PIT_D + 1 + s * PIT_D, PIT.z + Math.sin(a) * r));
}
const rim = roadPts[roadPts.length - 1];
roadPts.push(new THREE.Vector3(rim.x + 30, 0.5, rim.z + 10), new THREE.Vector3(-20, 0.5, -5), new THREE.Vector3(PILES.x - 22, 0.5, PILES.z + 8));
const road = new THREE.CatmullRomCurve3(roadPts);
{
  const N = 400, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const p = road.getPointAt(i / N), t = road.getTangentAt(i / N), s = new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(4.5);
    pos.push(p.x + s.x, p.y + 0.3, p.z + s.z, p.x - s.x, p.y + 0.3, p.z - s.z);
    if (i < N) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = mesh(g, M(0x6e6559, { side: THREE.DoubleSide, roughness: 1 })); m.castShadow = false;
}

// ---------- экскаваторы ----------
const shovels = [];
for (const [dx, dz] of [[-12, 6], [10, -10]]) {
  const g = new THREE.Group(); g.position.set(PIT.x + dx, -PIT_D + 0.3, PIT.z + dz); scene.add(g);
  mesh(new THREE.BoxGeometry(9, 2.5, 7), M(0x333333), 0, 1.2, 0, g);
  const body = new THREE.Group(); body.position.y = 2.5; g.add(body);
  mesh(new THREE.BoxGeometry(8, 5, 6), M(0xf2b632), 0, 2.5, 0, body);
  const boom = mesh(new THREE.BoxGeometry(12, 1.2, 1.2), M(0xf2b632), 8, 5, 0, body); boom.rotation.z = 0.5;
  mesh(new THREE.BoxGeometry(3, 3, 4), M(0x555555), 13, 7.5, 0, body);
  shovels.push(body);
}

// ---------- самосвалы ----------
const CHARGE = new THREE.Vector3(10, 0, 100);
mesh(new THREE.BoxGeometry(70, 0.4, 26), M(0x58616b), CHARGE.x, 0.2, CHARGE.z);
const chargers = [];
for (let i = 0; i < 4; i++) {
  const c = mesh(new THREE.BoxGeometry(3, 7, 3), M(0x203041, { emissive: 0x2aa7d6, emissiveIntensity: 0 }), CHARGE.x - 27 + i * 18, 3.5, CHARGE.z - 11);
  chargers.push(c);
}
label('<b>Зарядка самосвалов</b><span id="l-ch">—</span>', CHARGE.x, 14, CHARGE.z);
const trucks = [];
const oreMat = { soft: M(0x7fbf7f), hard: M(0xc9785b) };
for (let i = 0; i < 14; i++) {
  const g = new THREE.Group(); scene.add(g);
  mesh(new THREE.BoxGeometry(9, 2, 5), M(0xffc21a, { metalness: 0.2 }), 0, 2.4, 0, g);
  mesh(new THREE.BoxGeometry(2.5, 2.6, 4.6), M(0xffc21a), 4.2, 4.6, 0, g);
  const bed = mesh(new THREE.BoxGeometry(6.2, 2.6, 5), M(0xd9a514), -1, 4.6, 0, g);
  const load = mesh(new THREE.SphereGeometry(2.6, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), oreMat.hard, -1, 5.8, 0, g);
  load.scale.set(1.15, 0.8, 0.95);
  for (const [x, z] of [[3, 2.6], [3, -2.6], [-2.8, 2.6], [-2.8, -2.6]])
    mesh(new THREE.CylinderGeometry(1.4, 1.4, 1.2, 14).rotateX(Math.PI / 2), M(0x1d1d1d), x, 1.4, z, g);
  const glow = new THREE.PointLight(0x4cc3ff, 0, 18); glow.position.y = 7; g.add(glow);
  g.scale.setScalar(0.85);
  trucks.push({ g, load, glow, phase: i / 14 });
}

// ---------- склады и конвейер ----------
const piles = {};
for (const [d, dz, col] of [['soft', -18, 0x7fbf7f], ['hard', 18, 0xc9785b]]) {
  const m = mesh(new THREE.ConeGeometry(18, 14, 36), M(col, { roughness: 1 }), PILES.x, 7, PILES.z + dz);
  piles[d] = m;
}
label('<b>Склад мягкой руды</b><span id="l-ps">—</span>', PILES.x, 26, PILES.z - 18);
label('<b>Склад твёрдой руды</b><span id="l-ph">—</span>', PILES.x, 26, PILES.z + 18);

const PLANT = new THREE.Vector3(105, 0, -5);
// конвейеры
const belts = [];
for (const dz of [-18, 18]) {
  const a = new THREE.Vector3(PILES.x + 16, 2, PILES.z + dz), b = new THREE.Vector3(PLANT.x - 22, 9, PLANT.z + (dz < 0 ? -12 : 12));
  const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
  const m = mesh(new THREE.BoxGeometry(len, 0.8, 3), M(0x2c3540), mid.x, mid.y, mid.z);
  m.lookAt(b); m.rotateY(Math.PI / 2);
  const dots = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.9, 1.6), dz < 0 ? oreMat.soft : oreMat.hard, 24);
  scene.add(dots); belts.push({ a, b, dots, rate: 0 });
}
// фабрика: корпус, две мельницы, флотация
mesh(new THREE.BoxGeometry(52, 22, 62), M(0x8d99a6, { roughness: 0.6, metalness: 0.3 }), PLANT.x + 6, 11, PLANT.z);
mesh(new THREE.BoxGeometry(54, 2, 64), M(0x5d6874), PLANT.x + 6, 23, PLANT.z);
const mills = [];
for (const [i, dz] of [[0, -12], [1, 12]]) {
  const grp = new THREE.Group(); grp.position.set(PLANT.x - 26, 10, PLANT.z + dz); scene.add(grp);
  const drum = mesh(new THREE.CylinderGeometry(7, 7, 14, 28).rotateZ(Math.PI / 2), M(0xb7c3cf, { metalness: 0.6, roughness: 0.35 }), 0, 0, 0, grp);
  for (let k = 0; k < 6; k++) mesh(new THREE.BoxGeometry(14.4, 0.8, 1.2), M(0x55606b), 0, Math.cos(k) * 7, Math.sin(k) * 7, drum);
  mesh(new THREE.CylinderGeometry(7.6, 7.6, 1.2, 28).rotateZ(Math.PI / 2), M(0x39434d), -7, 0, 0, grp);
  const lamp = mesh(new THREE.SphereGeometry(1.2, 12, 8), M(0x4fd18b, { emissive: 0x4fd18b, emissiveIntensity: 2 }), 0, 9, 0, grp);
  mills.push({ drum, lamp });
}
const cells = [];
for (let k = 0; k < 6; k++) cells.push(mesh(new THREE.CylinderGeometry(3.2, 3.2, 5, 20), M(0x5a6b7a, { metalness: 0.4 }), PLANT.x + 44, 2.5, PLANT.z - 20 + k * 8));
const froth = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 6, 4), M(0xd9b44a, { emissive: 0x6b4f10 }), 60); scene.add(froth);
label('<b>Фабрика · две линии</b><span id="l-pl">—</span>', PLANT.x, 34, PLANT.z);
label('<b>Флотация → медь</b><span id="l-fl">—</span>', PLANT.x + 44, 14, PLANT.z + 30);

// ---------- ВЭС ----------
const turbines = [];
const WIND = new THREE.Vector3(20, 0, -200);
for (let i = 0; i < 12; i++) {
  const x = WIND.x + (i % 6) * 55 + (Math.floor(i / 6) % 2) * 25, z = WIND.z - Math.floor(i / 6) * 70;
  mesh(new THREE.CylinderGeometry(1, 1.8, 60, 12), M(0xeef2f5, { roughness: 0.4 }), x, 30, z);
  mesh(new THREE.BoxGeometry(3, 3, 7), M(0xeef2f5), x, 61, z + 1.5);
  const hub = new THREE.Group(); hub.position.set(x, 61, z + 5.5); scene.add(hub);
  for (let k = 0; k < 3; k++) {
    const b = mesh(new THREE.BoxGeometry(1.2, 26, 0.4), M(0xf7f9fb, { roughness: 0.35 }), 0, 13, 0, hub);
    b.geometry.translate(0, 0, 0); const piv = new THREE.Group(); piv.rotation.z = k * Math.PI * 2 / 3; piv.add(b); hub.add(piv);
  }
  turbines.push(hub);
}
label('<b>ВЭС 300 МВт</b><span id="l-wind">—</span>', WIND.x + 60, 82, WIND.z + 10);

// ---------- СЭС ----------
const PV = new THREE.Vector3(80, 0, 110);
const panelMat = M(0x1d3557, { metalness: 0.6, roughness: 0.25, emissive: 0x1e5aa8, emissiveIntensity: 0 });
const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(10, 0.4, 5), panelMat, 140);
{
  const o = new THREE.Object3D(); let k = 0;
  for (let r = 0; r < 10; r++) for (let c = 0; c < 14; c++) {
    o.position.set(PV.x + c * 11.5, 2.5, PV.z + r * 9); o.rotation.set(-0.75, 0, 0); o.updateMatrix(); panels.setMatrixAt(k++, o.matrix);
  }
  panels.castShadow = true; scene.add(panels);
}
label('<b>СЭС 250 МВт</b><span id="l-pv">—</span>', PV.x + 80, 16, PV.z + 40);

// ---------- накопитель, подстанция, ЛЭП KEGOC ----------
const BESS = new THREE.Vector3(170, 0, 30);
const bessLights = [];
for (let i = 0; i < 6; i++) {
  mesh(new THREE.BoxGeometry(6, 6, 13), M(0xe9edf0), BESS.x + (i % 3) * 8, 3, BESS.z + Math.floor(i / 3) * 16);
  bessLights.push(mesh(new THREE.BoxGeometry(0.4, 4, 9), M(0x4fd18b, { emissive: 0x4fd18b, emissiveIntensity: 1 }), BESS.x + (i % 3) * 8 + 3.1, 3, BESS.z + Math.floor(i / 3) * 16));
}
label('<b>Накопитель 60 МВт</b><span id="l-bess">—</span>', BESS.x + 8, 16, BESS.z + 8);
const SUB = new THREE.Vector3(205, 0, -40);
mesh(new THREE.BoxGeometry(30, 1, 30), M(0x777f88), SUB.x, 0.5, SUB.z);
for (let i = 0; i < 4; i++) {
  mesh(new THREE.BoxGeometry(5, 7, 6), M(0x6a737c, { metalness: 0.5 }), SUB.x - 9 + i * 6, 4.5, SUB.z - 6);
  mesh(new THREE.CylinderGeometry(0.4, 0.4, 8), M(0xc0c6cc), SUB.x - 9 + i * 6, 12, SUB.z - 6);
}
label('<b>Подстанция 220 кВ</b><span id="l-grid">—</span>', SUB.x, 24, SUB.z);
const towerPts = [];
for (let i = 0; i < 7; i++) {
  const x = SUB.x + 60 + i * 110, z = SUB.z - 40 - i * 55;
  const t = mesh(new THREE.CylinderGeometry(0.8, 4.5, 42, 4), M(0x9aa3ab, { metalness: 0.6, wireframe: true }), x, 21, z);
  mesh(new THREE.BoxGeometry(22, 0.8, 0.8), M(0x9aa3ab), x, 40, z);
  towerPts.push(new THREE.Vector3(x, 39, z));
}
label('<b>KEGOC · уголь 66 %</b><span class="mute">0,79 т CO₂ / МВт·ч</span>', towerPts[2].x, 52, towerPts[2].z);

// ---------- потоки энергии: частицы по кривым ----------
function flow(points, color) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 80, 0.25, 6); mesh(geo, new THREE.MeshBasicMaterial({ color: 0x334455, transparent: true, opacity: 0.6 }));
  const n = 40, im = new THREE.InstancedMesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }), n);
  scene.add(im); return { curve, im, n, mw: 0, off: Math.random() };
}
const flows = {
  grid: flow([...towerPts.slice().reverse(), new THREE.Vector3(SUB.x, 14, SUB.z)], 0xb8c2cc),
  wind: flow([new THREE.Vector3(WIND.x + 140, 30, WIND.z + 10), new THREE.Vector3(SUB.x - 30, 22, SUB.z - 60), new THREE.Vector3(SUB.x - 4, 14, SUB.z - 10)], 0x5ec8e5),
  pv: flow([new THREE.Vector3(PV.x + 80, 10, PV.z - 4), new THREE.Vector3(SUB.x - 20, 18, SUB.z + 50), new THREE.Vector3(SUB.x + 4, 14, SUB.z + 10)], 0xf2c14e),
  plant: flow([new THREE.Vector3(SUB.x - 14, 14, SUB.z), new THREE.Vector3(PLANT.x + 40, 30, PLANT.z - 20), new THREE.Vector3(PLANT.x + 10, 24, PLANT.z)], 0x9ff5c6),
  charge: flow([new THREE.Vector3(SUB.x - 14, 14, SUB.z + 6), new THREE.Vector3(60, 26, 60), new THREE.Vector3(CHARGE.x + 20, 8, CHARGE.z - 11)], 0x4cc3ff),
};
const dummy = new THREE.Object3D();
function updFlow(f, dt) {
  f.off = (f.off + dt * (0.04 + Math.min(f.mw, 300) / 3000)) % 1;
  const vis = Math.round(Math.min(f.n, f.mw / 6));
  for (let i = 0; i < f.n; i++) {
    if (i < vis) { dummy.position.copy(f.curve.getPointAt((i / f.n + f.off) % 1)); dummy.scale.setScalar(1); }
    else dummy.scale.setScalar(0);
    dummy.updateMatrix(); f.im.setMatrixAt(i, dummy.matrix);
  }
  f.im.instanceMatrix.needsUpdate = true;
}

// ---------- данные ----------
async function poll() {
  try {
    const r = await fetch(`ditto/api/2/things?ids=${NAMES.map(n => NS + ':' + n).join(',')}&fields=thingId,features`);
    const data = await r.json(); T = {}; for (const t of data) T[t.thingId.split(':')[1]] = t;
    hud();
  } catch (e) { $('clock').textContent = 'нет связи с Ditto'; }
}
const set = (id, h) => { const e = document.getElementById(id); if (e) e.innerHTML = h; };
function hud() {
  const mode = v('coordinator', 'mode', '—');
  $('mode').textContent = mode === 'вдох' ? 'ВДОХ · копим энергию' : mode === 'выдох' ? 'ВЫДОХ · экономим' : '—';
  $('mode').className = mode === 'вдох' ? 'inhale' : 'exhale';
  $('clock').textContent = `модельное время ${v('site', 'sim_time', '')}`;
  $('whyt').innerHTML = `<b>Почему так:</b> ${v('coordinator', 'why', '—')}`;
  set('l-pit', `${fmt(v('pit', 'ore_tph'))} т/ч · твёрдой ${fmt(100 * v('pit', 'hard_frac'))} %`);
  set('l-ps', `${fmt(v('pile-soft', 'tonnes') / 1000)} тыс. т · ${fmt(v('pile-soft', 'fill_pct'))} %`);
  set('l-ph', `${fmt(v('pile-hard', 'tonnes') / 1000)} тыс. т · ${fmt(v('pile-hard', 'fill_pct'))} %`);
  set('l-pl', `${fmt(v('plant', 'feed_tph'))} т/ч · P80 ${fmt(v('plant', 'p80_um'))} мкм`);
  set('l-fl', `${fmt(v('flotation', 'cu_tph'), 1)} т меди/ч · извл. ${fmt(v('flotation', 'recovery'), 1)} %`);
  set('l-wind', `${fmt(v('wind', 'power_mw'))} МВт`);
  set('l-pv', `${fmt(v('pv', 'power_mw'))} МВт`);
  set('l-bess', v('bess', 'available', true) ? `заряд ${fmt(v('bess', 'soc'))} %` : 'ОТКАЗ');
  set('l-grid', `из сети ${fmt(v('substation', 'grid_mw'))} / ${fmt(v('substation', 'grid_cap_mw'))} МВт`);
  set('l-ch', `${fmt(v('energy', 'charge_mw'))} МВт`);
  const rows = [['Нагрузка', fmt(v('energy', 'load_mw')) + ' МВт'], ['Ветер + солнце', fmt(v('energy', 'renew_mw')) + ' МВт'],
    ['Доля ВИЭ', fmt(v('energy', 'renew_share_pct')) + ' %'], ['CO₂ сейчас', fmt(v('substation', 'co2_t_h')) + ' т/ч'],
    ['Медь с начала: Тыныс', fmt(v('site', 'cu_adj_t')) + ' т'], ['Медь: как сейчас', fmt(v('shadow-v0', 'cu_adj_t')) + ' т'],
    ['Резерв для KEGOC', fmt(v('substation', 'flex_down_mw')) + ' МВт']];
  $('kt').innerHTML = rows.map(([a, b]) => `<tr><td class="mute">${a}</td><td>${b}</td></tr>`).join('');
  flows.grid.mw = v('substation', 'grid_mw'); flows.wind.mw = v('wind', 'power_mw'); flows.pv.mw = v('pv', 'power_mw');
  flows.plant.mw = v('plant', 'mill_mw'); flows.charge.mw = v('energy', 'charge_mw') * 3;
  for (const [d, n] of [['soft', 'pile-soft'], ['hard', 'pile-hard']]) { const f = 0.35 + 0.9 * v(n, 'fill_pct', 50) / 100; piles[d].scale.set(f, f, f); piles[d].position.y = 7 * f; }
  belts[0].rate = v('plant', 'feed_soft_tph') / 4000; belts[1].rate = v('plant', 'feed_hard_tph') / 4000;
  for (let l = 0; l < 2; l++) {
    const n = `line-${l + 1}`, ok = v(n, 'available', true), q = v(n, 'feed_tph');
    mills[l].speed = q / 3330; mills[l].lamp.material.color.set(!ok ? 0xe0675a : q > 0 ? 0x4fd18b : 0x888888);
    mills[l].lamp.material.emissive.set(!ok ? 0xe0675a : q > 0 ? 0x4fd18b : 0x222222);
  }
  panelMat.emissiveIntensity = Math.min(1, v('pv', 'power_mw') / 250) * 0.9;
  const soc = v('bess', 'soc', 50) / 100;
  bessLights.forEach((b, i) => { b.scale.y = Math.max(0.05, soc); b.material.emissive.set(v('bess', 'available', true) ? 0x4fd18b : 0xe0675a); });
  const nch = Math.round(v('energy', 'charge_mw') / 18);
  chargers.forEach((c, i) => c.material.emissiveIntensity = i < nch ? 1.6 : 0);
}
poll(); setInterval(poll, 1000);

// ---------- время суток ----------
function sky() {
  const s = String(v('site', 'sim_time', '2026-06-01 12:00')); const q = new URLSearchParams(location.search).get('h');
  const h = q !== null ? +q : +(s.slice(11, 13) || 12);
  const a = (h - 6) / 12 * Math.PI;                       // 6 ч — восход, 18 ч — закат
  const day = Math.max(0, Math.sin(a));
  sun.position.set(Math.cos(a) * 500, 40 + Math.sin(a) * 450, 200);
  sun.intensity = 0.7 + 1.9 * day; hemi.intensity = 0.9 + 0.4 * day;
  sun.color.setHSL(0.1 + 0.5 * (1 - day), 0.4, 0.85);
  const top = new THREE.Color().lerpColors(new THREE.Color(0x24344c), new THREE.Color(0x8fb7d9), day);
  scene.background = top; scene.fog.color.copy(top);
}

// ---------- экскурсия ----------
const STOPS = [
  { p: [170, 230, 330], t: [10, -10, 0], h: 'Рудник Актогай · режим «Тыныс»', s: 'Карьер, фабрика и энергия — 37 цифровых двойников на OpenEgiz' },
  { p: [-60, 70, 120], t: [-130, -35, 10], h: 'Карьер', s: 'Электросамосвалы возят руду по спирали; мягкая и твёрдая руда идут на разные склады' },
  { p: [60, 45, 150], t: [10, 0, 100], h: 'Зарядка самосвалов', s: 'Заряжаем, когда энергия дешёвая и чистая; когда дорогая — ездим на батареях' },
  { p: [10, 60, -90], t: [70, 5, -10], h: 'Склады и фабрика', s: 'Ветер есть — мелем твёрдую руду и мелем тоньше. Ветра нет — мелем мягкую, твёрдую копим' },
  { p: [80, 110, -60], t: [140, 40, -240], h: 'Ветер и солнце', s: 'Реальная погода Актогая 2024 (Open‑Meteo ERA5)' },
  { p: [240, 60, 60], t: [205, 10, -40], h: 'Сеть KEGOC и накопитель', s: 'Уголь 66 %: каждый МВт·ч из сети — 0,79 т CO₂. Рудник может снизить нагрузку по просьбе KEGOC' },
  { p: [170, 230, 330], t: [10, -10, 0], h: 'Вдох и выдох', s: 'Координатор каждый час строит план на сутки и объясняет решение словами' },
];
let tour = null;
$('tour').onclick = () => { tour = { i: 0, t0: performance.now(), from: { p: camera.position.clone(), t: controls.target.clone() } }; };
$('reset').onclick = () => { tour = null; $('caption').style.opacity = 0; camera.position.copy(HOME.pos); controls.target.copy(HOME.tgt); };
renderer.domElement.addEventListener('pointerdown', () => { if (tour) { tour = null; $('caption').style.opacity = 0; } });
function tourStep(now) {
  if (!tour) return;
  const st = STOPS[tour.i], k = Math.min(1, (now - tour.t0) / 3500), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  camera.position.lerpVectors(tour.from.p, new THREE.Vector3(...st.p), e);
  controls.target.lerpVectors(tour.from.t, new THREE.Vector3(...st.t), e);
  $('caption').innerHTML = `${st.h}<small>${st.s}</small>`; $('caption').style.opacity = 1;
  if (now - tour.t0 > 8000) {
    tour.i++; if (tour.i >= STOPS.length) { tour = null; $('caption').style.opacity = 0; return; }
    tour.t0 = now; tour.from = { p: camera.position.clone(), t: controls.target.clone() };
  }
}

// ---------- анимация ----------
let last = performance.now(), rot = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  sky();
  rot += dt * (0.3 + 3.2 * v('wind', 'cf_pct', 0) / 100); turbines.forEach((h, i) => h.rotation.z = rot + i);
  mills.forEach(m => m.drum.rotation.x += dt * 1.5 * (m.speed || 0));
  shovels.forEach((s, i) => s.rotation.y = Math.sin(now / 1400 + i * 2) * 0.9);
  // самосвалы: фаза из двойника + плавное движение между обновлениями
  trucks.forEach((tr, i) => {
    const n = `truck-${String(i + 1).padStart(2, '0')}`, st = v(n, 'state', 'empty');
    tr.glow.intensity = st === 'charging' ? 3 : 0;
    if (st === 'charging') {
      const k = i % 4, row = Math.floor(i / 4);
      tr.g.position.set(CHARGE.x - 27 + k * 18, 0.4, CHARGE.z - 4 + row * 7); tr.g.rotation.y = Math.PI / 2; tr.load.visible = false; return;
    }
    const target = v(n, 'route_pos', tr.phase); let d = target - tr.phase; d -= Math.round(d);
    tr.phase = (tr.phase + dt * 0.02 + d * dt * 0.5 + 1) % 1;
    const up = tr.phase < 0.5, f = up ? tr.phase * 2 : 2 - tr.phase * 2;
    const p = road.getPointAt(f), t = road.getTangentAt(f), side = new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(up ? 2.2 : -2.2);
    tr.g.position.copy(p).add(side); tr.g.position.y = p.y + 0.3;
    tr.g.rotation.y = Math.atan2(-t.z, t.x) + (up ? 0 : Math.PI);
    tr.load.visible = st === 'loaded';
    tr.load.material = (i % 3 === 0 ? v('pit', 'hard_frac', 0.5) < 0.5 : v('pit', 'hard_frac', 0.5) >= 0.5) ? oreMat.hard : oreMat.soft;
  });
  belts.forEach(b => {
    b.off = ((b.off || 0) + dt * 0.08 * Math.max(0.05, b.rate)) % 1;
    for (let i = 0; i < 24; i++) {
      if (b.rate > 0.02) { dummy.position.lerpVectors(b.a, b.b, (i / 24 + b.off) % 1); dummy.position.y += 1; dummy.scale.setScalar(1); } else dummy.scale.setScalar(0);
      dummy.updateMatrix(); b.dots.setMatrixAt(i, dummy.matrix);
    }
    b.dots.instanceMatrix.needsUpdate = true;
  });
  const cu = v('flotation', 'cu_tph', 0);
  for (let i = 0; i < 60; i++) {
    const c = cells[i % 6].position, ph = (now / 1600 + i * 0.37) % 1;
    dummy.position.set(c.x + Math.sin(i * 7.1) * 2, 5 + ph * 4, c.z + Math.cos(i * 3.3) * 2);
    dummy.scale.setScalar(cu > 0 ? 1 - ph : 0); dummy.updateMatrix(); froth.setMatrixAt(i, dummy.matrix);
  }
  froth.instanceMatrix.needsUpdate = true;
  Object.values(flows).forEach(f => updFlow(f, dt));
  tourStep(now);
  controls.update();
  renderer.render(scene, camera); labels.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
