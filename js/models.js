/* ============================================================
   Dragon Cradle — models.js
   Three.js プロシージャルモデル（卵・幼体・成体）と共通ジオメトリヘルパー
   依存: THREE, ATTR (balance.js)
   ============================================================ */
'use strict';

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
function _makeMat(color, emissiveHex, emissiveInt, extra) {
  return new THREE.MeshStandardMaterial(Object.assign({
    color: hexToThreeColor(color),
    emissive: hexToThreeColor(emissiveHex || color),
    emissiveIntensity: emissiveInt,
    metalness: 0.25,
    roughness: 0.55,
  }, extra || {}));
}
function makeSphere(r, color, emissiveHex, emissiveInt = 0.3, wSeg = 16, hSeg = 12) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, wSeg, hSeg), _makeMat(color, emissiveHex, emissiveInt));
}
function makeEllipsoid(rx, ry, rz, color, emissiveHex, emissiveInt = 0.3) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), _makeMat(color, emissiveHex, emissiveInt));
  m.scale.set(rx, ry, rz);
  return m;
}
function makeCylinder(rTop, rBot, h, color, emissiveHex, emissiveInt = 0.3, seg = 12) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), _makeMat(color, emissiveHex, emissiveInt));
}
function makeCone(r, h, color, emissiveHex, emissiveInt = 0.3, seg = 10) {
  return new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), _makeMat(color, emissiveHex, emissiveInt));
}
function makeTorus(r, tube, color, emissiveHex, emissiveInt = 0.3) {
  return new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 16), _makeMat(color, emissiveHex, emissiveInt));
}
// コウモリ翼型のポリゴンメッシュを生成（ptsは2D座標配列、XY平面）
function makeWingShape(pts, color, emissiveHex, emissiveInt = 0.3) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const mat = _makeMat(color, emissiveHex, emissiveInt);
  mat.side = THREE.DoubleSide;
  return new THREE.Mesh(geo, mat);
}

// 共通: ドラゴンウイング構築（帆型翼膜 + 骨格スパー2本）
function buildBatWing(g, side, cfg) {
  const zB = -0.12, zM = -0.15;
  // ポイント定義（右翼正x系）
  const SH  = [0.6, 0.35];   // 肩
  const EL  = [1.5, 1.2];    // 肘（上方に高く）
  const TIP = [3.2, 1.9];    // 翼先端（高く遠く）
  const SP2 = [2.8, 0.1];    // 第2スパー先端（下方外側）
  const TRL = [0.6, -0.2];   // 体側下端

  function addBone(p1, p2, rT, rB, col, em, emI) {
    const dx = p2[0]-p1[0], dy = p2[1]-p1[1];
    const len = Math.sqrt(dx*dx + dy*dy);
    const b = makeCylinder(rT, rB, len, col, em, emI);
    b.position.set(side*(p1[0]+p2[0])/2, (p1[1]+p2[1])/2, zB);
    b.rotation.z = -side * Math.atan2(dx, dy);
    g.add(b);
  }
  function addJoint(p, r, col, em, emI) {
    const j = makeSphere(r, col, em, emI);
    j.position.set(side*p[0], p[1], zB);
    g.add(j);
  }
  // 骨格: 肩→肘（上腕）
  addJoint(SH, 0.08, cfg.bc, cfg.be, cfg.bi);
  addBone(SH, EL, 0.05, 0.04, cfg.bc, cfg.be, cfg.bi);
  addJoint(EL, 0.06, cfg.bc, cfg.be, cfg.bi);
  // 肘→先端（メインスパー）
  addBone(EL, TIP, 0.04, 0.018, cfg.bc, cfg.be, cfg.bi);
  // 肘→下スパー
  addBone(EL, SP2, 0.03, 0.014, cfg.bc, cfg.be, cfg.bi);
  // 肘の鉤爪
  const claw = makeCone(0.025, 0.13, cfg.bc, cfg.be, 0.7);
  claw.position.set(side*(EL[0]+0.08), EL[1]-0.06, zB);
  claw.rotation.x = 0.4;
  claw.rotation.z = side * 0.3;
  g.add(claw);
  // 翼膜（1枚の大きな帆型 + 下縁スカラップ）
  const membrane = makeWingShape([
    SH,                         // 肩
    EL,                         // 肘
    [2.3, 1.65],                // メインスパー中間
    TIP,                        // 翼先端
    [3.1, 1.2],                 // 先端下（スカラップ山）
    [2.8, 0.55],                // スパー間（谷）
    [3.0, 0.35],                // スカラップ山
    SP2,                        // 第2スパー先端
    [2.0, -0.15],               // 下縁外（谷）
    [1.5, 0.05],                // スカラップ山
    [1.0, -0.2],                // 下縁内（谷）
    TRL,                        // 体側下端
  ], cfg.mc, cfg.me, cfg.mi);
  membrane.position.z = zM;
  if (side < 0) membrane.scale.x = -1;
  g.add(membrane);

  return {
    tip:   [side*TIP[0], TIP[1], zB-0.08],
    sp2:   [side*SP2[0], SP2[1], zB-0.08],
    elbow: [side*EL[0], EL[1], zB],
  };
}

