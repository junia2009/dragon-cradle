/* ============================================================
   Dragon Cradle — enemies.js
   敵モンスター（ドラゴン以外）の3Dモデル。
   元のドラゴン（幼体）と同じ作風：球・楕円体・円錐を組み合わせ、属性色でほんのり光る。
   頭・目・翼・尻尾・腕は最初から関節（ピボット）付きで作り、rig.js の animateDragon で動く。
   依存: THREE, models.js（makeSphere ほか）, rig.js
   ============================================================ */
'use strict';

// 関節グループ。wp はモデル座標での位置
function _ePart(parent, x, y, z) {
  const g = new THREE.Group();
  const pw = parent.userData.wp || new THREE.Vector3();
  g.position.set(x - pw.x, y - pw.y, z - pw.z);
  g.userData.wp = new THREE.Vector3(x, y, z);
  parent.add(g);
  return g;
}
// モデル座標 (x,y,z) に置く
function _ePut(parent, mesh, x, y, z) {
  const pw = parent.userData.wp || new THREE.Vector3();
  mesh.position.set(x - pw.x, y - pw.y, z - pw.z);
  parent.add(mesh);
  return mesh;
}
// 元のドラゴンと同じ「白目＋黒目＋ハイライト」の目。左右それぞれ関節にしてまばたきできる
function _eEyes(head, parts, x, y, z, r) {
  [['eyeL', -1], ['eyeR', 1]].forEach(([k, s]) => {
    const e = _ePart(head, x * s, y, z);
    _ePut(e, makeSphere(r, '#ffffff', '#ffffff', 0.3), x * s, y, z);
    _ePut(e, makeSphere(r * 0.66, '#111111', '#000000', 0), x * s, y - r * 0.05, z + r * 0.55);
    _ePut(e, makeSphere(r * 0.26, '#ffffff', '#ffffff', 1.0), x * s + r * 0.25, y + r * 0.3, z + r * 0.8);
    parts[k] = e;
  });
}

// ---------------- 氷：ユキダマ ----------------
function buildYukidama(g, parts, c, em) {
  const snow = '#e6f2fb';
  // 体（大きな雪玉）
  _ePut(g, makeEllipsoid(0.85, 0.75, 0.8, snow, em, 0.12), 0, -0.35, 0);
  // マフラー（属性色）
  const scarf = _ePut(g, makeTorus(0.62, 0.12, c, em, 0.35), 0, 0.28, 0.02);
  scarf.rotation.x = Math.PI / 2;
  const tail = _ePut(g, makeEllipsoid(0.12, 0.28, 0.06, c, em, 0.35), 0.35, 0.05, 0.55);
  tail.rotation.z = 0.3;
  // 頭（小さな雪玉）
  const head = _ePart(g, 0, 0.35, 0);
  parts.head = head;
  _ePut(head, makeSphere(0.62, snow, em, 0.12), 0, 0.85, 0.05);
  // ほっぺ
  [-1, 1].forEach(s => _ePut(head, makeSphere(0.11, '#ffb3c6', '#ff8fab', 0.2), 0.36 * s, 0.7, 0.5));
  // 氷の鼻
  const nose = _ePut(head, makeCone(0.06, 0.22, c, em, 0.6), 0, 0.78, 0.7);
  nose.rotation.x = Math.PI / 2;
  // 口
  const mouth = _ePut(head, makeTorus(0.07, 0.018, '#5a7a8a', em, 0.2), 0, 0.6, 0.6);
  mouth.rotation.z = Math.PI;
  // 頭の氷結晶
  [-0.12, 0, 0.12].forEach((dx, i) => {
    const cr = _ePut(head, makeCone(0.06, 0.24 + (i === 1 ? 0.12 : 0), c, em, 0.8), dx, 1.48 + (i === 1 ? 0.06 : 0), 0);
    cr.rotation.z = -dx * 2.5;
  });
  _eEyes(head, parts, 0.2, 0.92, 0.5, 0.12);
  // 腕（氷の枝）
  [['armL', -1], ['armR', 1]].forEach(([k, s]) => {
    const a = _ePart(g, 0.72 * s, -0.15, 0.1);
    const arm = _ePut(a, makeCone(0.07, 0.45, c, em, 0.5), 0.92 * s, 0.0, 0.15);
    arm.rotation.z = -s * 1.1;
    parts[k] = a;
  });
  // 足
  [-1, 1].forEach(s => _ePut(g, makeEllipsoid(0.2, 0.12, 0.26, snow, em, 0.1), 0.35 * s, -1.08, 0.2));
}

