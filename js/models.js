/* ============================================================
   Dragon Cradle — models.js
   卵・環境演出（空・地面・台座・浮遊光）と共通テクスチャ
   依存: THREE, ATTR (balance.js)　※ドラゴン本体は creatures.js
   ============================================================ */
'use strict';

// ============================================================
// 環境演出（空・地面・台座・浮遊光）
// ============================================================
function makeCanvasTexture(size, draw) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

// 柔らかい光の玉（スプライト・粒子用）
let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  _glowTex = makeCanvasTexture(64, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
  return _glowTex;
}

// 縦グラデーションの空（大きな球の内側）
function buildSkyDome(top, mid, bottom) {
  const tex = makeCanvasTexture(256, (g, s) => {
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, top);
    grd.addColorStop(0.55, mid);
    grd.addColorStop(1, bottom);
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(90, 32, 16), mat);
  sky.renderOrder = -10;
  return sky;
}

// 地面：中心が明るく外周が背景に溶ける円盤
function buildGround(colorHex, accentHex, radius = 26) {
  const tex = makeCanvasTexture(512, (g, s) => {
    const c = s / 2;
    const grd = g.createRadialGradient(c, c, 0, c, c, c);
    grd.addColorStop(0, accentHex);
    grd.addColorStop(0.12, colorHex);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    // 同心円の細線（紋様）
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 1;
    for (let r = 0.08; r < 0.5; r += 0.07) {
      g.beginPath(); g.arc(c, c, s * r, 0, Math.PI * 2); g.stroke();
    }
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

// 接地影
function buildContactShadow(size = 2.6, opacity = 0.55) {
  const tex = makeCanvasTexture(128, (g, s) => {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0.9)');
    grd.addColorStop(0.6, 'rgba(0,0,0,0.35)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

// 台座：黒曜石の円盤＋属性色に光るリング
function buildPedestal(accentHex, radius = 1.7) {
  const g = new THREE.Group();
  const stone = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.08, 0.22, 64),
    new THREE.MeshStandardMaterial({ color: 0x0c0d14, metalness: 0.6, roughness: 0.35 })
  );
  stone.position.y = -0.11;
  g.add(stone);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(accentHex), transparent: true, opacity: 0.85 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.98, 0.018, 8, 96), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.005;
  g.add(ring);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.72, 0.008, 6, 96), ringMat.clone());
  inner.material.opacity = 0.35;
  inner.rotation.x = Math.PI / 2;
  inner.position.y = 0.005;
  g.add(inner);
  g.userData.ring = ring;
  return g;
}

// 浮遊する光の粒子
function buildMotes(colorHex, count = 140, spread = 16, height = 7) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 1] = Math.random() * height - 0.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread - 2;
    seeds[i] = Math.random() * 100;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.09, map: glowTexture(), color: new THREE.Color(colorHex),
    transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData = { seeds, height, base: pos.slice() };
  return pts;
}
function animateMotes(pts, t) {
  if (!pts) return;
  const p = pts.geometry.attributes.position;
  const { seeds, height, base } = pts.userData;
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    p.array[i * 3] = base[i * 3] + Math.sin(t * 0.3 + s) * 0.4;
    p.array[i * 3 + 1] = ((base[i * 3 + 1] + t * (0.12 + (s % 1) * 0.15)) % height) - 0.5;
    p.array[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.25 + s) * 0.4;
  }
  p.needsUpdate = true;
}

// 星空（タイトル・孵化）
function createStarField(scene, count = 500) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 40 + Math.random() * 30;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 1.6 - 0.6);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph);
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.5, map: glowTexture(), color: 0xdfe6ff, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return pts;
}

// ============================================================
// 卵（なめらかな回転体＋光る紋様＋ひび）
// ============================================================
function buildEgg(attr) {
  const g = new THREE.Group();
  const col = ATTR[attr].color;
  const em = ATTR[attr].emissive;

  // 卵形の輪郭（上がすぼまる）
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const v = i / 40;
    const y = -Math.cos(v * Math.PI) * 1.45;
    const r = Math.sin(v * Math.PI) * 1.02 * (1 - 0.18 * (y / 1.45 + 1) / 2);
    pts.push(new THREE.Vector2(Math.max(0.0001, r), y));
  }
  const shellGeo = new THREE.LatheGeometry(pts, 64);

  // 紋様テクスチャ（属性色の帯と斑点）
  const tex = makeCanvasTexture(512, (c, s) => {
    c.fillStyle = '#14131c';
    c.fillRect(0, 0, s, s);
    c.globalAlpha = 1;
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * s, y = s * 0.1 + Math.random() * s * 0.8;
      const r = 4 + Math.random() * 16;
      const grd = c.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, col);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = grd;
      c.globalAlpha = 0.25 + Math.random() * 0.5;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 0.9;
    c.strokeStyle = col;
    c.lineWidth = 3;
    [0.38, 0.62].forEach(yy => {
      c.beginPath();
      for (let x = 0; x <= s; x += 8) {
        const y = s * yy + Math.sin(x / s * Math.PI * 8) * 10;
        x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    });
  });
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: tex, emissive: new THREE.Color(em), emissiveMap: tex,
    emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.15,
  });
  const shell = new THREE.Mesh(shellGeo, shellMat);
  g.add(shell);

  // 内側の光（孵化が近づくほど強くなる）
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: new THREE.Color(col), transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.set(5, 6, 1);
  g.add(glow);

  // ひび（稲妻状の発光線）
  const cracks = [];
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
    const linePts = [];
    let y = -0.3 + Math.random() * 0.6, a = a0;
    for (let k = 0; k < 6; k++) {
      const v = Math.acos(-y / 1.45) / Math.PI;
      const r = Math.sin(v * Math.PI) * 1.02 * (1 - 0.18 * (y / 1.45 + 1) / 2) + 0.012;
      linePts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      y += (Math.random() - 0.3) * 0.28;
      a += (Math.random() - 0.5) * 0.35;
    }
    const geo = new THREE.BufferGeometry().setFromPoints(linePts);
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const line = new THREE.Line(geo, mat);
    g.add(line);
    cracks.push(line);
  }
  g.userData = { shell, glow, cracks };
  return g;
}
