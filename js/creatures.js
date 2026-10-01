/* ============================================================
   Dragon Cradle — creatures.js
   ドラゴン（幼体・成体 × 4属性）のプロシージャル3Dモデルとアニメーション

   ・胴体〜首〜尻尾は「ロフト（断面を曲線に沿って掃引）」した1枚のスキンメッシュ。
     骨（Bone）を仕込んであり、首・尻尾がなめらかに曲がる
   ・頭部は球をスカルプト（頂点変形）して成形
   ・背は濃く腹は明るいカウンターシェーディング＋鱗テクスチャ＋環境反射
   ・待機（呼吸・まばたき・尻尾・翼・たてがみ・ローブ）と
     アクション（attack / hit / happy / roar）を手続き的に再生

   API:
     buildDragon(attr, stage, type)       → THREE.Group（userData.rig を持つ）
     animateDragon(group, dt, t)          毎フレーム
     playDragonAction(group, name)        'attack' | 'hit' | 'happy' | 'roar'
     setDragonScale(group, s)             足元を地面に保ったまま拡大縮小
     dragonCenterY(group)                 胴の中心の高さ（演出用）
     setDragonFlash(group, amount)        被弾フラッシュ
     animateDragonParticles(group, t)     互換用（animateDragon に統合済み）
   依存: THREE, ATTR, glowTexture, makeCanvasTexture（models.js）
   ============================================================ */
'use strict';

const GROUND_Y = -0.72;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// ------------------------------------------------------------
// 配色（属性ごと）
// ------------------------------------------------------------
const PALETTE = {
  fire: {
    back: '#5c140d', belly: '#c27a3a', skin2: '#7e1f12', membrane: '#3d0e08', memGlow: '#ff5a1f',
    horn: '#efe2c8', claw: '#2a1712', eye: '#ffc23a', glow: '#ff7a2e', accent: '#ffb347',
  },
  ice: {
    back: '#18323b', belly: '#4b6f7a', skin2: '#234652', horn: '#dff6ff', claw: '#16262c',
    eye: '#7fe8ff', glow: '#5fd8ff', crystal: '#bff0ff', accent: '#9fe9ff',
  },
  thunder: {
    back: '#272c42', belly: '#7d849e', skin2: '#333a56', hair: '#ffd95a', hoof: '#8a6a22',
    horn: '#ffe9a0', eye: '#ffe066', glow: '#ffd447', feather: '#f4f1e6', featherTip: '#ffd447', accent: '#fff3b0',
  },
  dark: {
    robe: '#1b1230', robeIn: '#0b0714', trim: '#7c4dff', eye: '#d6b3ff', glow: '#a779ff',
    hand: '#231a36', claw: '#b9a2ff', accent: '#c7a6ff',
  },
};

// ------------------------------------------------------------
// テクスチャ・マテリアル
// ------------------------------------------------------------
const _ckTex = {};
function ckTexture(kind) {
  if (_ckTex[kind]) return _ckTex[kind];
  const tex = makeCanvasTexture(256, (g, s) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    if (kind === 'scales') {
      // ずらし配置の鱗（中心が明るく縁が暗い）
      const cw = s / 8, ch = s / 10;
      for (let row = -1; row <= 10; row++) {
        for (let col = -1; col <= 8; col++) {
          const x = col * cw + (row % 2 ? cw / 2 : 0), y = row * ch;
          const grd = g.createRadialGradient(x + cw / 2, y + ch * 0.35, 1, x + cw / 2, y + ch * 0.5, cw * 0.7);
          grd.addColorStop(0, '#ffffff');
          grd.addColorStop(0.75, '#d8d8d8');
          grd.addColorStop(1, '#8a8a8a');
          g.fillStyle = grd;
          g.beginPath();
          g.ellipse(x + cw / 2, y + ch * 0.55, cw * 0.56, ch * 0.75, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
    } else if (kind === 'hide') {
      // 小さな凹凸（怪獣・馬の皮膚）
      for (let i = 0; i < 900; i++) {
        const v = 222 + Math.floor(Math.random() * 33);
        g.fillStyle = `rgb(${v},${v},${v})`;
        const r = 1 + Math.random() * 3;
        g.beginPath(); g.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2); g.fill();
      }
    } else if (kind === 'robe') {
      // 布の縦じわと、かすかなルーン
      for (let x = 0; x < s; x += 2) {
        const v = 215 + Math.floor(Math.sin(x * 0.21) * 22 + Math.sin(x * 0.07) * 14);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, 0, 2, s);
      }
    } else if (kind === 'runes') {
      g.fillStyle = '#000000';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const cx = (i % 3) * s / 3 + s / 6, cy = s * 0.72 + (i % 2) * 18;
        g.globalAlpha = 0.7;
        g.beginPath();
        g.arc(cx, cy, 9, Math.PI * 0.2, Math.PI * 1.6);
        g.moveTo(cx - 12, cy + 16); g.lineTo(cx + 12, cy + 16);
        g.moveTo(cx, cy - 14); g.lineTo(cx, cy + 22);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.fillStyle = '#ffffff';
      g.fillRect(0, s * 0.94, s, 3);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.__shared = true;
  _ckTex[kind] = tex;
  return tex;
}

function ckMat(o = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(o.color || '#ffffff'),
    roughness: o.roughness ?? 0.55,
    metalness: o.metalness ?? 0.04,
    clearcoat: o.clearcoat ?? 0.25,
    clearcoatRoughness: o.clearcoatRoughness ?? 0.45,
    emissive: new THREE.Color(o.emissive || o.color || '#000000'),
    emissiveIntensity: o.emissiveIntensity ?? 0,
    vertexColors: !!o.vertexColors,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    flatShading: !!o.flat,
    envMapIntensity: o.env ?? 0.5,
  });
  if (o.map) { m.map = ckTexture(o.map); m.bumpMap = ckTexture(o.map); m.bumpScale = o.bump ?? 0.012; }
  if (o.emissiveMap) m.emissiveMap = ckTexture(o.emissiveMap);
  if (o.skinning) m.skinning = true;
  if (o.depthWrite === false) m.depthWrite = false;
  return m;
}
const glowMat = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const basicMat = color => new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });

// 同じ位置の頂点（UVの継ぎ目）の法線を平均して、継ぎ目の線を消す
function smoothSeams(geo) {
  geo.computeVertexNormals();
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  }
  const n = new THREE.Vector3();
  map.forEach(ids => {
    if (ids.length < 2) return;
    n.set(0, 0, 0);
    ids.forEach(i => n.add(V3(nor.getX(i), nor.getY(i), nor.getZ(i))));
    n.normalize();
    ids.forEach(i => nor.setXYZ(i, n.x, n.y, n.z));
  });
  nor.needsUpdate = true;
  return geo;
}

// ------------------------------------------------------------
// ロフト：断面（楕円）を曲線に沿って掃引したチューブ。bones を指定するとスキンメッシュ
//   points: [{ p:[x,y,z], r:[rx,ry], role? }]
// ------------------------------------------------------------
function catmull1(vals, t) {
  const n = vals.length - 1;
  const f = t * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
  const p0 = vals[Math.max(0, i - 1)], p1 = vals[i], p2 = vals[i + 1], p3 = vals[Math.min(n, i + 2)];
  return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

function loft(points, o = {}) {
  const seg = o.seg || 48, rad = o.radial || 16;
  const curve = new THREE.CatmullRomCurve3(points.map(q => V3(...q.p)), false, 'catmullrom', 0.5);
  const rxs = points.map(q => q.r[0]), rys = points.map(q => q.r[1]);
  const back = new THREE.Color(o.back || '#ffffff'), belly = new THREE.Color(o.belly || o.back || '#ffffff');
  const pos = [], col = [], uv = [], idx = [], skinI = [], skinW = [];
  const frames = [];
  let up = V3(0, 1, 0);
  const prevT = V3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const P = curve.getPoint(t);
    const T = curve.getTangent(t).normalize();
    if (i === 0) {
      up = o.up ? V3(...o.up) : V3(0, 1, 0);
      up.sub(T.clone().multiplyScalar(up.dot(T))).normalize();
      if (up.lengthSq() < 1e-6) up = V3(0, 0, -1);
    } else {
      // 平行移動フレーム（ねじれ・反転を防ぐ）
      up.sub(T.clone().multiplyScalar(up.dot(T))).normalize();
    }
    prevT.copy(T);
    const side = V3().crossVectors(T, up).normalize();
    frames.push({ P, T, up: up.clone(), side });
    const rx = Math.max(0.0005, catmull1(rxs, t)), ry = Math.max(0.0005, catmull1(rys, t));
    for (let j = 0; j <= rad; j++) {
      const th = -Math.PI / 2 + (j / rad) * Math.PI * 2;  // 継ぎ目は腹側
      const c = Math.cos(th), s = Math.sin(th);
      const v = P.clone().addScaledVector(side, c * rx).addScaledVector(up, s * ry * (s < 0 ? (o.bellyFlat ?? 1) : 1));
      pos.push(v.x, v.y, v.z);
      const k = smooth(-0.8, -0.05, s);
      const cc = belly.clone().lerp(back, k);
      col.push(cc.r, cc.g, cc.b);
      uv.push(t * (o.uRepeat || 6), j / rad * (o.vRepeat || 2));
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rad; j++) {
      const a = i * (rad + 1) + j, b = a + rad + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  smoothSeams(geo);

  const out = { curve, frames, points };
  if (o.pivot !== undefined) {
    // 制御点ごとに骨。pivot から前後に連鎖させる（尻尾側と首側が独立して動く）
    const n = points.length;
    const bones = points.map(() => new THREE.Bone());
    const bind = points.map((q, i) => curve.getPoint(i / (n - 1)));
    bones.forEach((b, i) => {
      b.userData.bindPos = bind[i].clone();
      b.userData.role = points[i].role || 'body';
      b.userData.index = i;
    });
    bones[o.pivot].position.copy(bind[o.pivot]);
    for (let i = o.pivot - 1; i >= 0; i--) { bones[i + 1].add(bones[i]); bones[i].position.copy(bind[i]).sub(bind[i + 1]); }
    for (let i = o.pivot + 1; i < n; i++) { bones[i - 1].add(bones[i]); bones[i].position.copy(bind[i]).sub(bind[i - 1]); }
    for (let i = 0; i <= seg; i++) {
      const f = (i / seg) * (n - 1), a = Math.min(n - 2, Math.floor(f)), w = f - a;
      for (let j = 0; j <= rad; j++) { skinI.push(a, a + 1, 0, 0); skinW.push(1 - w, w, 0, 0); }
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinW, 4));
    const mesh = new THREE.SkinnedMesh(geo, o.mat);
    mesh.add(bones[o.pivot]);
    mesh.bind(new THREE.Skeleton(bones));
    mesh.frustumCulled = false;
    out.mesh = mesh;
    out.bones = bones;
  } else {
    out.mesh = new THREE.Mesh(geo, o.mat);
  }
  return out;
}

// 簡易チューブ（角・爪・脚など、骨なし）
function tube(pts, radii, mat, o = {}) {
  return loft(pts.map((p, i) => ({ p, r: Array.isArray(radii[i]) ? radii[i] : [radii[i], radii[i]] })),
    { seg: o.seg || 14, radial: o.radial || 10, mat, back: o.back, belly: o.belly, up: o.up, uRepeat: o.uRepeat || 2 }).mesh;
}

// 球のスカルプト（頂点を関数で変形）
function sculpt(fn, mat, w = 32, h = 24) {
  const geo = new THREE.SphereGeometry(1, w, h);
  const p = geo.attributes.position;
  const v = V3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  smoothSeams(geo);
  return new THREE.Mesh(geo, mat);
}

// 頭部の汎用スカルプト。z+ が前
function headShape(o) {
  return v => {
    const fz = smooth(-0.1, 1, v.z);
    // 吻を前に伸ばしつつ細く
    v.z *= o.len * (v.z > 0 ? 1 + o.snout * fz : 1);
    const taper = 1 - o.taper * fz;
    v.x *= o.width * taper;
    v.y *= o.height * (1 - o.taperY * fz);
    if (v.y > 0) v.y *= 1 - o.flatTop * smooth(0.2, 1, v.z / o.len);
    // 眉の張り出し
    if (o.brow && v.y > 0.25 * o.height && v.z > -0.1 && v.z < 0.45 * o.len) v.y += o.brow * Math.exp(-Math.pow((Math.abs(v.x) / o.width - 0.55) * 4, 2));
    v.y += o.drop * fz * o.len;
  };
}

function attachTo(bone, obj, worldPos) {
  obj.position.copy(worldPos).sub(bone.userData.bindPos);
  bone.add(obj);
  return obj;
}
// ロフトの曲線上の点に一番近い骨
function boneNear(L, worldPos) {
  let best = 0, bd = Infinity;
  L.bones.forEach((b, i) => { const d = b.userData.bindPos.distanceTo(worldPos); if (d < bd) { bd = d; best = i; } });
  return L.bones[best];
}

// ------------------------------------------------------------
// パーツ
// ------------------------------------------------------------
function makeEye(r, irisColor, o = {}) {
  const g = new THREE.Group();
  const sclera = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), ckMat({ color: o.sclera || '#f3ead8', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1, env: 1.2 }));
  g.add(sclera);
  const iris = new THREE.Mesh(new THREE.SphereGeometry(r * (o.big ? 0.8 : 0.72), 20, 14), ckMat({ color: irisColor, emissive: irisColor, emissiveIntensity: o.glow ?? 0.9, roughness: 0.2, clearcoat: 1 }));
  iris.scale.set(1, 1, 0.45);
  iris.position.z = r * 0.7;
  g.add(iris);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 14, 10), basicMat('#050505'));
  pupil.scale.set(o.slit ? 0.22 : (o.big ? 0.58 : 0.6), o.slit ? 0.95 : (o.big ? 0.66 : 0.6), 0.3);
  pupil.position.z = r * 0.97;
  g.add(pupil);
  const hl = new THREE.Mesh(new THREE.SphereGeometry(r * (o.big ? 0.22 : 0.14), 10, 8), basicMat('#ffffff'));
  hl.position.set(-r * 0.3, r * 0.35, r * 1.02);
  g.add(hl);
  if (o.big) {
    const hl2 = new THREE.Mesh(new THREE.SphereGeometry(r * 0.1, 8, 6), basicMat('#ffffff'));
    hl2.position.set(r * 0.32, -r * 0.3, r * 1.0);
    g.add(hl2);
  }
  g.userData.iris = iris;
  return g;
}