// ---------------- 炎：フレアバット ----------------
function buildFlareBat(g, parts, c, em) {
  const fur = '#3a1410';
  // 宙に浮く丸い体
  _ePut(g, makeSphere(0.6, fur, em, 0.18), 0, 0.15, 0);
  _ePut(g, makeEllipsoid(0.38, 0.4, 0.2, '#6a2a1a', em, 0.15), 0, 0.05, 0.45);
  const head = _ePart(g, 0, 0.35, 0.05);
  parts.head = head;
  // 大きな耳
  [-1, 1].forEach(s => {
    const ear = _ePut(head, makeCone(0.18, 0.5, fur, em, 0.2), 0.32 * s, 0.82, 0);
    ear.rotation.z = -s * 0.35;
    const inner = _ePut(head, makeCone(0.1, 0.32, c, em, 0.6), 0.32 * s, 0.8, 0.06);
    inner.rotation.z = -s * 0.35;
  });
  _eEyes(head, parts, 0.2, 0.32, 0.48, 0.14);
  // 小さな牙
  [-1, 1].forEach(s => {
    const f = _ePut(head, makeCone(0.03, 0.1, '#ffffff', '#ffffff', 0.3), 0.07 * s, -0.02, 0.56);
    f.rotation.x = Math.PI;
  });
  // 翼（膜は属性色に光る）
  [['wingL', -1], ['wingR', 1]].forEach(([k, s]) => {
    const w = _ePart(g, 0.5 * s, 0.25, -0.05);
    const mem = makeWingShape([[0, 0.25], [0.55, 0.5], [1.15, 0.35], [1.0, 0.0], [0.75, -0.25], [0.45, -0.05], [0.2, -0.25], [0, -0.1]], c, em, 0.5);
    mem.scale.x = s;
    _ePut(w, mem, 0.5 * s, 0.25, -0.05);
    [[0.55, 0.5], [1.15, 0.35]].forEach(([x, y]) => _ePut(w, makeSphere(0.05, '#ffb347', em, 1.0), (0.5 + x) * s, 0.25 + y, -0.05));
    parts[k] = w;
  });
  // 尻尾の火の玉
  const tail = _ePart(g, 0, 0.0, -0.5);
  _ePut(tail, makeEllipsoid(0.08, 0.08, 0.25, fur, em, 0.2), 0, -0.05, -0.7);
  _ePut(tail, makeSphere(0.12, c, em, 1.0), 0, -0.05, -0.95);
  _ePut(tail, makeSphere(0.07, '#FF8C00', em, 1.0), 0, 0.05, -1.03);
  parts.tail = tail;
  // 小さな足（ぶら下がる）
  [-1, 1].forEach(s => _ePut(g, makeSphere(0.08, '#6a2a1a', em, 0.2), 0.18 * s, -0.48, 0.1));
}

// ---------------- 炎：マグマガメ ----------------
function buildMagmaTurtle(g, parts, c, em) {
  const rock = '#2e2622';
  // 甲羅（岩）
  _ePut(g, makeEllipsoid(1.0, 0.62, 1.1, rock, em, 0.12), 0, -0.35, -0.05);
  _ePut(g, makeEllipsoid(1.05, 0.15, 1.15, '#4a3a30', em, 0.1), 0, -0.68, -0.05);
  // 溶岩のひび（光る）
  [[0, 0.22, -0.05, 0.16], [0.45, 0.05, 0.25, 0.11], [-0.45, 0.05, 0.25, 0.11], [0.5, 0.0, -0.4, 0.1], [-0.5, 0.0, -0.4, 0.1], [0, 0.08, -0.6, 0.12]].forEach(([x, y, z, r]) => {
    _ePut(g, makeSphere(r, c, em, 1.0), x, y, z);
  });
  // 甲羅の火山（てっぺん）
  _ePut(g, makeCone(0.2, 0.32, rock, em, 0.15), 0, 0.38, -0.05);
  _ePut(g, makeSphere(0.09, '#FF8C00', em, 1.0), 0, 0.55, -0.05);
  // 頭
  const head = _ePart(g, 0, -0.45, 0.85);
  parts.head = head;
  _ePut(head, makeEllipsoid(0.42, 0.38, 0.45, '#7a4a2a', em, 0.15), 0, -0.3, 1.25);
  [-1, 1].forEach(s => _ePut(head, makeSphere(0.08, '#ff9a70', '#ff6a4a', 0.2), 0.3 * s, -0.42, 1.55));
  const mouth = _ePut(head, makeTorus(0.08, 0.02, '#3a1a0a', em, 0.2), 0, -0.48, 1.66);
  mouth.rotation.z = Math.PI;
  _eEyes(head, parts, 0.17, -0.18, 1.58, 0.11);
  // 脚
  [[-0.7, 0.55], [0.7, 0.55], [-0.7, -0.6], [0.7, -0.6]].forEach(([x, z]) => {
    _ePut(g, makeEllipsoid(0.25, 0.3, 0.25, '#7a4a2a', em, 0.12), x, -0.85, z);
    _ePut(g, makeSphere(0.1, c, em, 0.5), x, -1.1, z + 0.12);
  });
  // しっぽ
  const tail = _ePart(g, 0, -0.6, -1.0);
  _ePut(tail, makeCone(0.12, 0.35, '#7a4a2a', em, 0.12), 0, -0.65, -1.25).rotation.x = -1.4;
  parts.tail = tail;
}

