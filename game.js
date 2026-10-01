/* ============================================================
   Dragon Cradle — game.js
   画面遷移 / 3Dシーン / 孵化・育成・バトルの進行 / セーブ
   依存: THREE, balance.js, music.js, models.js
   ============================================================ */
'use strict';

const VERSION      = 'v3.2.0';
const SAVE_KEY     = 'dragon_cradle_save';
const BEST_KEY     = SAVE_KEY + '_best';
const SAVE_VERSION = 3;
const AUTO_COMMAND_DELAY     = 650;  // 自動戦闘のコマンド実行遅延(ms)
const AUTO_NEXT_BATTLE_DELAY = 2200; // 自動戦闘で次の敵へ進むまでの遅延(ms)

const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ATTR_ICON = { fire: 'i-flame', ice: 'i-snow', thunder: 'i-bolt', dark: 'i-moon' };
const STAT_LABEL = { hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD' };

// ============================================================
// 状態
// ============================================================
function freshState() {
  return {
    v: SAVE_VERSION,
    attr: null,
    stage: 'egg',          // egg | baby | adult
    hatchPt: 0,
    growthPt: 0,
    level: 1,
    exp: 0,
    trained: { hp: 0, atk: 0, def: 0, spd: 0 },
    trainCount: { atk: 0, def: 0, spd: 0 },
    dragonType: 'balanced',
    stamina: STA_MAX,
    staNext: 0,            // 次にスタミナが回復する時刻
    idleAt: Date.now(),    // 放置成長の基準時刻
    battleLevel: 1,
    score: 0,
    streak: 0,
    totalWin: 0,
    autoMode: false,
  };
}
let state = freshState();

function dragonData() {
  return { attr: state.attr, level: state.level, stage: state.stage === 'adult' ? 'adult' : 'baby', trained: state.trained };
}
const playerStats = () => calcStats(dragonData());

// ============================================================
// 3D ステージ（キャンバス・レンダラは全画面で1つを共有）
// ============================================================
const Stage = (() => {
  const canvas = $('stage');
  let renderer = null;
  let current = null;
  let last = performance.now();

  function ensure() {
    if (renderer) return renderer;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    // 画面回転では端末によってサイズの確定が遅れるため、落ち着くまで数回計算し直す
    let timers = [];
    const scheduleResize = () => {
      timers.forEach(clearTimeout);
      resize();
      requestAnimationFrame(resize);
      timers = [150, 400, 800].map(ms => setTimeout(resize, ms));
    };
    window.addEventListener('resize', scheduleResize);
    window.addEventListener('orientationchange', scheduleResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleResize);
    requestAnimationFrame(loop);
    return renderer;
  }

  function resize() {
    if (!renderer) return;
    // キャンバス自身の表示サイズを使う（回転直後の innerWidth/innerHeight の遅延に影響されにくい）
    const W = canvas.clientWidth || window.innerWidth, H = canvas.clientHeight || window.innerHeight;
    if (!W || !H) return;
    renderer.setSize(W, H, false);
    if (current) {
      current.camera.aspect = W / H;
      current.camera.updateProjectionMatrix();
      if (current.onResize) current.onResize(W, H);
    }
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!current || document.hidden) return;
    current.update(dt, now / 1000);
    renderer.render(current.scene, current.camera);
  }

  function disposeScene(s) {
    if (!s) return;
    if (s.dispose) s.dispose();
    const shared = glowTexture();
    s.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach(m => {
        ['map', 'emissiveMap'].forEach(k => { if (m[k] && m[k] !== shared) m[k].dispose(); });
        m.dispose();
      });
    });
  }

  function set(sceneObj) {
    ensure();
    disposeScene(current);
    current = sceneObj;
    resize();
    document.body.classList.add('has-stage');
  }

  function clear() {
    disposeScene(current);
    current = null;
    document.body.classList.remove('has-stage');
  }

  return { set, clear, get current() { return current; }, get canvas() { return canvas; } };
})();

// 共通ライティング
function addLights(scene, accentHex, opts = {}) {
  scene.add(new THREE.HemisphereLight(0xbfc8ff, 0x1a1420, opts.hemi ?? 0.75));
  scene.add(new THREE.AmbientLight(0x6a7088, opts.ambient ?? 0.55));
  const key = new THREE.DirectionalLight(0xfff1dc, opts.key ?? 1.0);
  key.position.set(3, 6, 5);
  scene.add(key);
  const rim = new THREE.PointLight(new THREE.Color(accentHex), opts.rim ?? 2.2, 14);
  rim.position.set(-1.5, 3, -3.5);
  scene.add(rim);
  const fill = new THREE.PointLight(0x5566aa, 0.6, 18);
  fill.position.set(-5, 2, 4);
  scene.add(fill);
  return { key, rim, fill };
}

// 汎用トゥイーン
function makeTweener() {
  const list = [];
  return {
    add(dur, fn) {
      return new Promise(resolve => list.push({ t0: performance.now(), dur, fn, resolve }));
    },
    update() {
      const now = performance.now();
      for (let i = list.length - 1; i >= 0; i--) {
        const tw = list[i];
        const p = Math.min(1, (now - tw.t0) / tw.dur);
        tw.fn(p);
        if (p >= 1) { list.splice(i, 1); tw.resolve(); }
      }
    },
  };
}
const easeOut = p => 1 - Math.pow(1 - p, 3);

// 光の粒バースト
function makeBurster(scene) {
  const parts = [];
  return {
    burst(pos, color, count = 24, speed = 3, life = 0.9, size = 0.35) {
      for (let i = 0; i < count; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture(), color: new THREE.Color(color), transparent: true,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        s.position.copy(pos);
        const sz = size * (0.5 + Math.random());
        s.scale.set(sz, sz, 1);
        const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
        scene.add(s);
        parts.push({ s, v, life, age: 0 });
      }
    },
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        p.s.position.addScaledVector(p.v, dt);
        p.v.multiplyScalar(0.94);
        p.v.y += dt * 0.8;
        p.s.material.opacity = Math.max(0, 1 - p.age / p.life);
        if (p.age >= p.life) {
          scene.remove(p.s);
          p.s.material.dispose();
          parts.splice(i, 1);
        }
      }
    },
  };
}

function hexCss(n) { return '#' + n.toString(16).padStart(6, '0'); }
function mixHex(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return '#' + ca.lerp(cb, t).getHexString();
}