// 曲がった角（根元→先端が後ろへ反る）
function makeHorn(len, r, mat, curl = 0.5, segs = 4) {
  const pts = [], rs = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    pts.push([0, Math.sin(u * 1.3) * len * 0.8, -Math.pow(u, 1.6) * len * curl]);
    rs.push(r * (1 - u * 0.96));
  }
  return tube(pts, rs, mat, { seg: 12, radial: 10 });
}

function makeClaw(len, r, mat) {
  return tube([[0, 0, 0], [0, -len * 0.25, len * 0.6], [0, -len * 0.75, len * 0.9]], [r, r * 0.6, 0.002], mat, { seg: 8, radial: 7 });
}

// 結晶（六角柱＋尖頭、ファセット）
function makeCrystal(h, r, color, glow) {
  const pts = [V3(0, 0), V3(r * 0.85, h * 0.04), V3(r, h * 0.62), V3(0, h)].map(p => new THREE.Vector2(p.x, p.y));
  const geo = new THREE.LatheGeometry(pts, 6);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, ckMat({ color, emissive: glow, emissiveIntensity: 0.35, roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.88, flat: true, env: 1.6 }));
  return m;
}

// 炎（加算スプライトの集合・アニメーションで揺らぐ）
function makeFlame(size, colors = ['#fff4c2', '#ffb02e', '#ff4a1a']) {
  const g = new THREE.Group();
  const sprites = [];
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(colors.length - 1, Math.floor(i / 2.5))];
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.userData = { k: i / 7, seed: Math.random() * 10 };
    g.add(s);
    sprites.push(s);
  }
  g.userData.flame = { sprites, size };
  return g;
}
function updateFlame(f, t) {
  const { sprites, size } = f.userData.flame;
  sprites.forEach(s => {
    const { k, seed } = s.userData;
    const ph = (t * 1.6 + seed) % 1;
    s.position.set(Math.sin(t * 7 + seed) * 0.08 * size * k, ph * size * (0.6 + k), Math.cos(t * 5 + seed) * 0.06 * size * k);
    const sc = size * (1.1 - k * 0.6) * (1 - ph * 0.6) * (0.85 + Math.sin(t * 13 + seed) * 0.15);
    s.scale.set(sc, sc * 1.3, 1);
    s.material.opacity = (1 - ph) * (0.9 - k * 0.3);
  });
}

// 稲妻アーク（頂点をランダムに揺らして明滅）
function makeArc(a, b, color, width = 1) {
  const n = 9;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, linewidth: width }));
  line.userData.arc = { a: a.clone(), b: b.clone(), n, next: 0 };
  line.frustumCulled = false;
  return line;
}
function updateArc(line, t, intensity = 1) {
  const d = line.userData.arc;
  if (t < d.next) return;
  d.next = t + 0.06 + Math.random() * 0.08;
  const p = line.geometry.attributes.position;
  const amp = d.a.distanceTo(d.b) * 0.18;
  for (let i = 0; i < d.n; i++) {
    const u = i / (d.n - 1);
    const v = d.a.clone().lerp(d.b, u);
    const j = (i === 0 || i === d.n - 1) ? 0 : amp;
    p.setXYZ(i, v.x + (Math.random() - 0.5) * j, v.y + (Math.random() - 0.5) * j, v.z + (Math.random() - 0.5) * j);
  }
  p.needsUpdate = true;
  line.material.opacity = Math.random() < 0.35 * intensity + 0.15 ? 0.95 : 0;
}

// 毛束・たてがみ（短い円錐を連結した鎖。波打たせる）
function makeStrand(len, r, mat, links = 4, dir = V3(0, -1, -0.4)) {
  const root = new THREE.Group();
  let parent = root;
  const chain = [];
  const step = len / links;
  const d = dir.clone().normalize();
  for (let i = 0; i < links; i++) {
    const g = new THREE.Group();
    if (i > 0) g.position.copy(d).multiplyScalar(step);
    const r0 = r * (1 - i / links), r1 = r * (1 - (i + 1) / links) + 0.002;
    const m = tube([[0, 0, 0], d.clone().multiplyScalar(step * 1.15).toArray()], [r0, r1], mat, { seg: 2, radial: 6 });
    g.add(m);
    parent.add(g);
    chain.push(g);
    parent = g;
  }
  root.userData.chain = chain;
  return root;
}