// ---------------- 炎：ヒノコ ----------------
function buildHinoko(g, parts, c, em) {
  // 宙に浮くしずく形の炎の精
  const head = _ePart(g, 0, -0.2, 0);
  parts.head = head;
  _ePut(head, makeEllipsoid(0.55, 0.62, 0.52, '#ff5a1f', em, 0.6), 0, 0.05, 0);
  _ePut(head, makeEllipsoid(0.36, 0.42, 0.3, '#ffb347', '#ffb347', 0.9), 0, -0.02, 0.26);
  // 頭の炎（3つの火）
  [[-0.2, 0.62, -0.3, 0.12, 0.42], [0.2, 0.62, 0.3, 0.12, 0.42], [0, 0.72, 0, 0.16, 0.6]].forEach(([x, y, rz, r, h]) => {
    const f = _ePut(head, makeCone(r, h, c, em, 0.9), x, y + h * 0.3, -0.05);
    f.rotation.z = rz;
  });
  _ePut(head, makeSphere(0.08, '#fff3c2', '#fff3c2', 1.2), 0, 1.15, -0.05);
  _eEyes(head, parts, 0.17, 0.12, 0.42, 0.11);
  const mouth = _ePut(head, makeTorus(0.06, 0.016, '#7a1a08', em, 0.3), 0, -0.1, 0.5);
  mouth.rotation.z = Math.PI;
  // 小さな手
  [['armL', -1], ['armR', 1]].forEach(([k, s]) => {
    const a = _ePart(g, 0.45 * s, -0.2, 0.1);
    _ePut(a, makeSphere(0.11, '#ff8a3a', em, 0.6), 0.6 * s, -0.25, 0.2);
    parts[k] = a;
  });
  // 下に流れる火の粉（裾）
  const hem = _ePart(g, 0, -0.75, 0);
  [[0, -0.75, 0, 0.2], [0.12, -0.95, -0.05, 0.13], [-0.1, -1.1, 0.02, 0.09], [0.04, -1.22, -0.04, 0.06]].forEach(([x, y, z, r]) => {
    _ePut(hem, makeSphere(r, c, em, 0.9), x, y, z);
  });
  parts.hem = hem;
}

// ---------------- 氷：コオリガニ ----------------
function buildKoorigani(g, parts, c, em) {
  const shell = '#4f87a0';
  _ePut(g, makeEllipsoid(0.95, 0.5, 0.75, shell, em, 0.15), 0, -0.4, 0);
  _ePut(g, makeEllipsoid(0.75, 0.2, 0.55, '#cfe8f2', em, 0.1), 0, -0.72, 0.05);
  // 甲羅の氷の結晶
  [[-0.35, -0.05, -0.1, 0.24], [0, 0.0, -0.2, 0.32], [0.35, -0.05, -0.1, 0.24]].forEach(([x, y, z, h]) => {
    _ePut(g, makeCone(0.08, h, c, em, 0.8), x, y, z);
  });
  // 目玉（柄の先）
  const head = _ePart(g, 0, -0.3, 0.45);
  parts.head = head;
  [-1, 1].forEach(s => {
    const stalk = _ePut(head, makeCylinder(0.04, 0.05, 0.35, shell, em, 0.15), 0.22 * s, -0.1, 0.55);
    stalk.rotation.z = -s * 0.15;
  });
  _eEyes(head, parts, 0.25, 0.13, 0.58, 0.12);
  const mouth = _ePut(head, makeTorus(0.07, 0.018, '#2a4a5a', em, 0.2), 0, -0.4, 0.72);
  mouth.rotation.z = Math.PI;
  // 大きなハサミ
  [['armL', -1], ['armR', 1]].forEach(([k, s]) => {
    const a = _ePart(g, 0.7 * s, -0.45, 0.3);
    const arm = _ePut(a, makeEllipsoid(0.12, 0.11, 0.32, shell, em, 0.15), 0.82 * s, -0.42, 0.48);
    arm.rotation.y = s * 0.4;
    _ePut(a, makeEllipsoid(0.28, 0.24, 0.32, shell, em, 0.15), 0.92 * s, -0.32, 0.82);
    const upper = _ePut(a, makeCone(0.1, 0.36, c, em, 0.7), 0.92 * s, -0.18, 1.16);
    upper.rotation.x = Math.PI / 2 - 0.3;
    const lower = _ePut(a, makeCone(0.08, 0.3, c, em, 0.7), 0.92 * s, -0.44, 1.12);
    lower.rotation.x = Math.PI / 2 + 0.3;
    parts[k] = a;
  });
  // 脚（左右3本ずつ）
  [-1, 1].forEach(s => [0.2, -0.15, -0.5].forEach(z => {
    const leg = _ePut(g, makeCylinder(0.05, 0.04, 0.6, shell, em, 0.15), 0.95 * s, -0.8, z);
    leg.rotation.z = s * 0.8;
  }));
}

