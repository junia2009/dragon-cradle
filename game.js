/* ============================================================
   Dragon Cradle — game.js
   Phase 1: 基盤 / Phase 2: 卵・孵化 / Phase 3: ドラゴンモデル
   ============================================================ */
'use strict';

// ============================================================
// 定数
// ============================================================
const ATTR = {
  fire:    { name: '炎ドラゴン',  color: '#FF4500', emissive: '#FF2000', fogColor: 0x1a0500 },
  ice:     { name: '氷ドラゴン',  color: '#00CFFF', emissive: '#0099BB', fogColor: 0x001a2a },
  thunder: { name: '雷ドラゴン',  color: '#FFD700', emissive: '#CC9900', fogColor: 0x1a1500 },
  dark:    { name: '闇ドラゴン',  color: '#7B2FFF', emissive: '#4a00cc', fogColor: 0x080010 },
};

const BASE_STATS = {
  fire:    { hp: 80,  atk: 25, def: 10, spd: 15 },
  ice:     { hp: 100, atk: 15, def: 25, spd: 10 },
  thunder: { hp: 70,  atk: 20, def: 8,  spd: 22 },
  dark:    { hp: 90,  atk: 20, def: 20, spd: 12 },
};

// 成長ゲージ必要pt（幼体→成体に50pt）
const HATCH_MAX    = 100;   // 孵化ゲージ最大
const RAISE_MAX    = 50;    // 成長ゲージ最大（幼体→成体）
const HATCH_IDLE   = 6000;  // 放置孵化インターバル(ms) + 1pt
const RAISE_IDLE   = 60000; // 放置成長インターバル(ms) + 1pt
const TRAIN_CD     = 30000; // トレーニングクールダウン(ms)

// ============================================================
// 状態
// ============================================================
let state = {
  attr: null,       // 'fire' | 'ice' | 'thunder' | 'dark'
  stage: 'egg',     // 'egg' | 'baby' | 'adult'
  hatchPt: 0,
  growthPt: 0,
  stats: null,
  score: 0,
  streak: 0,
  totalWin: 0,
  battleLevel: 1,
  lastSaveTime: Date.now(),
};

// セーブデータキー
const SAVE_KEY = 'dragon_cradle_save';

// ============================================================
// 画面管理
// ============================================================
const screens = {};
['select','hatch','raise','battle','record'].forEach(id => {
  screens[id] = document.getElementById('screen-' + id);
});
const mainNav = document.getElementById('main-nav');

function showScreen(name) {
  Object.keys(screens).forEach(k => screens[k].classList.remove('active'));
  screens[name].classList.add('active');

  // ナビ表示制御
  const showNav = ['raise','battle','record'].includes(name);
  mainNav.classList.toggle('hidden', !showNav);

  // ナビハイライト
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.screen === name);
  });
}

// ============================================================
// Three.js 共通ユーティリティ
// ============================================================
function hexToThreeColor(hex) {
  return new THREE.Color(hex);
}

function makeBox(w, h, d, color, emissiveHex, emissiveInt = 0.3) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color: hexToThreeColor(color),
    emissive: hexToThreeColor(emissiveHex || color),
    emissiveIntensity: emissiveInt,
    metalness: 0.2,
    roughness: 0.7,
  });
  return new THREE.Mesh(geo, mat);
}

// 共通: 星空パーティクル
function createStarField(scene, count = 400) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const palette = [0xffffff, 0xcfc9ff, 0xa8d8ff, 0xffd6e0, 0xb8ffec];
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i*3]   = (Math.random()-.5)*80;
    pos[i*3+1] = (Math.random()-.5)*50;
    pos[i*3+2] = (Math.random()-.5)*80;
    const c = new THREE.Color(palette[Math.floor(Math.random()*palette.length)]);
    colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.15, vertexColors: true, transparent: true,
    opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return pts;
}

// ============================================================
// Phase1: 属性選択画面
// ============================================================
document.querySelectorAll('.attr-card').forEach(card => {
  card.addEventListener('click', () => {
    const attr = card.dataset.attr;
    selectAttr(attr);
  });
});

function selectAttr(attr) {
  state.attr = attr;
  state.stage = 'egg';
  state.hatchPt = 0;
  state.growthPt = 0;
  state.stats = Object.assign({}, BASE_STATS[attr]);
  state.score = 0;
  state.streak = 0;
  state.battleLevel = 1;

  // CSS変数のカラーを属性カラーに変更
  document.documentElement.style.setProperty('--current-attr', ATTR[attr].color);

  showScreen('hatch');
  initHatchScene(attr);
}

// ============================================================
// Phase2: 孵化シーン（Three.js）
// ============================================================
let hatchScene, hatchCamera, hatchRenderer, hatchAnimId;
let eggGroup = null;
let eggCrackLines = [];
let hatchParticles = [];
let hatchIdleTimer = null;

