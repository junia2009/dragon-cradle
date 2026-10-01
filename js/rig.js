/* ============================================================
   Dragon Cradle — rig.js
   元のドラゴンモデル（models.js）の形・色は一切変えずに、動きだけを付ける。

   モデル生成後に、パーツ（頭・目・翼・尻尾・腕・裾・オーブ）を
   見えない関節（ピボット）の下にまとめ直す。静止時の見た目は元と同じ。

   API:
     rigDragon(group, attr)            buildDragon の直後に呼ぶ
     animateDragon(group, dt, t)       毎フレーム（属性パーティクルの周回も含む）
     playDragonAction(group, name)     'attack' | 'hit' | 'happy' | 'roar'
   依存: THREE, animateDragonParticles（models.js）
   ============================================================ */
'use strict';

// 各モデルのパーツ振り分けルール。c はパーツ中心（モデル座標）
const near = (x, y, z, r) => c => Math.hypot(c.x - x, c.y - y, c.z - z) < r;
const RIG_RULES = {
  'fire-baby': [
    ['eyeL', [-0.30, 1.36, 0.75], near(-0.30, 1.36, 0.75, 0.2)],
    ['eyeR', [0.30, 1.36, 0.75], near(0.30, 1.36, 0.75, 0.2)],
    ['head', [0, 0.55, 0.1], c => c.y > 0.6],
    ['wingL', [-0.75, 0.3, -0.1], c => c.x < -0.7 && c.y > 0],
    ['wingR', [0.75, 0.3, -0.1], c => c.x > 0.7 && c.y > 0],
    ['tail', [0, -0.25, -0.65], c => c.z < -0.7],
  ],
  'fire-adult': [
    ['eyeL', [-0.22, 1.38, 1.08], near(-0.22, 1.38, 1.08, 0.1)],
    ['eyeR', [0.22, 1.38, 1.08], near(0.22, 1.38, 1.08, 0.1)],
    ['head', [0, 1.0, 0.8], c => (c.y > 1.02 && c.z > 0.75) || (c.y > 1.45 && c.z > 0.5) || (c.z > 1.0 && c.y > 0.9)],
    ['wingL', [-0.6, 0.35, -0.12], c => c.x < -0.5 && c.y > 0],
    ['wingR', [0.6, 0.35, -0.12], c => c.x > 0.5 && c.y > 0],
    ['tail', [0, -0.15, -0.8], c => c.z < -0.85 && c.y < 0.2],
  ],
  'ice-baby': [
    ['eyeL', [-0.25, 1.15, 0.48], near(-0.25, 1.15, 0.48, 0.13)],
    ['eyeR', [0.25, 1.15, 0.48], near(0.25, 1.15, 0.48, 0.13)],
    ['head', [0, 0.75, 0.1], c => c.y > 0.7 && c.z > -0.1],
    ['armL', [-0.5, 0.2, 0.3], (c, m) => c.x < -0.45 && c.y > -0.3 && c.y < 0.4],
    ['armR', [0.5, 0.2, 0.3], (c, m) => c.x > 0.45 && c.y > -0.3 && c.y < 0.4],
    ['tail', [0, -0.35, -0.45], c => c.z < -0.5 && c.y < -0.3],
  ],
  'ice-adult': [
    ['eyeL', [-0.24, 1.52, 0.91], near(-0.24, 1.52, 0.91, 0.08)],
    ['eyeR', [0.24, 1.52, 0.91], near(0.24, 1.52, 0.91, 0.08)],
    ['head', [0, 1.15, 0.45], c => c.y > 1.17 && c.z > 0.15 && Math.abs(c.x) < 0.5],
    ['armL', [-0.6, 0.3, 0.3], c => c.x < -0.55 && c.y > -0.2 && c.y < 0.4 && c.z > 0.2],
    ['armR', [0.6, 0.3, 0.3], c => c.x > 0.55 && c.y > -0.2 && c.y < 0.4 && c.z > 0.2],
    ['tail', [0, -0.1, -0.75], (c, m) => c.z < -0.85 && c.y < -0.05 && Math.abs(c.x) < 0.3 && m.geometry.type.indexOf('Cylinder') < 0],
  ],
  'thunder-baby': [
    ['eyeL', [-0.22, 1.11, 0.9], near(-0.22, 1.11, 0.9, 0.12)],
    ['eyeR', [0.22, 1.11, 0.9], near(0.22, 1.11, 0.9, 0.12)],
    ['head', [0, 0.65, 0.55], c => c.z > 0.45 && c.y > 0.7 && Math.abs(c.x) < 0.4],
    ['wingL', [-0.5, 0.3, -0.1], c => c.x < -0.45 && c.y > 0.2],
    ['wingR', [0.5, 0.3, -0.1], c => c.x > 0.45 && c.y > 0.2],
    ['tail', [0, -0.1, -0.75], c => c.z < -0.75],
  ],
  'thunder-adult': [
    ['eyeL', [-0.20, 1.5, 1.08], near(-0.20, 1.5, 1.08, 0.08)],
    ['eyeR', [0.20, 1.5, 1.08], near(0.20, 1.5, 1.08, 0.08)],
    ['head', [0, 1.2, 0.88], c => (c.y > 1.2 && c.z > 0.95) || (c.y > 1.45 && c.z > 0.7)],
    ['tail', [0, -0.1, -0.9], c => c.z < -0.9 && c.y < 0],
  ],
  'dark-baby': [
    ['eyeL', [-0.15, 1.15, 0.47], near(-0.15, 1.15, 0.47, 0.1)],
    ['eyeR', [0.15, 1.15, 0.47], near(0.15, 1.15, 0.47, 0.1)],
    ['head', [0, 0.9, 0.1], c => c.y > 0.95],
    ['armL', [-0.4, 0.05, 0.25], c => c.x < -0.35 && c.y > -0.3 && c.y < 0.3 && c.z > 0.2],
    ['armR', [0.4, 0.05, 0.25], c => c.x > 0.35 && c.y > -0.3 && c.y < 0.3 && c.z > 0.2],
    ['hem', [0, -0.9, 0], c => c.y < -0.8],
    ['orbs', [0, 0, 0], c => (Math.abs(c.x) > 0.7 || Math.abs(c.z) > 0.55) && c.y > -0.2 && c.y < 0.6],
  ],
  'dark-adult': [
    ['eyeL', [-0.14, 1.32, 0.54], near(-0.14, 1.32, 0.54, 0.08)],
    ['eyeR', [0.14, 1.32, 0.54], near(0.14, 1.32, 0.54, 0.08)],
    ['head', [0, 1.05, 0.05], c => c.y > 1.1 && Math.abs(c.x) < 0.45],
    ['armL', [-0.6, 0.5, 0.2], c => c.x < -0.5 && c.y < 0.4 && c.y > -0.3 && c.z > 0.2],
    ['armR', [0.6, 0.5, 0.2], c => c.x > 0.5 && c.y < 0.4 && c.y > -0.3 && c.z > 0.2],
    ['hem', [0, -1.25, 0], c => c.y < -1.1],
    ['orbs', [0, 0, 0], c => (Math.abs(c.x) > 0.8 || Math.abs(c.z) > 0.7) && c.y > 0],
  ],
};