// ---------------- 氷：フロストウルフ ----------------
function buildFrostWolf(g, parts, c, em) {
  const fur = '#d6e8f2', fur2 = '#9fbfd0';
  _ePut(g, makeEllipsoid(0.48, 0.45, 0.85, fur, em, 0.1), 0, -0.25, -0.1);
  // 首まわりの氷のたてがみ
  [[-0.3, 0.12, 0.45], [0, 0.22, 0.5], [0.3, 0.12, 0.45], [-0.2, 0.25, 0.25], [0.2, 0.25, 0.25]].forEach(([x, y, z]) => {
    const sp = _ePut(g, makeCone(0.08, 0.3, c, em, 0.7), x, y, z);
    sp.rotation.x = -0.6;
  });
  const head = _ePart(g, 0, 0.0, 0.65);
  parts.head = head;
  _ePut(head, makeSphere(0.42, fur, em, 0.1), 0, 0.3, 0.8);
  _ePut(head, makeEllipsoid(0.2, 0.17, 0.3, fur2, em, 0.1), 0, 0.15, 1.18);
  _ePut(head, makeSphere(0.06, '#1a2a3a', '#000000', 0), 0, 0.22, 1.47);
  [-1, 1].forEach(s => {
    const ear = _ePut(head, makeCone(0.13, 0.32, fur, em, 0.1), 0.24 * s, 0.75, 0.7);
    ear.rotation.z = -s * 0.25;
    const inner = _ePut(head, makeCone(0.07, 0.2, c, em, 0.6), 0.24 * s, 0.73, 0.75);
    inner.rotation.z = -s * 0.25;
  });
  _eEyes(head, parts, 0.18, 0.4, 1.1, 0.1);
  // 脚
  [[-0.28, 0.4], [0.28, 0.4], [-0.28, -0.55], [0.28, -0.55]].forEach(([x, z]) => {
    _ePut(g, makeCylinder(0.11, 0.09, 0.6, fur, em, 0.1), x, -0.78, z);
    _ePut(g, makeSphere(0.1, fur2, em, 0.15), x, -1.08, z + 0.05);
  });
  // ふさふさの尻尾
  const tail = _ePart(g, 0, -0.05, -0.85);
  const t = _ePut(tail, makeEllipsoid(0.17, 0.17, 0.42, fur, em, 0.1), 0, 0.15, -1.15);
  t.rotation.x = 0.7;
  _ePut(tail, makeSphere(0.1, c, em, 0.8), 0, 0.42, -1.38);
  parts.tail = tail;
}