function initHatchScene(attr) {
  const canvas = document.getElementById('hatch-canvas');
  const W = canvas.clientWidth  || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;

  // 既存シーンがあれば破棄
  if (hatchAnimId) { cancelAnimationFrame(hatchAnimId); hatchAnimId = null; }
  if (hatchRenderer) { hatchRenderer.dispose(); }

  hatchScene = new THREE.Scene();
  hatchScene.fog = new THREE.FogExp2(ATTR[attr].fogColor, 0.025);

  hatchCamera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
  hatchCamera.position.set(0, 0, 8);

  hatchRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  hatchRenderer.setSize(W, H);
  hatchRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  hatchRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  hatchRenderer.toneMappingExposure = 1.2;

  // ライト
  hatchScene.add(new THREE.AmbientLight(0x334466, 0.8));
  const pt = new THREE.PointLight(hexToThreeColor(ATTR[attr].color), 2.0, 20);
  pt.position.set(0, 3, 5);
  hatchScene.add(pt);
  const pt2 = new THREE.PointLight(0x223366, 0.6, 20);
  pt2.position.set(0, -4, -5);
  hatchScene.add(pt2);

  createStarField(hatchScene);
  buildEgg(attr);
  updateHatchLabel(attr);
  updateHatchGaugeUI();
  animateHatch();

  // 放置タイマー開始
  clearInterval(hatchIdleTimer);
  hatchIdleTimer = setInterval(() => {
    if (state.stage === 'egg') addHatchPt(1);
  }, HATCH_IDLE);

  // クリックで孵化促進
  canvas.onclick = () => {
    if (state.stage !== 'egg') return;
    addHatchPt(2);
    shakeEgg(0.3);
  };

  window.addEventListener('resize', () => {
    if (!hatchRenderer) return;
    const W2 = canvas.clientWidth  || window.innerWidth;
    const H2 = canvas.clientHeight || window.innerHeight;
    hatchCamera.aspect = W2 / H2;
    hatchCamera.updateProjectionMatrix();
    hatchRenderer.setSize(W2, H2);
  });
}

function updateHatchLabel(attr) {
  const el = document.getElementById('hatch-attr-label');
  if (el) el.textContent = ATTR[attr].name + ' の卵';
}

// ---- ボクセル卵 ----
function buildEgg(attr) {
  if (eggGroup) hatchScene.remove(eggGroup);
  eggGroup = new THREE.Group();
  eggCrackLines = [];

  const c  = ATTR[attr].color;
  const em = ATTR[attr].emissive;

  // 卵の形：BoxGeometryを積み上げて楕円形に近づける
  const layers = [
    { y: -1.2, w: 0.8, h: 0.4, d: 0.8 },
    { y: -0.8, w: 1.3, h: 0.4, d: 1.3 },
    { y: -0.4, w: 1.6, h: 0.4, d: 1.6 },
    { y:  0.0, w: 1.7, h: 0.4, d: 1.7 },
    { y:  0.4, w: 1.6, h: 0.4, d: 1.6 },
    { y:  0.8, w: 1.3, h: 0.4, d: 1.3 },
    { y:  1.2, w: 0.9, h: 0.4, d: 0.9 },
    { y:  1.5, w: 0.5, h: 0.35,d: 0.5 },
  ];

  layers.forEach(l => {
    const m = makeBox(l.w, l.h, l.d, '#1a1a2e', em, 0.1);
    m.position.y = l.y;
    eggGroup.add(m);
  });

  // 表面模様（属性カラーのボクセルをランダムに配置）
  for (let i = 0; i < 14; i++) {
    const size = 0.18 + Math.random() * 0.14;
    const dot = makeBox(size, size, size * 0.3, c, em, 0.6);
    const angle = Math.random() * Math.PI * 2;
    const r = 0.8 + Math.random() * 0.7;
    const yp = -1.0 + Math.random() * 2.2;
    dot.position.set(Math.cos(angle)*r, yp, Math.sin(angle)*r);
    dot.rotation.y = angle;
    eggGroup.add(dot);
  }

  // ひびメッシュ（最初は非表示）
  for (let i = 0; i < 5; i++) {
    const cGeo = new THREE.BoxGeometry(0.05, 0.5 + Math.random()*0.4, 0.05);
    const cMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    const crack = new THREE.Mesh(cGeo, cMat);
    const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
    crack.position.set(Math.cos(angle)*1.6, -0.3 + Math.random()*1.0, Math.sin(angle)*1.6);
    crack.rotation.z = (Math.random()-.5) * 0.5;
    eggGroup.add(crack);
    eggCrackLines.push(crack);
  }

  hatchScene.add(eggGroup);
}

// 揺らす
let eggShake = 0;
function shakeEgg(intensity) { eggShake = intensity; }

// ひびをゲージに応じて表示
function updateCracks(ratio) {
  if (ratio < 0.8) return;
  const t = (ratio - 0.8) / 0.2; // 0.8〜1.0 → 0〜1
  eggCrackLines.forEach((cl, i) => {
    cl.material.opacity = t * (0.5 + (i%3)*0.2);
  });
}

// ---- 孵化ゲージ ----
function addHatchPt(pt) {
  state.hatchPt = Math.min(state.hatchPt + pt, HATCH_MAX);
  updateHatchGaugeUI();
  updateCracks(state.hatchPt / HATCH_MAX);
  if (state.hatchPt >= HATCH_MAX) doHatch();
}

function updateHatchGaugeUI() {
  const fill = document.getElementById('hatch-gauge-fill');
  const text = document.getElementById('hatch-gauge-text');
  if (fill) fill.style.width = (state.hatchPt / HATCH_MAX * 100) + '%';
  if (text) text.textContent = `${state.hatchPt} / ${HATCH_MAX}`;
}