// 幼体：まんまるスムーズちびドラゴン（属性別デザイン）
function buildBabyDragon(attr) {
  const g = new THREE.Group();
  const c  = ATTR[attr].color;
  const em = ATTR[attr].emissive;
  const bodyColor = '#1a2a1a';

  // ===== 属性別ユニーク体型（氷=ゴジラ、雷=ペガサス、闇=フード怪獣） =====

  // === 氷ベビー：チビゴジラ（二足歩行怪獣） ===
  if (attr === 'ice') {
    // 直立ボディ（ゴジラ体型：上半身が大きく下半身で支える）
    const torso = makeEllipsoid(0.7, 0.9, 0.6, bodyColor, em, 0.15);
    g.add(torso);
    const bellyPlate = makeEllipsoid(0.45, 0.65, 0.3, '#2a3a2a', em, 0.1);
    bellyPlate.position.set(0, -0.05, 0.35);
    g.add(bellyPlate);

    // 頭（ゴジラ風・角張った大きめ頭部）
    const skull = makeEllipsoid(0.55, 0.5, 0.55, bodyColor, em, 0.15);
    skull.position.set(0, 1.1, 0.1);
    g.add(skull);
    // 吻部（ゴジラのマズル — 前に長い）
    const snout = makeEllipsoid(0.35, 0.3, 0.4, bodyColor, em, 0.15);
    snout.position.set(0, 0.95, 0.5);
    g.add(snout);
    // 下顎
    const jaw = makeEllipsoid(0.3, 0.15, 0.35, bodyColor, em, 0.15);
    jaw.position.set(0, 0.78, 0.5);
    g.add(jaw);

    // 目（小さく鋭い — ゴジラの怒り目）
    [[-0.25, 0], [0.25, 0]].forEach(([x]) => {
      const eyeW = makeSphere(0.12, '#ffffff', '#ffffff', 0.3);
      eyeW.position.set(x, 1.15, 0.45);
      g.add(eyeW);
      const iris = makeSphere(0.08, '#111111', '#000000', 0);
      iris.position.set(x, 1.14, 0.53);
      g.add(iris);
      const hl = makeSphere(0.03, '#ffffff', '#ffffff', 1.0);
      hl.position.set(x + 0.03, 1.18, 0.55);
      g.add(hl);
    });

    // 鼻孔
    [[-0.08, 0], [0.08, 0]].forEach(([x]) => {
      const n = makeSphere(0.04, c, em, 0.4);
      n.position.set(x, 0.95, 0.82);
      g.add(n);
    });

    // 小さな歯（口から覗く）
    [[-0.12, 0.85, 0.72], [0.12, 0.85, 0.72], [0, 0.85, 0.78]].forEach(([x,y,z]) => {
      const tooth = makeCone(0.025, 0.08, '#e8e8e8', '#ffffff', 0.3);
      tooth.position.set(x, y, z);
      tooth.rotation.x = Math.PI;
      g.add(tooth);
    });

    // 二本の太い脚（二足歩行 — ゴジラの力強い脚）
    [[-0.35, 0], [0.35, 0]].forEach(([x]) => {
      const thigh = makeEllipsoid(0.28, 0.35, 0.28, bodyColor, em, 0.1);
      thigh.position.set(x, -0.7, 0);
      g.add(thigh);
      const foot = makeEllipsoid(0.25, 0.1, 0.3, bodyColor, em, 0.12);
      foot.position.set(x, -1.05, 0.1);
      g.add(foot);
      // 三本指
      for (let t = 0; t < 3; t++) {
        const toe = makeSphere(0.07, c, em, 0.3);
        toe.position.set(x + (t-1)*0.12, -1.1, 0.35);
        g.add(toe);
      }
    });

    // 小さな腕（T-レックス風の短い前肢）
    [[-0.55, 0], [0.55, 0]].forEach(([x]) => {
      const arm = makeEllipsoid(0.12, 0.18, 0.1, bodyColor, em, 0.1);
      arm.position.set(x, 0.15, 0.35);
      arm.rotation.z = x < 0 ? 0.4 : -0.4;
      g.add(arm);
      const cl = makeSphere(0.05, c, em, 0.3);
      cl.position.set(x + (x<0 ? -0.08 : 0.08), 0.02, 0.4);
      g.add(cl);
    });

    // 背びれ（氷の結晶ドーサルプレート — ゴジラのトレードマーク）
    for (let i = 0; i < 5; i++) {
      const pH = 0.15 + Math.sin(i / 4 * Math.PI) * 0.15;
      const plate = makeCone(0.06, pH, c, em, 0.8);
      plate.position.set(0, 1.2 - i * 0.35, -0.25 - i * 0.05);
      g.add(plate);
      if (i > 0 && i < 4) {
        [[-0.08, 0], [0.08, 0]].forEach(([sx]) => {
          const sp = makeCone(0.03, pH * 0.5, '#ffffff', '#aaddff', 0.9);
          sp.position.set(sx, 1.15 - i * 0.35, -0.3 - i * 0.05);
          g.add(sp);
        });
      }
    }

    // 尻尾（太くて重い — ゴジラの重量感）
    const t1 = makeSphere(0.25, bodyColor, em, 0.1);
    t1.position.set(0, -0.4, -0.6);
    g.add(t1);
    const t2 = makeSphere(0.18, bodyColor, em, 0.1);
    t2.position.set(0, -0.55, -1.0);
    g.add(t2);
    const t3 = makeSphere(0.12, bodyColor, em, 0.1);
    t3.position.set(0, -0.65, -1.35);
    g.add(t3);
    const tailTip = makeCone(0.06, 0.15, c, em, 1.0);
    tailTip.position.set(0, -0.6, -1.5);
    tailTip.rotation.x = 0.5;
    g.add(tailTip);

    addAttrEffect(g, attr, 'baby');
    return g;
  }

  // === 雷ベビー：チビペガサス（翼のある馬＋角から雷撃） ===
  if (attr === 'thunder') {
    // 馬体（横長の丸い体）
    const torso = makeEllipsoid(0.5, 0.5, 0.9, bodyColor, em, 0.15);
    g.add(torso);
    const bellyP = makeEllipsoid(0.35, 0.35, 0.6, '#2a3a2a', em, 0.1);
    bellyP.position.set(0, -0.15, 0);
    g.add(bellyP);

    // 首（斜め上に伸びる）
    const neck = makeEllipsoid(0.25, 0.35, 0.25, bodyColor, em, 0.15);
    neck.position.set(0, 0.5, 0.55);
    neck.rotation.x = -0.3;
    g.add(neck);

    // 頭（馬顔・丸くて可愛い）
    const head = makeEllipsoid(0.35, 0.4, 0.5, bodyColor, em, 0.15);
    head.position.set(0, 1.0, 0.65);
    g.add(head);
    // マズル
    const muzzle = makeEllipsoid(0.2, 0.2, 0.35, bodyColor, em, 0.12);
    muzzle.position.set(0, 0.85, 1.0);
    g.add(muzzle);

    // 鼻孔
    [[-0.08, 0], [0.08, 0]].forEach(([x]) => {
      const n = makeSphere(0.04, c, em, 0.5);
      n.position.set(x, 0.82, 1.28);
      g.add(n);
    });

    // 目（大きくてかわいい）
    [[-0.22, 0], [0.22, 0]].forEach(([x]) => {
      const eyeW = makeSphere(0.15, '#ffffff', '#ffffff', 0.3);
      eyeW.position.set(x, 1.1, 0.85);
      g.add(eyeW);
      const iris = makeSphere(0.1, '#111111', '#000000', 0);
      iris.position.set(x, 1.1, 0.93);
      g.add(iris);
      const hl = makeSphere(0.04, '#ffffff', '#ffffff', 1.0);
      hl.position.set(x + 0.04, 1.15, 0.96);
      g.add(hl);
    });

    // 耳（馬耳 — とがった）
    [[-0.15, 0], [0.15, 0]].forEach(([x]) => {
      const ear = makeCone(0.06, 0.2, bodyColor, em, 0.15);
      ear.position.set(x, 1.35, 0.55);
      ear.rotation.z = x < 0 ? 0.2 : -0.2;
      g.add(ear);
    });

    // 角（一角獣の角 — 雷撃の源）
    const horn = makeCone(0.05, 0.4, c, em, 1.0);
    horn.position.set(0, 1.4, 0.7);
    horn.rotation.x = -0.3;
    g.add(horn);
    const hornSpark = makeSphere(0.04, '#ffffff', c, 1.3);
    hornSpark.position.set(0, 1.72, 0.58);
    g.add(hornSpark);

    // 四本脚（馬脚＋蹄）
    [[-0.25,-0.5,0.5],[0.25,-0.5,0.5],[-0.25,-0.5,-0.5],[0.25,-0.5,-0.5]].forEach(([x,y,z]) => {
      const leg = makeCylinder(0.1, 0.08, 0.5, bodyColor, em, 0.1);
      leg.position.set(x, y, z);
      g.add(leg);
      const hoof = makeCylinder(0.1, 0.1, 0.08, c, em, 0.4);
      hoof.position.set(x, y - 0.28, z);
      g.add(hoof);
    });

    // 小さな翼（かわいいベビーウイング）
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const wing = makeEllipsoid(0.08, 0.3, 0.25, c, em, 0.4);
      wing.position.set(side * 0.55, 0.35, -0.1);
      wing.rotation.z = side * 0.4;
      g.add(wing);
      const wTip = makeSphere(0.04, '#ffffff', c, 0.9);
      wTip.position.set(side * 0.7, 0.55, -0.1);
      g.add(wTip);
    });

    // たてがみ（首に沿って光る球）
    for (let i = 0; i < 4; i++) {
      const mane = makeSphere(0.06, c, em, 0.6);
      mane.position.set(0, 1.2 - i * 0.15, 0.6 - i * 0.02);
      g.add(mane);
    }

    // 馬の尻尾（流れるような）
    const tailBase = makeSphere(0.15, bodyColor, em, 0.1);
    tailBase.position.set(0, -0.15, -0.85);
    g.add(tailBase);
    for (let i = 0; i < 3; i++) {
      const strand = makeEllipsoid(0.04, 0.2, 0.04, c, em, 0.5);
      strand.position.set((i-1)*0.06, -0.3 - i*0.05, -1.0 - i*0.05);
      g.add(strand);
    }

    // 稲妻ほっぺマーク
    [[-0.35, 0.95], [0.35, 0.95]].forEach(([x, y]) => {
      const bolt = makeCone(0.03, 0.1, c, em, 1.0);
      bolt.position.set(x, y, 0.9);
      bolt.rotation.z = 0.5;
      g.add(bolt);
    });

    addAttrEffect(g, attr, 'baby');
    return g;
  }

  // === 闇ベビー：フードをかぶった怪獣（得体の知れない存在） ===
  if (attr === 'dark') {
    // 体（マント下に隠れた不定形の胴体）
    const torso = makeEllipsoid(0.6, 0.8, 0.5, '#0a0a15', em, 0.05);
    g.add(torso);

    // マント/ローブ（大きなコーン形状で体を覆う）
    const cloak = makeCone(0.9, 1.8, '#0a0a15', em, 0.05);
    cloak.position.set(0, 0.2, 0);
    g.add(cloak);

    // フード（頭を覆う大きな丸いフード）
    const hood = makeEllipsoid(0.6, 0.55, 0.6, '#0a0a15', em, 0.08);
    hood.position.set(0, 1.2, 0.1);
    g.add(hood);
    // フードの先端（とんがり）
    const hoodPeak = makeCone(0.35, 0.5, '#0a0a15', em, 0.06);
    hoodPeak.position.set(0, 1.55, -0.05);
    g.add(hoodPeak);
    // フードの縁（前面に張り出す）
    const hoodBrim = makeEllipsoid(0.5, 0.1, 0.35, '#0a0a15', em, 0.08);
    hoodBrim.position.set(0, 1.25, 0.45);
    g.add(hoodBrim);

    // フード内部の闇（真っ暗な虚空）
    const hoodInner = makeEllipsoid(0.4, 0.35, 0.2, '#020005', '#000000', 0);
    hoodInner.position.set(0, 1.15, 0.35);
    g.add(hoodInner);

    // フード内で光る目（得体の知れない存在の証）
    [[-0.15, 0], [0.15, 0]].forEach(([x]) => {
      // 外側のグロー（ぼんやり光る）
      const eyeGlow = makeSphere(0.08, c, em, 1.5);
      eyeGlow.position.set(x, 1.15, 0.45);
      g.add(eyeGlow);
      // 中心（鋭く白く光る）
      const eyeCore = makeSphere(0.04, '#ffffff', c, 2.0);
      eyeCore.position.set(x, 1.15, 0.5);
      g.add(eyeCore);
    });

    // マントから覗く小さな手
    [[-0.45, 0], [0.45, 0]].forEach(([x]) => {
      const hand = makeSphere(0.1, bodyColor, em, 0.1);
      hand.position.set(x, 0.0, 0.3);
      g.add(hand);
      for (let f = 0; f < 3; f++) {
        const finger = makeSphere(0.03, c, em, 0.5);
        finger.position.set(x + (f-1)*0.05, -0.05, 0.38);
        g.add(finger);
      }
    });

    // マント裾（ゆらめく端 — 地面付近で散る）
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const wisp = makeEllipsoid(0.15 - i*0.01, 0.08, 0.15 - i*0.01, '#0a0a15', em, 0.03 + i*0.02);
      wisp.position.set(Math.sin(angle) * 0.4, -0.85 - i*0.03, Math.cos(angle) * 0.3);
      g.add(wisp);
    }

    // 浮遊するオーブ（周囲に漂う不気味な光）
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      const orb = makeSphere(0.04, c, em, 0.8 + i*0.1);
      orb.position.set(Math.sin(angle) * 0.8, 0.3 + Math.cos(angle*2) * 0.2, Math.cos(angle) * 0.6);
      g.add(orb);
    }

    addAttrEffect(g, attr, 'baby');
    return g;
  }

  // === 共通ベース：まんまるスムーズ体型（炎用） ===
  // 体（大きな球）
  const body = makeEllipsoid(0.85, 0.8, 0.75, bodyColor, em, 0.15);
  body.position.y = 0;
  g.add(body);

  // おなか（明るめ）
  const belly = makeEllipsoid(0.6, 0.55, 0.3, '#2a3a2a', em, 0.1);
  belly.position.set(0, -0.15, 0.45);
  g.add(belly);

  // 頭（体より大きい球＝ちび感）
  const head = makeSphere(0.9, bodyColor, em, 0.15);
  head.position.set(0, 1.25, 0.15);
  g.add(head);

  // ほっぺ（小さい球でぷにっと）
  [[-0.6, 1.0], [0.6, 1.0]].forEach(([x, y]) => {
    const cheek = makeSphere(0.2, c, em, 0.25);
    cheek.position.set(x, y, 0.6);
    g.add(cheek);
  });

  // 目（大きくてまんまる）
  [[-0.3, 0], [0.3, 0]].forEach(([x]) => {
    const eyeWhite = makeSphere(0.22, '#ffffff', '#ffffff', 0.3);
    eyeWhite.position.set(x, 1.35, 0.7);
    g.add(eyeWhite);
    const iris = makeSphere(0.15, '#111111', '#000000', 0);
    iris.position.set(x, 1.34, 0.82);
    g.add(iris);
    // ハイライト
    const hl = makeSphere(0.06, '#ffffff', '#ffffff', 1.0);
    hl.position.set(x + 0.06, 1.42, 0.88);
    g.add(hl);
  });

  // 口（にっこりトーラス）
  const mouth = makeTorus(0.12, 0.025, c, em, 0.5);
  mouth.position.set(0, 0.95, 0.8);
  mouth.rotation.x = 0.3;
  mouth.rotation.z = Math.PI;
  g.add(mouth);

  // 鼻（ちょこんと球）
  const nose = makeEllipsoid(0.08, 0.06, 0.06, c, em, 0.4);
  nose.position.set(0, 1.1, 0.88);
  g.add(nose);

  // ぷにぷに足（球で短くて太い）
  [[-0.45, -0.85, 0.3], [0.45, -0.85, 0.3], [-0.35, -0.85, -0.3], [0.35, -0.85, -0.3]].forEach(([x,y,z]) => {
    const leg = makeEllipsoid(0.22, 0.2, 0.22, bodyColor, em, 0.1);
    leg.position.set(x, y, z);
    g.add(leg);
    // 肉球
    const pad = makeSphere(0.1, c, em, 0.4);
    pad.position.set(x, y - 0.17, z);
    g.add(pad);
  });

  // === 属性別パーツ ===
  if (attr === 'fire') {
    // 炎：頭の上にちいさな炎冠
    for (let i = 0; i < 3; i++) {
      const flame = makeEllipsoid(0.08 - i*0.015, 0.16 - i*0.03, 0.06, c, em, 0.9);
      flame.position.set((i-1)*0.18, 2.2 + i*0.12, 0.15);
      flame.rotation.z = (i-1) * 0.3;
      g.add(flame);
    }
    const flameTop = makeSphere(0.07, '#FF8C00', em, 1.0);
    flameTop.position.set(0, 2.55, 0.15);
    g.add(flameTop);
    // ぷに尻尾（球の連鎖 → 炎先端）
    const tail1 = makeSphere(0.28, bodyColor, em, 0.1);
    tail1.position.set(0, -0.3, -0.85);
    g.add(tail1);
    const tail2 = makeSphere(0.2, bodyColor, em, 0.1);
    tail2.position.set(0, -0.42, -1.2);
    g.add(tail2);
    const tailFlame = makeEllipsoid(0.15, 0.22, 0.12, c, em, 0.9);
    tailFlame.position.set(0, -0.35, -1.5);
    g.add(tailFlame);
    const tailSpark = makeSphere(0.08, '#FF8C00', em, 1.0);
    tailSpark.position.set(0, -0.25, -1.65);
    g.add(tailSpark);
    // 小翼（丸い膜）
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const wing = makeEllipsoid(0.08, 0.35, 0.3, c, em, 0.5);
      wing.position.set(side*0.85, 0.35, -0.1);
      wing.rotation.z = side*0.4;
      g.add(wing);
    });

  }

  g.scale.setScalar(0.8);
  addAttrEffect(g, attr, 'baby');
  return g;
}