// ---------------- 雷：ピリビー ----------------
function buildPiribee(g, parts, c, em) {
  const yel = '#ffd447', blk = '#2a2418';
  // おしり（縞模様）
  const tail = _ePart(g, 0, 0.1, -0.3);
  _ePut(tail, makeEllipsoid(0.42, 0.42, 0.5, yel, em, 0.35), 0, 0.0, -0.6);
  [-0.45, -0.7].forEach(z => {
    const band = _ePut(tail, makeTorus(0.38, 0.06, blk, '#000000', 0), 0, 0.0, z);
    band.scale.set(1, 1, 1);
  });
  const sting = _ePut(tail, makeCone(0.06, 0.2, '#ffffff', c, 0.8), 0, -0.05, -1.12);
  sting.rotation.x = -Math.PI / 2;
  parts.tail = tail;
  // 胴と頭
  _ePut(g, makeSphere(0.32, blk, em, 0.15), 0, 0.15, -0.05);
  const head = _ePart(g, 0, 0.25, 0.1);
  parts.head = head;
  _ePut(head, makeSphere(0.45, yel, em, 0.35), 0, 0.35, 0.35);
  [-1, 1].forEach(s => {
    const ant = _ePut(head, makeCylinder(0.02, 0.02, 0.4, blk, em, 0.1), 0.15 * s, 0.9, 0.3);
    ant.rotation.z = -s * 0.35;
    _ePut(head, makeSphere(0.07, '#ffffff', c, 1.2), 0.24 * s, 1.08, 0.3);
    _ePut(head, makeSphere(0.07, '#ffb3c6', '#ff8fab', 0.2), 0.3 * s, 0.22, 0.68);
  });
  _eEyes(head, parts, 0.17, 0.42, 0.7, 0.13);
  // 羽（2対・透ける）
  [['wingL', -1], ['wingR', 1]].forEach(([k, s]) => {
    const w = _ePart(g, 0.2 * s, 0.45, -0.1);
    [[0.55, 0.75, 0.18, 0.4], [0.45, 0.45, 0.13, 0.3]].forEach(([x, y, rx, ry]) => {
      const wing = _ePut(w, makeEllipsoid(rx, ry, 0.03, '#e8f6ff', c, 0.4), x * s, y, -0.15);
      wing.material.transparent = true;
      wing.material.opacity = 0.7;
      wing.rotation.z = -s * 0.6;
    });
    parts[k] = w;
  });
  // 小さな脚
  [-1, 1].forEach(s => _ePut(g, makeSphere(0.06, blk, em, 0.1), 0.15 * s, -0.22, 0.05));
}

// ---------------- 雷：ライジュウ ----------------
function buildRaijuu(g, parts, c, em) {
  const fur = '#3a3a5a', fur2 = '#6a6a9a';
  _ePut(g, makeEllipsoid(0.5, 0.5, 0.75, fur, em, 0.15), 0, -0.3, -0.1);
  _ePut(g, makeEllipsoid(0.32, 0.35, 0.4, fur2, em, 0.1), 0, -0.35, 0.35);
  // 背中の稲妻模様
  [[-0.2, 0.12, -0.2], [0.2, 0.12, -0.2], [0, 0.18, 0.1]].forEach(([x, y, z]) => {
    const b = _ePut(g, makeCone(0.06, 0.22, c, em, 1.0), x, y, z);
    b.rotation.z = x ? -x * 2 : 0.4;
  });
  const head = _ePart(g, 0, -0.05, 0.5);
  parts.head = head;
  _ePut(head, makeSphere(0.46, fur, em, 0.15), 0, 0.3, 0.65);
  _ePut(head, makeEllipsoid(0.22, 0.16, 0.18, fur2, em, 0.1), 0, 0.12, 1.02);
  _ePut(head, makeSphere(0.05, '#ffb3c6', '#ff8fab', 0.3), 0, 0.2, 1.18);
  // 稲妻の先の大きな耳
  [-1, 1].forEach(s => {
    const ear = _ePut(head, makeCone(0.16, 0.5, fur, em, 0.15), 0.3 * s, 0.82, 0.55);
    ear.rotation.z = -s * 0.4;
    const tip = _ePut(head, makeCone(0.08, 0.2, c, em, 1.0), 0.43 * s, 1.08, 0.55);
    tip.rotation.z = -s * 0.4;
    _ePut(head, makeCone(0.04, 0.16, c, em, 1.0), 0.42 * s, 0.25, 0.95).rotation.z = s * 1.2;
  });
  _eEyes(head, parts, 0.19, 0.42, 1.0, 0.12);
  // 脚
  [[-0.3, 0.3], [0.3, 0.3], [-0.3, -0.45], [0.3, -0.45]].forEach(([x, z]) => {
    _ePut(g, makeCylinder(0.12, 0.1, 0.5, fur, em, 0.15), x, -0.82, z);
    _ePut(g, makeSphere(0.11, c, em, 0.6), x, -1.07, z + 0.05);
  });
  // ジグザグの稲妻しっぽ
  const tail = _ePart(g, 0, -0.1, -0.8);
  [[0, 0.05, -0.95, 0.6], [0.15, 0.35, -1.05, -0.6], [0, 0.65, -1.15, 0.6], [0.15, 0.95, -1.2, -0.6]].forEach(([x, y, z, rz]) => {
    const seg = _ePut(tail, makeCylinder(0.06, 0.08, 0.36, '#ffd447', em, 0.9), x, y, z);
    seg.rotation.z = rz;
  });
  parts.tail = tail;
}