// ---- 孵化演出 → 育成画面へ ----
function doHatch() {
  clearInterval(hatchIdleTimer);
  state.stage = 'baby';
  // ひびを全部表示
  eggCrackLines.forEach(cl => { cl.material.opacity = 1; });
  // パーティクル爆発
  spawnHatchParticles();
  // 少し待って育成画面へ
  setTimeout(() => {
    showScreen('raise');
    mainNav.classList.remove('hidden');
    initRaiseScene(state.attr);
    saveGame();
  }, 1800);
}

// 孵化パーティクル
function spawnHatchParticles() {
  const c = hexToThreeColor(ATTR[state.attr].color);
  for (let i = 0; i < 60; i++) {
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, 0);
    const vel = new THREE.Vector3(
      (Math.random()-.5)*4,
      (Math.random()-.5)*4,
      (Math.random()-.5)*4
    );
    hatchScene.add(mesh);
    hatchParticles.push({ mesh, vel, life: 0 });
  }
}

// ---- 孵化シーンアニメーション ----
function animateHatch() {
  hatchAnimId = requestAnimationFrame(animateHatch);
  const t = performance.now() * 0.001;

  if (eggGroup) {
    // ゆりかごアニメーション
    const swayBase = Math.sin(t * 1.6) * 0.08;
    eggGroup.rotation.z = swayBase + eggShake * Math.sin(t * 12);
    eggGroup.position.y = Math.sin(t * 0.9) * 0.08;
    eggShake *= 0.88;
    eggGroup.rotation.y = t * 0.2;
  }

  // パーティクル更新
  for (let i = hatchParticles.length - 1; i >= 0; i--) {
    const p = hatchParticles[i];
    p.life += 0.035;
    p.mesh.position.addScaledVector(p.vel, 0.04);
    p.mesh.material.opacity = Math.max(0, 1 - p.life);
    if (p.life >= 1) {
      hatchScene.remove(p.mesh);
      hatchParticles.splice(i, 1);
    }
  }

  hatchRenderer.render(hatchScene, hatchCamera);
}

// ============================================================
// Phase3 + Phase4: 育成シーン（Three.js）
// ============================================================
let raiseScene, raiseCamera, raiseRenderer, raiseAnimId;
let dragonGroup = null;
let attrEffectParticles = [];
let raiseIdleTimer = null;
let trainCooldown = {};

function initRaiseScene(attr) {
  const canvas = document.getElementById('raise-canvas');
  const W = canvas.clientWidth  || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;

  if (raiseAnimId) { cancelAnimationFrame(raiseAnimId); raiseAnimId = null; }
  if (raiseRenderer) { raiseRenderer.dispose(); }

  raiseScene = new THREE.Scene();
  raiseScene.fog = new THREE.FogExp2(ATTR[attr].fogColor, 0.02);

  raiseCamera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
  raiseCamera.position.set(0, 1, 10);
  raiseCamera.lookAt(0, 0, 0);

  raiseRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  raiseRenderer.setSize(W, H);
  raiseRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  raiseRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  raiseRenderer.toneMappingExposure = 1.2;
  raiseRenderer.shadowMap.enabled = true;

  // ライト
  raiseScene.add(new THREE.AmbientLight(0x334466, 0.7));
  const spot = new THREE.SpotLight(hexToThreeColor(ATTR[attr].color), 2.5, 30, Math.PI/5, 0.5);
  spot.position.set(0, 10, 6);
  spot.castShadow = true;
  raiseScene.add(spot);
  const pt = new THREE.PointLight(0x112244, 0.6, 20);
  pt.position.set(-5, 2, -3);
  raiseScene.add(pt);

  createStarField(raiseScene);
  buildDragonModel(attr, state.stage);
  updateRaiseUI();
  animateRaise();

  // 放置タイマー
  clearInterval(raiseIdleTimer);
  raiseIdleTimer = setInterval(() => {
    if (state.stage === 'baby') {
      addGrowthPt(1);
    }
  }, RAISE_IDLE);

  setupRaiseButtons(attr);
  updateRaiseUI();

  window.addEventListener('resize', () => {
    if (!raiseRenderer) return;
    const W2 = canvas.clientWidth  || window.innerWidth;
    const H2 = canvas.clientHeight || window.innerHeight;
    raiseCamera.aspect = W2 / H2;
    raiseCamera.updateProjectionMatrix();
    raiseRenderer.setSize(W2, H2);
  });
}

// ---- ドラゴンモデル（ボクセル） ----
function buildDragonModel(attr, stage) {
  if (dragonGroup) raiseScene.remove(dragonGroup);
  attrEffectParticles = [];
  dragonGroup = stage === 'baby'
    ? buildBabyDragon(attr)
    : buildAdultDragon(attr);
  raiseScene.add(dragonGroup);
}