// 成体：スムーズ＆かっこいいドラゴン（属性別＋育成タイプ装飾）
function buildAdultDragon(attr, type = 'balanced') {
  const g = new THREE.Group();
  const c  = ATTR[attr].color;
  const em = ATTR[attr].emissive;
  const bodyColor = '#0d1a0d';
  const bc2 = '#1a2a1a';

  // ===== 属性別ユニーク体型（成体版） =====

  // === 氷成体：ゴジラ（二足歩行の巨大怪獣） ===
  if (attr === 'ice') {
    // 直立した巨大な胴体
    const torso = makeEllipsoid(0.75, 0.95, 0.7, bodyColor, em, 0.2);
    torso.position.set(0, 0.2, 0);
    g.add(torso);
    // 胸板（前面が明るめ）
    const chest = makeEllipsoid(0.5, 0.7, 0.35, bc2, em, 0.15);
    chest.position.set(0, 0.25, 0.4);
    g.add(chest);
    // 腹部
    const belly = makeEllipsoid(0.55, 0.45, 0.35, bc2, em, 0.1);
    belly.position.set(0, -0.1, 0.3);
    g.add(belly);
    // 肩の筋肉
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const sh = makeEllipsoid(0.25, 0.2, 0.3, bodyColor, em, 0.18);
      sh.position.set(side*0.6, 0.55, 0.15);
      g.add(sh);
    });

    // 太い首（短めで力強い）
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      const nR = 0.28 * (1.2 - t * 0.3);
      const seg = makeCylinder(nR, nR*0.9, 0.22, bodyColor, em, 0.2);
      seg.position.set(0, 0.75 + t*0.4, 0.3 + t*0.15);
      seg.rotation.x = -0.15;
      g.add(seg);
    }

    // 頭部（ゴジラの角張った巨大頭蓋）
    const skull = makeEllipsoid(0.42, 0.35, 0.5, bodyColor, em, 0.2);
    skull.position.set(0, 1.55, 0.45);
    g.add(skull);
    // 吻部（上顎 — 長くて重厚）
    const snout = makeEllipsoid(0.32, 0.25, 0.45, bodyColor, em, 0.2);
    snout.position.set(0, 1.4, 0.8);
    g.add(snout);
    // 鼻先
    const snoutTip = makeEllipsoid(0.25, 0.18, 0.2, bodyColor, em, 0.22);
    snoutTip.position.set(0, 1.38, 1.1);
    g.add(snoutTip);
    // 鼻梁
    const noseBridge = makeEllipsoid(0.12, 0.08, 0.35, bodyColor, em, 0.25);
    noseBridge.position.set(0, 1.55, 0.7);
    g.add(noseBridge);
    // 下顎
    const lowerJaw = makeEllipsoid(0.28, 0.15, 0.4, bodyColor, em, 0.18);
    lowerJaw.position.set(0, 1.22, 0.75);
    lowerJaw.rotation.x = 0.1;
    g.add(lowerJaw);
    // 下顎先端
    const lowerJawTip = makeEllipsoid(0.2, 0.1, 0.2, bodyColor, em, 0.18);
    lowerJawTip.position.set(0, 1.18, 1.0);
    g.add(lowerJawTip);
    // 口の内部
    const mouthInside = makeEllipsoid(0.22, 0.06, 0.25, '#080808', '#000000', 0);
    mouthInside.position.set(0, 1.3, 0.85);
    g.add(mouthInside);
    // 牙（上顎）
    [[-0.1, 1.32, 1.05], [0.1, 1.32, 1.05], [-0.07, 1.32, 0.9], [0.07, 1.32, 0.9]].forEach(([x,y,z], i) => {
      const fh = i < 2 ? 0.22 : 0.15;
      const fang = makeCone(0.03, fh, '#e8e0d0', '#ffffff', 0.5);
      fang.position.set(x, y-fh*0.5, z);
      fang.rotation.x = Math.PI;
      g.add(fang);
    });
    // 牙（下顎）
    [[-0.09, 1.22, 0.95], [0.09, 1.22, 0.95]].forEach(([x,y,z]) => {
      const fang = makeCone(0.025, 0.16, '#e8e0d0', '#ffffff', 0.5);
      fang.position.set(x, y, z);
      g.add(fang);
    });
    // 眉稜
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const brow = makeEllipsoid(0.18, 0.08, 0.2, bodyColor, em, 0.25);
      brow.position.set(side*0.2, 1.65, 0.78);
      g.add(brow);
    });
    // 目（小さく鋭い — ゴジラの怒り目）
    [[-0.24, 0], [0.24, 0]].forEach(([x]) => {
      const eyeSocket = makeEllipsoid(0.10, 0.06, 0.05, '#020502', '#000000', 0);
      eyeSocket.position.set(x, 1.52, 0.88);
      g.add(eyeSocket);
      const eyeGlow = makeEllipsoid(0.085, 0.05, 0.03, c, em, 1.2);
      eyeGlow.position.set(x, 1.52, 0.90);
      g.add(eyeGlow);
      const eye = makeEllipsoid(0.07, 0.04, 0.025, '#ffffff', c, 1.5);
      eye.position.set(x, 1.52, 0.92);
      g.add(eye);
      const pupil = makeEllipsoid(0.015, 0.03, 0.015, '#000000', '#000000', 0);
      pupil.position.set(x, 1.52, 0.935);
      g.add(pupil);
    });
    // 鼻孔
    [[-0.06, 0], [0.06, 0]].forEach(([x]) => {
      const n = makeSphere(0.03, c, em, 0.6);
      n.position.set(x, 1.42, 1.22);
      g.add(n);
    });
    // 後頭部スパイク列
    for (let i = 0; i < 4; i++) {
      const spH = 0.14 - i*0.02;
      const sp = makeCone(0.025, spH, bodyColor, em, 0.3);
      sp.position.set(0, 1.7-i*0.02, 0.2+i*0.08);
      sp.rotation.x = -0.35;
      g.add(sp);
    }

    // 二本の巨大な脚（二足歩行 — ゴジラの力強い脚）
    [[-0.4, 0], [0.4, 0]].forEach(([x]) => {
      // 太もも（巨大）
      const thigh = makeEllipsoid(0.3, 0.38, 0.3, bodyColor, em, 0.15);
      thigh.position.set(x, -0.35, -0.1);
      g.add(thigh);
      // 脛
      const shin = makeCylinder(0.2, 0.15, 0.45, bodyColor, em, 0.15);
      shin.position.set(x, -0.7, -0.05);
      g.add(shin);
      // 足
      const foot = makeEllipsoid(0.22, 0.1, 0.3, bodyColor, em, 0.12);
      foot.position.set(x, -0.98, 0.1);
      g.add(foot);
      // 爪×3
      for (let ti = 0; ti < 3; ti++) {
        const angle = (ti - 1) * 0.7;
        const tx = x + Math.sin(angle) * 0.15;
        const tz = 0.1 + 0.22 + Math.cos(angle) * 0.05;
        const claw = makeCone(0.04, 0.15, c, em, 0.7);
        claw.position.set(tx, -0.98, tz);
        claw.rotation.x = Math.PI/2 + 0.3;
        claw.rotation.y = angle * 0.5;
        g.add(claw);
      }
    });

    // 短い腕（T-レックス風の前肢）
    [[-0.6, 0], [0.6, 0]].forEach(([x]) => {
      // 上腕
      const upperArm = makeEllipsoid(0.14, 0.22, 0.12, bodyColor, em, 0.15);
      upperArm.position.set(x, 0.25, 0.35);
      upperArm.rotation.z = x < 0 ? 0.5 : -0.5;
      g.add(upperArm);
      // 前腕
      const forearm = makeEllipsoid(0.1, 0.18, 0.1, bodyColor, em, 0.15);
      forearm.position.set(x + (x<0 ? -0.12 : 0.12), 0.05, 0.4);
      forearm.rotation.z = x < 0 ? 0.3 : -0.3;
      g.add(forearm);
      // 手 + 爪
      for (let ci = 0; ci < 2; ci++) {
        const cl = makeCone(0.025, 0.1, c, em, 0.7);
        cl.position.set(x + (x<0 ? -0.18 : 0.18), -0.05 + ci*0.06, 0.42 + ci*0.02);
        cl.rotation.x = 0.4;
        cl.rotation.z = x < 0 ? -0.3 : 0.3;
        g.add(cl);
      }
    });

    // ドーサルプレート（氷の結晶 — ゴジラのトレードマーク、大きく印象的に）
    for (let i = 0; i < 10; i++) {
      const h = 0.15 + Math.sin(i / 9 * Math.PI) * 0.35;
      const w = 0.04 + Math.sin(i / 9 * Math.PI) * 0.03;
      const plate = makeCone(w, h, i%2===0 ? c : '#ffffff', '#aaddff', 0.8 + (i%2)*0.2);
      plate.position.set(0, 0.95 - i*0.12, -0.15 - i*0.08);
      g.add(plate);
      // サイドプレート（小さめ左右交互）
      if (i > 1 && i < 8) {
        const side = i % 2 === 0 ? -1 : 1;
        const sp = makeCone(w*0.6, h*0.4, '#ffffff', '#aaddff', 0.9);
        sp.position.set(side*0.08, 0.9 - i*0.12, -0.2 - i*0.08);
        sp.rotation.z = side * 0.3;
        g.add(sp);
      }
    }

    // 尻尾（太くて長い — ゴジラの重量感ある尻尾）
    const tailData = [
      {r:0.35,p:[0,-0.2,-0.9]},{r:0.28,p:[0,-0.35,-1.45]},{r:0.22,p:[0,-0.48,-1.95]},
      {r:0.17,p:[0,-0.58,-2.4]},{r:0.13,p:[0,-0.66,-2.8]},{r:0.1,p:[0,-0.72,-3.15]},
      {r:0.07,p:[0,-0.76,-3.45]},{r:0.05,p:[0,-0.78,-3.7]},
    ];
    tailData.forEach(({r,p}) => {
      const seg = makeSphere(r, bodyColor, em, 0.15);
      seg.position.set(...p);
      g.add(seg);
    });
    // 尻尾のドーサルプレート（小さめ）
    for (let i = 0; i < 5; i++) {
      const sp = makeCone(0.025, 0.1 + i*0.01, c, '#aaddff', 0.7);
      sp.position.set(0, -0.15 - i*0.12, -1.0 - i*0.5);
      g.add(sp);
    }
    // 尻尾先端の氷結晶
    const tailCrystal = makeCone(0.04, 0.18, '#ffffff', '#aaddff', 1.0);
    tailCrystal.position.set(0, -0.75, -3.85);
    tailCrystal.rotation.x = 0.5;
    g.add(tailCrystal);

    // 氷の装甲（体表面）
    [[-1, 0], [1, 0]].forEach(([side]) => {
      for (let i = 0; i < 4; i++) {
        const armor = makeEllipsoid(0.06, 0.18 - i*0.03, 0.25 - i*0.04, c, em, 0.4 + i*0.1);
        armor.position.set(side*(0.62+i*0.03), 0.1 + i*0.18, -0.05+i*0.1);
        g.add(armor);
      }
    });
    // 背中の装甲プレート
    for (let i = 0; i < 3; i++) {
      const bp = makeEllipsoid(0.3-i*0.05, 0.03, 0.22, '#ffffff', '#aaddff', 0.5+i*0.15);
      bp.position.set(0, 0.9+i*0.03, -0.1+i*0.2);
      g.add(bp);
    }

    // 体表の霜模様
    for (let i = 0; i < 6; i++) {
      const frost = makeSphere(0.03, '#ffffff', '#aaddff', 0.6+i*0.08);
      frost.position.set(Math.sin(i*1.2)*0.6, 0.1+Math.cos(i*1.2)*0.5, -0.1+i*0.15);
      g.add(frost);
    }

    // 育成タイプ装飾
    if (type === 'attacker') {
      [[-0.4, 0], [0.4, 0]].forEach(([x]) => {
        const bigClaw = makeCone(0.065, 0.28, c, em, 0.9);
        bigClaw.position.set(x, -0.98, 0.35);
        bigClaw.rotation.x = 0.6;
        g.add(bigClaw);
      });
      [[-0.1, 1.3, 0.92], [0.1, 1.3, 0.92]].forEach(([x,y,z]) => {
        const fang = makeCone(0.035, 0.2, '#ffffff', '#ffffff', 0.8);
        fang.position.set(x, y, z);
        fang.rotation.x = Math.PI;
        g.add(fang);
      });
    } else if (type === 'tank') {
      for (let i = 0; i < 5; i++) {
        const plate = makeEllipsoid(0.22, 0.08, 0.25, c, em, 0.35+i*0.04);
        plate.position.set(0, 0.8+i*0.035, -0.3+i*0.22);
        g.add(plate);
      }
      [[-1, 0], [1, 0]].forEach(([side]) => {
        const shoulder = makeEllipsoid(0.2, 0.16, 0.22, c, em, 0.45);
        shoulder.position.set(side*0.8, 0.6, 0.15);
        g.add(shoulder);
      });
    } else if (type === 'speedster') {
      [[-1, 0], [1, 0]].forEach(([side]) => {
        const fin = makeEllipsoid(0.28, 0.04, 0.4, c, em, 0.5);
        fin.position.set(side*0.85, 0, -0.3);
        g.add(fin);
      });
    }

    // 氷柱群（地面から怪獣の斜め後ろ〜真後ろにかけて聳える）
    const icicleData = [
      // 真後ろ中央（最大・最も目立つ）
      [ 0.00, -1.8,  1.00, 1.00,  0.00],
      [ 0.00, -2.6,  0.85, 0.90,  0.05],
      [ 0.00, -3.2,  0.65, 0.75,  0.08],
      // 左斜め後ろ
      [-0.55, -1.5,  0.90, 0.95, -0.12],
      [-1.05, -2.0,  0.78, 0.82, -0.18],
      [-1.55, -2.5,  0.62, 0.70, -0.22],
      [-0.30, -2.9,  0.72, 0.78,  0.04],
      // 右斜め後ろ
      [ 0.55, -1.5,  0.90, 0.95,  0.12],
      [ 1.05, -2.0,  0.78, 0.82,  0.18],
      [ 1.55, -2.5,  0.62, 0.70,  0.22],
      [ 0.30, -2.9,  0.72, 0.78, -0.04],
      // 最後列（細い添え柱）
      [-0.80, -3.5,  0.50, 0.60, -0.25],
      [ 0.80, -3.5,  0.50, 0.60,  0.25],
      [ 0.00, -3.8,  0.40, 0.55,  0.10],
    ];
    icicleData.forEach(([ix, iz, hMul, wMul, tilt]) => {
      const ih = (3.2 + Math.random() * 0.6) * hMul;
      const iw = (0.35 + Math.random() * 0.10) * wMul;
      // 氷柱本体
      const pillar = makeCone(iw, ih, '#a8e8ff', '#ffffff', 0.55);
      pillar.position.set(ix, -0.7 + ih * 0.5, iz);
      pillar.rotation.z = tilt;
      g.add(pillar);
      // 根本の台座
      const base = makeCylinder(iw * 1.5, iw * 1.2, 0.15, '#ccf4ff', '#aaddff', 0.35);
      base.position.set(ix, -0.7 + 0.075, iz);
      base.rotation.z = tilt;
      g.add(base);
      // 内部グロー
      const glow = makeCone(iw * 0.55, ih * 0.85, '#e8f8ff', '#aaddff', 0.20);
      glow.position.set(ix, -0.7 + ih * 0.5, iz);
      glow.rotation.z = tilt;
      g.add(glow);
      // 先端の輝き
      const tip = makeSphere(iw * 0.38, '#ffffff', '#d0f0ff', 0.9);
      tip.position.set(
        ix + Math.sin(tilt) * ih * 0.5,
        -0.7 + ih,
        iz
      );
      g.add(tip);
    });

    addAttrEffect(g, attr, 'adult');
    return g;
  }

  // === 雷成体：ペガサス（翼のある馬＋角から雷撃） ===
  if (attr === 'thunder') {
    // 馬体（優雅で力強い水平ボディ）
    const torso = makeEllipsoid(0.55, 0.5, 1.1, bodyColor, em, 0.2);
    g.add(torso);
    const chestP = makeEllipsoid(0.4, 0.45, 0.5, bc2, em, 0.15);
    chestP.position.set(0, 0.1, 0.5);
    g.add(chestP);
    const bellyP = makeEllipsoid(0.42, 0.35, 0.55, bc2, em, 0.1);
    bellyP.position.set(0, -0.15, 0.1);
    g.add(bellyP);

    // 肩
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const sh = makeEllipsoid(0.2, 0.18, 0.28, bodyColor, em, 0.18);
      sh.position.set(side*0.48, 0.18, 0.5);
      g.add(sh);
    });
    // 腰
    const hip = makeEllipsoid(0.5, 0.42, 0.5, bodyColor, em, 0.15);
    hip.position.set(0, -0.05, -0.5);
    g.add(hip);

    // 首（アーチ状に伸びる優雅な馬首）
    const neckSegs = 5;
    for (let i = 0; i < neckSegs; i++) {
      const t = i / (neckSegs - 1);
      const nY = 0.35 + t * 0.8;
      const nZ = 0.6 + t * 0.25;
      const nRad = 0.2 * (1.3 - t * 0.35);
      const seg = makeCylinder(nRad, nRad*0.9, 0.2, bodyColor, em, 0.2);
      seg.position.set(0, nY, nZ);
      seg.rotation.x = -0.25 - t*0.1;
      g.add(seg);
    }
    // 喉（前面の膨らみ）
    const throat = makeEllipsoid(0.1, 0.3, 0.15, bc2, em, 0.1);
    throat.position.set(0, 0.6, 0.82);
    throat.rotation.x = -0.2;
    g.add(throat);

    // 頭部（馬の優雅な頭蓋）
    const skull = makeEllipsoid(0.3, 0.28, 0.42, bodyColor, em, 0.2);
    skull.position.set(0, 1.5, 0.88);
    g.add(skull);
    // 吻部（馬の長いマズル）
    const snout = makeEllipsoid(0.2, 0.2, 0.45, bodyColor, em, 0.2);
    snout.position.set(0, 1.38, 1.2);
    g.add(snout);
    // 鼻先
    const snoutTip = makeEllipsoid(0.18, 0.16, 0.15, bodyColor, em, 0.22);
    snoutTip.position.set(0, 1.35, 1.5);
    g.add(snoutTip);
    // 下顎
    const lowerJaw = makeEllipsoid(0.18, 0.12, 0.35, bodyColor, em, 0.18);
    lowerJaw.position.set(0, 1.25, 1.15);
    g.add(lowerJaw);
    // 鼻孔
    [[-0.06, 0], [0.06, 0]].forEach(([x]) => {
      const n = makeSphere(0.03, c, em, 0.6);
      n.position.set(x, 1.38, 1.58);
      g.add(n);
    });

    // 耳（馬耳 — 長くてとがった）
    [[-0.12, 0], [0.12, 0]].forEach(([x]) => {
      const ear = makeCone(0.04, 0.22, bodyColor, em, 0.2);
      ear.position.set(x, 1.75, 0.78);
      ear.rotation.z = x < 0 ? 0.15 : -0.15;
      g.add(ear);
    });

    // 角（太く力強い螺旋角 — 雷撃の源、前方を向く）
    // rotation.x=1.2 → 先端方向 (0, +0.362, +0.932)
    // 全パーツを horn軸方向に Δ=0.5 スライドして後頭部貫通を解消
    const hornBase = makeCone(0.20, 0.25, c, em, 0.9);
    hornBase.position.set(0, 1.601, 1.366);
    hornBase.rotation.x = 1.2;
    g.add(hornBase);
    const hornMain = makeCone(0.13, 1.50, c, em, 1.1);
    hornMain.position.set(0, 1.701, 1.636);
    hornMain.rotation.x = 1.2;
    g.add(hornMain);
    const hornTip = makeCone(0.04, 0.45, '#ffffff', c, 1.4);
    hornTip.position.set(0, 2.051, 2.546);
    hornTip.rotation.x = 1.2;
    g.add(hornTip);
    // 螺旋リング（白っぽい黄色 '#ffffcc' — 視認性重視）
    for (let i = 0; i < 6; i++) {
      const d = -0.60 + i * (1.20 / 5);
      const rr = 0.14 - i * 0.017;
      const tube = 0.020 - i * 0.002;
      const ring = makeTorus(rr, tube, '#ffffcc', '#ffffaa', 1.0 + i*0.05);
      ring.position.set(0, 1.701 + d*0.362, 1.636 + d*0.932);
      ring.rotation.x = 1.2;
      g.add(ring);
    }
    // 根本の発光オーラ（額への接合部）
    const hornRoot = makeSphere(0.12, c, em, 0.8);
    hornRoot.position.set(0, 1.551, 1.196);
    g.add(hornRoot);
    // 先端スパーク
    const hornTipSpark = makeSphere(0.07, '#ffffff', '#ffffcc', 2.2);
    hornTipSpark.position.set(0, 2.131, 2.756);
    g.add(hornTipSpark);
    const hornTipGlow = makeSphere(0.13, c, em, 1.2);
    hornTipGlow.position.set(0, 2.131, 2.756);
    g.add(hornTipGlow);

    // 目（大きく光る — 馬の目）
    [[-0.2, 0], [0.2, 0]].forEach(([x]) => {
      const eyeSocket = makeEllipsoid(0.1, 0.07, 0.05, '#020502', '#000000', 0);
      eyeSocket.position.set(x, 1.5, 1.05);
      g.add(eyeSocket);
      const eyeGlow = makeEllipsoid(0.085, 0.055, 0.03, c, em, 1.2);
      eyeGlow.position.set(x, 1.5, 1.07);
      g.add(eyeGlow);
      const eye = makeEllipsoid(0.07, 0.045, 0.025, '#ffffff', c, 1.5);
      eye.position.set(x, 1.5, 1.09);
      g.add(eye);
      const pupil = makeEllipsoid(0.015, 0.035, 0.015, '#000000', '#000000', 0);
      pupil.position.set(x, 1.5, 1.105);
      g.add(pupil);
    });

    // たてがみ（首に沿ったエレクトリックなたてがみ）
    for (let i = 0; i < 8; i++) {
      const maneH = 0.12 + Math.sin(i/7*Math.PI) * 0.15;
      const mane = makeCone(0.03, maneH, i%2===0 ? c : '#ffffff', em, 0.7 + (i%2)*0.3);
      mane.position.set(0, 1.6 - i*0.13, 0.82 - i*0.03);
      g.add(mane);
    }

    // 四本脚（力強い馬の筋肉脚 — 肩筋・前腕・膝関節・管骨・球節・蹄の多段構成）
    // === 前脚 ===
    [[-0.40, 0.42], [0.40, 0.42]].forEach(([x, z]) => {
      // 肩の筋肉
      const shoulder = makeEllipsoid(0.24, 0.34, 0.22, bodyColor, em, 0.18);
      shoulder.position.set(x, -0.02, z);
      g.add(shoulder);
      // 前腕
      const forearm = makeCylinder(0.16, 0.13, 0.38, bodyColor, em, 0.15);
      forearm.position.set(x, -0.40, z + 0.02);
      g.add(forearm);
      // 膝関節
      const knee = makeSphere(0.15, bodyColor, em, 0.20);
      knee.position.set(x, -0.61, z + 0.03);
      g.add(knee);
      // 管骨
      const cannon = makeCylinder(0.09, 0.08, 0.28, bodyColor, em, 0.15);
      cannon.position.set(x, -0.78, z + 0.02);
      g.add(cannon);
      // 球節
      const fetlock = makeSphere(0.11, bodyColor, em, 0.18);
      fetlock.position.set(x, -0.95, z + 0.02);
      g.add(fetlock);
      // 蹄
      const hoof = makeCylinder(0.16, 0.17, 0.11, c, em, 0.65);
      hoof.position.set(x, -1.07, z);
      g.add(hoof);
      // 蹄の発光リム
      const hoofRim = makeTorus(0.16, 0.013, c, em, 0.9);
      hoofRim.position.set(x, -1.09, z);
      hoofRim.rotation.x = Math.PI / 2;
      g.add(hoofRim);
    });
    // === 後脚（ハック関節が特徴的な馬の後脚） ===
    [[-0.40, -0.50], [0.40, -0.50]].forEach(([x, z]) => {
      // 尻・ハム
      const haunch = makeEllipsoid(0.30, 0.44, 0.30, bodyColor, em, 0.18);
      haunch.position.set(x, -0.04, z);
      g.add(haunch);
      // 大腿部の筋肉
      const hamstring = makeEllipsoid(0.22, 0.28, 0.20, bodyColor, em, 0.16);
      hamstring.position.set(x, -0.36, z - 0.05);
      g.add(hamstring);
      // ガスキン
      const gaskin = makeCylinder(0.17, 0.13, 0.38, bodyColor, em, 0.15);
      gaskin.position.set(x, -0.48, z - 0.06);
      gaskin.rotation.x = 0.12;
      g.add(gaskin);
      // ハック関節
      const hock = makeEllipsoid(0.15, 0.13, 0.20, bodyColor, em, 0.22);
      hock.position.set(x, -0.70, z + 0.06);
      g.add(hock);
      // ハック以下の管骨
      const cannon = makeCylinder(0.11, 0.10, 0.26, bodyColor, em, 0.15);
      cannon.position.set(x, -0.86, z + 0.04);
      g.add(cannon);
      // 球節
      const fetlock = makeSphere(0.12, bodyColor, em, 0.18);
      fetlock.position.set(x, -1.02, z + 0.04);
      g.add(fetlock);
      // 蹄
      const hoof = makeCylinder(0.17, 0.18, 0.12, c, em, 0.65);
      hoof.position.set(x, -1.15, z + 0.03);
      g.add(hoof);
      // 蹄の発光リム
      const hoofRim = makeTorus(0.175, 0.014, c, em, 0.9);
      hoofRim.position.set(x, -1.17, z + 0.03);
      hoofRim.rotation.x = Math.PI / 2;
      g.add(hoofRim);
    });

    // 背中の帯電スパイン（背骨に沿った電撃フィン — 雷感の核心）
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const sz = 0.35 - i * 0.15;
      const spH = 0.18 + Math.sin(t * Math.PI) * 0.52;
      const spW = 0.07 + Math.sin(t * Math.PI) * 0.05;
      // 各z位置での体表面Y座標を胴体・胸パーツから計算
      const torsoTopY  = 0.5  * Math.sqrt(Math.max(0, 1 - (sz / 1.1) ** 2));
      const chestDz    = sz - 0.5;
      const chestTopY  = Math.abs(chestDz) <= 0.5
        ? 0.1 + 0.45 * Math.sqrt(Math.max(0, 1 - (chestDz / 0.5) ** 2))
        : 0;
      const backY = Math.max(torsoTopY, chestTopY);
      // 交互に属性色と白で電荷を表現
      const spineColor = i % 2 === 0 ? c : '#ffffff';
      const spineEm    = i % 2 === 0 ? em : c;
      const spine = makeCone(spW, spH, spineColor, spineEm, 0.9 + (i%2)*0.3);
      spine.position.set(0, backY + spH * 0.5, sz);
      g.add(spine);
      // スパイン根本のリングプレート（体表面に密着）
      const base = makeCylinder(spW * 1.6, spW * 1.6, 0.04, c, em, 0.7);
      base.position.set(0, backY - 0.01, sz);
      g.add(base);
      // スパイン先端のスパーク
      if (i % 2 === 0) {
        const tip = makeSphere(0.05, '#ffffff', c, 1.5);
        tip.position.set(0, backY + spH + 0.03, sz);
        g.add(tip);
      }
    }

    // 体側面の放電アーク（側腹から体外へ弧を描く雷）
    [[-1, 0], [1, 0]].forEach(([side]) => {
      // メイン放電ライン（体に沿って斜めに走る稲妻）
      const arcAngles = [0.7, 1.1, -0.3];
      arcAngles.forEach((rot, ai) => {
        const arc = makeCylinder(0.008, 0.008, 0.5 + ai*0.08, '#ffffff', c, 1.2);
        arc.position.set(side*(0.52 + ai*0.08), 0.2 - ai*0.12, 0.2 - ai*0.25);
        arc.rotation.z = side * (0.9 + ai*0.3);
        arc.rotation.x = rot * 0.2;
        g.add(arc);
        // 放電先端の光点
        const dot = makeSphere(0.025, '#ffffff', c, 1.6);
        dot.position.set(side*(0.75 + ai*0.12), 0.05 - ai*0.18, 0.22 - ai*0.28);
        g.add(dot);
      });
      // 肩の電磁コイル（螺旋リング）
      for (let ri = 0; ri < 3; ri++) {
        const coil = makeTorus(0.17 - ri*0.03, 0.012, c, em, 0.5 + ri*0.15);
        coil.position.set(side*0.5, 0.22 - ri*0.06, 0.45 - ri*0.05);
        coil.rotation.y = side * (0.4 + ri*0.15);
        coil.rotation.x = 0.5;
        g.add(coil);
      }
    });

    // 帯電オーラリング（胴体を包む電磁フィールド — 3本の楕円輪）
    [[0, 0, 0.1], [0, 0.08, -0.3], [0, 0.04, -0.7]].forEach(([dx, dy, dz], ri) => {
      const aura = makeTorus(0.62 - ri*0.04, 0.015, c, em, 0.35 + ri*0.1);
      aura.position.set(dx, dy, dz);
      aura.rotation.x = Math.PI/2 + 0.08;
      g.add(aura);
    });

    // 荷電粒子群（体周囲を漂う電気の粒 — 6点対称）
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const r = 0.78;
      const cx2 = Math.sin(angle) * r;
      const cz2 = Math.cos(angle) * r * 0.55;
      const particle = makeSphere(0.035, i%2===0 ? '#ffffff' : c, c, 1.0 + (i%2)*0.4);
      particle.position.set(cx2, 0.15 + Math.sin(angle*0.8)*0.2, cz2);
      g.add(particle);
      // 各粒子から体へのアーク
      const arcLen = 0.18 + (i%3)*0.04;
      const micro = makeCylinder(0.005, 0.005, arcLen, c, em, 0.9);
      micro.position.set(cx2*0.7, 0.15 + Math.sin(angle*0.8)*0.2, cz2*0.7);
      micro.rotation.z = Math.atan2(cx2, 1) * 0.8;
      micro.rotation.x = Math.atan2(cz2, 1) * 0.6;
      g.add(micro);
    }

    // 馬の尻尾（流れるようなエレクトリックテイル）
    const tailBase = makeSphere(0.2, bodyColor, em, 0.15);
    tailBase.position.set(0, -0.15, -0.95);
    g.add(tailBase);
    for (let i = 0; i < 8; i++) {
      const strand = makeEllipsoid(0.03, 0.25-i*0.02, 0.03, i%2===0 ? c : '#ffffff', em, 0.5+i*0.05);
      strand.position.set((i%3-1)*0.05, -0.35 - i*0.06, -1.1 - i*0.12);
      g.add(strand);
    }
    const tailSpark = makeSphere(0.03, '#ffffff', c, 1.3);
    tailSpark.position.set(0, -0.8, -2.0);
    g.add(tailSpark);

    // 背中の稲妻模様
    for (let i = 0; i < 4; i++) {
      [[-1, 0], [1, 0]].forEach(([side]) => {
        const mark = makeCylinder(0.008, 0.008, 0.12, c, em, 0.8+i*0.1);
        mark.position.set(side*(0.45+0.02), -0.1+i*0.14, -0.08+i*0.16);
        mark.rotation.z = side*(0.8+i*0.2);
        g.add(mark);
      });
    }

    // 稲妻ほっぺマーク
    [[-0.22, 1.42, 1.2], [0.22, 1.42, 1.2]].forEach(([x,y,z]) => {
      const bolt1 = makeCone(0.02, 0.14, c, em, 1.0);
      bolt1.position.set(x, y, z);
      bolt1.rotation.z = 0.5;
      g.add(bolt1);
      const bolt2 = makeCone(0.015, 0.1, c, em, 1.0);
      bolt2.position.set(x, y-0.08, z+0.03);
      bolt2.rotation.z = -0.5;
      g.add(bolt2);
    });

    // 育成タイプ装飾
    if (type === 'attacker') {
      // より大きな角
      const bigHorn = makeCone(0.06, 0.35, '#ffffff', c, 1.5);
      bigHorn.position.set(0, 2.431, 2.756);
      bigHorn.rotation.x = 1.2;
      g.add(bigHorn);
      // 蹄のスパーク
      [[-0.35,-0.77,0.44],[0.35,-0.77,0.44],[-0.35,-0.78,-0.39],[0.35,-0.78,-0.39]].forEach(([x,y,z]) => {
        const spark = makeSphere(0.04, '#ffffff', c, 1.2);
        spark.position.set(x, y, z);
        g.add(spark);
      });
    } else if (type === 'tank') {
      for (let i = 0; i < 4; i++) {
        const plate = makeEllipsoid(0.2, 0.06, 0.22, c, em, 0.35+i*0.04);
        plate.position.set(0, 0.5+i*0.03, -0.3+i*0.2);
        g.add(plate);
      }
      [[-1, 0], [1, 0]].forEach(([side]) => {
        const shoulder = makeEllipsoid(0.18, 0.14, 0.2, c, em, 0.45);
        shoulder.position.set(side*0.65, 0.3, 0.35);
        g.add(shoulder);
      });
    } else if (type === 'speedster') {
      [[-1, 0], [1, 0]].forEach(([side]) => {
        const booster = makeEllipsoid(0.08, 0.12, 0.3, c, em, 0.9);
        booster.position.set(side*0.65, 0.2, -0.6);
        booster.rotation.z = side*0.3;
        g.add(booster);
        const glow = makeSphere(0.04, '#ffffff', c, 1.0);
        glow.position.set(side*0.65, 0.2, -0.9);
        g.add(glow);
      });
    }

    // グループ全体を+0.43上げて前蹄底が地面(y=-0.7)に揃う
    g.position.y = 0.43;

    addAttrEffect(g, attr, 'adult');
    return g;
  }

  // === 闇成体：フードをかぶった謎の怪獣（得体の知れない存在） ===
  if (attr === 'dark') {
    // ローブ/マントの体（大きな円錐形で全身を覆う）
    const robe = makeCone(1.3, 2.8, '#0a0a15', em, 0.05);
    robe.position.set(0, 0.1, 0);
    g.add(robe);
    // ローブの内側の体（少し明るい）
    const innerBody = makeEllipsoid(0.55, 0.9, 0.5, '#0d0d1a', em, 0.03);
    innerBody.position.set(0, 0.2, 0.15);
    g.add(innerBody);

    // 肩（ローブの下に見える肩のライン）
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const sh = makeEllipsoid(0.35, 0.12, 0.25, '#0a0a15', em, 0.06);
      sh.position.set(side*0.55, 0.8, 0);
      g.add(sh);
    });

    // フード（大きく深い — 顔を完全に隠す）
    const hood = makeEllipsoid(0.55, 0.52, 0.55, '#0a0a15', em, 0.08);
    hood.position.set(0, 1.45, 0.05);
    g.add(hood);
    // フードの先端（とんがりが後ろに流れる）
    const hoodPeak = makeCone(0.32, 0.6, '#0a0a15', em, 0.06);
    hoodPeak.position.set(0, 1.75, -0.1);
    g.add(hoodPeak);
    // フードの縁（前面に大きく張り出す — 深い影を作る）
    const hoodBrim = makeEllipsoid(0.48, 0.12, 0.4, '#0a0a15', em, 0.08);
    hoodBrim.position.set(0, 1.5, 0.4);
    g.add(hoodBrim);
    // フードの左右の垂れ（フードの側面が垂れ下がる）
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const drape = makeEllipsoid(0.15, 0.35, 0.22, '#0a0a15', em, 0.06);
      drape.position.set(side*0.38, 1.2, 0.1);
      g.add(drape);
    });

    // フード内部の深い闇（虚空 — 何も見えない暗闇）
    const hoodVoid = makeEllipsoid(0.38, 0.35, 0.12, '#020005', '#000000', 0);
    hoodVoid.position.set(0, 1.38, 0.30);
    g.add(hoodVoid);
    // もう一層の闇（より深く）
    const hoodVoid2 = makeEllipsoid(0.3, 0.28, 0.08, '#010003', '#000000', 0);
    hoodVoid2.position.set(0, 1.35, 0.34);
    g.add(hoodVoid2);

    // フード内で光る目（得体の知れない存在の証 — 闇の中で鋭く光る）
    [[-0.14, 0], [0.14, 0]].forEach(([x]) => {
      // 外側の大きなグロー（ぼんやり）
      const outerGlow = makeSphere(0.12, c, em, 1.2);
      outerGlow.position.set(x, 1.32, 0.52);
      g.add(outerGlow);
      // 中間グロー
      const midGlow = makeSphere(0.08, c, em, 1.8);
      midGlow.position.set(x, 1.32, 0.54);
      g.add(midGlow);
      // 中心（鋭く白く光る — 縦スリット風）
      const eyeCore = makeEllipsoid(0.025, 0.06, 0.02, '#ffffff', c, 2.5);
      eyeCore.position.set(x, 1.32, 0.57);
      g.add(eyeCore);
    });

    // ローブから伸びる手/腕（不気味に長い）
    [[-0.65, 0], [0.65, 0]].forEach(([x]) => {
      // 袖（ローブの袖口）
      const sleeve = makeEllipsoid(0.12, 0.3, 0.12, '#0a0a15', em, 0.06);
      sleeve.position.set(x, 0.25, 0.3);
      sleeve.rotation.z = x < 0 ? 0.4 : -0.4;
      g.add(sleeve);
      // 手（暗い、ほぼシルエット）
      const hand = makeEllipsoid(0.08, 0.12, 0.06, '#0d0d1a', em, 0.08);
      hand.position.set(x + (x<0 ? -0.1 : 0.1), 0.0, 0.35);
      g.add(hand);
      // 光る指先（3本）
      for (let f = 0; f < 3; f++) {
        const finger = makeCone(0.015, 0.08, c, em, 0.6);
        finger.position.set(x + (x<0 ? -0.12 : 0.12) + (f-1)*0.04, -0.08, 0.38);
        finger.rotation.x = 0.3;
        g.add(finger);
      }
    });

    // ローブ裾（地面に広がる — ゆらめく不定形の端）
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const r = 0.8 + Math.sin(i*2.3)*0.2;
      const wisp = makeEllipsoid(0.2 - i*0.012, 0.1, 0.2 - i*0.012, '#0a0a15', em, 0.03 + i*0.015);
      wisp.position.set(Math.sin(angle) * r * 0.5, -1.2 - i*0.03, Math.cos(angle) * r * 0.4);
      g.add(wisp);
    }

    // 浮遊するオーブ（肩の周辺に — 闇のエネルギー）
    [[-0.85, 0.9, 0.1], [0.85, 0.9, 0.1], [-0.5, 1.8, -0.15], [0.5, 1.8, -0.15]].forEach(([x,y,z]) => {
      const orb = makeSphere(0.05, c, em, 1.0);
      orb.position.set(x, y, z);
      g.add(orb);
      const orbRing = makeTorus(0.065, 0.008, c, em, 0.7);
      orbRing.position.set(x, y, z);
      orbRing.rotation.x = 0.5;
      g.add(orbRing);
    });

    // 光る紋様（ローブ全体に散らばる）
    for (let i = 0; i < 10; i++) {
      const angle = i * 0.63;
      const rune = makeSphere(0.025, c, em, 0.5 + i*0.06);
      rune.position.set(
        Math.sin(angle) * 0.5,
        0.8 - i*0.15,
        Math.cos(angle) * 0.4 + 0.1
      );
      g.add(rune);
    }

    // 闇のオーラ（周囲に漂う影の断片）
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      const shard = makeEllipsoid(0.04, 0.15, 0.03, c, em, 0.3 + i*0.08);
      shard.position.set(
        Math.sin(angle) * 1.2,
        0.5 + Math.cos(angle * 1.5) * 0.4,
        Math.cos(angle) * 0.8
      );
      shard.rotation.z = angle;
      g.add(shard);
    }

    // 育成タイプ装飾
    if (type === 'attacker') {
      // 鋭い爪の手
      [[-0.65, 0], [0.65, 0]].forEach(([x]) => {
        for (let ci = 0; ci < 2; ci++) {
          const cl = makeCone(0.02, 0.15, c, em, 0.9);
          cl.position.set(x + (x<0 ? -0.15 : 0.15), -0.12 + ci*0.04, 0.4);
          cl.rotation.x = 0.4;
          g.add(cl);
        }
      });
      // 目の光がより強く
      const eyeBoost1 = makeSphere(0.12, c, em, 0.6);
      eyeBoost1.position.set(-0.14, 1.35, 0.4);
      g.add(eyeBoost1);
      const eyeBoost2 = makeSphere(0.12, c, em, 0.6);
      eyeBoost2.position.set(0.14, 1.35, 0.4);
      g.add(eyeBoost2);
    } else if (type === 'tank') {
      // ローブの上に追加の装甲/シールド
      for (let i = 0; i < 4; i++) {
        const plate = makeEllipsoid(0.22, 0.06, 0.2, c, em, 0.3+i*0.05);
        plate.position.set(0, 0.6+i*0.04, 0.35-i*0.03);
        g.add(plate);
      }
      // 肩のシールドオーブ
      [[-0.85, 0.9, 0.1], [0.85, 0.9, 0.1]].forEach(([x,y,z]) => {
        const shield = makeSphere(0.08, c, em, 0.6);
        shield.position.set(x, y, z);
        g.add(shield);
      });
    } else if (type === 'speedster') {
      // 浮遊する速度のウィスプ
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2;
        const sp = makeEllipsoid(0.06, 0.03, 0.2, c, em, 0.7+i*0.1);
        sp.position.set(Math.sin(angle)*1.0, 0.3, Math.cos(angle)*0.8 - 0.3);
        sp.rotation.y = angle;
        g.add(sp);
      }
    }

    addAttrEffect(g, attr, 'adult');
    return g;
  }

  // === 炎の体型パラメータ（前後に長い流線型、頭は小さめ） ===
  const shapes = {
    fire:    { bRx:0.6, bRy:0.55, bRz:1.0, nR:0.22, nH:1.1, hRx:0.32, hRy:0.28, hRz:0.42, hornH:0.9 },
  };
  const s = shapes[attr];

  // === 共通ベースボディ（バランスの良い流線型） ===
  // 胴体
  const body = makeEllipsoid(s.bRx, s.bRy, s.bRz, bodyColor, em, 0.2);
  g.add(body);
  // 胸板
  const chest = makeEllipsoid(s.bRx*0.45, s.bRy*0.75, s.bRz*0.5, bc2, em, 0.15);
  chest.position.set(0, 0.05, 0.45);
  g.add(chest);
  // 腹
  const belly = makeEllipsoid(s.bRx*0.5, s.bRy*0.35, s.bRz*0.4, bc2, em, 0.1);
  belly.position.set(0, -0.15, 0.2);
  g.add(belly);
  // 肩
  [[-1, 0], [1, 0]].forEach(([side]) => {
    const shoulderMuscle = makeEllipsoid(0.18, 0.15, 0.25, bodyColor, em, 0.18);
    shoulderMuscle.position.set(side*0.48, 0.12, 0.35);
    g.add(shoulderMuscle);
  });
  // 腰
  const hip = makeEllipsoid(s.bRx*0.55, s.bRy*0.5, s.bRz*0.48, bodyColor, em, 0.15);
  hip.position.set(0, -0.06, -0.45);
  g.add(hip);

  // 首（セグメント化された力強い首 — 参考画像のリブ構造）
  const neckSegs = 5;
  for (let i = 0; i < neckSegs; i++) {
    const t = i / (neckSegs - 1);
    const nY = 0.25 + t * 0.75;
    const nZ = 0.5 + t * 0.3;
    const nRad = s.nR * (1.4 - t * 0.4);
    const seg = makeCylinder(nRad, nRad*0.9, s.nH*0.18, bodyColor, em, 0.2);
    seg.position.set(0, nY, nZ);
    seg.rotation.x = -0.2 - t*0.15;
    g.add(seg);
    // 各セグメント間に溝（暗い細いリング）
    if (i < neckSegs - 1) {
      const groove = makeTorus(nRad*0.85, 0.008, bc2, em, 0.08);
      groove.position.set(0, nY+0.08, nZ+0.03);
      groove.rotation.x = Math.PI/2 - 0.2 - t*0.15;
      g.add(groove);
    }
  }
  // 首の筋肉（左右の太い筋）
  [[-1, 0], [1, 0]].forEach(([side]) => {
    const neckMuscle = makeEllipsoid(0.1, 0.35, 0.14, bc2, em, 0.12);
    neckMuscle.position.set(side*0.12, 0.55, 0.6);
    neckMuscle.rotation.x = -0.25;
    g.add(neckMuscle);
  });
  // 喉の袋（前面の膨らみ）
  const throat = makeEllipsoid(0.12, 0.28, 0.18, bc2, em, 0.1);
  throat.position.set(0, 0.5, 0.78);
  throat.rotation.x = -0.2;
  g.add(throat);

  // === 頭部（シャープで一体的なドラゴンヘッド） ===
  // メイン頭蓋（大きく角張った形状）
  const skull = makeEllipsoid(s.hRx*1.2, s.hRy*1.05, s.hRz*0.9, bodyColor, em, 0.2);
  skull.position.set(0, 1.38, 0.85);
  g.add(skull);
  // 吻部（上顎 — 短めに詰めてコンパクト）
  const snout = makeEllipsoid(s.hRx*0.75, s.hRy*0.55, s.hRz*0.9, bodyColor, em, 0.2);
  snout.position.set(0, 1.28, 1.15);
  g.add(snout);
  // 鼻先
  const snoutTip = makeEllipsoid(s.hRx*0.55, s.hRy*0.4, s.hRz*0.25, bodyColor, em, 0.22);
  snoutTip.position.set(0, 1.25, 1.38);
  g.add(snoutTip);
  // 鼻梁（上面の鋭い稜線）
  const noseBridge = makeEllipsoid(s.hRx*0.2, 0.08, s.hRz*0.7, bodyColor, em, 0.25);
  noseBridge.position.set(0, 1.42, 1.05);
  g.add(noseBridge);
  // 下顎（しっかり開いた口）
  const lowerJaw = makeEllipsoid(s.hRx*0.65, s.hRy*0.35, s.hRz*0.7, bodyColor, em, 0.18);
  lowerJaw.position.set(0, 1.08, 1.05);
  lowerJaw.rotation.x = 0.15;
  g.add(lowerJaw);
  // 下顎先端
  const lowerJawTip = makeEllipsoid(s.hRx*0.45, s.hRy*0.22, s.hRz*0.25, bodyColor, em, 0.18);
  lowerJawTip.position.set(0, 1.03, 1.28);
  g.add(lowerJawTip);
  // 口の内部（暗い空洞）
  const mouthInside = makeEllipsoid(s.hRx*0.5, 0.08, s.hRz*0.4, '#080808', '#000000', 0);
  mouthInside.position.set(0, 1.15, 1.12);
  g.add(mouthInside);
  // 牙（上顎 — 前方2本が大きく、奥2本が小さい）
  [[-0.1, 1.18, 1.32], [0.1, 1.18, 1.32], [-0.07, 1.18, 1.18], [0.07, 1.18, 1.18]].forEach(([x,y,z], i) => {
    const fh = i < 2 ? 0.2 : 0.13;
    const fang = makeCone(0.028, fh, '#e8e0d0', '#ffffff', 0.5);
    fang.position.set(x, y-fh*0.5, z);
    fang.rotation.x = Math.PI;
    g.add(fang);
  });
  // 牙（下顎 — 上向きに突き出す）
  [[-0.09, 1.1, 1.22], [0.09, 1.1, 1.22]].forEach(([x,y,z]) => {
    const fang = makeCone(0.024, 0.15, '#e8e0d0', '#ffffff', 0.5);
    fang.position.set(x, y, z);
    g.add(fang);
  });
  // 眉稜（目の上に大きく庇のように張り出す）
  [[-1, 0], [1, 0]].forEach(([side]) => {
    const browRidge = makeEllipsoid(0.16, 0.07, 0.18, bodyColor, em, 0.25);
    browRidge.position.set(side*0.17, 1.5, 1.0);
    g.add(browRidge);
  });
  // 頬骨（側面に鋭く張り出す）
  [[-1, 0], [1, 0]].forEach(([side]) => {
    const cheek = makeEllipsoid(0.12, 0.07, 0.2, bodyColor, em, 0.2);
    cheek.position.set(side*0.28, 1.25, 0.92);
    g.add(cheek);
  });
  // 目（大きく光る鋭い目 — 顔の横に配置）
  const eyeW = 0.085;
  const eyeH = 0.05;
  [[-0.22, 0], [0.22, 0]].forEach(([x]) => {
    // 眼窩（暗いくぼみ — 大きめ）
    const eyeSocket = makeEllipsoid(eyeW+0.04, eyeH+0.04, 0.05, '#020502', '#000000', 0);
    eyeSocket.position.set(x, 1.38, 1.06);
    g.add(eyeSocket);
    // 虹彩グロー（強く発光）
    const eyeGlow = makeEllipsoid(eyeW+0.015, eyeH+0.015, 0.03, c, em, 1.2);
    eyeGlow.position.set(x, 1.38, 1.08);
    g.add(eyeGlow);
    // 白目+虹彩（はっきり光る）
    const eye = makeEllipsoid(eyeW, eyeH, 0.025, '#ffffff', c, 1.5);
    eye.position.set(x, 1.38, 1.10);
    g.add(eye);
    // 瞳孔（縦スリット）
    const pupil = makeEllipsoid(eyeW*0.18, eyeH*0.85, 0.015, '#000000', '#000000', 0);
    pupil.position.set(x, 1.38, 1.115);
    g.add(pupil);
  });
  // 鼻孔
  [[-0.06, 0], [0.06, 0]].forEach(([x]) => {
    const nostril = makeSphere(0.028, c, em, 0.6);
    nostril.position.set(x, 1.28, 1.48);
    g.add(nostril);
  });
  // 後頭部スパイク列（大→小、後ろに反る）
  for (let i = 0; i < 5; i++) {
    const spH = 0.16 - i*0.02;
    const sp = makeCone(0.025, spH, bodyColor, em, 0.3);
    sp.position.set(0, 1.55-i*0.015, 0.65+i*0.1);
    sp.rotation.x = -0.35;
    g.add(sp);
  }
  // 下顎の棘（アゴヒゲの鋭い突起 × 3）
  for (let i = 0; i < 3; i++) {
    const chinSpike = makeCone(0.02, 0.1+i*0.01, bodyColor, em, 0.2);
    chinSpike.position.set(0, 0.98, 1.1+i*0.08);
    chinSpike.rotation.x = Math.PI * 0.85;
    g.add(chinSpike);
  }

  // 脚（太く頑丈な四肢）
  const legPositions = [[-0.42,-0.2,0.35],[0.42,-0.2,0.35],[-0.38,-0.15,-0.38],[0.38,-0.15,-0.38]];
  // 前脚
  [[-0.42,-0.2,0.35],[0.42,-0.2,0.35]].forEach(([x,y,z]) => {
    // 太もも（太い楕円体）
    const thigh = makeEllipsoid(0.2, 0.25, 0.2, bodyColor, em, 0.15);
    thigh.position.set(x, y-0.05, z);
    g.add(thigh);
    // 脛（太いテーパーシリンダー）
    const shin = makeCylinder(0.16, 0.12, 0.35, bodyColor, em, 0.15);
    shin.position.set(x, y-0.3, z+0.03);
    g.add(shin);
    // 足（がっしりした楕円体）
    const foot = makeEllipsoid(0.15, 0.07, 0.18, bodyColor, em, 0.12);
    foot.position.set(x, y-0.52, z+0.08);
    g.add(foot);
    // 爪×3（足の前端から生える）
    for (let ti = 0; ti < 3; ti++) {
      const angle = (ti - 1) * 0.7;
      const tx = x + Math.sin(angle) * 0.12;
      const tz = z + 0.08 + 0.14 + Math.cos(angle) * 0.04;
      const claw = makeCone(0.035, 0.13, c, em, 0.7);
      claw.position.set(tx, y-0.52, tz);
      claw.rotation.x = Math.PI/2 + 0.3;
      claw.rotation.y = angle * 0.5;
      g.add(claw);
    }
  });
  // 後脚（前脚よりさらに太く筋肉質）
  [[-0.38,-0.15,-0.38],[0.38,-0.15,-0.38]].forEach(([x,y,z]) => {
    // 太もも（巨大な楕円体）
    const thigh = makeEllipsoid(0.24, 0.3, 0.24, bodyColor, em, 0.15);
    thigh.position.set(x, y-0.02, z);
    g.add(thigh);
    // 脛（太いテーパー）
    const shin = makeCylinder(0.18, 0.13, 0.4, bodyColor, em, 0.15);
    shin.position.set(x, y-0.32, z+0.04);
    g.add(shin);
    // 足（がっしりした楕円体）
    const foot = makeEllipsoid(0.17, 0.08, 0.2, bodyColor, em, 0.12);
    foot.position.set(x, y-0.58, z+0.1);
    g.add(foot);
    // 爪×3（足の前端から生える）
    for (let ti = 0; ti < 3; ti++) {
      const angle = (ti - 1) * 0.75;
      const tx = x + Math.sin(angle) * 0.14;
      const tz = z + 0.1 + 0.16 + Math.cos(angle) * 0.05;
      const claw = makeCone(0.04, 0.15, c, em, 0.7);
      claw.position.set(tx, y-0.58, tz);
      claw.rotation.x = Math.PI/2 + 0.3;
      claw.rotation.y = angle * 0.5;
      g.add(claw);
    }
  });

  // === 属性別固有パーツ ===
  if (attr === 'fire') {
    // ---- 角（大×2 + 小×2） ----
    [[-0.18, 1.7, 0.6], [0.18, 1.7, 0.6]].forEach(([x,y,z]) => {
      const horn = makeCone(0.07, s.hornH, c, em, 0.9);
      horn.position.set(x, y, z);
      horn.rotation.x = -0.4;
      horn.rotation.z = x<0 ? -0.15 : 0.15;
      g.add(horn);
      const hornRing = makeTorus(0.08, 0.015, c, em, 0.5);
      hornRing.position.set(x, y-0.1, z+0.04);
      hornRing.rotation.x = -0.4;
      g.add(hornRing);
    });
    [[-0.3, 1.5, 0.8], [0.3, 1.5, 0.8]].forEach(([x,y,z]) => {
      const sideHorn = makeCone(0.04, 0.3, c, em, 0.7);
      sideHorn.position.set(x, y, z);
      sideHorn.rotation.x = -0.2;
      sideHorn.rotation.z = x<0 ? -0.5 : 0.5;
      g.add(sideHorn);
    });
    // ---- 翼（解剖学的バットウイング + 炎装飾） ----
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const w = buildBatWing(g, side, {
        bc: c, be: em, bi: 0.5, mc: c, me: em, mi: 0.25,
      });
      // 翼先端の炎
      const wf1 = makeSphere(0.09, '#FF8C00', em, 1.0);
      wf1.position.set(...w.tip);
      g.add(wf1);
      const wf2 = makeSphere(0.05, '#FFD700', em, 1.2);
      wf2.position.set(w.tip[0]*1.02, w.tip[1]+0.1, w.tip[2]-0.02);
      g.add(wf2);
      // 下スパー先端にも炎
      const wf3 = makeSphere(0.06, '#FF8C00', em, 0.8);
      wf3.position.set(...w.sp2);
      g.add(wf3);
    });
    // ---- 尻尾（球7個 → 炎2段） ----
    const tailData = [
      {r:0.38,p:[0,-0.3,-1.05]},{r:0.32,p:[0,-0.45,-1.6]},{r:0.26,p:[0.08,-0.6,-2.1]},
      {r:0.21,p:[0.16,-0.72,-2.55]},{r:0.16,p:[0.24,-0.82,-2.95]},{r:0.12,p:[0.3,-0.88,-3.3]},
      {r:0.08,p:[0.35,-0.92,-3.6]},
    ];
    tailData.forEach(({r,p}) => {
      const seg = makeSphere(r, bodyColor, em, 0.15);
      seg.position.set(...p);
      g.add(seg);
    });
    // 尻尾の鱗突起（左右交互）
    for (let ti = 0; ti < 5; ti++) {
      const sp = makeCone(0.035, 0.12+ti*0.01, c, em, 0.6);
      sp.position.set((ti%2-0.5)*0.15, -0.35-ti*0.12, -1.2-ti*0.5);
      g.add(sp);
    }
    // 尻尾の炎
    const tf1 = makeEllipsoid(0.2, 0.35, 0.18, c, em, 0.9);
    tf1.position.set(0.4, -0.85, -3.85);
    g.add(tf1);
    const tf2 = makeSphere(0.12, '#FF8C00', em, 1.0);
    tf2.position.set(0.42, -0.78, -4.0);
    g.add(tf2);
    const tf3 = makeSphere(0.06, '#FFD700', em, 1.2);
    tf3.position.set(0.45, -0.72, -4.1);
    g.add(tf3);
    // ---- 背びれ（コーン8本 + 根本リング） ----
    for (let i = 0; i < 8; i++) {
      const h = 0.2 + (i%2)*0.16 + i*0.015;
      const spine = makeCone(0.04, h, i%2===0 ? c : '#FF8C00', em, 0.7);
      spine.position.set(0, 0.56+i*0.015, -0.3+i*0.18);
      g.add(spine);
      if (i % 2 === 0) {
        const ring = makeTorus(0.045, 0.01, c, em, 0.4);
        ring.position.set(0, 0.53+i*0.015, -0.3+i*0.18);
        g.add(ring);
      }
    }
    // ---- 体の炎模様（体表面に小さい楕円を散りばめ） ----
    for (let i = 0; i < 6; i++) {
      const angle = i * 1.05;
      const mark = makeEllipsoid(0.06, 0.04, 0.12, c, em, 0.5+i*0.08);
      mark.position.set(Math.sin(angle)*s.bRx*0.85, -0.2+Math.cos(angle)*0.3, -0.1+i*0.15);
      mark.rotation.z = angle;
      g.add(mark);
    }

  }

  // === 育成タイプによる追加装飾 ===
  if (type === 'attacker') {
    // アタッカー：大きな爪 + 牙 + 額の傷跡
    legPositions.forEach(([x,y,z], li) => {
      const isFront = li < 2;
      const clawY = isFront ? y-0.54 : y-0.6;
      const clawZ = isFront ? z+0.18 : z+0.22;
      const bigClaw = makeCone(0.065, 0.28, c, em, 0.9);
      bigClaw.position.set(x, clawY, clawZ);
      bigClaw.rotation.x = 0.6;
      g.add(bigClaw);
    });
    [[-0.1, 1.02, 1.18], [0.1, 1.02, 1.18]].forEach(([x,y,z]) => {
      const fang = makeCone(0.035, 0.18, '#ffffff', '#ffffff', 0.8);
      fang.position.set(x, y, z);
      fang.rotation.x = Math.PI;
      g.add(fang);
    });
    // 額の傷跡（3本の短いシリンダー）
    for (let i = 0; i < 3; i++) {
      const scar = makeCylinder(0.008, 0.008, 0.12, c, em, 0.6);
      scar.position.set(-0.06+i*0.06, 1.45+i*0.015, 1.0);
      scar.rotation.z = 0.4;
      g.add(scar);
    }
  } else if (type === 'tank') {
    // タンク：装甲プレート×5 + 肩ガード大 + 尻尾の鎧
    for (let i = 0; i < 5; i++) {
      const plate = makeEllipsoid(s.bRx*0.28, 0.08, 0.25, c, em, 0.35+i*0.04);
      plate.position.set(0, 0.72+i*0.035, -0.45+i*0.28);
      g.add(plate);
    }
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const shoulder = makeEllipsoid(0.2, 0.16, 0.22, c, em, 0.45);
      shoulder.position.set(side*0.75, 0.3, 0.22);
      g.add(shoulder);
      const shoulderSpike = makeCone(0.035, 0.15, c, em, 0.7);
      shoulderSpike.position.set(side*0.9, 0.42, 0.22);
      shoulderSpike.rotation.z = side*(-0.3);
      g.add(shoulderSpike);
    });
  } else if (type === 'speedster') {
    // スピード：翼ブースター + 流線型ヒレ + 尻尾の推進フィン
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const booster = makeEllipsoid(0.09, 0.14, 0.35, c, em, 0.9);
      booster.position.set(side*2.0, 0.3, -0.7);
      booster.rotation.z = side*0.3;
      g.add(booster);
      const boosterGlow = makeSphere(0.05, '#ffffff', c, 1.0);
      boosterGlow.position.set(side*2.0, 0.3, -0.95);
      g.add(boosterGlow);
    });
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const fin = makeEllipsoid(0.28, 0.04, 0.4, c, em, 0.5);
      fin.position.set(side*1.15, -0.15, -0.4);
      g.add(fin);
    });
    // 尻尾フィン
    const tailFin = makeEllipsoid(0.2, 0.03, 0.25, c, em, 0.6);
    tailFin.position.set(0, -0.65, -2.5);
    g.add(tailFin);
  }

  addAttrEffect(g, attr, 'adult');
  return g;
}