// ---------------- 孵化シーン ----------------
function createHatchScene(attr) {
  const col = ATTR[attr].color;
  const scene = new THREE.Scene();
  const bg = hexCss(ATTR[attr].fogColor);
  scene.fog = new THREE.Fog(ATTR[attr].fogColor, 12, 40);
  scene.add(buildSkyDome(mixHex(bg, '#000000', 0.4), mixHex(bg, '#1a1c2e', 0.5), '#05060a'));
  createStarField(scene, 600);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 0.9, 8.2);
  camera.lookAt(0, 0.3, 0);

  addLights(scene, col, { key: 0.9, rim: 3 });
  const ground = buildGround(mixHex(bg, '#202233', 0.5), mixHex(col, '#000000', 0.6), 20);
  ground.position.y = -1.75;
  scene.add(ground);
  const ped = buildPedestal(col, 1.5);
  ped.position.y = -1.75;
  scene.add(ped);
  const shadow = buildContactShadow(3, 0.6);
  shadow.position.y = -1.74;
  scene.add(shadow);
  const motes = buildMotes(col, 90, 14, 6);
  motes.position.y = -1.7;
  scene.add(motes);

  const egg = buildEgg(attr);
  scene.add(egg);
  const fx = makeBurster(scene);

  let shake = 0, progress = 0, hatched = false, flashT = 0;

  return {
    scene, camera,
    onResize(W, H) { camera.setViewOffset(W, H, 0, H * 0.05, W, H); },
    shake(i) { shake = Math.max(shake, i); },
    setProgress(r) { progress = r; },
    tap(quality) {
      const pos = new THREE.Vector3(0, 0.4, 1.1);
      if (quality === 'perfect') fx.burst(pos, '#fff3c9', 18, 3.4, 0.8, 0.35);
      else if (quality === 'great') fx.burst(pos, col, 10, 2.6, 0.7, 0.3);
    },
    hatch() {
      hatched = true;
      flashT = 1;
      fx.burst(new THREE.Vector3(0, 0, 0), col, 70, 6, 1.6, 0.6);
      fx.burst(new THREE.Vector3(0, 0, 0), '#ffffff', 40, 4, 1.2, 0.4);
    },
    update(dt, t) {
      const sway = Math.sin(t * 1.6);
      if (!hatched) {
        egg.rotation.z = sway * 0.12 + shake * Math.sin(t * 40) * 0.08;
        egg.rotation.y = t * 0.25;
        egg.position.y = 0.05 + Math.sin(t * 0.9) * 0.06;
        shake *= Math.pow(0.02, dt);
        egg.userData.glow.material.opacity = 0.2 + progress * 0.6 + Math.abs(sway) * 0.08;
        egg.userData.shell.material.emissiveIntensity = 0.45 + progress * 0.9;
        const cr = clamp((progress - 0.55) / 0.45, 0, 1);
        egg.userData.cracks.forEach((c, i) => { c.material.opacity = clamp(cr * 6 - i, 0, 1); });
      } else {
        flashT = Math.max(0, flashT - dt * 1.4);
        egg.scale.setScalar(Math.max(0.001, 1 + (1 - flashT) * 0.6));
        egg.userData.shell.material.opacity = flashT;
        egg.userData.shell.material.transparent = true;
        egg.userData.glow.material.opacity = flashT * 1.2;
        egg.userData.cracks.forEach(c => { c.material.opacity = flashT; });
      }
      ped.userData.ring.material.opacity = 0.5 + progress * 0.5;
      animateMotes(motes, t);
      fx.update(dt);
    },
  };
}

// ---------------- 育成シーン ----------------
function createRaiseScene(attr, stage, type) {
  const col = ATTR[attr].color;
  const bgHex = hexCss(ATTR[attr].raiseBg);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(ATTR[attr].raiseBg, 14, 42);
  scene.add(buildSkyDome(mixHex(bgHex, '#000000', 0.55), mixHex(bgHex, '#11131f', 0.3), '#050608'));

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
  // 幼体は寄り、成体は引きで全身を収める
  const FRAMING = {
    baby:  { pos: new THREE.Vector3(0, 1.1, 6.4), target: new THREE.Vector3(0, 0.35, 0) },
    adult: { pos: new THREE.Vector3(0, 1.9, 10.2), target: new THREE.Vector3(0, 0.95, 0) },
  };
  const frame = f => {
    camera.position.copy(f.pos);
    if (controls) { controls.target.copy(f.target); controls.update(); }
  };
  let controls = null;
  camera.position.copy(FRAMING[stage === 'adult' ? 'adult' : 'baby'].pos);

  addLights(scene, col);
  const ground = buildGround(mixHex(bgHex, '#1c1e2c', 0.4), mixHex(col, '#000000', 0.65), 24);
  ground.position.y = -0.72;
  scene.add(ground);
  const ped = buildPedestal(col, 1.9);
  ped.position.y = -0.72;
  scene.add(ped);
  const shadow = buildContactShadow(3.4, 0.6);
  shadow.position.y = -0.71;
  scene.add(shadow);
  const motes = buildMotes(col, 120, 16, 7);
  motes.position.y = -0.7;
  scene.add(motes);
  const fx = makeBurster(scene);

  let dragon = rigDragon(buildDragon(attr, stage, type), attr);
  scene.add(dragon);

  controls = new THREE.OrbitControls(camera, Stage.canvas);
  controls.target.copy(FRAMING[stage === 'adult' ? 'adult' : 'baby'].target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;
  controls.update();
  let idleTimer = null;
  const pauseAuto = () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { controls.autoRotate = true; }, 6000);
  };
  controls.addEventListener('start', pauseAuto);

  let hop = 0, flash = 0;

  return {
    scene, camera,
    onResize(W, H) {
      // プロフィールカードとドックを避けてドラゴンを中央に
      // 要素自身の大きさから求める（ウィンドウ高さとの組み合わせがずれても破綻しない）
      const card = document.querySelector('.profile');
      const dock = document.querySelector('#screen-raise .dock');
      const cardW = card ? card.offsetLeft + card.offsetWidth : 0;
      const dockH = dock ? dock.offsetHeight + (parseFloat(getComputedStyle(dock).bottom) || 0) : 0;
      camera.setViewOffset(W, H, -clamp(cardW, 0, W * 0.4) * 0.5, clamp(dockH, 0, H * 0.4) * 0.45, W, H);
    },
    react(mult) {
      hop = 1;
      playDragonAction(dragon, 'happy');
      fx.burst(new THREE.Vector3(0, 0.6, 0), mult >= 3 ? '#fff1c4' : col, 8 + mult * 8, 2.5 + mult, 0.9, 0.3);
    },
    setDragon(newStage, newType, evolve) {
      scene.remove(dragon);
      dragon.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      dragon = rigDragon(buildDragon(attr, newStage, newType), attr);
      scene.add(dragon);
      if (newStage !== stage) { stage = newStage; frame(FRAMING[stage === 'adult' ? 'adult' : 'baby']); }
      if (evolve) {
        flash = 1;
        playDragonAction(dragon, 'roar');
        fx.burst(new THREE.Vector3(0, 0.8, 0), '#ffffff', 50, 5, 1.4, 0.5);
        fx.burst(new THREE.Vector3(0, 0.8, 0), col, 60, 6, 1.6, 0.5);
      }
    },
    update(dt, t) {
      controls.update();
      hop = Math.max(0, hop - dt * 2.6);
      dragon.position.y = Math.sin(t * 0.8) * 0.1 + Math.sin(hop * Math.PI) * 0.35;
      flash = Math.max(0, flash - dt * 0.8);
      setDragonFlash(dragon, flash + hop * 0.25);
      animateDragon(dragon, dt, t);
      animateMotes(motes, t);
      ped.userData.ring.material.opacity = 0.65 + Math.sin(t * 1.5) * 0.2;
      fx.update(dt);
    },
    dispose() {
      clearTimeout(idleTimer);
      controls.dispose();
    },
  };
}