// 幼体：ずんぐりかわいい
function buildBabyDragon(attr) {
  const g = new THREE.Group();
  const c  = ATTR[attr].color;
  const em = ATTR[attr].emissive;
  const bodyColor = '#1a2a1a';

  // 体（ずんぐり）
  const body = makeBox(1.8, 1.4, 1.4, bodyColor, em, 0.15);
  body.position.y = 0;
  g.add(body);

  // 頭（大きめ）
  const head = makeBox(1.5, 1.5, 1.3, bodyColor, em, 0.15);
  head.position.set(0, 1.2, 0.2);
  g.add(head);

  // 目（大きくてかわいい）
  [[-0.35, 0], [0.35, 0]].forEach(([x]) => {
    const eye = makeBox(0.28, 0.28, 0.15, c, em, 1.0);
    eye.position.set(x, 1.3, 0.8);
    g.add(eye);
    // 瞳
    const pupil = makeBox(0.14, 0.14, 0.1, '#000000', '#000000', 0);
    pupil.position.set(x, 1.28, 0.88);
    g.add(pupil);
  });

  // 鼻
  const nose = makeBox(0.18, 0.18, 0.12, c, em, 0.8);
  nose.position.set(0, 0.95, 0.88);
  g.add(nose);

  // 翼（ちっちゃい）
  [[-1.2, 0], [1.2, 0]].forEach(([x]) => {
    const wing = makeBox(0.12, 0.6, 0.7, c, em, 0.5);
    wing.position.set(x, 0.3, -0.2);
    wing.rotation.z = x < 0 ? 0.4 : -0.4;
    g.add(wing);
  });

  // 尻尾
  const tail1 = makeBox(0.5, 0.5, 0.5, bodyColor, em, 0.1);
  tail1.position.set(0, -0.6, -0.9);
  g.add(tail1);
  const tail2 = makeBox(0.35, 0.35, 0.35, bodyColor, em, 0.1);
  tail2.position.set(0, -0.9, -1.4);
  g.add(tail2);
  const tailTip = makeBox(0.2, 0.2, 0.2, c, em, 0.6);
  tailTip.position.set(0, -1.1, -1.8);
  g.add(tailTip);

  // 足
  [[-0.6, -0.9, 0.3], [0.6, -0.9, 0.3], [-0.5, -0.9, -0.4], [0.5, -0.9, -0.4]].forEach(([x,y,z]) => {
    const leg = makeBox(0.35, 0.5, 0.35, bodyColor, em, 0.1);
    leg.position.set(x, y, z);
    g.add(leg);
  });

  // 属性エフェクト
  addAttrEffect(g, attr, 'baby');
  return g;
}

// 成体：シャープでかっこいい
function buildAdultDragon(attr) {
  const g = new THREE.Group();
  const c  = ATTR[attr].color;
  const em = ATTR[attr].emissive;
  const bodyColor = '#0d1a0d';
  const scaleColor = c;

  // 体（横長・シャープ）
  const body = makeBox(2.6, 1.2, 1.8, bodyColor, em, 0.2);
  g.add(body);

  // 頸
  const neck = makeBox(0.8, 1.4, 0.8, bodyColor, em, 0.2);
  neck.position.set(0, 1.0, 0.5);
  neck.rotation.x = -0.3;
  g.add(neck);

  // 頭（鋭い）
  const head = makeBox(1.0, 0.9, 1.4, bodyColor, em, 0.2);
  head.position.set(0, 1.9, 1.0);
  g.add(head);

  // 角
  [[-0.25, 2.5, 0.6], [0.25, 2.5, 0.6]].forEach(([x,y,z]) => {
    const horn = makeBox(0.12, 0.7, 0.12, scaleColor, em, 0.9);
    horn.position.set(x, y, z);
    horn.rotation.x = -0.3;
    g.add(horn);
  });

  // 目（鋭い・細め）
  [[-0.28, 0], [0.28, 0]].forEach(([x]) => {
    const eye = makeBox(0.22, 0.15, 0.12, c, em, 1.2);
    eye.position.set(x, 1.92, 1.65);
    g.add(eye);
  });

  // 鼻孔
  [[-0.15, 0], [0.15, 0]].forEach(([x]) => {
    const nostril = makeBox(0.1, 0.08, 0.1, c, em, 0.6);
    nostril.position.set(x, 1.65, 1.72);
    g.add(nostril);
  });

  // 大きな翼（シャープ）
  [[-1, 0], [1, 0]].forEach(([side]) => {
    const wingBase = makeBox(0.2, 1.2, 2.0, c, em, 0.4);
    wingBase.position.set(side * 1.8, 0.8, -0.3);
    wingBase.rotation.z = side * 0.5;
    wingBase.rotation.x = 0.15;
    g.add(wingBase);

    const wingTip = makeBox(0.12, 0.7, 1.4, c, em, 0.6);
    wingTip.position.set(side * 2.9, 1.6, -0.5);
    wingTip.rotation.z = side * 0.9;
    wingTip.rotation.x = 0.2;
    g.add(wingTip);

    // 翼膜風ボクセル
    for (let j = 0; j < 3; j++) {
      const mem = makeBox(0.08, 0.5 - j*0.1, 0.4, bodyColor, em, 0.05);
      mem.position.set(side * (2.1 + j*0.4), 0.5 - j*0.1, -0.2 - j*0.1);
      mem.rotation.z = side * (0.6 + j*0.2);
      g.add(mem);
    }
  });

  // 尻尾（長め）
  const tailSegs = [
    { p: [0, -0.4, -1.3], s: [0.8, 0.7, 0.7] },
    { p: [0, -0.7, -2.1], s: [0.6, 0.55, 0.55] },
    { p: [0.3, -1.0, -2.8], s: [0.45, 0.4, 0.4] },
    { p: [0.7, -1.2, -3.3], s: [0.3, 0.3, 0.3] },
  ];
  tailSegs.forEach(({p, s}) => {
    const seg = makeBox(s[0], s[1], s[2], bodyColor, em, 0.15);
    seg.position.set(...p);
    g.add(seg);
  });
  const tailTip = makeBox(0.2, 0.35, 0.35, scaleColor, em, 0.8);
  tailTip.position.set(1.0, -1.4, -3.6);
  g.add(tailTip);

  // 足（しっかり）
  [[-0.9,-0.85,0.6],[0.9,-0.85,0.6],[-0.8,-0.85,-0.7],[0.8,-0.85,-0.7]].forEach(([x,y,z]) => {
    const leg = makeBox(0.4, 0.8, 0.4, bodyColor, em, 0.15);
    leg.position.set(x, y, z);
    g.add(leg);
    const claw = makeBox(0.45, 0.15, 0.5, scaleColor, em, 0.5);
    claw.position.set(x, y-0.46, z+0.1);
    g.add(claw);
  });

  // 背びれ
  for (let i = 0; i < 5; i++) {
    const spine = makeBox(0.12, 0.4 + i*0.08, 0.12, scaleColor, em, 0.7);
    spine.position.set(0, 0.7 + (i*0.04), -0.3 + i*0.3);
    g.add(spine);
  }

  // 属性エフェクト
  addAttrEffect(g, attr, 'adult');
  return g;
}

