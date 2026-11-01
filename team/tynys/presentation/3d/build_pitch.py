"""Собирает 3D-презентацию из demo.html (настоящая сцена стенда на записи trace.json) + слой слайдов."""
import base64, pathlib, re, sys
HERE = pathlib.Path(__file__).resolve().parent
UI = HERE.parents[1] / "ui"   # team/tynys/ui: demo.html — собрать заранее: python ui/build_demo.py
html = (UI / "demo.html").read_text(encoding="utf-8")

def rep(old, new, count=1):
    global html
    if old not in html:
        sys.exit("not found: " + old[:80])
    html = html.replace(old, new, count)

# 1) хуки в модуле сцены
rep("function pollTrace() { const k = ((performance.now() - tStart) / 1000 / 4.0) % TRACE.length; D = TRACE[Math.floor(k)]; }",
    "function pollTrace() { const k = ((performance.now() - tStart) / 1000 / 4.0) % TRACE.length; D = TRACE[Math.floor(k)]; if (window.__pitchOverride) D = window.__pitchOverride(D); }")
rep("labels.domElement.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2';",
    "labels.domElement.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2'; labels.domElement.id = 'scene-labels';")
rep("window.__tynys = {", "window.__THREE = THREE; window.__trucks = trucks; window.__terrainH = terrainH; window.__tynys = {")

rep("source='replay';tStart=performance.now();", "source='replay';tStart=performance.now()-11*4000;")  # запись начинается в 22:00 — показ стартует с 09:00 утра

# 1b) самосвалы: ровные интервалы, две полосы без наложения, слоты зарядки
rep("s = new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(5);", "s = new THREE.Vector3(-t.z, 0, t.x).normalize().multiplyScalar(13.5);")
rep("normalize().multiplyScalar(-6.2); setInst(berm", "normalize().multiplyScalar(-15); setInst(berm")
rep("g.scale.setScalar(1.6);   // увеличены для наглядности", "g.scale.setScalar(1.15);   // увеличены для наглядности")
rep("const TRUCK_TIMELAPSE = 6;            // показ движения ускорен ×6",
    """const TRUCK_TIMELAPSE = 6;            // показ движения ускорен ×6
// Презентация: у всех движущихся звеньев одна и та же «временная фаза» рейса, сдвинутая
// на свою долю цикла. Гружёный подъём 12 км/ч и порожний спуск 30 км/ч не дают догнать
// друг друга; вернувшееся с зарядки звено встаёт в середину самого большого интервала.
const TRUCK_VUP = 12 / 3.6 / 10, TRUCK_VDN = 30 / 3.6 / 10;
const TRUCK_TC = ROAD_LEN / TRUCK_VUP + ROAD_LEN / TRUCK_VDN, TRUCK_A = (ROAD_LEN / TRUCK_VUP) / TRUCK_TC;
let truckU = 0;
function truckJoin(tr) {
  const offs = trucks.filter(o => o !== tr && (o._mv || o._was)).map(o => o.off).sort((a, b) => a - b);
  if (!offs.length) { tr.off = 0; return; }
  let best = -1, bi = 0;
  for (let k = 0; k < offs.length; k++) { const a = offs[k], b = k + 1 < offs.length ? offs[k + 1] : offs[0] + 1; if (b - a > best) { best = b - a; bi = k; } }
  tr.off = ((offs[bi] + best / 2) % 1 + 1) % 1;
}
function truckRelax(dt) {
  const mv = trucks.filter(o => o._mv).sort((a, b) => a.off - b.off), n = mv.length; if (n < 2) return;
  const d = mv.map((o, k) => { const prev = mv[(k - 1 + n) % n].off - (k === 0 ? 1 : 0), next = mv[(k + 1) % n].off + (k === n - 1 ? 1 : 0); return ((prev + next) / 2 - o.off) * Math.min(1, dt * 0.25); });
  mv.forEach((o, k) => { o.off = ((o.off + d[k]) % 1 + 1) % 1; });
}""")
rep("  const slots = { c: 0, w: 0 };", "  const slots = { c: 0, w: 0, ch: {} };\n  truckU = (truckU + Math.max(0, dt) * TRUCK_TIMELAPSE / TRUCK_TC) % 1;\n  trucks.forEach(o => { o._was = o._mv; o._mv = false; });")
rep("tr.g.position.set(CHARGE.x - 30 + k * 20, 0.4, CHARGE.z - 8 + Math.floor(i/4)*13);",
    "const q = slots.ch[k] = (slots.ch[k] || 0) + 1; tr.g.position.set(CHARGE.x - 30 + k * 20, 0.4, CHARGE.z - 8 + (q - 1) * 16);")
rep("tr.g.position.set(CHARGE.x - 40 + (k % 6) * 17, 0.4, CHARGE.z + 40 + Math.floor(k / 6) * 13);",
    "tr.g.position.set(CHARGE.x - 40 + (k % 6) * 17, 0.4, CHARGE.z + 48 + Math.floor(k / 6) * 17);")
rep("""    const upNow = tr.phase < 0.5, kmh = upNow ? 12 : 30;
    tr.phase = ((tr.phase + Math.max(0, dt) * TRUCK_TIMELAPSE * (kmh / 3.6 / 10) / (2 * ROAD_LEN)) % 1 + 1) % 1;
    const up = tr.phase < 0.5, f = up ? tr.phase * 2 : 2 - tr.phase * 2;""",
    """    if (!tr._was) truckJoin(tr); tr._mv = true;
    const w = ((truckU + tr.off) % 1 + 1) % 1, up = w < TRUCK_A, f = Math.min(0.9995, up ? w / TRUCK_A : 1 - (w - TRUCK_A) / (1 - TRUCK_A)); tr._f = f; tr._up = up;""")