// ---------------- バトルシーン ----------------
function createBattleScene(p, e) {
  const scene = new THREE.Scene();
  const bg = e.boss ? '#1c0810' : '#140c1c';
  scene.fog = new THREE.Fog(new THREE.Color(bg), 13, 40);
  scene.add(buildSkyDome(e.boss ? '#2a0a12' : '#1a1028', bg, '#050407'));

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 200);
  const big = p.stage === 'adult' || e.stage === 'adult';
  const camBase = big ? new THREE.Vector3(0, 2.1, 11.2) : new THREE.Vector3(0, 1.5, 8.6);
  const lookY = big ? 0.9 : 0.4;
  camera.position.copy(camBase);
  camera.lookAt(0, lookY, 0);

  addLights(scene, '#ffffff', { rim: 0.6 });
  const pRim = new THREE.PointLight(new THREE.Color(ATTR[p.attr].color), 2.2, 12);
  pRim.position.set(-4, 3, -2.5);
  scene.add(pRim);
  const eRim = new THREE.PointLight(new THREE.Color(e.boss ? '#ff3a4a' : ATTR[e.attr].color), e.boss ? 3.2 : 2.2, 12);
  eRim.position.set(4, 3, -2.5);
  scene.add(eRim);

  const ground = buildGround(e.boss ? '#2a1016' : '#1d1526', e.boss ? '#3a0f18' : '#2a1d36', 26);
  ground.position.y = -0.72;
  scene.add(ground);
  const motes = buildMotes(e.boss ? '#ff6a4a' : '#ffb86b', 110, 20, 7);
  motes.position.y = -0.7;
  scene.add(motes);
  const fx = makeBurster(scene);
  const tw = makeTweener();

  function makeFighter(info, x, facing, accent) {
    const g = rigDragon(buildDragon(info.attr, info.stage, info.type), info.attr);
    if (info.stage === 'adult') g.scale.setScalar(info.boss ? 1.22 : 1.05);
    else if (info.boss) g.scale.multiplyScalar(1.2);
    g.rotation.y = facing;
    scene.add(g);
    const ped = buildPedestal(accent, 1.45);
    ped.position.set(x, -0.72, 0);
    scene.add(ped);
    const sh = buildContactShadow(2.8, 0.55);
    sh.position.set(x, -0.71, 0);
    scene.add(sh);
    return { g, ped, base: new THREE.Vector3(x, 0, 0), dir: Math.sign(-x), lunge: 0, knock: 0, side: 0, sink: 0, flash: 0, phase: Math.random() * 6 };
  }
  const F = {
    player: makeFighter(p, -2.9, 0.6, ATTR[p.attr].color),
    enemy:  makeFighter(e, 2.9, -0.6, e.boss ? '#ff3a4a' : ATTR[e.attr].color),
  };

  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x8fa8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  shield.position.copy(F.player.base).add(new THREE.Vector3(0, 0.5, 0));
  scene.add(shield);
  let shieldTarget = 0, shakeAmt = 0;

  const centerOf = who => F[who].g.position.clone().add(new THREE.Vector3(0, F[who].g.userData.stage === 'adult' ? 1.0 : 0.5, 0));

  return {
    scene, camera,
    onResize(W, H) {
      // 上部HUDと下部コマンドの間に収まるよう、やや下へずらす
      const hud = document.querySelector('.battle-hud');
      const top = clamp(hud ? hud.offsetTop + hud.offsetHeight : H * 0.3, 0, H * 0.45);
      camera.setViewOffset(W, H, 0, -(top - H * 0.18) * 0.5, W, H);
    },
    lunge(who) {
      const f = F[who];
      playDragonAction(f.g, 'attack');
      return tw.add(340, q => { f.lunge = Math.sin(easeOut(q) * Math.PI) * 1.3; });
    },
    hit(who, strong) {
      const f = F[who];
      f.flash = 1;
      playDragonAction(f.g, 'hit');
      shakeAmt = Math.max(shakeAmt, strong ? 0.28 : 0.1);
      fx.burst(centerOf(who), who === 'enemy' ? '#fff0c0' : '#ffb0b8', strong ? 26 : 12, strong ? 5 : 3.2, 0.6, 0.32);
      return tw.add(320, q => { f.knock = Math.sin(q * Math.PI) * (strong ? 0.5 : 0.28); });
    },
    evade(who) {
      const f = F[who];
      return tw.add(420, q => { f.side = Math.sin(q * Math.PI) * 1.1; });
    },
    shield(on) { shieldTarget = on ? 0.22 : 0; },
    heal(who) { fx.burst(centerOf(who), '#7dffbf', 26, 1.6, 1.1, 0.3); },
    projectile(from, to, color) {
      const a = centerOf(from), b = centerOf(to);
      const orbs = [];
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: new THREE.Color(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        const sz = 0.9 - i * 0.1;
        s.scale.set(sz, sz, 1);
        scene.add(s);
        orbs.push(s);
      }
      return tw.add(460, q => {
        orbs.forEach((s, i) => {
          const qq = clamp(q - i * 0.035, 0, 1);
          s.position.lerpVectors(a, b, easeOut(qq));
          s.position.y += Math.sin(qq * Math.PI) * 1.1;
          s.material.opacity = q >= 1 ? 0 : 1 - i * 0.12;
        });
        if (q >= 1) orbs.forEach(s => { scene.remove(s); s.material.dispose(); });
      }).then(() => fx.burst(b, color, 40, 5.5, 0.9, 0.45));
    },
    charge(who, color) { fx.burst(centerOf(who), color, 20, 1.2, 0.8, 0.35); playDragonAction(F[who].g, 'roar'); },
    cheer(who) { playDragonAction(F[who].g, 'roar'); },
    defeat(who) {
      const f = F[who];
      return tw.add(1100, q => { f.sink = easeOut(q); });
    },
    shake(a) { shakeAmt = Math.max(shakeAmt, a); },
    screenPos(who) {
      const v = centerOf(who).add(new THREE.Vector3(0, 0.6, 0)).project(camera);
      return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight };
    },
    update(dt, t) {
      tw.update();
      Object.keys(F).forEach(k => {
        const f = F[k];
        f.flash = Math.max(0, f.flash - dt * 4);
        f.g.position.set(
          f.base.x + f.dir * (f.lunge - f.knock),
          Math.sin(t * 1.2 + f.phase) * 0.1 - f.sink * 1.2,
          f.base.z + f.side
        );
        f.g.rotation.z = f.sink * f.dir * -0.6;
        setDragonFlash(f.g, f.flash);
        animateDragon(f.g, dt, t);
        f.ped.userData.ring.material.opacity = 0.6 + Math.sin(t * 2 + f.phase) * 0.25;
      });
      shield.material.opacity += (shieldTarget - shield.material.opacity) * Math.min(1, dt * 10);
      shield.scale.setScalar(1 + Math.sin(t * 6) * 0.02);
      shakeAmt *= Math.pow(0.004, dt);
      camera.position.set(
        camBase.x + Math.sin(t * 0.2) * 0.35 + (Math.random() - 0.5) * shakeAmt,
        camBase.y + (Math.random() - 0.5) * shakeAmt,
        camBase.z
      );
      camera.lookAt(0, lookY, 0);
      animateMotes(motes, t);
      fx.update(dt);
    },
  };
}

// ============================================================
// 画面管理
// ============================================================
const screens = {};
['select', 'hatch', 'raise', 'battle', 'record'].forEach(id => { screens[id] = $('screen-' + id); });
const mainNav = $('main-nav');
let currentScreen = 'select';

function showScreen(name) {
  if (currentScreen === 'battle' && name !== 'battle') abandonBattle();
  currentScreen = name;
  Object.keys(screens).forEach(k => screens[k].classList.toggle('active', k === name));
  mainNav.classList.toggle('hidden', !['raise', 'battle', 'record'].includes(name));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.screen === name));

  if (name === 'select') { Stage.clear(); Music.play('title'); }
  else if (name === 'hatch') Music.play('hatch', { intensity: state.hatchPt / HATCH_MAX });
  else if (name === 'raise' || name === 'record') Music.play('raise', { attr: state.attr, adult: state.stage === 'adult' });
}