// ---------------- 雷：ストームバード ----------------
function buildStormBird(g, parts, c, em) {
  const blue = '#3d4f86', belly = '#c9d4f0';
  _ePut(g, makeSphere(0.55, blue, em, 0.15), 0, -0.2, 0);
  _ePut(g, makeEllipsoid(0.38, 0.42, 0.22, belly, em, 0.1), 0, -0.28, 0.4);
  const head = _ePart(g, 0, 0.2, 0.1);
  parts.head = head;
  _ePut(head, makeSphere(0.4, blue, em, 0.15), 0, 0.55, 0.2);
  // 雷の冠羽
  [[-0.12, 0.3], [0, 0], [0.12, -0.3]].forEach(([x, rz], i) => {
    const f = _ePut(head, makeCone(0.07, 0.4 - Math.abs(x), c, em, 0.9), x, 1.05 - Math.abs(x), 0.05 - i * 0.05);
    f.rotation.z = rz;
    f.rotation.x = -0.4;
  });
  const beak = _ePut(head, makeCone(0.1, 0.25, '#ffb347', em, 0.4), 0, 0.45, 0.65);
  beak.rotation.x = Math.PI / 2;
  _eEyes(head, parts, 0.18, 0.62, 0.52, 0.11);
  // 翼（重ねた羽根）
  [['wingL', -1], ['wingR', 1]].forEach(([k, s]) => {
    const w = _ePart(g, 0.5 * s, -0.05, -0.05);
    [0, 1, 2].forEach(i => {
      const f = _ePut(w, makeEllipsoid(0.38 - i * 0.07, 0.11, 0.2, i === 0 ? c : blue, em, i === 0 ? 0.6 : 0.15), (0.85 - i * 0.1) * s, 0.05 - i * 0.15, -0.1 - i * 0.05);
      f.rotation.z = -s * (0.5 - i * 0.2);
    });
    parts[k] = w;
  });
  // 尾羽
  const tail = _ePart(g, 0, -0.3, -0.5);
  [-0.15, 0, 0.15].forEach((x, i) => {
    const f = _ePut(tail, makeEllipsoid(0.07, 0.04, 0.35, i === 1 ? c : blue, em, i === 1 ? 0.7 : 0.15), x, -0.25, -0.8);
    f.rotation.y = x * 2;
  });
  parts.tail = tail;
  // 足
  [-1, 1].forEach(s => {
    _ePut(g, makeCylinder(0.03, 0.03, 0.35, '#ffb347', em, 0.3), 0.18 * s, -0.88, 0.05);
    _ePut(g, makeEllipsoid(0.1, 0.04, 0.14, '#ffb347', em, 0.3), 0.18 * s, -1.06, 0.12);
  });
}

// ---------------- 闇：カゲボウ ----------------
function buildKageboo(g, parts, c, em) {
  const body = '#2a1a4a';
  const head = _ePart(g, 0, -0.1, 0);
  parts.head = head;
  _ePut(head, makeSphere(0.6, body, em, 0.25), 0, 0.15, 0);
  // 頭の上のゆらめき
  const tuft = _ePut(head, makeCone(0.2, 0.45, body, em, 0.3), 0.05, 0.8, -0.05);
  tuft.rotation.z = -0.3;
  // 光る目（闇の目）
  [['eyeL', -1], ['eyeR', 1]].forEach(([k, s]) => {
    const e = _ePart(head, 0.2 * s, 0.22, 0.5);
    _ePut(e, makeSphere(0.12, c, em, 1.5), 0.2 * s, 0.22, 0.5);
    _ePut(e, makeSphere(0.06, '#ffffff', c, 2.0), 0.2 * s, 0.22, 0.58);
    parts[k] = e;
  });
  const mouth = _ePut(head, makeTorus(0.1, 0.02, c, em, 0.8), 0, -0.05, 0.55);
  mouth.rotation.z = Math.PI;
  // 小さな手
  [['armL', -1], ['armR', 1]].forEach(([k, s]) => {
    const a = _ePart(g, 0.5 * s, -0.1, 0.1);
    _ePut(a, makeEllipsoid(0.12, 0.08, 0.1, body, em, 0.3), 0.68 * s, -0.2, 0.2);
    parts[k] = a;
  });
  // 尾（くねる影）
  const tail = _ePart(g, 0, -0.45, -0.1);
  [[0, -0.55, -0.1, 0.4], [0.12, -0.8, -0.25, 0.28], [0.05, -1.0, -0.38, 0.18], [-0.08, -1.12, -0.48, 0.1]].forEach(([x, y, z, r]) => {
    _ePut(tail, makeSphere(r, body, em, 0.25), x, y, z);
  });
  parts.tail = tail;
  // 周りに漂う光
  const orbs = _ePart(g, 0, 0, 0);
  [0, 1, 2].forEach(i => {
    const a = i * Math.PI * 2 / 3;
    _ePut(orbs, makeSphere(0.05, c, em, 1.0), Math.cos(a) * 0.95, 0.1 + i * 0.15, Math.sin(a) * 0.95);
  });
  parts.orbs = orbs;
}