// 属性ごとのエフェクトパーティクル（スムーズ球）
function addAttrEffect(group, attr, stage) {
  if (!group.userData.particles) group.userData.particles = [];
  const c = hexToThreeColor(ATTR[attr].color);
  const count = stage === 'adult' ? 30 : 20;
  for (let i = 0; i < count; i++) {
    const size = 0.04 + Math.random() * 0.06;
    const geo = new THREE.SphereGeometry(size, 8, 6);
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
    group.userData.particles.push(mesh);
  }
}

// ============================================================
// ドラゴン生成の窓口
// ============================================================
const BABY_SCALE = 0.65;
function buildDragon(attr, stage, type) {
  const g = stage === 'adult' ? buildAdultDragon(attr, type) : buildBabyDragon(attr);
  if (stage !== 'adult') g.scale.multiplyScalar(BABY_SCALE);
  g.userData.stage = stage;
  return g;
}

// 属性パーティクルの周回アニメーション
function animateDragonParticles(group, t) {
  const ps = group && group.userData.particles;
  if (!ps) return;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i], d = p.userData;
    const angle = d.baseAngle + t * d.speed;
    p.position.x = Math.cos(angle) * d.radius;
    p.position.z = Math.sin(angle) * d.radius;
    p.position.y = Math.sin(t * d.ySpeed + d.yOffset) * 0.6;
    p.material.opacity = 0.35 + Math.sin(t * 2 + d.yOffset) * 0.25;
  }
}

// 被弾・発光演出用：全メッシュの基準発光量を記録し、flash(0..1) を上乗せする
function setDragonFlash(group, amount) {
  if (!group) return;
  if (!group.userData.emissiveMeshes) {
    group.userData.emissiveMeshes = [];
    group.traverse(o => {
      if (o.isMesh && o.material && o.material.emissiveIntensity !== undefined && !(group.userData.particles || []).includes(o)) {
        o.userData.baseEmissive = o.material.emissiveIntensity;
        group.userData.emissiveMeshes.push(o);
      }
    });
  }
  group.userData.emissiveMeshes.forEach(o => {
    o.material.emissiveIntensity = o.userData.baseEmissive + amount * 1.6;
  });
}

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
