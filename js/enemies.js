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

// ============================================================
// 生成の窓口
// ============================================================
const ENEMY_BUILDERS = {
  yukidama:     { attr: 'ice',  build: buildYukidama },
  flarebat:     { attr: 'fire', build: buildFlareBat },
  magmaturtle:  { attr: 'fire', build: buildMagmaTurtle },
};

function buildEnemy(species, opts = {}) {
  const def = ENEMY_BUILDERS[species];
  const attr = def.attr;
  const g = new THREE.Group();
  g.userData.wp = new THREE.Vector3();
  const parts = {};
  def.build(g, parts, ATTR[attr].color, ATTR[attr].emissive);
  addAttrEffect(g, attr, 'baby');
  g.scale.setScalar(BABY_SCALE * (opts.scale || 1));
  g.userData.stage = 'baby';
  g.userData.species = species;
  g.userData.rig = { parts, attr, stage: 'baby', action: null, blinkAt: 1 + Math.random() * 3, seed: Math.random() * 10, base: null };
  return g;
}