// コウモリ型の翼。wing-local: +x 外側, +y 上, +z 前。side=-1 で左右反転
function makeBatWing(side, span, pal) {
  const shoulder = new THREE.Group();
  const arm = new THREE.Group();
  shoulder.add(arm);
  const sc = v => V3(v[0] * span * side, v[1] * span, v[2] * span);
  const S = sc([0, 0, 0]), E = sc([0.5, 0.22, -0.08]), W = sc([1.0, 0.32, 0.02]);
  const F = [sc([2.05, 0.38, -0.32]), sc([1.8, -0.12, -0.78]), sc([1.3, -0.38, -1.0]), sc([0.75, -0.42, -0.98])];
  const R0 = sc([0.04, -0.28, -0.62]);
  const boneMat = ckMat({ color: pal.skin2 || pal.back, roughness: 0.45, clearcoat: 0.4, emissive: pal.glow, emissiveIntensity: 0.02 });
  const r = 0.032 * span;
  arm.add(tube([S.toArray(), E.toArray(), W.toArray()], [r * 1.5, r * 1.1, r * 0.8], boneMat));
  F.forEach(f => {
    const mid = W.clone().lerp(f, 0.5).add(V3(0, 0.04 * span, 0));
    arm.add(tube([W.toArray(), mid.toArray(), f.toArray()], [r * 0.6, r * 0.4, r * 0.08], boneMat, { seg: 8, radial: 6 }));
  });
  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 10, 8), boneMat);
  knuckle.position.copy(W);
  arm.add(knuckle);
  const thumb = makeClaw(0.12 * span, 0.018 * span, ckMat({ color: pal.claw, roughness: 0.3, clearcoat: 0.8 }));
  thumb.position.copy(W);
  thumb.rotation.x = -0.3;
  arm.add(thumb);

  const memMat = ckMat({ color: pal.membrane || pal.back, emissive: pal.memGlow || pal.glow, emissiveIntensity: 0.22, roughness: 0.75, clearcoat: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  // 頂点 apex から辺 e0→e1 までの扇形パッチ（指の線を共有するので隙間ができない）
  function sector(apex, e0, e1, scallop, billow, n = 10) {
    const pos = [], idx = [];
    const nrm = V3().subVectors(e0, apex).cross(V3().subVectors(e1, apex)).normalize();
    for (let i = 0; i <= n; i++) {
      for (let j = 0; j <= n; j++) {
        const u = i / n, v = j / n;   // u: e0→e1 方向, v: apex→辺
        const P = apex.clone().lerp(e0.clone().lerp(e1, u), v);
        const k = Math.sin(Math.PI * u);
        P.lerp(apex, scallop * k * Math.pow(v, 3));
        P.addScaledVector(nrm, -billow * k * Math.sin(Math.PI * v) * side);
        pos.push(P.x, P.y, P.z);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const a = i * (n + 1) + j, b = a + n + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, memMat);
  }
  for (let i = 0; i < F.length - 1; i++) arm.add(sector(W, F[i], F[i + 1], 0.16, 0.04 * span));
  // 腕〜体側：肩 S を頂点に、前縁（肘・手首）と後縁（最後の指→体）を張る
  arm.add(sector(W, F[F.length - 1], R0, 0.2, 0.05 * span));
  arm.add(sector(S, E, W, 0, 0, 6));
  arm.add(sector(S, W, R0, 0.0, 0.03 * span, 8));
  shoulder.userData = { arm, side };
  return shoulder;
}

// 同じマテリアルのメッシュを1つのジオメトリに結合（描画回数の削減）
function mergeInto(parent, meshes) {
  const byMat = new Map();
  meshes.forEach(m => { if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(m); });
  byMat.forEach((list, mat) => {
    const pos = [], nor = [], col = [], idx = [];
    let base = 0;
    const nm = new THREE.Matrix3();
    list.forEach(m => {
      m.updateMatrix();
      nm.getNormalMatrix(m.matrix);
      const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
      const v = V3();
      for (let i = 0; i < P.count; i++) {
        v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(m.matrix); pos.push(v.x, v.y, v.z);
        v.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        if (C) col.push(C.getX(i), C.getY(i), C.getZ(i));
      }
      const I = g.index ? g.index.array : [...Array(P.count).keys()];
      for (let i = 0; i < I.length; i++) idx.push(I[i] + base);
      base += P.count;
      parent.remove(m);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    if (col.length) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    parent.add(new THREE.Mesh(geo, mat));
  });
}

// 羽根の翼（ペガサス）
let _featherGeo = null;
function featherGeo() {
  if (_featherGeo) return _featherGeo;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.2, 0.2, 0.15, 0.75);
  s.quadraticCurveTo(0.1, 1.02, -0.02, 1);
  s.quadraticCurveTo(-0.14, 0.55, 0, 0);
  const geo = new THREE.ShapeGeometry(s, 8);
  const p = geo.attributes.position;
  const col = [];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setZ(i, -Math.pow(y, 2) * 0.12 + Math.abs(p.getX(i)) * 0.05);  // 反り
    col.push(y, y, y); // 先端ほど 1（先端色）
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  _featherGeo = geo;
  return geo;
}
function makeFeatherWing(side, span, pal) {
  const shoulder = new THREE.Group();
  const arm = new THREE.Group();
  shoulder.add(arm);
  const mat = ckMat({ color: pal.feather, roughness: 0.6, clearcoat: 0.2, side: THREE.DoubleSide, emissive: pal.featherTip, emissiveIntensity: 0.06 });
  const tipMat = ckMat({ color: pal.featherTip, roughness: 0.4, side: THREE.DoubleSide, emissive: pal.featherTip, emissiveIntensity: 0.55 });
  const W = V3(0.95 * span * side, 0.2 * span, 0.02 * span);
  arm.add(tube([[0, 0, 0], [0.5 * span * side, 0.16 * span, 0.06 * span], W.toArray()], [0.05 * span, 0.04 * span, 0.03 * span], ckMat({ color: pal.feather, roughness: 0.7 })));
  const hand = new THREE.Group();
  hand.position.copy(W);
  arm.add(hand);
  const feathers = [];
  // 羽根は +y 方向に伸びる形。angle=0 で後ろ、π/2 で外側を向く
  const add = (parent, pos, len, angle, m, w = 1, lift = 0) => {
    const f = new THREE.Mesh(featherGeo(), m);
    f.position.copy(pos);
    f.scale.set(len * 0.75 * w, len, len);
    f.rotation.set(-Math.PI / 2 + lift, 0, -side * angle);
    parent.add(f);
    feathers.push({ f, base: f.rotation.clone() });
    return f;
  };
  // 初列風切（手先から外側へ扇状）
  for (let i = 0; i < 12; i++) {
    const u = i / 11;
    add(hand, V3(-0.03 * span * side * i, 0.002 * i, -0.01 * span * i), (1.0 - u * 0.25) * span, 1.45 - u * 0.9, i < 3 ? tipMat : mat, 1, 0.015 * i);
  }
  // 次列風切（腕に沿って後ろへ）
  for (let i = 0; i < 13; i++) {
    const u = i / 12;
    const p = V3(lerp(0.88, 0.08, u) * span * side, lerp(0.19, 0.02, u) * span, 0);
    add(arm, p, (0.68 - u * 0.12) * span, 0.55 - u * 0.4, mat, 1, 0.05);
  }
  // 雨覆（前縁を覆う短い羽・上に重ねる）
  for (let i = 0; i < 14; i++) {
    const u = i / 13;
    const p = V3(lerp(0.95, 0.08, u) * span * side, lerp(0.22, 0.05, u) * span + 0.01, 0.03 * span);
    add(arm, p, 0.36 * span, 0.7 - u * 0.4, i % 5 === 0 ? tipMat : mat, 1.2, 0.12);
    if (i % 2 === 0) add(arm, p.clone().add(V3(0, 0.012, 0.05 * span)), 0.2 * span, 0.8 - u * 0.4, mat, 1.3, 0.2);
  }
  // 羽根は親（腕・手先）ごとに1メッシュへ結合
  mergeInto(arm, feathers.filter(f => f.f.parent === arm).map(f => f.f));
  mergeInto(hand, feathers.filter(f => f.f.parent === hand).map(f => f.f));
  shoulder.userData = { arm, hand, side };
  return shoulder;
}

// ------------------------------------------------------------
// リグ（アニメーション用の参照と状態）
// ------------------------------------------------------------
function newRig(kind, inner) {
  return {
    kind, inner,
    neck: [], tail: [], wings: [], strands: [], flames: [], arcs: [], crystals: [], orbs: [], eyes: [], blinkers: [],
    head: null, jaw: null, robe: null, arms: [],
    anchors: {},
    action: null,
    blinkAt: 1 + Math.random() * 3,
    chestY: 1,
    seed: Math.random() * 10,
    breath: 0.012,
  };
}

function addEyes(rig, parent, pos, r, color, opts = {}) {
  [-1, 1].forEach(s => {
    const e = makeEye(r, color, opts);
    e.position.set(pos[0] * s, pos[1], pos[2]);
    e.rotation.y = s * (opts.yaw ?? 0.35);
    e.rotation.z = -s * (opts.tilt ?? 0);
    parent.add(e);
    rig.eyes.push(e);
    rig.blinkers.push(e);
  });
}

// ============================================================
// 炎
// ============================================================
function buildFireAdult(rig, pal) {
  const inner = rig.inner;
  const body = loft([
    { p: [0, 0.38, -3.1], r: [0.012, 0.012], role: 'tail' },
    { p: [0, 0.46, -2.55], r: [0.07, 0.075], role: 'tail' },
    { p: [0, 0.62, -1.95], r: [0.12, 0.13], role: 'tail' },
    { p: [0, 0.85, -1.42], r: [0.2, 0.22], role: 'tail' },
    { p: [0, 1.03, -0.95], r: [0.3, 0.32], role: 'tail' },
    { p: [0, 1.13, -0.5], r: [0.42, 0.45] },
    { p: [0, 1.12, 0.05], r: [0.5, 0.52] },
    { p: [0, 1.2, 0.55], r: [0.45, 0.5] },
    { p: [0, 1.47, 0.9], r: [0.29, 0.32], role: 'neck' },
    { p: [0, 1.86, 1.1], r: [0.2, 0.23], role: 'neck' },
    { p: [0, 2.16, 1.2], r: [0.16, 0.18], role: 'neck' },
    { p: [0, 2.32, 1.28], r: [0.13, 0.15], role: 'neck' },
    { p: [0, 2.4, 1.38], r: [0.02, 0.02], role: 'neck' },
  ], { pivot: 6, seg: 72, radial: 18, back: pal.back, belly: pal.belly, mat: ckMat({ vertexColors: true, map: 'scales', bump: 0.02, roughness: 0.45, clearcoat: 0.4, skinning: true, emissive: pal.glow }), uRepeat: 14, vRepeat: 3, bellyFlat: 0.85 });
  inner.add(body.mesh);
  rig.body = body;
  rig.tail = body.bones.slice(0, 5).reverse();   // 付け根→先端
  rig.neck = body.bones.slice(8, 12);
  rig.chestY = 1.15;

  const headBone = body.bones[11];
  const head = new THREE.Group();
  attachTo(headBone, head, V3(0, 2.36, 1.34));
  head.rotation.x = 0.18;
  rig.head = head;
  const skinMat = ckMat({ color: pal.back, map: 'scales', bump: 0.015, roughness: 0.45, clearcoat: 0.4, emissive: pal.glow });
  const skull = sculpt(headShape({ len: 0.34, width: 0.24, height: 0.2, snout: 0.6, taper: 0.38, taperY: 0.42, flatTop: 0.3, brow: 0.06, drop: -0.04 }), skinMat);
  skull.position.set(0, 0.04, 0.05);
  head.add(skull);
  [-1, 1].forEach(s => {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), basicMat('#120604'));
    n.scale.set(1, 0.6, 0.8);
    n.position.set(0.055 * s, 0.07, 0.54);
    head.add(n);
  });
  // 下顎（ヒンジ）
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.04, -0.12);
  head.add(jaw);
  const jawMesh = sculpt(headShape({ len: 0.32, width: 0.19, height: 0.06, snout: 0.5, taper: 0.4, taperY: 0.2, flatTop: 0, brow: 0, drop: 0.02 }), ckMat({ color: pal.skin2, map: 'scales', roughness: 0.5, emissive: pal.glow }));
  jawMesh.position.set(0, -0.03, 0.19);
  jaw.add(jawMesh);
  rig.jaw = jaw;
  // 牙
  const toothMat = ckMat({ color: pal.horn, roughness: 0.3, clearcoat: 0.8 });
  [-1, 1].forEach(s => {
    const t1 = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.08, 6), toothMat);
    t1.position.set(0.075 * s, -0.04, 0.4);
    t1.rotation.x = Math.PI;
    head.add(t1);
  });
  // 角（大×2、小×2）
  const hornMat = ckMat({ color: pal.horn, roughness: 0.35, clearcoat: 0.7, map: 'hide', bump: 0.006 });
  [-1, 1].forEach(s => {
    const h1 = makeHorn(0.55, 0.055, hornMat, 0.9);
    h1.position.set(0.11 * s, 0.13, -0.08);
    h1.rotation.set(-0.5, 0, s * -0.35);
    head.add(h1);
    const h2 = makeHorn(0.26, 0.03, hornMat, 0.8);
    h2.position.set(0.17 * s, 0.03, -0.12);
    h2.rotation.set(-0.9, 0, s * -0.9);
    head.add(h2);
    // 頬のトゲ
    const cs = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 6), hornMat);
    cs.position.set(0.19 * s, -0.04, 0.0);
    cs.rotation.set(-1.4, 0, s * -0.9);
    head.add(cs);
  });
  addEyes(rig, head, [0.15, 0.1, 0.18], 0.05, pal.eye, { slit: true, yaw: 0.65, tilt: 0.25, sclera: '#2a0f08', glow: 1.6 });
  // 鼻の穴の光（火の息）
  rig.anchors.mouth = new THREE.Group();
  rig.anchors.mouth.position.set(0, -0.02, 0.62);
  head.add(rig.anchors.mouth);

  // 背びれ（骨に付けて一緒に動く）
  const spikeMat = ckMat({ color: pal.skin2, roughness: 0.4, clearcoat: 0.6, emissive: pal.glow, emissiveIntensity: 0.15 });
  for (let i = 0; i < 18; i++) {
    const t = 0.04 + i / 17 * 0.82;
    const f = body.frames[Math.round(t * (body.frames.length - 1))];
    const rr = catmull1(body.points.map(q => q.r[1]), t);
    const h = 0.05 + rr * 0.42;
    const sp = new THREE.Mesh(new THREE.ConeGeometry(h * 0.35, h, 6), spikeMat);
    const wp = f.P.clone().addScaledVector(f.up, rr * 0.92);
    sp.quaternion.setFromUnitVectors(V3(0, 1, 0), f.up.clone().addScaledVector(f.T, -0.6).normalize());
    attachTo(boneNear(body, wp), sp, wp);
  }

  // 脚
  const legMat = ckMat({ color: pal.back, map: 'scales', bump: 0.015, roughness: 0.45, clearcoat: 0.35, emissive: pal.glow });
  const clawMat = ckMat({ color: pal.claw, roughness: 0.25, clearcoat: 0.9 });
  const leg = (bone, pts, rs, x) => {
    const m = tube(pts.map(p => [p[0] * x, p[1], p[2]]), rs, legMat, { back: pal.back, belly: pal.belly });
    m.position.sub(bone.userData.bindPos);
    bone.add(m);
    const last = pts[pts.length - 1];
    const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), legMat);
    foot.scale.set(0.11, 0.07, 0.16);
    foot.position.set(last[0] * x, 0.07, last[2] + 0.08).sub(bone.userData.bindPos);
    bone.add(foot);
    [-0.06, 0, 0.06].forEach(dx => {
      const c = makeClaw(0.1, 0.022, clawMat);
      c.position.set(last[0] * x + dx, 0.08, last[2] + 0.2).sub(bone.userData.bindPos);
      bone.add(c);
    });
  };
  [-1, 1].forEach(x => {
    leg(body.bones[7], [[0.34, 1.08, 0.55], [0.4, 0.66, 0.42], [0.38, 0.2, 0.58], [0.38, 0.08, 0.66]], [0.17, 0.12, 0.075, 0.06], x);
    leg(body.bones[5], [[0.4, 1.08, -0.5], [0.5, 0.66, -0.22], [0.45, 0.24, -0.62], [0.44, 0.08, -0.45]], [0.26, 0.16, 0.085, 0.06], x);
  });

  // 翼
  [-1, 1].forEach(s => {
    const w = makeBatWing(s, 1.3, pal);
    attachTo(body.bones[7], w, V3(0.26 * s, 1.58, 0.4));
    w.userData.rest = { y: s * 0.5, z: s * 0.22, x: 0.1 };
    rig.wings.push(w);
  });
  rig.anchors.shoulders = rig.wings;

  // 尻尾の先：スペード＋炎
  const tip = new THREE.Group();
  attachTo(body.bones[0], tip, V3(0, 0.38, -3.08));
  const spade = sculpt(v => { v.x *= 0.16; v.y *= 0.02; v.z *= 0.2; if (v.z < 0) v.x *= 1 + v.z * 0.8; }, spikeMat, 16, 8);
  spade.position.z = -0.12;
  tip.add(spade);
  const fl = makeFlame(0.32);
  fl.position.z = -0.1;
  tip.add(fl);
  rig.flames.push(fl);

  rig.anchors.head = head;
  rig.anchors.back = body.bones[6];
  rig.anchors.backPos = V3(0, 1.66, 0.05);
}