function applyAttrTheme(attr) {
  document.documentElement.style.setProperty('--current-attr', attr ? ATTR[attr].color : '#e6c47a');
}

function setSigil(el, attr) {
  if (!el) return;
  el.style.setProperty('--c', ATTR[attr].color);
  el.innerHTML = `<svg><use href="#${ATTR_ICON[attr]}"/></svg>`;
}

let toastTimer = null;
function toast(msg, kind = '') {
  const el = $('action-feedback');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast' + (kind ? ' ' + kind : ''); }, 1500);
}

// ============================================================
// 属性選択
// ============================================================
function initSelectScreen() {
  document.querySelectorAll('[data-version]').forEach(el => { el.textContent = VERSION; });
  const norm = { hp: 90, atk: 20, def: 18, spd: 22 };
  document.querySelectorAll('.attr-card').forEach(card => {
    const attr = card.dataset.attr;
    const box = card.querySelector('[data-mini-stats]');
    const s = BASE_STATS[attr];
    box.innerHTML = Object.keys(STAT_LABEL).map(k =>
      `<span>${STAT_LABEL[k]}</span><i style="--w:${Math.round(Math.min(1, s[k] / norm[k]) * 100)}%"></i>`
    ).join('');
    card.addEventListener('click', () => { Music.unlock(); Music.sfx('select'); selectAttr(attr); });
  });
}

function selectAttr(attr) {
  const keepAuto = state.autoMode;
  state = freshState();
  state.attr = attr;
  state.autoMode = keepAuto;
  applyAttrTheme(attr);
  saveGame();
  enterHatch();
}

// ============================================================
// 孵化
// ============================================================
let hatchScene = null;
let hatchCombo = 0;
let hatching = false;

function enterHatch() {
  hatching = false;
  hatchCombo = 0;
  hatchScene = createHatchScene(state.attr);
  Stage.set(hatchScene);
  $('hatch-attr-label').textContent = ATTR[state.attr].name + 'の卵';
  updateHatchUI();
  showScreen('hatch');
  requestAnimationFrame(animateTimingBar);
}

function animateTimingBar() {
  if (currentScreen !== 'hatch') return;
  const sway = Math.abs(Math.sin(performance.now() * 0.001 * 1.6));
  $('hatch-timing-bar').style.left = (sway * 100) + '%';
  requestAnimationFrame(animateTimingBar);
}

// 卵の揺れ(|sin|)のピーク付近でタップすると PERFECT
function evalHatchTiming() {
  const sway = Math.abs(Math.sin(performance.now() * 0.001 * 1.6));
  if (sway >= 0.85) return 'perfect';
  if (sway >= 0.55) return 'great';
  return 'normal';
}

function onHatchTap() {
  if (state.stage !== 'egg' || hatching) return;
  Music.unlock();
  const q = evalHatchTiming();
  let pts;
  if (q === 'perfect') { hatchCombo++; pts = 9 + Math.min(hatchCombo - 1, 3) * 2; }
  else if (q === 'great') { hatchCombo = 0; pts = 5; }
  else { hatchCombo = 0; pts = 2; }
  const label = q === 'perfect' ? (hatchCombo > 1 ? `PERFECT ×${hatchCombo}` : 'PERFECT') : q === 'great' ? 'GREAT' : 'TAP';
  const el = $('hatch-tap-result');
  el.textContent = label;
  el.className = 'tap-result tap-' + q;
  void el.offsetWidth;
  el.classList.add('show');
  Music.sfx('tap', { quality: q });
  hatchScene.shake(q === 'perfect' ? 1 : q === 'great' ? 0.6 : 0.3);
  hatchScene.tap(q);
  addHatchPt(pts);
}

function addHatchPt(pt) {
  if (state.stage !== 'egg') return;
  state.hatchPt = Math.min(HATCH_MAX, state.hatchPt + pt);
  updateHatchUI();
  if (state.hatchPt >= HATCH_MAX) doHatch();
  else saveGame();
}

function updateHatchUI() {
  const r = state.hatchPt / HATCH_MAX;
  $('hatch-gauge-fill').style.width = (r * 100) + '%';
  $('hatch-gauge-text').textContent = Math.floor(r * 100) + '%';
  if (hatchScene) hatchScene.setProgress(r);
  if (currentScreen === 'hatch') Music.set({ intensity: r });
}

function doHatch() {
  if (hatching) return;
  if (!hatchScene || currentScreen !== 'hatch') {
    // 放置中に孵化していた（起動時の時刻差計算）
    state.stage = 'baby';
    state.idleAt = Date.now();
    return;
  }
  hatching = true;
  Music.stinger('hatch');
  hatchScene.hatch();
  setTimeout(() => {
    state.stage = 'baby';
    state.idleAt = Date.now();
    saveGame();
    enterRaise();
    toast('孵化した！', 'critical');
  }, 2000);
}

// ============================================================
// 育成
// ============================================================
let raiseScene = null;

function enterRaise() {
  raiseScene = createRaiseScene(state.attr, state.stage, state.dragonType);
  Stage.set(raiseScene);
  setSigil($('raise-sigil'), state.attr);
  showScreen('raise');
  updateRaiseUI();
  if (pendingStatBump) {
    const stats = pendingStatBump;
    pendingStatBump = null;
    stats.forEach((k, i) => setTimeout(() => bumpStat(k), 400 + i * 120));
  }
}

const TRAIN_BUTTONS = { 'btn-feed': 'feed', 'btn-train-atk': 'train-atk', 'btn-train-def': 'train-def', 'btn-train-spd': 'train-spd' };

function doAction(type) {
  Music.unlock();
  tickTimers();
  if (state.stamina <= 0) {
    Music.sfx('nostamina');
    toast('スタミナ切れ — 勝利か時間経過で回復');
    return;
  }
  if (state.stamina >= STA_MAX) state.staNext = Date.now() + STA_RECOVER_MS;
  state.stamina--;

  const t = TRAINING[type];
  const mult = rollTrainingMult();
  const gain = calcTrainingGain(type, state.trained, state.level, mult);
  state.trained[t.stat] += gain;
  if (t.stat !== 'hp') state.trainCount[t.stat]++;

  const prevType = state.dragonType;
  state.dragonType = decideDragonType(state.trainCount);

  const head = mult >= 3 ? '大成功！ ' : mult >= 2 ? '成功！ ' : '';
  toast(`${head}${STAT_LABEL[t.stat]} +${gain}`, mult >= 3 ? 'critical' : '');
  Music.sfx(type === 'feed' ? 'feed' : 'train', { mult });
  if (type === 'feed' && mult > 1) Music.sfx('train', { mult });
  bumpStat(t.stat);
  raiseScene.react(mult);

  addGrowth(t.growth);
  if (state.dragonType !== prevType && state.stage === 'adult') {
    raiseScene.setDragon('adult', state.dragonType, false);
    setTimeout(() => toast(`${DRAGON_TYPES[state.dragonType].label}に変化した`), 900);
  }
  updateRaiseUI();
  saveGame();
}

function bumpStat(stat) {
  const row = document.querySelector(`.stat-row[data-stat="${stat}"]`);
  if (!row) return;
  row.classList.remove('bump');
  void row.offsetWidth;
  row.classList.add('bump');
}