rep("multiplyScalar(up ? 2.3 : -2.3)", "multiplyScalar(up ? 7.2 : -7.2)")
rep("  if(!LOW)dustIM.instanceMatrix.needsUpdate = true;", "  truckRelax(dt);\n  if(!LOW)dustIM.instanceMatrix.needsUpdate = true;")

# 1c) презентация: ярче небо и степь, фабрика крупнее — как корпуса Актогая
rep("new THREE.Color(0x3a78bb), dayK);", "new THREE.Color(0x1f6fd6), dayK);")
rep("new THREE.Color(0xe2e8e9), dayK);", "new THREE.Color(0xa6d2f4), dayK);")
rep("new THREE.Color(0xd3dde2), dayK);", "new THREE.Color(0xb9d6ee), dayK);")
rep("renderer.toneMappingExposure = 1 + 0.25 * dayK;", "renderer.toneMappingExposure = 1.05 + 0.3 * dayK;")
rep("const wall = M(0xb9c3cc, { metalness: 0.35, roughness: 0.55 });", "const wall = M(0xe4e9ee, { metalness: 0.2, roughness: 0.6 });")
rep("mesh(new THREE.BoxGeometry(60, 26, 70), wall, PLANT.x + 6, 13, PLANT.z);", "mesh(new THREE.BoxGeometry(60, 36, 98), wall, PLANT.x + 6, 18, PLANT.z);")
rep("mesh(new THREE.BoxGeometry(62, 2, 72), M(0x6f7c88, { metalness: 0.5 }), PLANT.x + 6, 27, PLANT.z);", "mesh(new THREE.BoxGeometry(63, 2.4, 101), M(0x2d73c9, { metalness: 0.3, roughness: 0.45 }), PLANT.x + 6, 37, PLANT.z);")
rep("mesh(new THREE.BoxGeometry(20, 36, 20), wall, PLANT.x + 28, 18, PLANT.z - 30);", "mesh(new THREE.BoxGeometry(22, 58, 22), wall, PLANT.x + 28, 29, PLANT.z - 34); mesh(new THREE.BoxGeometry(23, 2, 23), M(0x2d73c9, { metalness: 0.3, roughness: 0.45 }), PLANT.x + 28, 59, PLANT.z - 34);")
rep("""label('<b>Фабрика · две линии</b><span id="l-pl">—</span>', PLANT.x + 10, 52, PLANT.z - 20);""", """label('<b>Фабрика · две линии</b><span id="l-pl">—</span>', PLANT.x + 10, 70, PLANT.z - 20);""")
rep("new THREE.Vector3(PLANT.x + 60, 36, PLANT.z - 30), new THREE.Vector3(PLANT.x + 20, 28, PLANT.z)", "new THREE.Vector3(PLANT.x + 60, 46, PLANT.z - 30), new THREE.Vector3(PLANT.x + 20, 40, PLANT.z)")
rep("target('plant','Фабрика',[PLANT.x+10,15,PLANT.z],[67,30,72]);", "target('plant','Фабрика',[PLANT.x+10,19,PLANT.z],[67,40,100]);")

# 1d) кино-рендер: модули постобработки и крючок отрисовки
J = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/"
rep("import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js';",
    "import { mergeGeometries } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js';\n"
    f"import {{ EffectComposer }} from '{J}EffectComposer.js';\nimport {{ RenderPass }} from '{J}RenderPass.js';\nimport {{ GTAOPass }} from '{J}GTAOPass.js';\n"
    f"import {{ UnrealBloomPass }} from '{J}UnrealBloomPass.js';\nimport {{ OutputPass }} from '{J}OutputPass.js';\n"
    "window.__PP = { EffectComposer, RenderPass, GTAOPass, UnrealBloomPass, OutputPass };")
rep("  renderer.render(scene, camera); labels.render(scene, camera);", "  if (window.__pitchRender) window.__pitchRender(); else renderer.render(scene, camera); labels.render(scene, camera);")


# 2) обёртка документа: заголовок, шрифты
head_end = html.index("</head>")
head = html[:head_end]
body = html[head_end + len("</head>"):]
head = re.sub(r"<!doctype html>\s*<html[^>]*>\s*<head>", "", head, flags=re.I)
head = re.sub(r"<title>.*?</title>", "", head)
body = re.sub(r"<body[^>]*>", "", body, count=1)
body = body.replace("</body>", "").replace("</html>", "")
fonts = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700;800&family=Golos+Text:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">')
top = '<title>Тыныс в 3D</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n' + fonts + "\n"

img = lambda p: "data:image/jpeg;base64," + base64.b64encode((HERE / p).read_bytes()).decode()
js = (HERE / "pitch.js").read_text(encoding="utf-8").replace("/*__REAL__*/", (HERE / "pitch_real.js").read_text(encoding="utf-8"))
pitch = ("<style>" + (HERE / "pitch.css").read_text(encoding="utf-8") + "</style>\n"
         + (HERE / "pitch_slides.html").read_text(encoding="utf-8")
         + f"\n<script>window.PITCH_IMG={{pult:'{img('pult.jpg')}',futures:'{img('futures.jpg')}'}};document.body.dataset.view='tynys';</script>\n"
         + "<script>" + js + "</script>\n")
out = top + head + body + pitch
(HERE / "tynys-pitch.html").write_text(out, encoding="utf-8")
print("tynys-pitch.html", len(out) // 1024, "KB")