// 属性ごとのエフェクトパーティクル
function addAttrEffect(group, attr, stage) {
  const c = hexToThreeColor(ATTR[attr].color);
  const count = stage === 'adult' ? 30 : 20;
  for (let i = 0; i < count; i++) {
    const size = 0.06 + Math.random() * 0.08;
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(geo, mat);
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.8 + Math.random() * (stage === 'adult' ? 2.0 : 1.0);
    mesh.position.set(
      Math.cos(angle) * radius,
      (Math.random() - .5) * (stage === 'adult' ? 3 : 2),
      Math.sin(angle) * radius
    );
    mesh.userData = {
      baseAngle: angle, radius,
      speed: 0.3 + Math.random() * 0.5,
      yOffset: Math.random() * Math.PI * 2,
      ySpeed: 0.5 + Math.random() * 0.5,
    };
    group.add(mesh);
    attrEffectParticles.push(mesh);
  }
}

// ---- 育成UI ----
function setupRaiseButtons(attr) {
  const btnFeed    = document.getElementById('btn-feed');
  const btnTrainAtk= document.getElementById('btn-train-atk');
  const btnTrainDef= document.getElementById('btn-train-def');
  const btnTrainSpd= document.getElementById('btn-train-spd');
  const btnBattle  = document.getElementById('btn-go-battle');

  btnFeed.onclick     = () => doAction('feed');
  btnTrainAtk.onclick = () => doAction('train-atk');
  btnTrainDef.onclick = () => doAction('train-def');
  btnTrainSpd.onclick = () => doAction('train-spd');
  btnBattle.onclick   = () => {
    showScreen('battle');
    initBattleScene(attr);
  };
}

function doAction(type) {
  const now = Date.now();
  const cd = trainCooldown[type] || 0;
  if (now - cd < TRAIN_CD) {
    const remaining = Math.ceil((TRAIN_CD - (now - cd)) / 1000);
    showActionFeedback(`あと${remaining}秒待ってね`);
    return;
  }
  trainCooldown[type] = now;

  let growPt = 0;
  switch (type) {
    case 'feed':      state.stats.hp   += 5; growPt = 1; break;
    case 'train-atk': state.stats.atk  += 2; growPt = 3; break;
    case 'train-def': state.stats.def  += 2; growPt = 3; break;
    case 'train-spd': state.stats.spd  += 2; growPt = 3; break;
  }

  showActionFeedback(getActionEmoji(type));
  addGrowthPt(growPt);
  updateRaiseUI();
  saveGame();
}

function getActionEmoji(type) {
  return { feed: '🍖 おいしい！', 'train-atk': '⚔️ ATK UP!', 'train-def': '🛡️ DEF UP!', 'train-spd': '🏃 SPD UP!' }[type] || '';
}

let feedbackTimeout = null;
function showActionFeedback(msg) {
  const hint = document.querySelector('.hatch-center-hint') || document.createElement('div');
  // 育成画面用フィードバック（簡易）
  const el = document.getElementById('action-feedback');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(feedbackTimeout);
  feedbackTimeout = setTimeout(() => { el.style.opacity = '0'; }, 1200);
}

function addGrowthPt(pt) {
  if (state.stage !== 'baby') return;
  state.growthPt = Math.min(state.growthPt + pt, RAISE_MAX);
  updateRaiseUI();
  if (state.growthPt >= RAISE_MAX) doEvolve();
}

function doEvolve() {
  clearInterval(raiseIdleTimer);
  state.stage = 'adult';
  buildDragonModel(state.attr, 'adult');
  updateRaiseUI();
  saveGame();
}