function rigDragon(g, attr) {
  const stage = g.userData.stage === 'adult' ? 'adult' : 'baby';
  const rules = RIG_RULES[attr + '-' + stage];
  if (!rules) return g;
  const skip = new Set(g.userData.particles || []);
  const parts = {};
  const center = new THREE.Vector3();
  [...g.children].forEach(m => {
    if (skip.has(m) || !m.geometry) return;
    m.geometry.computeBoundingBox();
    m.updateMatrix();
    m.geometry.boundingBox.getCenter(center).applyMatrix4(m.matrix);
    const rule = rules.find(r => r[2](center, m));
    if (!rule) return;
    const name = rule[0];
    if (!parts[name]) {
      const pivot = new THREE.Group();
      pivot.position.set(...rule[1]);
      g.add(pivot);
      parts[name] = pivot;
    }
    // ピボット基準の座標に置き直す（見た目は変わらない）
    m.position.sub(parts[name].position);
    parts[name].add(m);
  });
  // 目は頭と一緒に動くよう、頭の中へ入れる
  ['eyeL', 'eyeR'].forEach(k => {
    if (parts[k] && parts.head) {
      parts[k].position.sub(parts.head.position);
      parts.head.add(parts[k]);
    }
  });
  g.userData.rig = { parts, attr, stage, action: null, blinkAt: 1 + Math.random() * 3, seed: Math.random() * 10, base: null };
  return g;
}

const RIG_ACTIONS = { attack: 0.7, hit: 0.5, happy: 1.0, roar: 1.3 };
function playDragonAction(g, name) {
  const rig = g && g.userData.rig;
  if (!rig || !RIG_ACTIONS[name]) return;
  rig.action = { name, t: 0, dur: RIG_ACTIONS[name] };
}