function addGrowth(pt) {
  if (state.stage !== 'baby') return;
  state.growthPt = Math.min(RAISE_MAX, state.growthPt + pt);
  if (state.growthPt >= RAISE_MAX) doEvolve();
}

function doEvolve() {
  state.stage = 'adult';
  saveGame();
  Music.stinger('evolve');
  Music.set({ adult: true });
  if (raiseScene && Stage.current === raiseScene) {
    raiseScene.setDragon('adult', state.dragonType, true);
    setTimeout(() => toast('成体に進化した！', 'critical'), 400);
  }
  updateRaiseUI();
}

function updateRaiseUI() {
  if (!state.attr || state.stage === 'egg') return;
  const s = playerStats();
  $('raise-attr-label').textContent = ATTR[state.attr].name;
  $('raise-stage-label').textContent = (state.stage === 'adult' ? '成体' : '幼体') + ' ・ ' + ATTR[state.attr].role;
  $('raise-level').textContent = state.level;

  const need = expToNext(state.level);
  $('raise-exp-text').textContent = state.level >= LEVEL_MAX ? 'MAX' : `${state.exp} / ${need}`;
  $('raise-exp-fill').style.width = (state.level >= LEVEL_MAX ? 100 : state.exp / need * 100) + '%';

  if (state.stage === 'baby') {
    $('raise-stage-progress').textContent = `${state.growthPt} / ${RAISE_MAX}`;
    $('raise-gauge-fill').style.width = (state.growthPt / RAISE_MAX * 100) + '%';
  } else {
    $('raise-stage-progress').textContent = '成体';
    $('raise-gauge-fill').style.width = '100%';
  }

  // ステータスバー：形（得意・不得意）が分かるよう HP は 1/4 換算で相対表示
  const norm = { hp: s.hp / 4, atk: s.atk, def: s.def, spd: s.spd };
  const maxN = Math.max(...Object.values(norm)) * 1.1;
  Object.keys(STAT_LABEL).forEach(k => {
    $(`stat-${k}-bar`).style.width = (norm[k] / maxN * 100) + '%';
    $(`stat-${k}-val`).textContent = s[k];
  });

  const ty = DRAGON_TYPES[state.dragonType];
  $('dragon-type-label').textContent = `${ty.label} ／ ${ty.special}`;
  $('dragon-special-label').textContent = ty.desc;

  // 鍛錬ボタン：次の上昇量（通常時）を表示。効率が落ちたら Lv を上げる合図
  Object.entries(TRAIN_BUTTONS).forEach(([id, type]) => {
    const t = TRAINING[type];
    const g = calcTrainingGain(type, state.trained, state.level, 1);
    const eff = trainingEfficiency(t.stat, state.trained[t.stat], state.level);
    const el = document.querySelector(`[data-gain="${type}"]`);
    if (el) el.textContent = `${STAT_LABEL[t.stat]} +${g}${eff < 0.6 ? ' ・ 頭打ち' : ''}`;
  });

  const lv = state.battleLevel;
  $('next-enemy-label').textContent = (isBossLevel(lv) ? 'BOSS ' : '') + 'Lv.' + lv;
  updateStaminaUI();
}

function updateStaminaUI() {
  const wrap = $('stamina-dots');
  if (wrap.children.length !== STA_MAX) {
    wrap.innerHTML = '';
    for (let i = 0; i < STA_MAX; i++) wrap.appendChild(document.createElement('i')).className = 'pip';
  }
  [...wrap.children].forEach((d, i) => d.classList.toggle('filled', i < state.stamina));
  const timeEl = $('sta-recover-time');
  if (state.stamina >= STA_MAX || !state.staNext) timeEl.textContent = 'FULL';
  else {
    const rem = Math.max(0, Math.ceil((state.staNext - Date.now()) / 1000));
    timeEl.textContent = `+1 in ${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`;
  }
  Object.keys(TRAIN_BUTTONS).forEach(id => { $(id).disabled = state.stamina <= 0; });
}

// スタミナ回復・放置成長（オフライン中も含めて時刻差で計算）
function tickTimers() {
  const now = Date.now();
  if (state.stamina < STA_MAX) {
    if (!state.staNext) state.staNext = now + STA_RECOVER_MS;
    while (state.stamina < STA_MAX && now >= state.staNext) {
      state.stamina++;
      state.staNext += STA_RECOVER_MS;
    }
    if (state.stamina >= STA_MAX) state.staNext = 0;
  }
  const interval = state.stage === 'egg' ? HATCH_IDLE : state.stage === 'baby' ? RAISE_IDLE : 0;
  if (!interval) { state.idleAt = now; return; }
  const n = Math.floor((now - (state.idleAt || now)) / interval);
  if (n > 0) {
    state.idleAt += n * interval;
    if (state.stage === 'egg' && !hatching) addHatchPt(Math.min(n, HATCH_MAX));
    else if (state.stage === 'baby') { addGrowth(n); updateRaiseUI(); }
  }
}

// ============================================================
// バトル
// ============================================================
let battle = null;       // balance.js のバトル状態
let battleScene = null;
let battleId = 0;        // 非同期演出の世代管理（画面を離れたら古い演出を無効化）
let battleBusy = false;

function startBattle() {
  if (!state.attr || state.stage === 'egg') return;
  const id = ++battleId;
  const level = state.battleLevel;
  const eAttr = pickEnemyAttr(level);
  const eStats = calcEnemyStats(level, eAttr);
  const pStats = playerStats();
  battle = createBattle(
    { attr: state.attr, type: state.dragonType, stats: pStats },
    { attr: eAttr, level, stats: eStats },
  );
  battleScene = createBattleScene(
    { attr: state.attr, stage: state.stage === 'adult' ? 'adult' : 'baby', type: state.dragonType },
    { attr: eAttr, stage: eStats.stage, type: level % 4 === 0 ? 'attacker' : 'balanced', boss: eStats.boss },
  );
  Stage.set(battleScene);
  battleBusy = true;

  setSigil($('bp-sigil'), state.attr);
  setSigil($('be-sigil'), eAttr);
  $('battle-player-name').textContent = ATTR[state.attr].name;
  $('battle-player-lv').textContent = 'Lv.' + state.level;
  $('battle-enemy-name').textContent = (eStats.boss ? '主・' : '野生の') + ATTR[eAttr].name;
  const elv = $('battle-enemy-lv');
  elv.textContent = (eStats.boss ? 'BOSS ' : '') + 'Lv.' + level;
  elv.classList.toggle('boss', eStats.boss);
  $('battle-log').innerHTML = '';
  $('battle-result').classList.add('hidden');
  $('battle-commands').classList.add('hidden');
  $('damage-layer').innerHTML = '';
  updateBattleUI();
  updateAutoButton();

  showScreen('battle');
  Music.play('battle', { boss: eStats.boss, intensity: 0.2, climax: false, danger: 0, tension: 0 });
  showBanner(eStats.boss ? 'Boss Battle' : 'Battle', eStats.boss ? `Lv.${level} ${ATTR[eAttr].short}の主` : `Lv.${level}`, eStats.boss);
  const mult = getAttrMultiplier(state.attr, eAttr);
  if (mult > 1) log(`相性有利 — ${ATTR[eAttr].short}に強い`, 'good');
  else if (mult < 1) log(`相性不利 — ${ATTR[eAttr].short}に弱い`, 'bad');

  setTimeout(() => { if (id === battleId) beginTurn(); }, 1500);
}