function buildFireBaby(rig, pal) {
  // 幼体は明るく柔らかい色味に
  pal = { ...pal, back: '#a32e16', skin2: '#b8381e', belly: '#eaa266', horn: '#fff1d8' };
  const inner = rig.inner;
  const body = loft([
    { p: [0, 0.16, -0.95], r: [0.012, 0.012], role: 'tail' },
    { p: [0, 0.1, -0.72], r: [0.05, 0.05], role: 'tail' },
    { p: [0, 0.13, -0.47], r: [0.09, 0.09], role: 'tail' },
    { p: [0, 0.3, -0.2], r: [0.27, 0.25], role: 'tail' },
    { p: [0, 0.44, 0], r: [0.36, 0.36] },
    { p: [0, 0.64, 0.04], r: [0.3, 0.3] },
    { p: [0, 0.82, 0.05], r: [0.2, 0.2], role: 'neck' },
    { p: [0, 0.92, 0.06], r: [0.15, 0.15], role: 'neck' },
    { p: [0, 1.0, 0.07], r: [0.02, 0.02], role: 'neck' },
  ], { pivot: 4, seg: 48, radial: 18, back: pal.back, belly: pal.belly, mat: ckMat({ vertexColors: true, map: 'scales', bump: 0.012, roughness: 0.5, clearcoat: 0.5, skinning: true, emissive: pal.glow }), uRepeat: 6, vRepeat: 2, up: [0, 0, -1] });
  inner.add(body.mesh);
  rig.body = body;
  rig.tail = body.bones.slice(0, 3).reverse();
  rig.neck = body.bones.slice(6, 8);
  rig.chestY = 0.5;

  const head = new THREE.Group();
  attachTo(body.bones[7], head, V3(0, 1.06, 0.08));
  rig.head = head;
  const skin = ckMat({ color: pal.skin2, map: 'scales', bump: 0.008, roughness: 0.5, clearcoat: 0.5, emissive: pal.glow });
  const skull = sculpt(v => { v.x *= 0.42; v.y *= 0.37; v.z *= 0.38; if (v.z > 0.2) v.z += (v.z - 0.2) * 0.25; if (v.y < -0.15) v.x *= 1.05; }, skin);
  head.add(skull);
  const muzzle = sculpt(v => { v.x *= 0.15; v.y *= 0.09; v.z *= 0.1; }, ckMat({ color: pal.skin2, map: 'scales', bump: 0.005, roughness: 0.5, clearcoat: 0.5, emissive: pal.glow }));
  muzzle.position.set(0, -0.11, 0.31);
  [-1, 1].forEach(s => {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), basicMat('#2a0a04'));
    n.position.set(0.035 * s, -0.08, 0.41);
    head.add(n);
  });
  head.add(muzzle);
  // ほっぺ
  [-1, 1].forEach(s => {
    const ck = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), glowMat('#ff7a6a', 0.35));
    ck.scale.set(1, 0.6, 0.4);
    ck.position.set(0.22 * s, -0.06, 0.3);
    head.add(ck);
  });
  addEyes(rig, head, [0.125, 0.05, 0.335], 0.088, '#ff9a2a', { big: true, yaw: 0.22, glow: 0.6 });
  // にっこり口
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16, Math.PI), basicMat('#3a120a'));
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, -0.15, 0.385);
  head.add(mouth);
  rig.jaw = null;
  // 小さな角と炎の冠
  const hornMat = ckMat({ color: pal.horn, roughness: 0.4, clearcoat: 0.6 });
  [-1, 1].forEach(s => {
    const h = makeHorn(0.14, 0.035, hornMat, 0.6);
    h.position.set(0.15 * s, 0.27, -0.04);
    h.rotation.set(-0.3, 0, s * -0.35);
    head.add(h);
  });
  const crown = makeFlame(0.2);
  crown.position.set(0, 0.33, 0);
  head.add(crown);
  rig.flames.push(crown);

  // 手足
  const limbMat = ckMat({ color: pal.skin2, map: 'scales', roughness: 0.5, clearcoat: 0.4, emissive: pal.glow });
  [-1, 1].forEach(s => {
    const foot = sculpt(v => { v.x *= 0.12; v.y *= 0.09; v.z *= 0.16; }, limbMat, 16, 10);
    foot.position.set(0.19 * s, 0.07, 0.14);
    inner.add(foot);
    const arm = tube([[0.24 * s, 0.6, 0.12], [0.3 * s, 0.48, 0.24]], [0.07, 0.055], limbMat);
    arm.position.sub(body.bones[5].userData.bindPos);
    body.bones[5].add(arm);
  });
  // 小さな翼
  [-1, 1].forEach(s => {
    const w = makeBatWing(s, 0.32, pal);
    attachTo(body.bones[5], w, V3(0.14 * s, 0.74, -0.18));
    w.userData.rest = { y: s * 0.6, z: s * 0.2, x: 0.3 };
    rig.wings.push(w);
  });
  // 尻尾の炎
  const fl = makeFlame(0.16);
  attachTo(body.bones[0], fl, V3(0, 0.17, -0.95));
  rig.flames.push(fl);
  rig.anchors.head = head;
}

// ============================================================
// 氷（二足の怪獣＋氷結晶の背びれ）
// ============================================================
function addDorsalCrystals(rig, body, pal, from, to, count, scale) {
  for (let i = 0; i < count; i++) {
    const t = from + (to - from) * (i / (count - 1));
    const f = body.frames[Math.round(t * (body.frames.length - 1))];
    const ry = catmull1(body.points.map(q => q.r[1]), t);
    const peak = Math.sin(Math.min(1, (t - from) / (to - from) * 1.25) * Math.PI) * 0.7 + 0.3;
    [[0, 1], [-1, 0.62], [1, 0.62]].forEach(([sx, hs]) => {
      const h = scale * peak * hs * (0.85 + Math.random() * 0.3);
      const c = makeCrystal(h, h * 0.22, pal.crystal, pal.glow);
      const n = f.up.clone().addScaledVector(f.side, sx * 0.55).normalize();
      const wp = f.P.clone().addScaledVector(f.up, ry * 0.85).addScaledVector(f.side, sx * ry * 0.35);
      c.quaternion.setFromUnitVectors(V3(0, 1, 0), n.addScaledVector(f.T, -0.35).normalize());
      attachTo(boneNear(body, wp), c, wp);
      rig.crystals.push(c);
    });
  }
}