// アクションの姿勢（0 → 最大 → 0 の山）
function rigPose(rig) {
  const P = { head: 0, lean: 0, wing: 0, flap: 0, tail: 0, squint: 0, arms: 0 };
  const a = rig.action;
  if (!a) return P;
  const p = a.t / a.dur;
  const bell = Math.sin(Math.PI * Math.min(1, p));
  if (a.name === 'attack') {
    const wind = p < 0.35 ? Math.sin(Math.PI * p / 0.35 / 2) : 0;
    const strike = p >= 0.35 ? Math.sin(Math.PI * (p - 0.35) / 0.65) : 0;
    P.head = -0.25 * wind + 0.35 * strike;
    P.lean = -0.06 * wind + 0.12 * strike;
    P.wing = bell;
    P.tail = Math.sin(p * Math.PI * 2) * 0.4;
    P.arms = strike;
  } else if (a.name === 'hit') {
    P.head = -0.3 * bell;
    P.lean = -0.12 * bell;
    P.squint = bell;
    P.wing = 0.4 * bell;
  } else if (a.name === 'happy') {
    P.flap = bell;
    P.tail = Math.sin(p * Math.PI * 6) * 0.5 * bell;
    P.head = -0.12 * bell;
    P.squint = 0.7 * bell;
    P.arms = 0.6 * bell;
  } else if (a.name === 'roar') {
    const hold = Math.min(1, p * 4) * Math.min(1, (1 - p) * 4);
    P.head = -0.4 * hold;
    P.wing = hold;
    P.tail = -0.2 * hold;
    P.arms = hold;
  }
  return P;
}

function animateDragon(g, dt, t) {
  animateDragonParticles(g, t);
  const rig = g && g.userData.rig;
  if (!rig) return;
  const { parts } = rig;
  if (!rig.base) rig.base = g.scale.clone();  // 呼び出し側で決めた大きさを基準にする
  if (rig.action) {
    rig.action.t += dt;
    if (rig.action.t >= rig.action.dur) rig.action = null;
  }
  const P = rigPose(rig);
  const T = t + rig.seed;

  // 呼吸（ほんのわずかに膨らむ）
  const br = Math.sin(T * 1.8) * 0.012;
  g.scale.set(rig.base.x * (1 + br * 0.5), rig.base.y * (1 + br), rig.base.z * (1 + br * 0.5));
  g.rotation.x = P.lean;

  if (parts.head) {
    parts.head.rotation.set(
      Math.sin(T * 0.9) * 0.04 + P.head,
      Math.sin(T * 0.45) * 0.12,
      Math.sin(T * 0.6 + 1) * 0.05
    );
  }

  // まばたき（闇は目の光がゆらめく）
  rig.blinkAt -= dt;
  let lid = 1;
  if (rig.blinkAt < 0.14) lid = Math.abs(rig.blinkAt - 0.07) / 0.07;
  if (rig.blinkAt <= 0) rig.blinkAt = 2.5 + Math.random() * 3.5;
  lid = Math.max(0.1, Math.min(lid, 1 - P.squint * 0.85));
  ['eyeL', 'eyeR'].forEach(k => {
    const e = parts[k];
    if (!e) return;
    if (rig.attr === 'dark') e.scale.setScalar(1 + Math.sin(T * 3 + (k === 'eyeL' ? 0 : 1)) * 0.08 + (1 - lid) * -0.5);
    else e.scale.y = lid;
  });

  // 翼（ゆったり上下＋羽ばたき・広げ）
  ['wingL', 'wingR'].forEach(k => {
    const w = parts[k];
    if (!w) return;
    const s = k === 'wingL' ? 1 : -1;
    const flap = Math.sin(T * (P.flap > 0 ? 16 : 1.6)) * (0.08 + P.flap * 0.45);
    w.rotation.set(0, s * P.wing * 0.25, s * (flap - P.wing * 0.35));
  });

  // 尻尾（左右に揺れる）
  if (parts.tail) parts.tail.rotation.set(Math.sin(T * 0.9) * 0.03, Math.sin(T * 1.3) * 0.12 + P.tail, 0);

  // 腕・手
  ['armL', 'armR'].forEach(k => {
    const a = parts[k];
    if (!a) return;
    const s = k === 'armL' ? 1 : -1;
    a.rotation.set(Math.sin(T * 1.1 + s) * 0.08 - P.arms * 0.5, 0, s * (Math.sin(T * 0.8) * 0.05 + P.arms * 0.2));
  });

  // ローブの裾とオーブ（闇）
  if (parts.hem) {
    parts.hem.rotation.y = Math.sin(T * 0.7) * 0.15;
    parts.hem.scale.set(1 + Math.sin(T * 2) * 0.04, 1, 1 + Math.cos(T * 2) * 0.04);
  }
  if (parts.orbs) {
    parts.orbs.rotation.y = T * 0.35;
    parts.orbs.position.y = Math.sin(T * 1.3) * 0.06;
  }
}