function showBanner(eyebrow, title, boss) {
  const el = $('battle-banner');
  el.innerHTML = `<span class="b-eyebrow">${eyebrow}</span><span class="b-title">${title}</span>`;
  el.className = 'banner' + (boss ? ' boss' : '');
  void el.offsetWidth;
  el.classList.add('show');
}

function beginTurn() {
  if (!battle || battle.over) return;
  const id = battleId;
  battleBusy = false;
  updateBattleUI();
  const heavy = battle.intent === 'heavy';
  Music.set({ tension: heavy ? 1 : 0 });
  if (heavy) {
    Music.sfx('charge');
    battleScene.charge('enemy', '#ff4455');
  }
  $('battle-commands').classList.remove('hidden');
  $('cmd-special').disabled = !canSpecial(battle);
  $('cmd-guard').classList.toggle('suggest', heavy);
  if (state.autoMode) {
    setTimeout(() => {
      if (id !== battleId || battleBusy || !state.autoMode || !battle || battle.over) return;
      choose(autoCommand(battle));
    }, AUTO_COMMAND_DELAY);
  }
}

async function choose(cmd) {
  if (!battle || battle.over || battleBusy) return;
  Music.unlock();
  battleBusy = true;
  const id = battleId;
  $('battle-commands').classList.add('hidden');
  const events = resolveTurn(battle, cmd);
  await playEvents(events, id);
  if (id !== battleId) return;
  battleScene.shield(false);
  updateBattleMusic();
  if (battle.over) finishBattle(battle.winner === 'player', id);
  else beginTurn();
}

async function playEvents(events, id) {
  for (const ev of events) {
    if (id !== battleId) return;
    switch (ev.type) {
      case 'action':
        if (ev.who === 'player') {
          if (ev.cmd === 'guard') {
            battleScene.shield(true);
            Music.sfx('guard');
            log('守りの構え');
            await wait(320);
          } else if (ev.cmd === 'special') {
            const sp = DRAGON_TYPES[ev.special].special;
            log(`${sp}！`, 'gold');
            Music.sfx('special');
            battleScene.charge('player', ATTR[state.attr].color);
            if (ev.special === 'tank') battleScene.shield(true);
            await wait(260);
            await battleScene.projectile('player', 'enemy', ATTR[state.attr].color);
          } else {
            await battleScene.lunge('player');
          }
        } else {
          if (ev.cmd === 'heavy') log('敵の強攻撃！', 'bad');
          await battleScene.lunge('enemy');
        }
        break;
      case 'damage': {
        const toEnemy = ev.target === 'enemy';
        battleScene.hit(ev.target, ev.crit || ev.heavy);
        if (toEnemy) Music.sfx('hit', { crit: ev.crit });
        else Music.sfx('hurt', { heavy: ev.heavy });
        if (ev.crit || ev.heavy) screenFlash(toEnemy ? '' : 'red');
        popNumber(ev.target, ev.amount, { crit: ev.crit, toPlayer: !toEnemy, sub: ev.attrMult > 1 ? '効果抜群' : ev.attrMult < 1 ? 'いまひとつ' : ev.guarded ? 'ガード' : '' });
        updateBattleUI();
        const tag = [ev.crit ? '会心' : '', ev.attrMult > 1 ? '効果抜群' : '', ev.attrMult < 1 ? 'いまひとつ' : '', ev.guarded ? 'ガード' : ''].filter(Boolean).join('・');
        log(`${toEnemy ? '敵に' : '自分に'} ${ev.amount} ダメージ${tag ? `（${tag}）` : ''}`, toEnemy ? '' : 'bad');
        await wait(360);
        break;
      }
      case 'evade':
        battleScene.evade(ev.target);
        Music.sfx('evade');
        popNumber(ev.target, 'MISS', { miss: true });
        log(ev.target === 'player' ? 'ひらりと回避した' : '敵に回避された', ev.target === 'player' ? 'good' : '');
        await wait(380);
        break;
      case 'heal':
        battleScene.heal(ev.target);
        Music.sfx('heal');
        popNumber(ev.target, '+' + ev.amount, { heal: true });
        updateBattleUI();
        await wait(300);
        break;
      case 'enrage':
        Music.sfx('enrage');
        showBanner('Warning', '主が激昂した', true);
        battleScene.shake(0.3);
        log('主の攻撃力が上がった！', 'bad');
        await wait(700);
        break;
    }
  }
}

function updateBattleMusic() {
  if (!battle) return;
  const pr = battle.player.hp / battle.player.maxHp;
  const er = battle.enemy.hp / battle.enemy.maxHp;
  Music.set({
    intensity: 0.3 + 0.7 * (1 - er),
    danger: pr < 0.35 ? (0.35 - pr) / 0.35 * 0.85 + 0.15 : 0,
    climax: er < 0.4 || pr < 0.35 || battle.enemy.enraged,
    tension: 0,
  });
}

function finishBattle(win, id) {
  const level = battle.enemy.level;
  const boss = battle.enemy.boss;
  const turns = battle.turn;
  const wasAuto = state.autoMode;
  Music.set({ danger: 0, tension: 0 });
  battleScene.defeat(win ? 'enemy' : 'player');
  setTimeout(() => { if (id === battleId && battleScene) battleScene.cheer(win ? 'player' : 'enemy'); }, 500);
  Music.stinger(win ? 'victory' : 'defeat');

  const rewards = [];
  const prevLevel = state.level;
  const prevStage = state.stage;
  const statsBefore = playerStats();
  let gainedExp;
  if (win) {
    state.streak++;
    state.totalWin++;
    state.battleLevel++;
    const pts = scoreForWin(level, state.streak, boss, turns);
    state.score += pts;
    gainedExp = expForWin(level, boss);
    const staBefore = state.stamina;
    state.stamina = Math.min(STA_MAX, state.stamina + STA_PER_WIN);
    if (state.stamina >= STA_MAX) state.staNext = 0;
    rewards.push(['スコア', `+${pts.toLocaleString()}`, true]);
    rewards.push(['経験値', `+${gainedExp}`]);
    if (state.stamina > staBefore) rewards.push(['スタミナ', `+${state.stamina - staBefore}`]);
    if (state.stage === 'baby') rewards.push(['成長', '+4']);
    rewards.push(['連勝', `${state.streak}`]);
  } else {
    state.streak = 0;
    gainedExp = Math.round(expForWin(level, boss) * EXP_ON_LOSE);
    rewards.push(['経験値', `+${gainedExp}`]);
  }
  gainExp(gainedExp);
  if (win) addGrowth(4);
  if (!win) rewards.push(['note', '鍛錬で能力を上げてから再挑戦しよう']);
  // レベルアップ・進化で上がった能力
  const evolved = prevStage !== 'adult' && state.stage === 'adult';
  const growth = (state.level > prevLevel || evolved)
    ? { before: statsBefore, after: playerStats(), prevLevel, level: state.level, evolved }
    : null;
  if (growth) pendingStatBump = Object.keys(STAT_LABEL).filter(k => growth.after[k] > growth.before[k]);

  updateRecord();
  saveGame();

  setTimeout(() => {
    if (id !== battleId) return;
    showBattleResult(win, boss, rewards, wasAuto && win, growth);
    if (growth) setTimeout(() => Music.stinger('levelup'), 600);
  }, 1300);
}