function buildIceAdult(rig, pal) {
  const inner = rig.inner;
  const body = loft([
    { p: [0, 0.16, -3.0], r: [0.03, 0.03], role: 'tail' },
    { p: [0, 0.24, -2.4], r: [0.12, 0.12], role: 'tail' },
    { p: [0, 0.4, -1.75], r: [0.23, 0.24], role: 'tail' },
    { p: [0, 0.64, -1.1], r: [0.35, 0.36], role: 'tail' },
    { p: [0, 0.95, -0.55], r: [0.46, 0.47], role: 'tail' },
    { p: [0, 1.25, -0.18], r: [0.55, 0.55] },
    { p: [0, 1.68, -0.04], r: [0.6, 0.57] },
    { p: [0, 2.08, 0.08], r: [0.54, 0.5] },
    { p: [0, 2.42, 0.2], r: [0.37, 0.35], role: 'neck' },
    { p: [0, 2.64, 0.3], r: [0.29, 0.27], role: 'neck' },
    { p: [0, 2.74, 0.42], r: [0.03, 0.03], role: 'neck' },
  ], { pivot: 6, seg: 64, radial: 20, back: pal.back, belly: pal.belly, mat: ckMat({ vertexColors: true, map: 'hide', bump: 0.012, roughness: 0.75, clearcoat: 0.15, skinning: true, emissive: pal.glow }), uRepeat: 10, vRepeat: 3 });
  inner.add(body.mesh);
  rig.body = body;
  rig.tail = body.bones.slice(0, 5).reverse();
  rig.neck = body.bones.slice(8, 10);
  rig.chestY = 1.7;

  const head = new THREE.Group();
  attachTo(body.bones[9], head, V3(0, 2.76, 0.5));
  head.rotation.x = 0.12;
  rig.head = head;
  const skinMat = ckMat({ color: pal.back, map: 'hide', bump: 0.01, roughness: 0.7, clearcoat: 0.15, emissive: pal.glow });
  const skull = sculpt(headShape({ len: 0.4, width: 0.3, height: 0.24, snout: 0.55, taper: 0.3, taperY: 0.3, flatTop: 0.35, brow: 0.07, drop: -0.04 }), skinMat);
  head.add(skull);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, -0.15);
  head.add(jaw);
  const jm = sculpt(headShape({ len: 0.38, width: 0.26, height: 0.1, snout: 0.45, taper: 0.3, taperY: 0.1, flatTop: 0, brow: 0, drop: 0 }), ckMat({ color: pal.belly, map: 'hide', roughness: 0.7, emissive: pal.glow }));
  jm.position.set(0, -0.03, 0.17);
  jaw.add(jm);
  rig.jaw = jaw;
  const toothMat = ckMat({ color: '#eef6f8', roughness: 0.3, clearcoat: 0.8 });
  for (let i = 0; i < 5; i++) {
    [-1, 1].forEach(s => {
      const tth = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 5), toothMat);
      tth.position.set(s * (0.07 + i * 0.035), -0.09, 0.5 - i * 0.07);
      tth.rotation.x = Math.PI;
      head.add(tth);
    });
  }
  addEyes(rig, head, [0.17, 0.08, 0.28], 0.045, pal.eye, { slit: false, yaw: 0.45, tilt: 0.3, sclera: '#0d1a1f', glow: 1.6 });
  rig.anchors.mouth = new THREE.Group();
  rig.anchors.mouth.position.set(0, -0.06, 0.65);
  head.add(rig.anchors.mouth);

  addDorsalCrystals(rig, body, pal, 0.06, 0.86, 13, 0.75);

  // 脚（太い柱のような二足）
  const legMat = ckMat({ color: pal.back, map: 'hide', bump: 0.01, roughness: 0.75, clearcoat: 0.1, emissive: pal.glow });
  const clawMat = ckMat({ color: pal.claw, roughness: 0.3, clearcoat: 0.8 });
  [-1, 1].forEach(x => {
    const b = body.bones[5];
    const m = tube([[0.4 * x, 1.2, -0.15], [0.52 * x, 0.66, 0.12], [0.46 * x, 0.22, -0.1], [0.46 * x, 0.08, 0.05]], [0.34, 0.25, 0.17, 0.15], legMat, { back: pal.back, belly: pal.belly });
    m.position.sub(b.userData.bindPos);
    b.add(m);
    const foot = sculpt(v => { v.x *= 0.2; v.y *= 0.1; v.z *= 0.3; }, legMat, 16, 10);
    foot.position.set(0.46 * x, 0.1, 0.16).sub(b.userData.bindPos);
    b.add(foot);
    [-0.1, 0, 0.1].forEach(dx => {
      const c = makeClaw(0.12, 0.03, clawMat);
      c.position.set(0.46 * x + dx, 0.1, 0.42).sub(b.userData.bindPos);
      b.add(c);
    });
    // 小さな腕（T-レックス風）
    const ab = body.bones[7];
    const arm = tube([[0.48 * x, 1.98, 0.24], [0.62 * x, 1.7, 0.42], [0.58 * x, 1.62, 0.66]], [0.12, 0.09, 0.07], legMat);
    arm.position.sub(ab.userData.bindPos);
    ab.add(arm);
    [-0.04, 0.04].forEach(dx => {
      const c = makeClaw(0.09, 0.02, clawMat);
      c.position.set(0.58 * x + dx, 1.62, 0.7).sub(ab.userData.bindPos);
      ab.add(c);
    });
  });

  // 地面から突き出す氷柱（旧デザインの名残を小さく上品に）
  [[-0.95, -1.2, 0.9], [-1.25, -0.5, 0.6], [1.0, -1.35, 0.75], [1.3, -0.7, 0.5], [0.6, -2.0, 0.55], [-0.5, -2.2, 0.45]].forEach(([x, z, h]) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    [0, 1, 2].forEach(k => {
      const c = makeCrystal(h * (1 - k * 0.3), h * 0.18, pal.crystal, pal.glow);
      c.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * 3, (Math.random() - 0.5) * 0.6);
      c.position.set((Math.random() - 0.5) * 0.25, 0, (Math.random() - 0.5) * 0.25);
      g.add(c);
      rig.crystals.push(c);
    });
    inner.add(g);
  });
  rig.anchors.head = head;
  rig.anchors.back = body.bones[7];
  rig.anchors.backPos = V3(0, 2.4, -0.3);
  rig.anchors.shoulders = [-1, 1].map(s => { const g = new THREE.Group(); attachTo(body.bones[7], g, V3(0.5 * s, 2.12, 0.05)); g.userData.side = s; return g; });
}

function buildIceBaby(rig, pal) {
  const inner = rig.inner;
  const body = loft([
    { p: [0, 0.08, -0.85], r: [0.03, 0.03], role: 'tail' },
    { p: [0, 0.12, -0.58], r: [0.1, 0.1], role: 'tail' },
    { p: [0, 0.22, -0.32], r: [0.2, 0.2], role: 'tail' },
    { p: [0, 0.38, -0.08], r: [0.33, 0.31] },
    { p: [0, 0.55, 0.02], r: [0.36, 0.35] },
    { p: [0, 0.78, 0.04], r: [0.29, 0.28] },
    { p: [0, 0.95, 0.06], r: [0.2, 0.2], role: 'neck' },
    { p: [0, 1.06, 0.1], r: [0.02, 0.02], role: 'neck' },
  ], { pivot: 4, seg: 48, radial: 18, back: pal.back, belly: pal.belly, mat: ckMat({ vertexColors: true, map: 'hide', bump: 0.015, roughness: 0.6, clearcoat: 0.3, skinning: true, emissive: pal.glow }), uRepeat: 4, vRepeat: 2, up: [0, 0, -1] });
  inner.add(body.mesh);
  rig.body = body;
  rig.tail = body.bones.slice(0, 3).reverse();
  rig.neck = body.bones.slice(6, 7);
  rig.chestY = 0.55;
  const head = new THREE.Group();
  attachTo(body.bones[6], head, V3(0, 1.12, 0.12));
  rig.head = head;
  const skin = ckMat({ color: pal.skin2, map: 'hide', bump: 0.01, roughness: 0.6, clearcoat: 0.35, emissive: pal.glow });
  const skull = sculpt(v => { v.x *= 0.36; v.y *= 0.3; v.z *= 0.36; if (v.z > 0) { v.z *= 1.25; v.y *= 1 - v.z * 0.25; } }, skin);
  head.add(skull);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0);
  head.add(jaw);
  const jm = sculpt(v => { v.x *= 0.28; v.y *= 0.09; v.z *= 0.3; }, ckMat({ color: pal.belly, roughness: 0.6, emissive: pal.glow }));
  jm.position.set(0, -0.04, 0.14);
  jaw.add(jm);
  rig.jaw = jaw;
  addEyes(rig, head, [0.15, 0.07, 0.34], 0.08, '#39b6e0', { big: true, yaw: 0.35, glow: 0.5 });
  addDorsalCrystals(rig, body, pal, 0.25, 0.8, 4, 0.32);
  const limb = ckMat({ color: pal.skin2, map: 'hide', roughness: 0.6, emissive: pal.glow });
  [-1, 1].forEach(s => {
    const foot = sculpt(v => { v.x *= 0.13; v.y *= 0.1; v.z *= 0.17; }, limb, 16, 10);
    foot.position.set(0.2 * s, 0.08, 0.12);
    inner.add(foot);
    const arm = tube([[0.27 * s, 0.75, 0.12], [0.33 * s, 0.62, 0.26]], [0.065, 0.05], limb);
    arm.position.sub(body.bones[5].userData.bindPos);
    body.bones[5].add(arm);
  });
  rig.anchors.head = head;
}

// ============================================================
// 雷（角のあるペガサス）
// ============================================================
function makeSpiralHorn(len, r, pal) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    pts.push(new THREE.Vector2(r * (1 - u) * (0.82 + 0.18 * Math.abs(Math.sin(u * Math.PI * 7))), u * len));
  }
  const geo = new THREE.LatheGeometry(pts, 12);
  // ねじり
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), a = (y / len) * Math.PI * 3;
    const x = p.getX(i), z = p.getZ(i);
    p.setXYZ(i, x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a));
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, ckMat({ color: pal.horn, emissive: pal.glow, emissiveIntensity: 0.45, roughness: 0.2, metalness: 0.3, clearcoat: 1, env: 1.4 }));
}