function updateRaiseUI() {
  const attr = state.attr;
  if (!attr) return;

  const label = document.getElementById('raise-attr-label');
  if (label) label.textContent = ATTR[attr].name;

  const stageLabel = document.getElementById('raise-stage-label');
  if (stageLabel) stageLabel.textContent = state.stage === 'baby' ? '幼体' : '成体';

  // ステータスバー（成体最大値を200として相対表示）
  const maxVal = 200;
  const stats = state.stats;

  const updateStat = (id, val) => {
    const bar = document.getElementById(`stat-${id}-bar`);
    const valEl = document.getElementById(`stat-${id}-val`);
    if (bar) {
      bar.style.width = Math.min(val / maxVal * 100, 100) + '%';
      bar.style.background = ATTR[attr].color;
      bar.style.boxShadow = `0 0 6px ${ATTR[attr].color}`;
    }
    if (valEl) valEl.textContent = val;
  };

  updateStat('hp',  stats.hp);
  updateStat('atk', stats.atk);
  updateStat('def', stats.def);
  updateStat('spd', stats.spd);

  // 成長ゲージ
  const fill = document.getElementById('raise-gauge-fill');
  const progress = document.getElementById('raise-stage-progress');
  if (state.stage === 'baby') {
    if (fill) {
      fill.style.width = (state.growthPt / RAISE_MAX * 100) + '%';
      fill.style.background = ATTR[attr].color;
      fill.style.boxShadow = `0 0 8px ${ATTR[attr].color}`;
    }
    if (progress) progress.textContent = `${state.growthPt} / ${RAISE_MAX}`;
  } else {
    if (fill) fill.style.width = '100%';
    if (progress) progress.textContent = '成体に進化！';
  }
}

// ---- 育成シーンアニメーション ----
function animateRaise() {
  raiseAnimId = requestAnimationFrame(animateRaise);
  const t = performance.now() * 0.001;

  if (dragonGroup) {
    // ゆっくり浮遊 + 回転
    dragonGroup.position.y = Math.sin(t * 0.8) * 0.12;
    dragonGroup.rotation.y = t * 0.25;
  }

  // 属性エフェクトパーティクル
  attrEffectParticles.forEach(p => {
    const d = p.userData;
    const angle = d.baseAngle + t * d.speed;
    p.position.x = Math.cos(angle) * d.radius;
    p.position.z = Math.sin(angle) * d.radius;
    p.position.y = Math.sin(t * d.ySpeed + d.yOffset) * 0.6 + (p.position.y * 0 || 0);
    p.material.opacity = 0.4 + Math.sin(t * 2 + d.yOffset) * 0.3;
    p.rotation.y = t * 2;
  });

  raiseRenderer.render(raiseScene, raiseCamera);
}

// ============================================================
// Phase5: バトルシーン
// ============================================================
let battleScene, battleCamera, battleRenderer, battleAnimId;
let playerDragonGroup, enemyDragonGroup;
let battleState = null;

function initBattleScene(attr) {
  const canvas = document.getElementById('battle-canvas');
  const W = canvas.clientWidth  || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;

  if (battleAnimId) { cancelAnimationFrame(battleAnimId); battleAnimId = null; }
  if (battleRenderer) { battleRenderer.dispose(); }

  battleScene = new THREE.Scene();
  battleScene.fog = new THREE.FogExp2(0x0a0010, 0.022);

  battleCamera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
  battleCamera.position.set(0, 2, 12);
  battleCamera.lookAt(0, 0, 0);

  battleRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  battleRenderer.setSize(W, H);
  battleRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  battleRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  battleRenderer.toneMappingExposure = 1.2;

  battleScene.add(new THREE.AmbientLight(0x334466, 0.6));
  const ptPlayer = new THREE.PointLight(hexToThreeColor(ATTR[attr].color), 1.5, 20);
  ptPlayer.position.set(-4, 3, 4);
  battleScene.add(ptPlayer);

  const enemyAttr = getRandomEnemyAttr(attr);
  const ptEnemy = new THREE.PointLight(hexToThreeColor(ATTR[enemyAttr].color), 1.5, 20);
  ptEnemy.position.set(4, 3, 4);
  battleScene.add(ptEnemy);

  createStarField(battleScene);

  // プレイヤードラゴン（左）
  playerDragonGroup = state.stage === 'adult' ? buildAdultDragon(attr) : buildBabyDragon(attr);
  playerDragonGroup.position.set(-4, 0, 0);
  playerDragonGroup.rotation.y = 0.6;
  playerDragonGroup.scale.setScalar(0.7);
  battleScene.add(playerDragonGroup);

  // 敵ドラゴン（右）
  enemyDragonGroup = buildAdultDragon(enemyAttr);
  enemyDragonGroup.position.set(4, 0, 0);
  enemyDragonGroup.rotation.y = -0.6;  // 左向き（プレイヤー方向）
  enemyDragonGroup.scale.setScalar(0.7);
  battleScene.add(enemyDragonGroup);

  // バトル初期化
  const enemyStats = calcEnemyStats(state.battleLevel);
  battleState = {
    playerHP: state.stats.hp,
    playerMaxHP: state.stats.hp,
    enemyHP: enemyStats.hp,
    enemyMaxHP: enemyStats.hp,
    enemyAttr,
    enemyStats,
    turn: 0,
    running: true,
    streak: state.streak,
  };

  updateBattleUI();
  document.getElementById('battle-result').classList.add('hidden');
  clearBattleLog();

  animateBattle();

  // バトル開始（少し待ってから）
  setTimeout(() => runBattleTurn(), 1000);

  window.addEventListener('resize', () => {
    if (!battleRenderer) return;
    const W2 = canvas.clientWidth  || window.innerWidth;
    const H2 = canvas.clientHeight || window.innerHeight;
    battleCamera.aspect = W2 / H2;
    battleCamera.updateProjectionMatrix();
    battleRenderer.setSize(W2, H2);
  });
}