// ---------------- 闇：ヨルキノコ ----------------
function buildYorukinoko(g, parts, c, em) {
  const stem = '#e9e0d0';
  // 軸（顔つき）
  _ePut(g, makeEllipsoid(0.5, 0.62, 0.48, stem, em, 0.08), 0, -0.48, 0);
  _eEyes(g, parts, 0.17, -0.3, 0.42, 0.11);
  const mouth = _ePut(g, makeTorus(0.06, 0.016, '#5a4a6a', em, 0.2), 0, -0.55, 0.47);
  mouth.rotation.z = Math.PI;
  [-1, 1].forEach(s => _ePut(g, makeSphere(0.08, '#ffb3c6', '#ff8fab', 0.2), 0.3 * s, -0.45, 0.38));
  // かさ（頭として揺れる）
  const head = _ePart(g, 0, 0.0, 0);
  parts.head = head;
  _ePut(head, makeEllipsoid(0.95, 0.5, 0.95, '#4a2470', em, 0.25), 0, 0.25, 0);
  _ePut(head, makeEllipsoid(0.85, 0.12, 0.85, '#2a1440', em, 0.15), 0, 0.0, 0);
  // 光る斑点
  [[0, 0.72, 0, 0.12], [0.5, 0.45, 0.3, 0.1], [-0.5, 0.45, 0.3, 0.1], [0.45, 0.5, -0.4, 0.09], [-0.45, 0.5, -0.4, 0.09], [0, 0.48, 0.6, 0.1]].forEach(([x, y, z, r]) => {
    _ePut(head, makeSphere(r, c, em, 1.2), x, y, z);
  });
  // 小さな手と足
  [['armL', -1], ['armR', 1]].forEach(([k, s]) => {
    const a = _ePart(g, 0.45 * s, -0.5, 0.1);
    _ePut(a, makeSphere(0.1, stem, em, 0.08), 0.55 * s, -0.6, 0.2);
    parts[k] = a;
  });
  [-1, 1].forEach(s => _ePut(g, makeEllipsoid(0.16, 0.1, 0.22, stem, em, 0.08), 0.22 * s, -1.08, 0.1));
  // 胞子の光
  const orbs = _ePart(g, 0, 0, 0);
  [0, 1, 2, 3].forEach(i => {
    const a = i * Math.PI / 2 + 0.4;
    _ePut(orbs, makeSphere(0.04, c, em, 1.0), Math.cos(a) * 1.05, 0.5 + (i % 2) * 0.3, Math.sin(a) * 1.05);
  });
  parts.orbs = orbs;
}