function buildThunderAdult(rig, pal) {
  const inner = rig.inner;
  const body = loft([
    { p: [0, 1.36, -1.0], r: [0.1, 0.12], role: 'tail' },
    { p: [0, 1.42, -0.72], r: [0.36, 0.42], role: 'tail' },
    { p: [0, 1.44, -0.25], r: [0.4, 0.48] },
    { p: [0, 1.4, 0.18], r: [0.42, 0.5] },
    { p: [0, 1.48, 0.58], r: [0.33, 0.5] },
    { p: [0, 1.78, 0.84], r: [0.2, 0.33], role: 'neck' },
    { p: [0, 2.12, 0.98], r: [0.15, 0.24], role: 'neck' },
    { p: [0, 2.38, 1.04], r: [0.12, 0.15], role: 'neck' },
    { p: [0, 2.45, 1.08], r: [0.02, 0.02], role: 'neck' },
  ], { pivot: 3, seg: 56, radial: 20, back: pal.back, belly: pal.belly, mat: ckMat({ vertexColors: true, map: 'hide', bump: 0.006, roughness: 0.4, clearcoat: 0.55, clearcoatRoughness: 0.3, skinning: true, emissive: pal.glow }), uRepeat: 6, vRepeat: 2 });
  inner.add(body.mesh);
  rig.body = body;
  rig.tail = [body.bones[1], body.bones[0]];
  rig.neck = body.bones.slice(5, 8);
  rig.chestY = 1.4;

  const head = new THREE.Group();
  attachTo(body.bones[7], head, V3(0, 2.38, 1.08));
  rig.head = head;
  const skin = ckMat({ color: pal.skin2, roughness: 0.4, clearcoat: 0.55, map: 'hide', bump: 0.004, emissive: pal.glow });
  // 馬の頭：前下がりに長い
  const hg = new THREE.Group();
  hg.rotation.x = 0.95;
  head.add(hg);
  const skull = sculpt(v => {
    const z = v.z;
    v.z = z * 0.34 + (z > 0 ? z * 0.1 : 0);
    const cheek = 0.035 * smooth(0.2, -0.8, z);
    v.x *= 0.12 * (1 - 0.4 * smooth(-0.3, 0.95, z)) + cheek;
    v.y *= 0.15 * (1 - 0.38 * smooth(-0.2, 0.8, z)) + 0.02 * smooth(0.8, 1, z);
    if (v.y < 0) v.y *= 0.85;
  }, skin);
  skull.position.z = 0.22;
  hg.add(skull);
  [-1, 1].forEach(s => {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), basicMat('#0a0a12'));
    n.scale.set(0.8, 1.2, 0.6);
    n.position.set(0.04 * s, 0.01, 0.65);
    hg.add(n);
  });
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.08, 0.3);
  hg.add(jaw);
  rig.jaw = jaw;
  addEyes(rig, hg, [0.115, 0.06, 0.1], 0.042, pal.eye, { yaw: 1.15, sclera: '#151824', glow: 1.3 });
  // 耳
  [-1, 1].forEach(s => {
    const ear = sculpt(v => { v.x *= 0.035; v.y *= 0.11; v.z *= 0.05; if (v.y > 0) v.x *= 1 - v.y * 6; }, skin, 12, 10);
    ear.position.set(0.08 * s, 0.1, 0.0);
    ear.rotation.set(-0.9, 0, s * -0.35);
    hg.add(ear);
    rig.anchors['ear' + s] = ear;
  });
  // 角
  const horn = makeSpiralHorn(0.55, 0.045, pal);
  horn.position.set(0, 0.14, 0.12);
  horn.rotation.x = -0.3;
  hg.add(horn);
  const tip = new THREE.Group();
  tip.position.set(0, 0.14 + Math.cos(0.3) * 0.55, 0.12 + Math.sin(0.3) * 0.55);
  hg.add(tip);
  rig.anchors.hornTip = tip;
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(pal.glow), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  spark.scale.set(0.3, 0.3, 1);
  tip.add(spark);
  rig.orbs.push({ s: spark, pulse: true });
  for (let i = 0; i < 3; i++) {
    const a = makeArc(V3(0, 0, 0), V3((Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5), pal.accent);
    tip.add(a);
    rig.arcs.push(a);
  }

  // たてがみ（首筋に沿った光る毛束）
  const hairMat = ckMat({ color: pal.hair, emissive: pal.glow, emissiveIntensity: 0.65, roughness: 0.5 });
  for (let i = 0; i < 16; i++) {
    const t = 0.6 + i / 15 * 0.38;
    const f = body.frames[Math.round(t * (body.frames.length - 1))];
    const ry = catmull1(body.points.map(q => q.r[1]), t);
    const wp = f.P.clone().addScaledVector(f.up, ry * 0.95);
    const st = makeStrand(0.34 + Math.random() * 0.14, 0.045, hairMat, 4, f.up.clone().multiplyScalar(0.5).addScaledVector(f.T, -0.7).add(V3((i % 2 ? 0.45 : -0.45), 0, 0)));
    attachTo(boneNear(body, wp), st, wp);
    rig.strands.push(st);
  }
  // 尻尾（流れる毛束）
  for (let i = 0; i < 6; i++) {
    const st = makeStrand(0.95 + Math.random() * 0.2, 0.05, hairMat, 5, V3((i - 2.5) * 0.08, -0.6, -0.8));
    attachTo(body.bones[0], st, V3(0, 1.38, -1.02));
    rig.strands.push(st);
  }
  // 脚
  const legMat = ckMat({ color: pal.back, roughness: 0.4, clearcoat: 0.5, map: 'hide', bump: 0.004, emissive: pal.glow });
  const hoofMat = ckMat({ color: pal.hoof, roughness: 0.25, metalness: 0.6, clearcoat: 0.9, env: 1.4 });
  const leg = (bone, pts, rs, x) => {
    const m = tube(pts.map(p => [p[0] * x, p[1], p[2]]), rs, legMat, { back: pal.back, belly: pal.belly });
    m.position.sub(bone.userData.bindPos);
    bone.add(m);
    const last = pts[pts.length - 1];
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.1, 14), hoofMat);
    hoof.position.set(last[0] * x, 0.05, last[2] + 0.02).sub(bone.userData.bindPos);
    bone.add(hoof);
    // 蹄の上の光る毛（距毛）
    const fur = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.025, 6, 14), glowMat(pal.glow, 0.5));
    fur.rotation.x = Math.PI / 2;
    fur.position.set(last[0] * x, 0.13, last[2] + 0.02).sub(bone.userData.bindPos);
    bone.add(fur);
  };
  [-1, 1].forEach(x => {
    leg(body.bones[4], [[0.19, 1.22, 0.56], [0.23, 0.68, 0.62], [0.22, 0.2, 0.62], [0.22, 0.1, 0.64]], [0.14, 0.075, 0.055, 0.05], x);
    leg(body.bones[1], [[0.2, 1.3, -0.66], [0.27, 0.9, -0.5], [0.25, 0.58, -0.86], [0.24, 0.2, -0.78], [0.24, 0.1, -0.76]], [0.2, 0.12, 0.07, 0.055, 0.05], x);
  });
  // 翼
  [-1, 1].forEach(s => {
    const w = makeFeatherWing(s, 1.15, pal);
    attachTo(body.bones[4], w, V3(0.2 * s, 1.82, 0.42));
    w.userData.rest = { y: s * 0.35, z: s * 0.42, x: 0.1 };
    rig.wings.push(w);
  });
  rig.anchors.shoulders = rig.wings;
  // 体側を走る稲妻
  [-1, 1].forEach(s => {
    const a = makeArc(V3(0.43 * s, 1.5, -0.5), V3(0.42 * s, 1.35, 0.45), pal.accent);
    attachTo(body.bones[3], a, V3(0, 0, 0).add(body.bones[3].userData.bindPos));
    a.position.set(0, 0, 0);
    a.userData.arc.a.sub(body.bones[3].userData.bindPos);
    a.userData.arc.b.sub(body.bones[3].userData.bindPos);
    rig.arcs.push(a);
  });
  rig.anchors.head = hg;
  rig.anchors.back = body.bones[3];
  rig.anchors.backPos = V3(0, 1.92, 0.1);
}

function buildThunderBaby(rig, pal) {
  const inner = rig.inner;
  const body = loft([
    { p: [0, 0.64, -0.46], r: [0.07, 0.08], role: 'tail' },
    { p: [0, 0.66, -0.3], r: [0.2, 0.22], role: 'tail' },
    { p: [0, 0.63, 0.0], r: [0.24, 0.26] },
    { p: [0, 0.69, 0.25], r: [0.2, 0.25] },
    { p: [0, 0.9, 0.38], r: [0.13, 0.17], role: 'neck' },
    { p: [0, 1.06, 0.42], r: [0.1, 0.12], role: 'neck' },
    { p: [0, 1.12, 0.45], r: [0.02, 0.02], role: 'neck' },
  ], { pivot: 2, seg: 40, radial: 18, back: pal.back, belly: pal.belly, mat: ckMat({ vertexColors: true, map: 'hide', bump: 0.004, roughness: 0.45, clearcoat: 0.5, skinning: true, emissive: pal.glow }), uRepeat: 3, vRepeat: 2 });
  inner.add(body.mesh);
  rig.body = body;
  rig.tail = [body.bones[1], body.bones[0]];
  rig.neck = body.bones.slice(4, 6);
  rig.chestY = 0.65;
  const head = new THREE.Group();
  attachTo(body.bones[5], head, V3(0, 1.12, 0.48));
  rig.head = head;
  const skin = ckMat({ color: pal.skin2, roughness: 0.45, clearcoat: 0.5, emissive: pal.glow });
  const hg = new THREE.Group();
  hg.rotation.x = 0.55;
  head.add(hg);
  const skull = sculpt(v => { v.x *= 0.17; v.y *= 0.18; v.z *= 0.24; if (v.z > 0) { v.z *= 1.2; v.x *= 1 - v.z * 0.3; v.y *= 1 - v.z * 0.25; } }, skin);
  skull.position.z = 0.1;
  hg.add(skull);
  addEyes(rig, hg, [0.12, 0.05, 0.17], 0.065, '#e0a020', { big: true, yaw: 0.7, glow: 0.5 });
  [-1, 1].forEach(s => {
    const ear = sculpt(v => { v.x *= 0.03; v.y *= 0.085; v.z *= 0.04; }, skin, 10, 8);
    ear.position.set(0.09 * s, 0.17, -0.02);
    ear.rotation.set(-0.4, 0, s * -0.4);
    hg.add(ear);
  });
  const horn = makeSpiralHorn(0.15, 0.03, pal);
  horn.position.set(0, 0.16, 0.1);
  horn.rotation.x = -0.1;
  hg.add(horn);
  const tip = new THREE.Group();
  tip.position.set(0, 0.32, 0.12);
  hg.add(tip);
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(pal.glow), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  spark.scale.set(0.16, 0.16, 1);
  tip.add(spark);
  rig.orbs.push({ s: spark, pulse: true });
  const a = makeArc(V3(0, 0, 0), V3(0.1, 0.15, 0), pal.accent);
  tip.add(a);
  rig.arcs.push(a);
  const hairMat = ckMat({ color: pal.hair, emissive: pal.glow, emissiveIntensity: 0.65, roughness: 0.5 });
  for (let i = 0; i < 4; i++) {
    const st = makeStrand(0.14, 0.03, hairMat, 3, V3(i % 2 ? 0.2 : -0.2, 0.3, -1));
    attachTo(body.bones[5], st, V3(0, 1.12 - i * 0.06, 0.38 - i * 0.03));
    rig.strands.push(st);
  }
  for (let i = 0; i < 3; i++) {
    const st = makeStrand(0.32, 0.04, hairMat, 4, V3((i - 1) * 0.15, -0.5, -0.8));
    attachTo(body.bones[0], st, V3(0, 0.66, -0.48));
    rig.strands.push(st);
  }
  const legMat = ckMat({ color: pal.back, roughness: 0.45, clearcoat: 0.45, emissive: pal.glow });
  const hoofMat = ckMat({ color: pal.hoof, roughness: 0.25, metalness: 0.6, clearcoat: 0.9 });
  [[0.13, 0.27, 3], [0.13, -0.3, 1]].forEach(([x, z, bi]) => [-1, 1].forEach(s => {
    const b = body.bones[bi];
    const m = tube([[x * s, 0.62, z], [x * s, 0.35, z + 0.02], [x * s, 0.08, z]], [0.07, 0.045, 0.04], legMat);
    m.position.sub(b.userData.bindPos);
    b.add(m);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.07, 12), hoofMat);
    hoof.position.set(x * s, 0.035, z).sub(b.userData.bindPos);
    b.add(hoof);
  }));
  [-1, 1].forEach(s => {
    const w = makeFeatherWing(s, 0.38, pal);
    attachTo(body.bones[3], w, V3(0.15 * s, 0.86, 0.12));
    w.userData.rest = { y: s * 0.45, z: s * 0.45, x: 0.15 };
    rig.wings.push(w);
  });
  rig.anchors.head = hg;
}

// ============================================================
// 闇（フードをかぶった謎の存在）
// ============================================================
function makeRobe(h, rBottom, rTop, pal, folds = 9) {
  const prof = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const r = lerp(rBottom, rTop, Math.pow(u, 0.8)) * (1 + 0.12 * Math.sin(u * Math.PI));
    prof.push(new THREE.Vector2(r, u * h));
  }
  const geo = new THREE.LatheGeometry(prof, 40);
  const p = geo.attributes.position;
  const base = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const th = Math.atan2(z, x), u = y / h;
    const fold = 1 + (0.09 * (1 - u)) * Math.sin(th * folds);
    x *= fold; z *= fold;
    // ぼろぼろの裾
    if (u < 0.02) y += (Math.sin(th * 13) > 0.2 ? -0.06 : 0.04) * h * 0.1 + Math.sin(th * 5) * 0.03 * h;
    p.setXYZ(i, x, y, z);
    base[i * 3] = x; base[i * 3 + 1] = y; base[i * 3 + 2] = z;
  }
  geo.computeVertexNormals();
  const mat = ckMat({ color: pal.robe, map: 'robe', bump: 0.01, roughness: 0.85, clearcoat: 0.05, side: THREE.DoubleSide, emissive: pal.trim, emissiveMap: 'runes', emissiveIntensity: 0.55 });
  const m = new THREE.Mesh(geo, mat);
  m.userData.robe = { base, h };
  return m;
}
function updateRobe(m, t, amp) {
  const { base, h } = m.userData.robe;
  const p = m.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = base[i * 3 + 1], u = 1 - Math.min(1, Math.max(0, y / h));
    if (u < 0.35) continue;
    const x = base[i * 3], z = base[i * 3 + 2];
    const th = Math.atan2(z, x);
    const w = Math.pow((u - 0.35) / 0.65, 2) * amp;
    const s = 1 + w * Math.sin(t * 2.2 + th * 3);
    p.setXYZ(i, x * s + Math.sin(t * 1.3) * w * 0.4, y + Math.sin(t * 3 + th * 5) * w * 0.25, z * s);
  }
  p.needsUpdate = true;
}