function getRandomEnemyAttr(playerAttr) {
  const attrs = ['fire','ice','thunder','dark'];
  return attrs[Math.floor(Math.random() * attrs.length)];
}

function calcEnemyStats(level) {
  return {
    hp:  Math.round(30 * Math.pow(1.3, level - 1)),
    atk: Math.round(8  * Math.pow(1.25, level - 1)),
    def: Math.round(3  * Math.pow(1.2, level - 1)),
    spd: Math.round(5  * Math.pow(1.15, level - 1)),
  };
}

function getAttrMultiplier(attackerAttr, defenderAttr) {
  const advantage = { fire:'ice', ice:'thunder', thunder:'fire' };
  const disadvantage = { ice:'fire', thunder:'ice', fire:'thunder' };
  if (advantage[attackerAttr] === defenderAttr) return 1.5;
  if (disadvantage[attackerAttr] === defenderAttr) return 0.7;
  return 1.0;
}

function runBattleTurn() {
  if (!battleState || !battleState.running) return;

  const ps = state.stats;
  const es = battleState.enemyStats;

  // 先攻判定
  const playerFirst = ps.spd >= es.spd;

  const doAttack = (isPlayer) => {
    if (isPlayer) {
      const mult = getAttrMultiplier(state.attr, battleState.enemyAttr);
      const dmg = Math.max(1, Math.floor((ps.atk - es.def) * mult));
      battleState.enemyHP = Math.max(0, battleState.enemyHP - dmg);
      const multText = mult > 1 ? ' 🔥効果抜群！' : mult < 1 ? ' 💧いまひとつ…' : '';
      addBattleLog(`▶ ${ATTR[state.attr].name}の攻撃！ ${dmg} ダメージ${multText}`);
      flashDragon(enemyDragonGroup);
    } else {
      const mult = getAttrMultiplier(battleState.enemyAttr, state.attr);
      const dmg = Math.max(1, Math.floor((es.atk - ps.def) * mult));
      battleState.playerHP = Math.max(0, battleState.playerHP - dmg);
      const multText = mult > 1 ? ' 🔥効果抜群！' : mult < 1 ? ' 💧いまひとつ…' : '';
      addBattleLog(`◀ ${ATTR[battleState.enemyAttr].name}の攻撃！ ${dmg} ダメージ${multText}`);
      flashDragon(playerDragonGroup);
    }
    updateBattleUI();
  };

  doAttack(playerFirst);

  // 勝敗チェック
  if (checkBattleEnd()) return;

  setTimeout(() => {
    doAttack(!playerFirst);
    if (!checkBattleEnd()) {
      battleState.turn++;
      setTimeout(runBattleTurn, 1200);
    }
  }, 900);
}

function checkBattleEnd() {
  if (battleState.playerHP <= 0) {
    endBattle(false);
    return true;
  }
  if (battleState.enemyHP <= 0) {
    endBattle(true);
    return true;
  }
  return false;
}

function endBattle(win) {
  battleState.running = false;

  if (win) {
    state.streak++;
    state.totalWin++;
    state.battleLevel++;

    const battleScore = state.battleLevel * 100;
    const streakBonus = state.streak * 50;
    const statBonus = (state.stats.hp + state.stats.atk + state.stats.def + state.stats.spd) / 5;
    const gained = Math.round((battleScore + streakBonus) * (statBonus / 30));
    state.score += gained;

    addBattleLog(`--- 🏆 勝利！ +${gained}pt ---`);
    showBattleResult(true, gained);
  } else {
    addBattleLog('--- 💀 敗北… ---');
    showBattleResult(false, 0);
    state.streak = 0;
  }

  updateRecord();
  saveGame();
}

function showBattleResult(win, score) {
  const resultEl = document.getElementById('battle-result');
  const titleEl  = document.getElementById('battle-result-title');
  const scoreEl  = document.getElementById('battle-result-score');

  resultEl.classList.remove('hidden');
  titleEl.textContent = win ? '🏆 勝利！' : '💀 敗北';
  titleEl.style.color = win ? '#69f0ae' : '#ff5252';
  scoreEl.textContent = win ? `+${score} pt` : 'スコア変化なし';

  document.getElementById('btn-next-battle').onclick = () => {
    resultEl.classList.add('hidden');
    if (battleAnimId) cancelAnimationFrame(battleAnimId);
    showScreen('battle');
    initBattleScene(state.attr);
  };
  document.getElementById('btn-back-raise').onclick = () => {
    if (battleAnimId) cancelAnimationFrame(battleAnimId);
    showScreen('raise');
    initRaiseScene(state.attr);
  };
}

function updateBattleUI() {
  if (!battleState) return;
  document.getElementById('battle-player-name').textContent = ATTR[state.attr].name;
  document.getElementById('battle-enemy-name').textContent  = ATTR[battleState.enemyAttr].name + ` Lv.${state.battleLevel}`;

  const pRatio = battleState.playerHP / battleState.playerMaxHP;
  const eRatio = battleState.enemyHP  / battleState.enemyMaxHP;
  document.getElementById('battle-player-hp-bar').style.width = (pRatio * 100) + '%';
  document.getElementById('battle-enemy-hp-bar').style.width  = (eRatio * 100) + '%';
  document.getElementById('battle-player-hp-text').textContent = `${battleState.playerHP} / ${battleState.playerMaxHP}`;
  document.getElementById('battle-enemy-hp-text').textContent  = `${battleState.enemyHP} / ${battleState.enemyMaxHP}`;
}

