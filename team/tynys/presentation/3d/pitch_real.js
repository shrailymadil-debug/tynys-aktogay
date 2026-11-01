  /* ================= РЕАЛИЗМ: самосвалы, кустарник, кино-рендер ================= */
  S.renderer.localClippingEnabled = true;
  const MAT = {
    yel: new T.MeshStandardMaterial({color: 0xf2b705, metalness: .35, roughness: .42}),
    yel2: new T.MeshStandardMaterial({color: 0xcf9200, metalness: .35, roughness: .5}),
    frame: new T.MeshStandardMaterial({color: 0x2b2d30, metalness: .6, roughness: .55}),
    tire: new T.MeshStandardMaterial({color: 0x161616, metalness: 0, roughness: .95}),
    rim: new T.MeshStandardMaterial({color: 0x9aa0a6, metalness: .8, roughness: .35}),
    glass: new T.MeshStandardMaterial({color: 0x1b2836, metalness: .7, roughness: .08}),
    batt: new T.MeshStandardMaterial({color: 0x2f6fb0, metalness: .5, roughness: .4}),
    lamp: new T.MeshStandardMaterial({color: 0xfff2c8, emissive: 0xfff2c8, emissiveIntensity: 1.4}),
    steel: new T.MeshStandardMaterial({color: 0x8d969d, metalness: .75, roughness: .35}),
    dsteel: new T.MeshStandardMaterial({color: 0x59626a, metalness: .7, roughness: .45}),
    blue: new T.MeshStandardMaterial({color: 0x2d6fb8, metalness: .45, roughness: .4}),
    teal: new T.MeshStandardMaterial({color: 0x3f8f8a, metalness: .4, roughness: .45}),
    conc: new T.MeshStandardMaterial({color: 0x9a9fa3, metalness: 0, roughness: .92}),
    slurry: new T.MeshStandardMaterial({color: 0x5d4a38, metalness: .1, roughness: .18}),
    froth: new T.MeshStandardMaterial({color: 0xd8c45a, metalness: .2, roughness: .35, emissive: 0x3a3006, emissiveIntensity: .4}),
    orange: new T.MeshStandardMaterial({color: 0xe0782f, metalness: .3, roughness: .5}),
  };
  const B = (w, h, d) => new T.BoxGeometry(w, h, d);
  function part(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; }

  // карьерный электросамосвал: колёса со спарками, рама, площадка с кабиной, кузов с козырьком, батареи по бортам
  const tireG = new T.CylinderGeometry(1.55, 1.55, 1.05, 24).rotateX(Math.PI / 2), rimG = new T.CylinderGeometry(.85, .85, 1.12, 14).rotateX(Math.PI / 2);
  const sideShape = new T.Shape([[-4.9, 3.3], [3.1, 3.75], [3.1, 6.25], [-4.9, 5.45]].map(([x, y]) => new T.Vector2(x, y)));
  const sideG = new T.ExtrudeGeometry(sideShape, {depth: .22, bevelEnabled: false});
  function truckModel() {
    const g = new T.Group(); g.userData.body = [];
    const body = m => (g.userData.body.push(m), m);
    for (const [x, z] of [[3.5, 2.55], [3.5, -2.55], [-2.7, 2.25], [-2.7, -2.25], [-2.7, 3.35], [-2.7, -3.35]]) { part(g, tireG, MAT.tire, x, 1.55, z); part(g, rimG, MAT.rim, x, 1.55, z); }
    body(part(g, B(9.6, .9, 2.3), MAT.frame, .3, 2.35, 0));
    part(g, new T.CylinderGeometry(.45, .45, 7.4, 10).rotateX(Math.PI / 2), MAT.frame, -2.7, 1.55, 0);
    body(part(g, B(1.5, 2.5, 2.7), MAT.yel2, 4.75, 3.05, 0));
    part(g, B(.08, 1.9, 2.3), MAT.frame, 5.52, 3.1, 0);
    body(part(g, B(2.3, .3, 6), MAT.yel, 4.35, 4.42, 0));
    body(part(g, B(1.9, 2, 1.9), MAT.yel, 4.2, 5.6, 1.85));
    part(g, B(1.95, .9, 1.95), MAT.glass, 4.25, 6.05, 1.85);
    part(g, B(.4, 2.6, .5), MAT.frame, 5.25, 2.9, 2.9, 0, 0, -.5);
    for (const z of [-2.9, 2.9]) part(g, new T.CylinderGeometry(.05, .05, 2.2, 6).rotateZ(Math.PI / 2), MAT.steel, 4.35, 5.05, z);
    for (const z of [-1, 1]) part(g, B(.1, .35, .5), MAT.lamp, 5.56, 3.6, z);
    body(part(g, B(3.2, 1.3, .7), MAT.batt, .9, 2.4, 1.6)); body(part(g, B(3.2, 1.3, .7), MAT.batt, .9, 2.4, -1.6));
    for (const z of [2.75, -2.97]) body(part(g, sideG, MAT.yel, 0, 0, z));
    body(part(g, B(8.05, .3, 5.9), MAT.yel, -.9, 3.52, 0, 0, 0, Math.atan2(.45, 8)));
    body(part(g, B(.3, 2.6, 5.9), MAT.yel, 3.1, 5, 0));
    body(part(g, B(3.1, .25, 6.1), MAT.yel, 4.55, 6.45, 0, 0, 0, -.06));
    for (const x of [-3.2, -.9, 1.4]) for (const z of [3.02, -3.24]) body(part(g, B(.35, 2.1, .12), MAT.yel2, x, 4.55 + x * .03, z));
    const cells = new T.Group(); cells.visible = false; g.add(cells); g.userData.cells = [];
    for (const zc of [1.6, -1.6]) for (let i = 0; i < 6; i++) { const c = new T.Mesh(B(.42, 1, .5), new T.MeshStandardMaterial({color: 0x37d67a, emissive: 0x37d67a, emissiveIntensity: 1.2})); c.position.set(-.35 + i * .5, 2.4, zc); cells.add(c); g.userData.cells.push(c); }
    g.userData.cellsGroup = cells;
    return g;
  }
  const truckList = window.__trucks || [];
  truckList.forEach(tr => {
    tr.g.children.forEach(c => { if (c !== tr.load && c !== tr.glow && !c.isSprite && (c.isMesh || c.isGroup)) c.visible = false; });
    const mdl = truckModel(); tr.g.add(mdl); tr.model = mdl;
    if (tr.load) tr.load.position.set(-.9, 4.2, 0);
  });

  // кустарник и камни степи — дают масштаб
  { const N2 = S.low ? 500 : 2400, im = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), new T.MeshStandardMaterial({roughness: 1, flatShading: true}), N2), o = new T.Object3D(), c = new T.Color();
    const bad = (x, z) => Math.hypot(x - PIT.x, z - PIT.z) < 140 || Math.hypot(x - 362, z - 44) < 150 || (x > 50 && x < 330 && z > 170 && z < 300) || (x > 80 && x < 270 && z > -265 && z < -135) || (x > -60 && x < 290 && z > -100 && z < 180) || (x > 270 && x < 370 && z > -150 && z < -70) || [[-350, -170, 140], [-390, 160, 120], [-90, -260, 100]].some(([a, b, r]) => Math.hypot(x - a, z - b) < r);
    let n = 0, tries = 0;
    while (n < N2 && tries++ < N2 * 8) {
      const a = Math.random() * Math.PI * 2, r = 60 + Math.sqrt(Math.random()) * 1150, x = 30 + Math.cos(a) * r, z = -20 + Math.sin(a) * r; if (bad(x, z)) continue;
      const s = 1.1 + Math.random() * 2.6; o.position.set(x, Math.max(0, TH(x, z)) + s * .22, z); o.scale.set(s, s * (.32 + Math.random() * .35), s * (.8 + Math.random() * .4)); o.rotation.y = Math.random() * 6.3; o.updateMatrix(); im.setMatrixAt(n, o.matrix);
      c.setHSL(.1 + Math.random() * .08, .22 + Math.random() * .15, .2 + Math.random() * .1); im.setColorAt(n, c); n++;
    }
    im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.receiveShadow = true; scene.add(im);
  }

  // крупные пятна грунта, промоины и накатанные колеи — убирают «плоский» вид степи
  { const cv = document.createElement('canvas'); cv.width = cv.height = 1024; const g = cv.getContext('2d'); const R = Math.random;
    for (let i = 0; i < 420; i++) { const x = R() * 1024, y = R() * 1024, r = 20 + R() * 120, dark = R() < .5; const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, dark ? `rgba(96,76,48,${.08 + R() * .14})` : `rgba(255,246,222,${.06 + R() * .1})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    g.lineCap = 'round';
    for (let i = 0; i < 12; i++) { g.strokeStyle = `rgba(${R() < .5 ? '220,205,175' : '120,100,72'},${.1 + R() * .12})`; g.lineWidth = 1 + R() * 2; g.beginPath(); let x = R() * 1024, y = R() * 1024; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (R() - .5) * 340; y += (R() - .5) * 340; g.quadraticCurveTo(x + (R() - .5) * 120, y + (R() - .5) * 120, x, y); } g.stroke(); }
    g.globalCompositeOperation = 'destination-in'; const mk2 = g.createRadialGradient(512, 512, 300, 512, 512, 505); mk2.addColorStop(0, 'rgba(0,0,0,1)'); mk2.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = mk2; g.fillRect(0, 0, 1024, 1024);
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
    const geo = new T.RingGeometry(103, 516, 128, 4); const pa = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < pa.count; i++) uv.setXY(i, (pa.getX(i) + 516) / 1032, (pa.getY(i) + 516) / 1032);
    const m = new T.Mesh(geo.rotateX(-Math.PI / 2), new T.MeshStandardMaterial({map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2})); m.position.set(PIT.x, .06, PIT.z); m.receiveShadow = true; m.renderOrder = 1; scene.add(m);
  }
  // кино-рендер: мягкие тени в углах (GTAO), свечение огней (bloom), тон-маппинг
  let comp = null, gtao = null, qHigh = !S.low && !S.softGL, fpsAcc = 0, fpsN = 0, fpsChecked = false;
  try { const q = localStorage.getItem('tynys-q'); if (q) qHigh = q === 'hi'; } catch (e) {}
  function buildComposer() {
    const P = window.__PP; if (!P || comp) return;
    const R = S.renderer, w = innerWidth, h = innerHeight;
    comp = new P.EffectComposer(R); comp.setPixelRatio(R.getPixelRatio()); comp.setSize(w, h);
    comp.addPass(new P.RenderPass(scene, camera));
    try { gtao = new P.GTAOPass(scene, camera, w, h); gtao.output = P.GTAOPass.OUTPUT.Default; gtao.blendIntensity = .85;
      gtao.updateGtaoMaterial({radius: 7, distanceExponent: 1.4, thickness: 6, scale: 1, samples: 12}); gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 10}); comp.addPass(gtao); } catch (e) { gtao = null; }
    comp.addPass(new P.UnrealBloomPass(new T.Vector2(w, h), .26, .55, .92));
    comp.addPass(new P.OutputPass());
  }
  window.__pitchRender = () => { if (qHigh && window.__PP) { if (!comp) buildComposer(); if (gtao) gtao.enabled = !inside && !fpsLow; comp.render(); } else S.renderer.render(scene, camera); };
  let fpsLow = false;
  addEventListener('resize', () => { if (comp) comp.setSize(innerWidth, innerHeight); });
  function setQ(hi) { qHigh = hi; try { localStorage.setItem('tynys-q', hi ? 'hi' : 'lo'); } catch (e) {} $('pq').textContent = hi ? 'Кино' : 'Быстро'; $('pq').setAttribute('aria-pressed', hi); }
  $('pq').onclick = () => setQ(!qHigh); setQ(qHigh);

  /* ================= КАРТОЧКА ДВОЙНИКА И «ЗАГЛЯНУТЬ ВНУТРЬ» ================= */
  const XR = new T.MeshStandardMaterial({color: 0xffd34d, transparent: true, opacity: .16, depthWrite: false, roughness: .3, metalness: .1, side: T.DoubleSide});
  const kindOf = id => !id ? null : /^truck-/.test(id) ? 'truck' : ['plant', 'line-1', 'line-2', 'flotation', 'concentrate', 'conveyor-feed'].includes(id) ? 'plant' : id === 'crusher' ? 'crusher' : id === 'bess' ? 'bess' : id === 'wind' ? 'wind' : (id === 'pit' || /^shovel/.test(id)) ? 'pit' : null;
  const GAUGE = {
    truck: d => [['Заряд батареи', d.soc, 100, '%', 'good']],
    'line-1': d => [['Мощность мельницы · предел 65', d.mill_mw, 65, 'МВт']], 'line-2': d => [['Мощность мельницы · предел 65', d.mill_mw, 65, 'МВт']],
    crusher: d => [['Производительность', d.throughput_tph, d.capacity_tph, 'т/ч']],
    bess: d => [['Заряд накопителя', d.soc, 100, '%', 'good']],
    wind: d => [['Мощность ВЭС', d.power_mw, d.capacity_mw || 300, 'МВт', 'good']],
    pv: d => [['Мощность СЭС', d.power_mw, d.capacity_mw || 250, 'МВт', 'good']],
    substation: d => [['Из сети · предел', d.grid_mw, d.grid_cap_mw || 260, 'МВт']],
    flotation: d => [['Извлечение меди', d.recovery, 100, '%', 'good']],
    pit: d => [['Добыча руды · план', d.ore_tph, d.ore_plan_tph, 'т/ч', 'good'], ['Доля твёрдой руды', d.hard_frac * 100, 100, '%', 'info']],
    'pile-soft': d => d.fill_pct != null ? [['Заполнение склада', d.fill_pct, 100, '%', 'info']] : null, 'pile-hard': d => d.fill_pct != null ? [['Заполнение склада', d.fill_pct, 100, '%', 'info']] : null,
  };
  const INSIDE_NAME = {plant: 'Обогатительная фабрика · разрез', crusher: 'Дробилка · разрез', truck: 'Электросамосвал · батарея', bess: 'Накопитель · стойки батарей', wind: 'Ветряк · гондола', pit: 'Карьер · забой'};
  let selId = null, inside = null, insideId = null, insideTags = [], follow = null, savedSel = null;
  const insp = $('insp');
  function drawInsp() {
    if (!selId) return;
    let D; try { D = S.data; } catch (e) { return; }
    const d = D[selId] || (selId === 'pit' ? D.pit : null) || {};
    $('inspT').textContent = $('selection-name').textContent || selId;
    $('inspEb').textContent = 'двойник kz.tynys:' + selId;
    const g = GAUGE[selId] || GAUGE[kindOf(selId)];
    const gs = g && d ? (g(d) || []) : [];
    $('inspG').innerHTML = gs.filter(x => Number.isFinite(Number(x[1]))).map(([n, v, mx, u, kind]) => { const k = Math.max(0, Math.min(1, Number(v) / (Number(mx) || 1))); const col = kind === 'good' ? (k > .5 ? '#4ff0c4' : k > .25 ? '#ffc04d' : '#ff7a5c') : kind === 'info' ? '#7fb8ff' : (k > .9 ? '#ff7a5c' : k > .7 ? '#ffc04d' : '#4ff0c4'); return `<div class="gg"><div class="gl"><span>${n}</span><b>${fmt(v, Number(v) < 100 ? 1 : 0)} <small>${u}</small></b></div><i><u style="width:${(k * 100).toFixed(1)}%;background:${col}"></u></i></div>`; }).join('');
    $('inspV').innerHTML = $('selection-values').innerHTML;
    $('inspIn').hidden = !kindOf(selId) || inside;
    $('inspIn').textContent = kindOf(selId) === 'pit' ? 'Спуститься в карьер ▸' : 'Заглянуть внутрь ▸';
  }
  function showInsp() { if (selId) { insp.hidden = false; drawInsp(); requestAnimationFrame(() => insp.classList.add('on')); } else if (!inside) { insp.classList.remove('on'); setTimeout(() => { if (!selId) insp.hidden = true; }, 350); } }
  setInterval(() => { let s = null; try { s = S.selected; } catch (e) {} if (s !== selId) { selId = s; showInsp(); } else if (selId) drawInsp(); }, 400);
  $('inspX').onclick = () => { if (inside) exitInside(); S.clearSelection(); };
  $('inspIn').onclick = () => enterInside(kindOf(selId), selId);
  $('insideX').onclick = () => exitInside();

  // разрез: всё внутри коробки выше отметки отсекается (как разрезанный макет)
  let cutList = [];
  function cutaway(box) {
    const [x0, x1, y0, z0, z1] = box;
    const planes = [new T.Plane(new T.Vector3(0, -1, 0), y0), new T.Plane(new T.Vector3(-1, 0, 0), x0), new T.Plane(new T.Vector3(1, 0, 0), -x1), new T.Plane(new T.Vector3(0, 0, -1), z0), new T.Plane(new T.Vector3(0, 0, 1), -z1)];
    const hit = new T.Box3(new T.Vector3(x0, y0, z0), new T.Vector3(x1, 1e4, z1)), bb = new T.Box3();
    scene.traverse(o => {
      if (!o.isMesh || o.userData.inside || !o.visible) return; const m = o.material; if (!m || Array.isArray(m) || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshBasicMaterial)) return;
      for (let p = o.parent; p; p = p.parent) if (p.userData.inside) return;
      bb.setFromObject(o); if (!bb.intersectsBox(hit) || bb.max.y < y0 + .5) return;
      o.userData.mat0 = m; const c = m.clone(); c.clippingPlanes = planes; c.clipIntersection = true; c.clipShadows = true; c.side = T.DoubleSide; o.material = c; cutList.push(o);
    });
  }
  function uncut() { cutList.forEach(o => { if (o.userData.mat0) { o.material.dispose(); o.material = o.userData.mat0; delete o.userData.mat0; } }); cutList = []; }

  const inGroups = {};
  const mk = (name) => { const g = new T.Group(); g.visible = false; g.userData.inside = true; scene.add(g); inGroups[name] = g; return g; };
  const fab = {balls: [], drums: [], bubbles: [], crane: null, flows: []};
  // ---- внутри фабрики: две линии измельчения, гидроциклоны, флотация, концентрат ----
  { const g = mk('plant'), PX = 120, PZ = -5;
    const floorCv = document.createElement('canvas'); floorCv.width = floorCv.height = 128; const fx = floorCv.getContext('2d'); fx.fillStyle = '#9ca1a4'; fx.fillRect(0, 0, 128, 128); fx.strokeStyle = 'rgba(60,66,70,.45)'; fx.lineWidth = 2; for (let i = 0; i <= 128; i += 32) { fx.beginPath(); fx.moveTo(i, 0); fx.lineTo(i, 128); fx.stroke(); fx.beginPath(); fx.moveTo(0, i); fx.lineTo(128, i); fx.stroke(); } fx.fillStyle = '#e8c33a'; fx.fillRect(0, 60, 128, 4);
    const ft = new T.CanvasTexture(floorCv); ft.wrapS = ft.wrapT = T.RepeatWrapping; ft.repeat.set(8, 12); ft.colorSpace = T.SRGBColorSpace;
    part(g, B(58, .3, 96), new T.MeshStandardMaterial({map: ft, roughness: .9}), PX + 6, .3, PZ);
    for (const zL of [-19, 9]) {
      const mill = new T.Group(); mill.position.set(113, 6.2, zL); g.add(mill);
      const shell = new T.Mesh(new T.CylinderGeometry(5, 5, 14, 48, 1, true, Math.PI / 2, Math.PI * 1.5).rotateZ(Math.PI / 2), new T.MeshStandardMaterial({color: 0x7f8a92, metalness: .75, roughness: .38, side: T.DoubleSide})); shell.castShadow = true; mill.add(shell);
      for (let k = 0; k < 10; k++) { const a = Math.PI / 2 + k * Math.PI * 1.5 / 10 + .1; const bar = new T.Mesh(B(13.6, .35, .35), MAT.dsteel); bar.position.set(0, Math.sin(a) * 4.75, Math.cos(a) * 4.75); bar.rotation.x = -a; shell.add(bar); }
      for (const x of [-7, 7]) part(mill, new T.RingGeometry(1.4, 5.3, 40).rotateY(Math.PI / 2), new T.MeshStandardMaterial({color: 0x6b757c, metalness: .7, roughness: .4, side: T.DoubleSide}), x, 0, 0);
      part(mill, new T.TorusGeometry(5.35, .35, 8, 48).rotateY(Math.PI / 2), MAT.dsteel, 4.5, 0, 0);
      part(g, B(4, 3.4, 3.2), MAT.blue, 124, 2, zL); part(g, new T.CylinderGeometry(1, 1, 3, 16).rotateZ(Math.PI / 2), MAT.dsteel, 121, 3.3, zL);
      for (const x of [104.5, 121.5]) part(g, B(2.4, 3.5, 6), MAT.conc, x, 1.9, zL);
      part(g, B(13.6, .12, 7.2), MAT.slurry, 113, 2.65, zL);
      const balls = new T.InstancedMesh(new T.SphereGeometry(.5, 10, 8), MAT.steel, 80); balls.userData.inside = true; g.add(balls);
      fab.balls.push({im: balls, zL, ph: Array.from({length: 80}, () => [Math.random(), 1.2 + Math.random() * 3.2, 106.8 + Math.random() * 12.4])}); fab.drums.push({shell, line: zL < 0 ? 'line-1' : 'line-2'});
      // гидроциклоны на площадке
      part(g, B(7, .35, 7), MAT.dsteel, 130, 11, zL); for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) part(g, B(.35, 11, .35), MAT.dsteel, 130 + dx, 5.5, zL + dz);
      part(g, new T.CylinderGeometry(.9, .9, 2.2, 16), MAT.steel, 130, 12.6, zL);
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, cx = 130 + Math.cos(a) * 2.2, cz = zL + Math.sin(a) * 2.2; part(g, new T.CylinderGeometry(.55, .55, 1.3, 12), MAT.teal, cx, 13.1, cz); part(g, new T.ConeGeometry(.55, 2.8, 12).rotateX(Math.PI), MAT.teal, cx, 11.05, cz); }
      // флотационные камеры
      for (let k = 0; k < 5; k++) {
        const cx = 137 + k * 4.4; part(g, new T.CylinderGeometry(2, 2, 4, 28, 1, true), new T.MeshStandardMaterial({color: 0x8d969d, metalness: .6, roughness: .4, side: T.DoubleSide}), cx, 2.3, zL);
        part(g, new T.CircleGeometry(1.95, 28).rotateX(-Math.PI / 2), MAT.froth, cx, 4.05, zL); part(g, B(1, .9, 1), MAT.blue, cx, 5.2, zL); part(g, new T.CylinderGeometry(.12, .12, 1.2, 6), MAT.steel, cx, 4.4, zL);
        const bub = new T.InstancedMesh(new T.SphereGeometry(.28, 8, 6), new T.MeshStandardMaterial({color: 0xf0de7a, roughness: .25, metalness: .3, transparent: true, opacity: .9}), 14); bub.userData.inside = true; g.add(bub);
        fab.bubbles.push({im: bub, cx, zL, ph: Array.from({length: 14}, () => [Math.random() * 6.28, Math.random() * 1.6, Math.random()])});
      }
      part(g, B(22, .8, 1.1), MAT.steel, 145.8, 3.7, zL - 2.9);
      const pipe1 = new T.CatmullRomCurve3([new T.Vector3(120, 1.6, zL + 3), new T.Vector3(124, 1.4, zL + 4.5), new T.Vector3(127, 6, zL + 3.5), new T.Vector3(129, 12.6, zL + 1.6)]);
      const pipe2 = new T.CatmullRomCurve3([new T.Vector3(130, 13.8, zL), new T.Vector3(133, 12, zL), new T.Vector3(135, 5.2, zL), new T.Vector3(137, 4.4, zL)]);
      for (const c of [pipe1, pipe2]) { part(g, new T.TubeGeometry(c, 30, .45, 8, false), MAT.orange, 0, 0, 0); const fl = new T.InstancedMesh(new T.SphereGeometry(.42, 6, 5), new T.MeshBasicMaterial({color: 0xffd0a0}), 8); fl.userData.inside = true; g.add(fl); fab.flows.push({im: fl, c, line: zL < 0 ? 'line-1' : 'line-2'}); }
    }
    // фильтр-пресс и концентрат
    part(g, B(9, 3, 4), MAT.blue, 150, 1.8, 34); for (let k = 0; k < 9; k++) part(g, B(.25, 2.6, 3.6), MAT.dsteel, 146.2 + k * .95, 1.8, 34);
    part(g, new T.ConeGeometry(3.6, 2.4, 20), new T.MeshStandardMaterial({color: 0x3d4440, roughness: .9}), 141, 1.5, 36);
    // мостовой кран и светильники
    for (const z of [-52, 42]) part(g, B(60, .7, .7), MAT.dsteel, PX + 6, 26, z);
    fab.crane = part(g, B(1.6, 1.2, 94), MAT.orange, 110, 26.8, PZ); part(fab.crane, B(2.4, 1.4, 2.4), MAT.dsteel, 0, -1, 6);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) part(g, B(1.8, .25, .8), MAT.lamp, 104 + i * 18, 23.5, -42 + j * 19);
  }
  // ---- внутри дробилки: конусная камера, подвижный конус, куски руды ----
  const cr = {mantle: null, rocks: null, ph: []};
  { const g = mk('crusher');
    part(g, new T.CylinderGeometry(6.2, 3.4, 7, 32, 1, true, Math.PI / 2, Math.PI * 1.5), new T.MeshStandardMaterial({color: 0x8b969e, metalness: .7, roughness: .4, side: T.DoubleSide}), 8, 6.5, -15);
    cr.mantle = part(g, new T.ConeGeometry(3.6, 7.5, 28), new T.MeshStandardMaterial({color: 0x6d6f62, metalness: .6, roughness: .5}), 8, 6.2, -15);
    part(g, new T.CylinderGeometry(.5, .5, 4, 10), MAT.steel, 8, 11, -15); part(g, B(16, .5, 1), MAT.dsteel, 8, 13.2, -15);
    cr.rocks = new T.InstancedMesh(new T.DodecahedronGeometry(.6), new T.MeshStandardMaterial({color: 0x9a7d63, roughness: 1, flatShading: true}), 40); cr.rocks.userData.inside = true; g.add(cr.rocks);
    cr.ph = Array.from({length: 40}, () => [Math.random(), Math.random() * 6.28, .6 + Math.random() * .7]);
  }
  // ---- внутри накопителя: стойки модулей, подсветка по заряду ----
  const bs = {mods: []};
  { const g = mk('bess');
    for (let i = 0; i < 8; i++) { const x = 230 + (i % 4) * 9, z = 60 + Math.floor(i / 4) * 18;
      for (const dx of [-1.7, 1.7]) { part(g, B(1.6, 4.4, 13), MAT.dsteel, x + dx, 2.4, z);
        for (let k = 0; k < 9; k++) { const m = new T.Mesh(B(.1, .32, 12), new T.MeshStandardMaterial({color: 0x37d67a, emissive: 0x37d67a, emissiveIntensity: 1.2})); m.position.set(x + dx + (dx < 0 ? .86 : -.86), .6 + k * .45, z); g.add(m); bs.mods.push({m, k}); } } }
  }
  // ---- внутри гондолы ветряка: вал, редуктор, генератор ----
  const wd = {shaft: null};
  { const g = mk('wind'), x = -60, y = Math.max(0, TH(-60, -380)) + 81, z = -380;
    wd.shaft = part(g, new T.CylinderGeometry(.32, .32, 4.4, 12).rotateX(Math.PI / 2), MAT.steel, x, y, z + 3.8);
    part(g, B(1.7, 1.6, 2), MAT.teal, x, y, z + 1.4); part(g, new T.CylinderGeometry(1, 1, 2.2, 20).rotateX(Math.PI / 2), MAT.blue, x, y, z - .9);
    part(g, B(2.4, .25, 7.5), MAT.dsteel, x, y - 1.1, z + 1); part(g, B(.8, .9, .9), MAT.orange, x + .8, y - .5, z - 2.6);
  }
  const INS = {
    plant: {cut: [94, 160, 10, -56, 46], cam: () => ({p: V(204, 64, 92), t: V(127, 3, -5)}), group: 'plant',
      tags: [[V(113, 14, -19), D => lineTag(D, 'line-1', 'Измельчение · линия 1')], [V(113, 14, 9), D => lineTag(D, 'line-2', 'Измельчение · линия 2')], [V(130, 19, -5), D => ['Гидроциклоны', `крупность P80 ${fmt(D.plant?.p80_um)} мкм`]], [V(146, 9, -5), D => ['Флотация', `извлечение ${fmt(D.flotation?.recovery, 1)} % · ${fmt(D.flotation?.cu_tph, 1)} т меди/ч`]], [V(148, 8, 34), D => ['Концентрат', `${fmt(D.concentrate?.inflow_tph)} т/ч · ${fmt(D.concentrate?.grade_pct)} % меди`]]]},
    crusher: {cut: [-1, 17, 5, -25, -5], cam: () => ({p: V(40, 26, 14), t: V(8, 6, -15)}), group: 'crusher',
      tags: [[V(8, 18, -15), D => ['Конусная дробилка', `${fmt(D.crusher?.throughput_tph)} из ${fmt(D.crusher?.capacity_tph)} т/ч · ${fmt(D.crusher?.power_mw, 1)} МВт`]]]},
    bess: {cut: [224, 263, 4.8, 50, 90], cam: () => ({p: V(285, 40, 118), t: V(244, 2, 69)}), group: 'bess',
      tags: [[V(244, 13, 69), D => ['Накопитель 60 МВт · 120 МВт·ч', `заряд ${fmt(D.bess?.soc)} % · мощность ${fmt(D.bess?.power_mw)} МВт`]]]},
    wind: {cut: [-63, -57, 81 + Math.max(0, TH(-60, -380)), -385, -373], cam: () => ({p: V(-46, 88 + Math.max(0, TH(-60, -380)), -362), t: V(-60, 81 + Math.max(0, TH(-60, -380)), -379)}), group: 'wind',
      tags: [[V(-60, 85 + Math.max(0, TH(-60, -380)), -379), D => ['Ротор → редуктор → генератор', `вся ВЭС сейчас: ${fmt(D.wind?.power_mw)} из 300 МВт`]]]},
    pit: {cam: () => ({p: V(PIT.x + 60, -20, PIT.z + 70), t: V(PIT.x, -66, PIT.z)}),
      tags: [[V(PIT.x, -60, PIT.z), D => ['Забой', `руда ${fmt(D.pit?.ore_tph)} т/ч · твёрдой ${fmt((D.pit?.hard_frac || 0) * 100)} %`]], [V(PIT.x - 70, 4, PIT.z - 60), D => ['Вскрыша', `${fmt(D.pit?.waste_tph)} т/ч в отвалы`]]]},
    truck: {cam: null, tags: []},
  };
  function lineTag(D, id, t) { const d = D[id] || {}; return d.state && d.state !== 'running' ? [t, `остановлена: ${d.stop_reason || d.state}`, 'bad'] : [t, `${fmt(d.feed_tph)} т/ч · ${fmt(d.mill_mw, 1)} МВт · P80 ${fmt(d.p80_um)} мкм`]; }
  const inTagLayer = document.createElement('div'); inTagLayer.className = 'intags'; document.body.appendChild(inTagLayer);
  function enterInside(kind, id) {
    if (!kind) return; if (inside) exitInside(true);
    stopPlay(); inside = kind; insideId = id; document.body.classList.add('inside'); ringPool.forEach(R => R.target = 0); tagsOn = false; breath.target = 0;
    const cfg = INS[kind];
    if (cfg.cut) cutaway(cfg.cut);
    if (cfg.group) inGroups[cfg.group].visible = true;
    let dst;
    if (kind === 'truck') {
      const tr = truckList[Number(id.split('-')[1]) - 1]; if (!tr) return exitInside();
      follow = tr; tr.model.userData.body.forEach(m => { m.userData.mat0 = m.material; m.material = XR; }); tr.model.userData.cellsGroup.visible = true;
      const p = new T.Vector3(); tr.g.getWorldPosition(p); const toC = V(PIT.x - p.x, 0, PIT.z - p.z), inPit = toC.length() < 115; const off = inPit ? toC.normalize().multiplyScalar(20).add(V(0, 9, 0)) : V(-17, 9, 15); dst = {p: p.clone().add(off), t: p.clone().add(V(0, 2.5, 0))}; if (tr.load) tr.load.userData.op = 1;
      insideTags = [[null, D => { const d = D[id] || {}; return ['Звено ' + id.split('-')[1] + ' · батарея ' + fmt(d.soc, 1) + ' %', `${STATE_RU[d.state] || d.state || ''} · ${fmt(d.energy_mwh, 1)} МВт·ч · груз ${fmt(d.payload_t)} т`]; }, () => { const q = new T.Vector3(); tr.g.getWorldPosition(q); return q.add(V(0, 9, 0)); }]];
    } else { dst = cfg.cam(); insideTags = cfg.tags.map(([p, f]) => [p, f]); }
    inTagLayer.innerHTML = insideTags.map(() => '<div class="it"><b></b><span></span></div>').join('');
    $('insideT').textContent = INSIDE_NAME[kind]; $('insideBar').hidden = false;
    controls.autoRotate = false;
    fly = {from: {p: camera.position.clone(), t: controls.target.clone()}, to: dst, start: performance.now(), dur: reduce ? 1 : 2600, auto: false, fast: false, shot: null};
    drawInsp();
  }
  function exitInside(silent) {
    if (!inside) return;
    uncut(); Object.values(inGroups).forEach(g => g.visible = false);
    if (follow) { follow.model.userData.body.forEach(m => { if (m.userData.mat0) m.material = m.userData.mat0; }); follow.model.userData.cellsGroup.visible = false; follow = null; }
    inside = null; insideId = null; insideTags = []; inTagLayer.innerHTML = ''; document.body.classList.remove('inside'); $('insideBar').hidden = true;
    if (!silent && curStep) apply(curStep);
    drawInsp();
  }
  const STATE_RU = {running: 'в работе', charging: 'на зарядке', waiting: 'ждёт', idle: 'стоит', hauling: 'везёт руду', returning: 'возвращается', fault: 'авария', maintenance: 'ремонт', unavailable: 'недоступно'};
  function insideTick(dt, now) {
    if (!inside) return;
    const ts = now / 1000; let D = null; try { D = S.data; } catch (e) {}
    if (inside === 'plant' && D) {
      fab.drums.forEach(({shell, line}) => { const run = (D[line]?.state || 'running') === 'running'; shell.userData.w = (shell.userData.w || 0) + ((run ? 1 : 0) - (shell.userData.w || 0)) * Math.min(1, dt * 1.5); shell.rotation.x += dt * .9 * shell.userData.w; });
      const o = new T.Object3D();
      fab.balls.forEach(({im, zL, ph}, li) => { const w = fab.drums[li].shell.userData.w || 0; ph.forEach((p, i) => { if (w > .02) p[0] = (p[0] + dt * .32 * w) % 1; const u = p[0], r = Math.min(4.3, p[1] + .9); let y, z;
        if (u < .72) { const th = -.7 + u / .72 * 2.5; y = -r * Math.cos(th); z = -r * Math.sin(th); } else { const k = (u - .72) / .28, th0 = 1.8, th1 = -.7; const ys = -r * Math.cos(th0), zs = -r * Math.sin(th0), ye = -r * Math.cos(th1), ze = -r * Math.sin(th1); y = ys + (ye - ys) * k - Math.sin(k * Math.PI) * .6; z = zs + (ze - zs) * k; }
        o.position.set(p[2], 6.2 + y, zL + z); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); im.instanceMatrix.needsUpdate = true; });
      const fon = (D.flotation?.state || 'running') === 'running';
      fab.bubbles.forEach(({im, cx, zL, ph}) => { ph.forEach((p, i) => { if (fon) p[2] = (p[2] + dt * .5) % 1; const r = p[1], a = p[0] + ts * .3; o.position.set(cx + Math.cos(a) * r, 4.1 + p[2] * .5, zL + Math.sin(a) * r); o.scale.setScalar(.6 + p[2] * .8); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); o.scale.setScalar(1); im.instanceMatrix.needsUpdate = true; });
      fab.flows.forEach(({im, c, line}) => { const run = (D[line]?.state || 'running') === 'running'; for (let i = 0; i < 8; i++) { const u = ((run ? ts * .25 : 0) + i / 8) % 1; c.getPointAt(u, o.position); o.updateMatrix(); im.setMatrixAt(i, o.matrix); } im.instanceMatrix.needsUpdate = true; });
      fab.crane.position.x = 126 + Math.sin(ts * .12) * 22;
    }
    if (inside === 'crusher' && D) {
      const run = (D.crusher?.state || 'running') === 'running', o = new T.Object3D();
      if (run) { cr.mantle.position.x = 8 + Math.cos(ts * 5) * .35; cr.mantle.position.z = -15 + Math.sin(ts * 5) * .35; }
      cr.ph.forEach((p, i) => { if (run) p[0] = (p[0] + dt * .35) % 1; const u = p[0], r = 4.6 - u * 2.2; o.position.set(8 + Math.cos(p[1] + u * 2) * r, 12 - u * 9.5, -15 + Math.sin(p[1] + u * 2) * r); o.rotation.set(u * 9, p[1], 0); o.scale.setScalar(p[2] * (1 - u * .55)); o.updateMatrix(); cr.rocks.setMatrixAt(i, o.matrix); }); cr.rocks.instanceMatrix.needsUpdate = true;
    }
    if (inside === 'bess' && D) { const lit = Math.round((D.bess?.soc || 0) / 100 * 9); bs.mods.forEach(({m, k}) => { const on = k < lit, c = (D.bess?.soc || 0) > 50 ? 0x37d67a : (D.bess?.soc || 0) > 25 ? 0xffc04d : 0xff6b4a; m.material.emissive.setHex(on ? c : 0x111111); m.material.color.setHex(on ? c : 0x222222); }); }
    if (inside === 'wind' && D) wd.shaft.rotation.z += dt * (D.wind?.power_mw > 5 ? 2.2 : .1);
    if (inside === 'truck' && follow && D) {
      const d = D[insideId] || {}, soc = d.soc || 0, lit = Math.round(soc / 100 * 6), c = soc > 50 ? 0x37d67a : soc > 25 ? 0xffc04d : 0xff6b4a;
      follow.model.userData.cells.forEach((m, i) => { const on = (i % 6) < lit; m.material.emissive.setHex(on ? c : 0x101010); m.material.color.setHex(on ? c : 0x202020); });
      if (!fly) { const p = new T.Vector3(); follow.g.getWorldPosition(p); const want = p.clone().add(V(0, 3, 0)); const dlt = want.clone().sub(controls.target); controls.target.add(dlt); camera.position.add(dlt); }
    }
    const w = innerWidth, h = innerHeight, tmp = new T.Vector3();
    [...inTagLayer.children].forEach((el, i) => { const tg = insideTags[i]; if (!tg || !D) return; const pos = tg[0] || (tg[2] && tg[2]()); if (!pos) return;
      tmp.copy(pos).project(camera); const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 && !fly; el.style.left = ((tmp.x + 1) / 2 * w) + 'px'; el.style.top = ((1 - tmp.y) / 2 * h) + 'px'; el.style.opacity = vis ? 1 : 0;
      const [a, b, cls] = tg[1](D); el.className = 'it' + (cls ? ' ' + cls : ''); el.firstChild.textContent = a; el.lastChild.textContent = b; });
  }
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (inside) exitInside(); else if (selId) S.clearSelection(); } }, true);

  // подписи стенда: по умолчанию скрыты, включаются кнопкой или клавишей L
  let labelsOn = false;
  function setLabels(on) { labelsOn = on; $('plbl').setAttribute('aria-pressed', on); document.body.classList.toggle('lblon', on); }
  $('plbl').onclick = () => setLabels(!labelsOn);
  addEventListener('keydown', e => { if (e.target.closest && e.target.closest('input,select,textarea')) return; if (e.key === 'l' || e.key === 'L' || e.key === 'д' || e.key === 'Д') setLabels(!labelsOn); if (e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й') setQ(!qHigh); }, true);
  // проверка скорости: если «кино» тормозит, отключаем AO
  function fpsGuard(dt) { if (fpsChecked || !qHigh || !comp) return; fpsAcc += dt; fpsN++; if (fpsAcc > 4) { if (fpsN / fpsAcc < 24) fpsLow = true; fpsChecked = true; } }