// 正面に顔の開口があるフード（先端は後ろへ流れる）
function makeHood(r, pal, peak = 0.5) {
  const geo = new THREE.SphereGeometry(r, 44, 30);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > 0.25 * r) { const k = (y - 0.25 * r) / r; y += k * r * peak * 0.6; z -= k * k * r * peak * 1.6; x *= 1 - k * 0.35; }
    if (y < -0.4 * r) { x *= 1.08; z *= 1.05; }
    p.setXYZ(i, x, y, z);
  }
  // 開口：正面の楕円領域の三角形を除く
  const idx = geo.index.array, keep = [];
  const c = V3();
  for (let t = 0; t < idx.length; t += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(V3(p.getX(idx[t + k]), p.getY(idx[t + k]), p.getZ(idx[t + k])));
    c.divideScalar(3 * r);
    const inOpen = c.z > 0.25 && Math.pow(c.x / 0.6, 2) + Math.pow((c.y + 0.1) / 0.62, 2) < 1;
    if (!inOpen) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  geo.setIndex(keep);
  geo.computeVertexNormals();
  const mat = ckMat({ color: pal.robe, map: 'robe', bump: 0.01, roughness: 0.85, side: THREE.DoubleSide, emissive: pal.trim, emissiveIntensity: 0.03 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.6, r * 0.028, 6, 48), glowMat(pal.trim, 0.85));
  rim.scale.set(1, 1.03, 1);
  rim.position.set(0, -0.1 * r, r * 0.72);
  rim.rotation.x = -0.12;
  g.add(rim);
  const voidM = new THREE.Mesh(new THREE.SphereGeometry(r * 0.82, 24, 16), basicMat('#020104'));
  voidM.position.set(0, -0.05 * r, 0);
  g.add(voidM);
  return g;
}

function buildDarkAdult(rig, pal) {
  const inner = rig.inner;
  const float = new THREE.Group();
  float.position.y = 0.12;
  inner.add(float);
  rig.float = float;
  rig.floatBase = 0.12;
  const robe = makeRobe(2.1, 0.85, 0.32, pal);
  float.add(robe);
  rig.robe = robe;
  rig.chestY = 1.5;
  // 肩当て（重なるケープ）
  const cape = makeRobe(0.55, 0.68, 0.3, pal, 7);
  cape.position.y = 1.55;
  float.add(cape);
  // フード
  const head = new THREE.Group();
  head.position.set(0, 2.18, 0.04);
  float.add(head);
  rig.head = head;
  head.add(makeHood(0.44, pal, 0.7));
  // 目（細く吊り上がった光）
  [-1, 1].forEach(s => {
    const e = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), basicMat('#ffffff'));
    core.scale.set(1.5, 0.55, 0.5);
    e.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(pal.glow), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(0.32, 0.2, 1);
    e.add(halo);
    e.position.set(0.11 * s, -0.02, 0.33);
    e.rotation.z = -s * 0.35;
    head.add(e);
    rig.eyes.push(e);
    rig.blinkers.push(e);
    rig.orbs.push({ s: halo, pulse: true, base: 0.32 });
  });
  // 腕（袖から伸びる長い腕と爪）
  const handMat = ckMat({ color: pal.hand, roughness: 0.6, clearcoat: 0.3, emissive: pal.glow, emissiveIntensity: 0.08 });
  const clawMat = ckMat({ color: pal.claw, emissive: pal.glow, emissiveIntensity: 0.5, roughness: 0.2, clearcoat: 1 });
  [-1, 1].forEach(s => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.48 * s, 1.75, 0.05);
    float.add(shoulder);
    const sleeve = tube([[0, 0, 0], [0.18 * s, -0.25, 0.12], [0.3 * s, -0.55, 0.3]], [0.13, 0.16, 0.2], ckMat({ color: pal.robe, map: 'robe', roughness: 0.85, side: THREE.DoubleSide, emissive: pal.trim, emissiveIntensity: 0.05 }));
    shoulder.add(sleeve);
    const fore = new THREE.Group();
    fore.position.set(0.3 * s, -0.55, 0.3);
    shoulder.add(fore);
    fore.add(tube([[0, 0.1, -0.05], [0.04 * s, -0.12, 0.12], [0.06 * s, -0.24, 0.24]], [0.06, 0.045, 0.04], handMat));
    for (let k = 0; k < 4; k++) {
      const c = makeClaw(0.22, 0.016, clawMat);
      c.position.set(0.06 * s + (k - 1.5) * 0.03, -0.26, 0.26);
      c.rotation.set(0.6, (k - 1.5) * 0.25, 0);
      fore.add(c);
    }
    rig.arms.push({ shoulder, fore, side: s });
  });
  // 浮遊するオーブ
  for (let i = 0; i < 3; i++) {
    const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(i === 1 ? '#ffffff' : pal.glow), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    o.scale.set(0.28, 0.28, 1);
    float.add(o);
    rig.orbs.push({ s: o, orbit: { r: 0.95, y: 1.4 + i * 0.35, sp: 0.6 + i * 0.25, ph: i * 2.1 } });
  }
  rig.anchors.head = head;
  rig.anchors.back = float;
  rig.anchors.backPos = V3(0, 1.85, -0.35);
  rig.anchors.shoulders = rig.arms.map(a => { a.shoulder.userData.side = a.side; return a.shoulder; });
}

function buildDarkBaby(rig, pal) {
  const inner = rig.inner;
  const float = new THREE.Group();
  float.position.y = 0.08;
  inner.add(float);
  rig.float = float;
  rig.floatBase = 0.08;
  const robe = makeRobe(0.75, 0.42, 0.24, pal, 7);
  float.add(robe);
  rig.robe = robe;
  rig.chestY = 0.5;
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0.02);
  float.add(head);
  rig.head = head;
  head.add(makeHood(0.4, pal, 0.9));
  [-1, 1].forEach(s => {
    const e = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), basicMat('#ffffff'));
    core.scale.set(1, 1.15, 0.5);
    e.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(pal.glow), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(0.3, 0.3, 1);
    e.add(halo);
    e.position.set(0.1 * s, -0.04, 0.3);
    head.add(e);
    rig.eyes.push(e);
    rig.blinkers.push(e);
    rig.orbs.push({ s: halo, pulse: true, base: 0.3 });
  });
  const handMat = ckMat({ color: pal.hand, roughness: 0.6, emissive: pal.glow, emissiveIntensity: 0.1 });
  [-1, 1].forEach(s => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.24 * s, 0.6, 0.12);
    float.add(shoulder);
    const fore = new THREE.Group();
    shoulder.add(fore);
    const hand = sculpt(v => { v.x *= 0.07; v.y *= 0.06; v.z *= 0.07; }, handMat, 12, 8);
    hand.position.set(0.06 * s, -0.08, 0.1);
    fore.add(hand);
    rig.arms.push({ shoulder, fore, side: s });
  });
  const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(pal.glow), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  o.scale.set(0.2, 0.2, 1);
  float.add(o);
  rig.orbs.push({ s: o, orbit: { r: 0.55, y: 0.9, sp: 0.9, ph: 0 } });
  rig.anchors.head = head;
}

// ============================================================
// 育成タイプの装飾（成体）
// ============================================================
function addTypeDecor(rig, attr, type, pal) {
  const A = rig.anchors;
  if (type === 'attacker') {
    // 赤く光る刃状の角
    const m = ckMat({ color: '#2a0d0d', emissive: '#ff3344', emissiveIntensity: 0.7, roughness: 0.2, metalness: 0.5, clearcoat: 1 });
    [-1, 1].forEach(s => {
      const h = makeHorn(attr === 'dark' ? 0.32 : 0.4, 0.035, m, 1.1);
      h.position.set(0.09 * s, attr === 'dark' ? 0.32 : 0.16, attr === 'dark' ? -0.05 : 0.02);
      h.rotation.set(-0.2, 0, s * -0.6);
      A.head.add(h);
    });
  } else if (type === 'tank') {
    // 金属の肩当て
    const m = ckMat({ color: '#6f7380', metalness: 0.85, roughness: 0.28, clearcoat: 0.6, env: 1.6, emissive: pal.glow, emissiveIntensity: 0.05 });
    (A.shoulders || []).forEach(sh => {
      const s = sh.userData.side || 1;
      const plate = sculpt(v => { v.x *= 0.26; v.y *= 0.12; v.z *= 0.24; if (v.y < 0) v.y *= 0.3; }, m, 20, 12);
      plate.position.set(0.04 * s, 0.1, 0);
      plate.rotation.z = -s * 0.5;
      sh.add(plate);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 24), glowMat(pal.glow, 0.7));
      rim.rotation.x = Math.PI / 2;
      rim.position.copy(plate.position);
      rim.rotation.y = s * 0.5;
      sh.add(rim);
    });
    const brow = sculpt(v => { v.x *= 0.16; v.y *= 0.05; v.z *= 0.12; }, m, 16, 8);
    brow.position.set(0, attr === 'dark' ? 0.3 : 0.17, attr === 'dark' ? 0.2 : 0.18);
    A.head.add(brow);
  } else if (type === 'speedster') {
    // 後ろへ流れる光るヒレ
    const m = ckMat({ color: pal.accent || pal.glow, emissive: pal.glow, emissiveIntensity: 0.6, roughness: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    const fin = (parent, pos, sc, s) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.quadraticCurveTo(0.1, 0.2, 0.05, 0.6); sh.quadraticCurveTo(0, 0.25, -0.06, 0);
      const f = new THREE.Mesh(new THREE.ShapeGeometry(sh, 6), m);
      f.position.copy(pos);
      f.scale.setScalar(sc);
      f.rotation.set(-1.9, s * 0.4, 0);
      parent.add(f);
    };
    [-1, 1].forEach(s => fin(A.head, V3(0.12 * s, attr === 'dark' ? 0.25 : 0.1, -0.08), 0.9, s));
    if (A.back) {
      const bp = A.backPos.clone().sub(A.back.userData.bindPos || V3());
      [-1, 1].forEach(s => fin(A.back, bp.clone().add(V3(0.14 * s, 0, 0)), 1.5, s));
    }
  }
}

// ============================================================
// 生成の窓口
// ============================================================
const BUILDERS = {
  fire:    { baby: buildFireBaby,    adult: buildFireAdult },
  ice:     { baby: buildIceBaby,     adult: buildIceAdult },
  thunder: { baby: buildThunderBaby, adult: buildThunderAdult },
  dark:    { baby: buildDarkBaby,    adult: buildDarkAdult },
};