function addBattleLog(msg) {
  const log = document.getElementById('battle-log');
  if (!log) return;
  const line = document.createElement('div');
  line.textContent = msg;
  line.className = 'fade-in';
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function clearBattleLog() {
  const log = document.getElementById('battle-log');
  if (log) log.innerHTML = '';
}

// ドラゴンをフラッシュ（被ダメ演出）
function flashDragon(group) {
  if (!group) return;
  group.children.forEach(child => {
    if (child.material) {
      const orig = child.material.emissiveIntensity || 0;
      child.material.emissiveIntensity = 2.0;
      setTimeout(() => { child.material.emissiveIntensity = orig; }, 200);
    }
  });
}

function animateBattle() {
  battleAnimId = requestAnimationFrame(animateBattle);
  const t = performance.now() * 0.001;

  if (playerDragonGroup) {
    playerDragonGroup.position.y = Math.sin(t * 1.1) * 0.1;
  }
  if (enemyDragonGroup) {
    enemyDragonGroup.position.y = Math.sin(t * 1.3 + 1) * 0.1;
  }

  battleRenderer.render(battleScene, battleCamera);
}

// ============================================================
// Phase6: スコア・記録
// ============================================================
function updateRecord() {
  const saved = loadGame();
  const bestScore = Math.max(state.score, saved.bestScore || 0);
  const bestStreak = Math.max(state.streak, saved.bestStreak || 0);
  const totalWin = Math.max(state.totalWin, saved.totalWin || 0);

  localStorage.setItem(SAVE_KEY + '_best', JSON.stringify({ bestScore, bestStreak, totalWin }));

  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('rec-best-score',  bestScore);
  el('rec-best-streak', bestStreak);
  el('rec-total-win',   totalWin);
}

// ============================================================
// セーブ / ロード
// ============================================================
function saveGame() {
  const data = {
    attr: state.attr,
    stage: state.stage,
    hatchPt: state.hatchPt,
    growthPt: state.growthPt,
    stats: state.stats,
    score: state.score,
    streak: state.streak,
    totalWin: state.totalWin,
    battleLevel: state.battleLevel,
    savedAt: Date.now(),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function loadBestRecord() {
  try {
    const raw = localStorage.getItem(SAVE_KEY + '_best');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ============================================================
// ナビゲーション
// ============================================================
document.getElementById('nav-raise').addEventListener('click', () => {
  if (state.attr) {
    showScreen('raise');
    if (!raiseRenderer) initRaiseScene(state.attr);
  }
});

document.getElementById('nav-battle').addEventListener('click', () => {
  if (state.attr) {
    showScreen('battle');
    initBattleScene(state.attr);
  }
});

document.getElementById('nav-record').addEventListener('click', () => {
  showScreen('record');
  const best = loadBestRecord();
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('rec-best-score',  best.bestScore  || 0);
  el('rec-best-streak', best.bestStreak || 0);
  el('rec-total-win',   best.totalWin   || 0);
});

document.getElementById('btn-back-from-record').addEventListener('click', () => {
  showScreen(state.attr ? 'raise' : 'select');
});

// ============================================================
// 起動：セーブデータがあれば復元
// ============================================================
(function init() {
  const saved = loadGame();
  if (saved.attr) {
    // セーブデータ復元
    Object.assign(state, {
      attr: saved.attr,
      stage: saved.stage,
      hatchPt: saved.hatchPt,
      growthPt: saved.growthPt,
      stats: saved.stats,
      score: saved.score || 0,
      streak: saved.streak || 0,
      totalWin: saved.totalWin || 0,
      battleLevel: saved.battleLevel || 1,
    });

    // 放置中の成長を計算
    if (saved.savedAt) {
      const elapsed = Date.now() - saved.savedAt;
      if (state.stage === 'egg') {
        const gained = Math.floor(elapsed / HATCH_IDLE);
        state.hatchPt = Math.min(state.hatchPt + gained, HATCH_MAX);
      } else if (state.stage === 'baby') {
        const gained = Math.floor(elapsed / RAISE_IDLE);
        state.growthPt = Math.min(state.growthPt + gained, RAISE_MAX);
        if (state.growthPt >= RAISE_MAX) state.stage = 'adult';
      }
    }

    document.documentElement.style.setProperty('--current-attr', ATTR[state.attr].color);

    if (state.stage === 'egg') {
      showScreen('hatch');
      initHatchScene(state.attr);
    } else {
      showScreen('raise');
      mainNav.classList.remove('hidden');
      initRaiseScene(state.attr);
    }
  } else {
    showScreen('select');
  }
})();

// ============================================================
// 向き検知（縦画面オーバーレイ表示）
// ============================================================
const orientOverlay = document.getElementById('orientation-overlay');

function checkOrientation() {
  const isPortrait = window.innerHeight > window.innerWidth;
  orientOverlay.classList.toggle('hidden', !isPortrait);
}

// リサイズ・画面回転で再チェック
window.addEventListener('resize', checkOrientation);
if (screen.orientation) {
  screen.orientation.addEventListener('change', () => setTimeout(checkOrientation, 150));
} else {
  window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 150));
}

// 初期チェック
checkOrientation();