function gainExp(n) {
  state.exp += n;
  while (state.level < LEVEL_MAX && state.exp >= expToNext(state.level)) {
    state.exp -= expToNext(state.level);
    state.level++;
  }
  if (state.level >= LEVEL_MAX) state.exp = 0;
}

// 結果画面のレベルアップ表示（上がった能力を数字のカウントアップで見せる）
let pendingStatBump = null;
function renderLevelUp(growth) {
  const box = $('battle-levelup');
  if (!growth) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const head = growth.evolved && growth.level === growth.prevLevel
    ? `<span class="lu-badge">EVOLVED</span><span class="lu-lv">成体に進化！</span>`
    : `<span class="lu-badge">${growth.evolved ? 'LEVEL UP ・ EVOLVED' : 'LEVEL UP'}</span><span class="lu-lv">Lv ${growth.prevLevel}<i>→</i><b>${growth.level}</b></span>`;
  const cells = Object.keys(STAT_LABEL).map(k => {
    const d = growth.after[k] - growth.before[k];
    return `<div class="lu-stat${d > 0 ? ' up' : ''}"><span class="k">${STAT_LABEL[k]}</span>`
      + `<span class="v" data-from="${growth.before[k]}" data-to="${growth.after[k]}">${growth.before[k]}</span>`
      + `<span class="d">${d > 0 ? '+' + d : '±0'}</span></div>`;
  }).join('');
  box.innerHTML = `<div class="lu-head">${head}</div><div class="lu-stats">${cells}</div>`;
  box.classList.remove('hidden');
  // 少し待ってから数字をカウントアップ
  const els = [...box.querySelectorAll('.v')];
  const t0 = performance.now() + 450, dur = 700;
  const step = now => {
    const p = Math.min(1, Math.max(0, (now - t0) / dur));
    const e = 1 - Math.pow(1 - p, 3);
    els.forEach(el => {
      const a = +el.dataset.from, b = +el.dataset.to;
      el.textContent = Math.round(a + (b - a) * e);
    });
    if (p < 1 && box.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function showBattleResult(win, boss, rewards, autoNext, growth) {
  const titleEl = $('battle-result-title');
  $('battle-result-eyebrow').textContent = win ? (boss ? 'Boss Defeated' : 'Battle Won') : 'Battle Lost';
  titleEl.textContent = win ? 'Victory' : 'Defeat';
  titleEl.className = 'result-title ' + (win ? 'win' : 'lose');
  $('battle-result-rewards').innerHTML = rewards.map(([k, v, hl], i) =>
    k === 'note'
      ? `<li class="note" style="animation-delay:${i * 70}ms">${v}</li>`
      : `<li class="${hl ? 'hl' : ''}" style="animation-delay:${i * 70}ms"><span>${k}</span><span>${v}</span></li>`
  ).join('');
  renderLevelUp(growth);
  $('btn-next-battle').querySelector('.t').textContent = win ? `次へ Lv.${state.battleLevel}` : '再挑戦';
  $('battle-result').classList.remove('hidden');

  if (autoNext) {
    const id = battleId;
    setTimeout(() => {
      if (id === battleId && state.autoMode && currentScreen === 'battle') startBattle();
    }, AUTO_NEXT_BATTLE_DELAY);
  }
}

// 戦闘中に画面を離れた＝撤退（連勝は途切れる）
function abandonBattle() {
  battleId++;
  if (battle && !battle.over) {
    state.streak = 0;
    saveGame();
    setTimeout(() => toast('撤退した（連勝リセット）'), 300);
  }
  battle = null;
  battleBusy = false;
  $('battle-commands').classList.add('hidden');
  $('battle-result').classList.add('hidden');
}

function updateBattleUI() {
  if (!battle) return;
  const setHp = (who, cur, max) => {
    const r = cur / max;
    const fill = $(`battle-${who}-hp-bar`);
    fill.style.width = (r * 100) + '%';
    if (who === 'player') fill.classList.toggle('low', r < 0.3);
    $(`battle-${who}-hp-ghost`).style.width = (r * 100) + '%';
    $(`battle-${who}-hp-text`).textContent = `${cur} / ${max}`;
  };
  setHp('player', battle.player.hp, battle.player.maxHp);
  setHp('enemy', battle.enemy.hp, battle.enemy.maxHp);
  $('battle-turn').textContent = battle.turn + 1;

  const pips = $('mp-pips');
  if (pips.children.length !== MP_MAX) {
    pips.innerHTML = '';
    for (let i = 0; i < MP_MAX; i++) pips.appendChild(document.createElement('i')).className = 'mp-pip';
  }
  [...pips.children].forEach((p, i) => {
    p.classList.toggle('on', i < battle.mp);
    p.classList.toggle('ready', i < battle.mp && battle.mp >= SPECIAL_COST);
  });

  const intent = $('enemy-intent');
  if (battle.over) { intent.textContent = ''; intent.className = 'intent'; }
  else if (battle.intent === 'heavy') { intent.textContent = '力をためている — 守りで軽減'; intent.className = 'intent heavy'; }
  else { intent.textContent = battle.enemy.enraged ? '激昂中' : '様子をうかがっている'; intent.className = 'intent'; }

  const ty = DRAGON_TYPES[state.dragonType];
  $('cmd-special-name').textContent = ty.special;
  $('mp-cost-label').textContent = `MP ${SPECIAL_COST} ・ ${ty.desc.split('・')[0]}`;
}

function log(msg, kind = '') {
  const box = $('battle-log');
  const line = document.createElement('div');
  line.className = 'log-line' + (kind ? ' ' + kind : '');
  line.textContent = msg;
  box.appendChild(line);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  [...box.children].forEach((c, i, arr) => c.classList.toggle('old', i < arr.length - 1));
}

function popNumber(who, value, opts = {}) {
  if (!battleScene) return;
  const pos = battleScene.screenPos(who);
  const el = document.createElement('div');
  el.className = 'dmg' + (opts.crit ? ' crit' : '') + (opts.toPlayer ? ' to-player' : '') + (opts.heal ? ' heal' : '') + (opts.miss ? ' miss' : '');
  el.style.left = (pos.x + (Math.random() - 0.5) * 40) + 'px';
  el.style.top = pos.y + 'px';
  el.innerHTML = `${opts.crit ? '<small>CRITICAL</small>' : ''}${value}${opts.sub ? `<small>${opts.sub}</small>` : ''}`;
  $('damage-layer').appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function screenFlash(kind) {
  const el = document.createElement('div');
  el.className = 'flash-overlay' + (kind ? ' ' + kind : '');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 400);
}

function updateAutoButton() {
  $('cmd-auto').setAttribute('aria-pressed', state.autoMode ? 'true' : 'false');
}

function toggleAutoMode() {
  Music.unlock();
  Music.sfx('ui');
  state.autoMode = !state.autoMode;
  updateAutoButton();
  saveGame();
  if (state.autoMode && battle && !battle.over && !battleBusy && !$('battle-commands').classList.contains('hidden')) {
    choose(autoCommand(battle));
  }
}

// ============================================================
// 記録
// ============================================================
function loadBestRecord() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) { return {}; }
}

function updateRecord() {
  const saved = loadBestRecord();
  const best = {
    bestScore:  Math.max(state.score, saved.bestScore || 0),
    bestStreak: Math.max(state.streak, saved.bestStreak || 0),
    totalWin:   Math.max(state.totalWin, saved.totalWin || 0),
    bestLevel:  Math.max(state.battleLevel - 1, saved.bestLevel || 0),
  };
  try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch (e) { /* noop */ }
  return best;
}

let resetArmed = false;
let resetTimer = null;

function showRecord() {
  const best = updateRecord();
  $('rec-best-score').textContent = best.bestScore.toLocaleString();
  $('rec-best-streak').textContent = best.bestStreak;
  $('rec-total-win').textContent = best.totalWin;
  $('rec-best-level').textContent = best.bestLevel ? 'Lv.' + best.bestLevel : '—';
  $('rec-current').textContent = state.attr && state.stage !== 'egg'
    ? `いまの竜：${ATTR[state.attr].name} Lv.${state.level}（${state.stage === 'adult' ? '成体' : '幼体'}・${DRAGON_TYPES[state.dragonType].label}） ／ スコア ${state.score.toLocaleString()}`
    : '';
  resetArmed = false;
  $('btn-reset').textContent = '新しい卵から始める';
  $('btn-reset').classList.remove('confirm');
  showScreen('record');
}

function onReset() {
  const btn = $('btn-reset');
  if (!resetArmed) {
    resetArmed = true;
    btn.textContent = 'もう一度押すと今の竜とお別れします';
    btn.classList.add('confirm');
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetArmed = false;
      btn.textContent = '新しい卵から始める';
      btn.classList.remove('confirm');
    }, 3500);
    return;
  }
  updateRecord();
  const keepAuto = state.autoMode;
  state = freshState();
  state.autoMode = keepAuto;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
  applyAttrTheme(null);
  showScreen('select');
}