function buildDragon(attr, stage, type = 'balanced') {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.y = GROUND_Y;
  root.add(inner);
  const st = stage === 'adult' ? 'adult' : 'baby';
  const rig = newRig(attr, inner);
  const pal = PALETTE[attr];
  BUILDERS[attr][st](rig, pal);
  if (st === 'adult' && type && type !== 'balanced') addTypeDecor(rig, attr, type, pal);
  addAttrEffect(root, attr, st);
  root.userData.rig = rig;
  root.userData.stage = st;
  root.userData.attr = attr;
  return root;
}
// 互換（preview.html など）
function buildBabyDragon(attr) { return buildDragon(attr, 'baby'); }
function buildAdultDragon(attr, type) { return buildDragon(attr, 'adult', type); }

function setDragonScale(group, s) {
  const rig = group.userData.rig;
  if (rig) rig.inner.scale.setScalar(s);
}
function dragonCenterY(group) {
  const rig = group.userData.rig;
  return rig ? GROUND_Y + rig.chestY * rig.inner.scale.y + (rig.float ? rig.float.position.y : 0) : 0.3;
}

// 属性の光の粒（軽量スプライト）
function addAttrEffect(group, attr, stage) {
  if (!group.userData.particles) group.userData.particles = [];
  const c = new THREE.Color(ATTR[attr].color);
  const count = stage === 'adult' ? 16 : 10;
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const sz = 0.06 + Math.random() * 0.08;
    s.scale.set(sz, sz, 1);
    const angle = Math.random() * Math.PI * 2;
    s.userData = {
      baseAngle: angle, radius: 0.9 + Math.random() * (stage === 'adult' ? 1.6 : 0.8),
      speed: 0.2 + Math.random() * 0.4, yOffset: Math.random() * Math.PI * 2, ySpeed: 0.4 + Math.random() * 0.5,
      yBase: (stage === 'adult' ? 0.6 : 0.1) + Math.random() * (stage === 'adult' ? 1.2 : 0.6),
    };
    group.add(s);
    group.userData.particles.push(s);
  }
}
function animateDragonParticles(group, t) {
  const ps = group && group.userData.particles;
  if (!ps) return;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i], d = p.userData;
    const a = d.baseAngle + t * d.speed;
    p.position.set(Math.cos(a) * d.radius, GROUND_Y + d.yBase + Math.sin(t * d.ySpeed + d.yOffset) * 0.25, Math.sin(a) * d.radius);
    p.material.opacity = 0.35 + Math.sin(t * 2 + d.yOffset) * 0.3;
  }
}

function setDragonFlash(group, amount) {
  if (!group) return;
  if (!group.userData.emissiveMeshes) {
    group.userData.emissiveMeshes = [];
    group.traverse(o => {
      if (o.isMesh && o.material && o.material.emissiveIntensity !== undefined && o.material.blending !== THREE.AdditiveBlending) {
        o.userData.baseEmissive = o.material.emissiveIntensity;
        group.userData.emissiveMeshes.push(o);
      }
    });
  }
  group.userData.emissiveMeshes.forEach(o => {
    o.material.emissiveIntensity = o.userData.baseEmissive + amount * 1.2;
  });
}

// ============================================================
// アニメーション
// ============================================================
const ACTIONS = { attack: 0.75, hit: 0.5, happy: 1.1, roar: 1.4 };
function playDragonAction(group, name) {
  const rig = group && group.userData.rig;
  if (!rig || !ACTIONS[name]) return;
  rig.action = { name, t: 0, dur: ACTIONS[name] };
}

// アクションの重み（0..1..0）と各ポーズ値
function actionPose(rig) {
  const a = rig.action;
  const P = { neckPitch: 0, headPitch: 0, jaw: 0, wingSpread: 0, wingFlap: 0, tailWhip: 0, tailUp: 0, lean: 0, squint: 0, glow: 0, arms: 0, hop: 0 };
  if (!a) return P;
  const p = a.t / a.dur;
  const bell = Math.sin(Math.PI * Math.min(1, p));
  if (a.name === 'attack') {
    const wind = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
    const strike = p < 0.35 ? -wind * 0.6 : Math.sin(Math.PI * (p - 0.35) / 0.65);
    P.neckPitch = -0.25 * (p < 0.35 ? wind : 0) + 0.45 * Math.max(0, strike);
    P.headPitch = 0.25 * Math.max(0, strike);
    P.jaw = 0.6 * Math.max(0, strike);
    P.wingSpread = bell;
    P.tailWhip = Math.sin(p * Math.PI * 2) * 0.5;
    P.lean = 0.15 * Math.max(0, strike) - 0.08 * (p < 0.35 ? wind : 0);
    P.arms = Math.max(0, strike);
    P.glow = bell;
  } else if (a.name === 'hit') {
    P.neckPitch = -0.4 * bell;
    P.headPitch = -0.3 * bell;
    P.jaw = 0.35 * bell;
    P.squint = bell;
    P.lean = -0.18 * bell;
    P.wingSpread = 0.3 * bell;
    P.tailUp = 0.3 * bell;
  } else if (a.name === 'happy') {
    P.wingFlap = bell;
    P.tailWhip = Math.sin(p * Math.PI * 6) * 0.6 * bell;
    P.headPitch = -0.2 * bell;
    P.hop = Math.abs(Math.sin(p * Math.PI * 2)) * 0.18 * bell;
    P.squint = 0.6 * bell;
    P.arms = 0.5 * bell;
  } else if (a.name === 'roar') {
    const hold = smooth(0, 0.25, p) * (1 - smooth(0.75, 1, p));
    P.neckPitch = -0.35 * hold;
    P.headPitch = -0.5 * hold;
    P.jaw = 0.9 * hold;
    P.wingSpread = hold;
    P.tailUp = 0.4 * hold;
    P.glow = hold;
    P.arms = hold;
  }
  return P;
}

function animateDragon(group, dt, t) {
  const rig = group && group.userData.rig;
  if (!rig) return;
  if (rig.action) {
    rig.action.t += dt;
    if (rig.action.t >= rig.action.dur) rig.action = null;
  }
  const P = actionPose(rig);
  const T = t + rig.seed;

  // 呼吸と前傾
  const br = Math.sin(T * 1.6) * rig.breath;
  rig.inner.rotation.x = P.lean;
  if (rig.body) {
    if (!rig.pivotBone) rig.pivotBone = rig.body.bones.find(b => b.parent && !b.parent.isBone);
    rig.pivotBone.scale.set(1 + br, 1 + br * 1.4, 1 + br);
  }
  if (!rig.float) rig.inner.position.y = GROUND_Y + P.hop;

  // 首（うねり＋見回し）
  rig.neck.forEach((b, i) => {
    const k = (i + 1) / rig.neck.length;
    b.rotation.x = Math.sin(T * 0.7 + i * 0.4) * 0.03 + P.neckPitch * 0.5 * k;
    b.rotation.y = Math.sin(T * 0.37) * 0.07 * k;
    b.rotation.z = Math.sin(T * 0.5 + 1) * 0.02;
  });
  if (rig.head) {
    rig.head.userData.baseRot = rig.head.userData.baseRot || rig.head.rotation.clone();
    const br0 = rig.head.userData.baseRot;
    rig.head.rotation.set(br0.x + P.headPitch + Math.sin(T * 0.9) * 0.03, br0.y + Math.sin(T * 0.37 + 0.6) * 0.12, br0.z + Math.sin(T * 0.53) * 0.04);
  }
  if (rig.jaw) rig.jaw.rotation.x = Math.max(0, Math.sin(T * 0.8)) * 0.03 + P.jaw * 0.5;

  // 尻尾（付け根から先へ遅れて揺れる）
  rig.tail.forEach((b, i) => {
    const k = (i + 1) / rig.tail.length;
    b.rotation.y = Math.sin(T * 1.3 - i * 0.6) * 0.1 * k + P.tailWhip * 0.3 * k;
    b.rotation.x = Math.sin(T * 0.9 - i * 0.5) * 0.04 - P.tailUp * 0.25 * k;
  });

  // 翼（ゆったり呼吸＋羽ばたき・広げ）
  rig.wings.forEach(w => {
    const r = w.userData.rest, s = w.userData.side;
    const flap = Math.sin(T * (P.wingFlap > 0 ? 14 : 1.4)) * (0.06 + P.wingFlap * 0.55);
    w.rotation.set(r.x - P.wingSpread * 0.1, r.y * (1 - P.wingSpread * 0.65), r.z * (1 - P.wingSpread * 0.9) + s * flap);
    if (w.userData.hand) w.userData.hand.rotation.z = -s * P.wingSpread * 0.15 + Math.sin(T * 1.8) * 0.03 * s;
  });

  // 毛束（波打つ）
  rig.strands.forEach((st, j) => {
    st.userData.chain.forEach((g, i) => {
      g.rotation.x = Math.sin(T * 2.6 - i * 0.8 + j) * 0.12;
      g.rotation.z = Math.sin(T * 1.9 - i * 0.7 + j * 1.3) * 0.1;
    });
  });

  // ローブと腕（闇）
  if (rig.robe) updateRobe(rig.robe, T, 0.06 + P.glow * 0.05);
  if (rig.float) rig.float.position.y = rig.floatBase + Math.sin(T * 1.2) * 0.06 + P.hop;
  rig.arms.forEach((a, i) => {
    a.shoulder.rotation.set(-0.15 + Math.sin(T * 0.9 + i) * 0.06 - P.arms * 0.9, 0, a.side * (0.12 + Math.sin(T * 0.7 + i) * 0.05));
    a.fore.rotation.x = -0.2 + Math.sin(T * 1.1 + i) * 0.08 - P.arms * 0.5;
  });

  // まばたき
  rig.blinkAt -= dt;
  let lid = 1;
  if (rig.blinkAt < 0.14) lid = Math.abs(rig.blinkAt - 0.07) / 0.07;
  if (rig.blinkAt <= 0) rig.blinkAt = 2.5 + Math.random() * 3.5;
  lid = Math.min(lid, 1 - P.squint * 0.85);
  rig.blinkers.forEach(e => { e.scale.y = Math.max(0.08, lid); });

  // 光るもの
  rig.flames.forEach(f => updateFlame(f, T));
  rig.arcs.forEach(a => updateArc(a, T, 0.5 + P.glow));
  rig.crystals.forEach((c, i) => { c.material.emissiveIntensity = 0.28 + Math.sin(T * 1.5 + i * 0.4) * 0.1 + P.glow * 0.9; });
  rig.orbs.forEach((o, i) => {
    if (o.orbit) {
      const q = o.orbit, a = T * q.sp + q.ph;
      o.s.position.set(Math.cos(a) * q.r, q.y + Math.sin(T * 1.7 + i) * 0.12, Math.sin(a) * q.r);
    }
    if (o.pulse) {
      const b = (o.base || o.s.scale.x) ;
      o.base = b;
      const k = 1 + Math.sin(T * 5 + i) * 0.15 + P.glow * 0.6;
      o.s.scale.set(b * k, b * k, 1);
    }
  });
  rig.eyes.forEach(e => { if (e.userData.iris) e.userData.iris.material.emissiveIntensity = 0.9 + P.glow * 1.5; });

  animateDragonParticles(group, t);
}