// ---------------- 闇：シャドウナイト ----------------
function buildShadowKnight(g, parts, c, em) {
  const steel = '#2c2c3e', trim = '#6a5a9a';
  // マント
  const cape = makeCone(0.75, 1.5, '#1a0f2e', em, 0.15);
  _ePut(g, cape, 0, -0.35, -0.2);
  // 胴（鎧）
  _ePut(g, makeEllipsoid(0.55, 0.55, 0.45, steel, em, 0.12), 0, -0.25, 0.05);
  _ePut(g, makeEllipsoid(0.32, 0.35, 0.12, trim, em, 0.25), 0, -0.2, 0.42);
  _ePut(g, makeSphere(0.08, c, em, 1.2), 0, -0.15, 0.53);
  // 兜
  const head = _ePart(g, 0, 0.25, 0.05);
  parts.head = head;
  _ePut(head, makeSphere(0.48, steel, em, 0.12), 0, 0.6, 0.05);
  _ePut(head, makeEllipsoid(0.36, 0.1, 0.12, '#05030a', '#000000', 0), 0, 0.55, 0.43);
  const crest = _ePut(head, makeCone(0.07, 0.45, c, em, 0.8), 0, 1.15, -0.05);
  crest.rotation.x = -0.35;
  [-1, 1].forEach(s => {
    const horn = _ePut(head, makeCone(0.07, 0.3, trim, em, 0.25), 0.4 * s, 0.85, 0.0);
    horn.rotation.z = -s * 0.9;
  });
  // 兜の奥で光る目
  [['eyeL', -1], ['eyeR', 1]].forEach(([k, s]) => {
    const e = _ePart(head, 0.13 * s, 0.56, 0.5);
    _ePut(e, makeSphere(0.06, c, em, 1.6), 0.13 * s, 0.56, 0.5);
    _ePut(e, makeSphere(0.03, '#ffffff', c, 2.0), 0.13 * s, 0.56, 0.54);
    parts[k] = e;
  });
  // 肩当て
  [-1, 1].forEach(s => _ePut(g, makeEllipsoid(0.26, 0.16, 0.26, trim, em, 0.25), 0.55 * s, 0.15, 0.05));
  // 剣（右手）と盾（左手）
  const armR = _ePart(g, 0.6, -0.05, 0.15);
  _ePut(armR, makeSphere(0.13, steel, em, 0.12), 0.7, -0.3, 0.25);
  const blade = _ePut(armR, makeCylinder(0.04, 0.06, 0.9, '#c9c4ff', c, 0.9), 0.75, 0.15, 0.4);
  blade.rotation.x = -0.3;
  _ePut(armR, makeEllipsoid(0.18, 0.04, 0.06, trim, em, 0.25), 0.74, -0.28, 0.28);
  parts.armR = armR;
  const armL = _ePart(g, -0.6, -0.05, 0.15);
  _ePut(armL, makeEllipsoid(0.38, 0.45, 0.08, steel, em, 0.12), -0.72, -0.3, 0.45);
  _ePut(armL, makeSphere(0.1, c, em, 1.0), -0.72, -0.25, 0.53);
  parts.armL = armL;
  // 脚（ブーツ）
  [-1, 1].forEach(s => {
    _ePut(g, makeCylinder(0.13, 0.15, 0.4, steel, em, 0.12), 0.24 * s, -0.85, 0.05);
    _ePut(g, makeEllipsoid(0.17, 0.1, 0.25, trim, em, 0.2), 0.24 * s, -1.06, 0.12);
  });
}

// ============================================================
// 生成の窓口
// ============================================================
const ENEMY_BUILDERS = {
  hinoko:       { attr: 'fire',    build: buildHinoko },
  flarebat:     { attr: 'fire',    build: buildFlareBat },
  magmaturtle:  { attr: 'fire',    build: buildMagmaTurtle },
  yukidama:     { attr: 'ice',     build: buildYukidama },
  koorigani:    { attr: 'ice',     build: buildKoorigani },
  frostwolf:    { attr: 'ice',     build: buildFrostWolf },
  piribee:      { attr: 'thunder', build: buildPiribee },
  raijuu:       { attr: 'thunder', build: buildRaijuu },
  stormbird:    { attr: 'thunder', build: buildStormBird },
  kageboo:      { attr: 'dark',    build: buildKageboo },
  yorukinoko:   { attr: 'dark',    build: buildYorukinoko },
  shadowknight: { attr: 'dark',    build: buildShadowKnight },
};

const ENEMY_FOOT_Y = -1.1;   // モデル座標での足元
const GROUND_LEVEL = -0.715; // 戦闘・育成シーンの地面の高さ

function buildEnemy(species, opts = {}) {
  const def = ENEMY_BUILDERS[species];
  const attr = def.attr;
  const root = new THREE.Group();
  // 拡大しても足元が地面に来るよう、内側のグループで大きさと高さを合わせる
  const inner = new THREE.Group();
  inner.userData.wp = new THREE.Vector3();
  const S = BABY_SCALE * (opts.scale || 1);
  inner.scale.setScalar(S);
  inner.position.y = GROUND_LEVEL - ENEMY_FOOT_Y * S;
  root.add(inner);
  const parts = {};
  def.build(inner, parts, ATTR[attr].color, ATTR[attr].emissive);
  addAttrEffect(inner, attr, 'baby');
  root.userData.particles = inner.userData.particles;
  root.userData.stage = (opts.scale || 1) > 1.35 ? 'adult' : 'baby';
  root.userData.species = species;
  root.userData.rig = { parts, attr, stage: 'baby', action: null, blinkAt: 1 + Math.random() * 3, seed: Math.random() * 10, base: null };
  return root;
}