// ============================================================
// セーブ / ロード
// ============================================================
function saveGame() {
  if (!state.attr) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, savedAt: Date.now() })); } catch (e) { /* noop */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// v2 以前のセーブ（ステータス累積型）を v3（Lv＋鍛錬量）へ移行
function migrateSave(saved) {
  if (!saved || !saved.attr || !ATTR[saved.attr]) return null;
  if (saved.v === SAVE_VERSION) return Object.assign(freshState(), saved);
  const s = freshState();
  s.attr = saved.attr;
  s.stage = ['egg', 'baby', 'adult'].includes(saved.stage) ? saved.stage : 'egg';
  s.hatchPt = saved.hatchPt || 0;
  s.growthPt = Math.min(RAISE_MAX, Math.round((saved.growthPt || 0) * RAISE_MAX / 50));
  s.battleLevel = Math.max(1, Math.min(60, saved.battleLevel || 1));
  s.level = Math.max(1, s.battleLevel - 1);
  s.score = saved.score || 0;
  s.streak = saved.streak || 0;
  s.totalWin = saved.totalWin || 0;
  s.trainCount = saved.trainCount || s.trainCount;
  s.dragonType = saved.dragonType || decideDragonType(s.trainCount);
  s.stamina = Math.min(STA_MAX, saved.stamina ?? STA_MAX);
  s.idleAt = saved.savedAt || Date.now();
  if (s.stamina < STA_MAX) s.staNext = s.idleAt + STA_RECOVER_MS; // 放置中の回復も計上
  if (saved.stats) {
    const base = calcStats({ attr: s.attr, level: s.level, stage: s.stage === 'adult' ? 'adult' : 'baby', trained: {} });
    Object.keys(STAT_LABEL).forEach(k => {
      s.trained[k] = clamp(Math.round((saved.stats[k] || 0) - base[k]), 0, Math.round(trainingCap(k, s.level)));
    });
  }
  return s;
}

// ============================================================
// イベント
// ============================================================
function bindEvents() {
  Object.entries(TRAIN_BUTTONS).forEach(([id, type]) => { $(id).addEventListener('click', () => doAction(type)); });
  $('btn-go-battle').addEventListener('click', () => { Music.sfx('select'); startBattle(); });
  $('screen-hatch').addEventListener('pointerdown', onHatchTap);

  $('cmd-attack').addEventListener('click', () => choose('attack'));
  $('cmd-special').addEventListener('click', () => { if (battle && canSpecial(battle)) choose('special'); });
  $('cmd-guard').addEventListener('click', () => choose('guard'));
  $('cmd-auto').addEventListener('click', toggleAutoMode);
  $('btn-next-battle').addEventListener('click', () => { Music.sfx('select'); startBattle(); });
  $('btn-back-raise').addEventListener('click', () => { Music.sfx('ui'); enterRaise(); });

  $('nav-raise').addEventListener('click', () => {
    if (!state.attr || state.stage === 'egg' || currentScreen === 'raise') return;
    Music.sfx('ui');
    enterRaise();
  });
  $('nav-battle').addEventListener('click', () => {
    if (!state.attr || state.stage === 'egg') return;
    if (currentScreen === 'battle' && battle && !battle.over) return;
    Music.sfx('ui');
    startBattle();
  });
  $('nav-record').addEventListener('click', () => { Music.sfx('ui'); showRecord(); });
  $('btn-back-from-record').addEventListener('click', () => {
    Music.sfx('ui');
    if (state.attr && state.stage !== 'egg') enterRaise();
    else showScreen('select');
  });
  $('btn-reset').addEventListener('click', onReset);

  const soundIcon = () => { $('bgm-toggle').innerHTML = `<svg><use href="#${Music.isMuted() ? 'i-mute' : 'i-sound'}"/></svg>`; };
  $('bgm-toggle').addEventListener('click', () => { Music.unlock(); Music.toggleMute(); soundIcon(); });
  soundIcon();

  // ユーザー操作でオーディオを起動（ブラウザの自動再生制限対策）。
  // iOS はタッチの pointerdown では許可されないため、鳴り始めるまで毎回の操作で再試行する
  ['pointerup', 'touchend', 'click', 'keydown'].forEach(ev => {
    document.addEventListener(ev, () => { if (!Music.isRunning()) Music.unlock(); }, { capture: true, passive: true });
  });

  // キーボード操作（バトル：1/2/3、A=自動）
  document.addEventListener('keydown', e => {
    if (currentScreen !== 'battle') return;
    if (e.key === '1') $('cmd-attack').click();
    else if (e.key === '2') $('cmd-special').click();
    else if (e.key === '3') $('cmd-guard').click();
    else if (e.key === 'a' || e.key === 'A') toggleAutoMode();
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); else if (state.attr) tickTimers(); });

  setInterval(() => {
    if (!state.attr) return;
    tickTimers();
    if (currentScreen === 'raise') updateStaminaUI();
  }, 1000);
}

// ============================================================
// 縦画面警告
// ============================================================
const orientOverlay = $('orientation-overlay');
function checkOrientation() {
  const isPortrait = window.innerHeight > window.innerWidth && window.innerWidth < 900;
  orientOverlay.classList.toggle('hidden', !isPortrait);
}
window.addEventListener('resize', checkOrientation);
if (screen.orientation) screen.orientation.addEventListener('change', () => setTimeout(checkOrientation, 150));
else window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 150));

// ============================================================
// 起動
// ============================================================
(function init() {
  initSelectScreen();
  bindEvents();
  checkOrientation();

  const saved = migrateSave(loadGame());
  if (!saved) {
    applyAttrTheme(null);
    showScreen('select');
    return;
  }
  state = saved;
  applyAttrTheme(state.attr);
  tickTimers();  // 放置中のスタミナ回復・成長
  if (state.stage === 'egg') enterHatch();
  else enterRaise();
  saveGame();
})();
