#!/usr/bin/env node
/* ============================================================
   Dragon Cradle — バランスシミュレーター
   使い方: node tools/simulate-balance.js [runs]      … 属性×鍛錬方針ごとの到達Lv・勝率
           PROBE=1 node tools/simulate-balance.js   … 到達時のステータスと敵ステータスの比較
   プレイスタイル別に「どのLvで詰まるか」「何戦でどこまで行けるか」を出力する。
   ============================================================ */
'use strict';
const B = require('../js/balance.js');

const RUNS = Number(process.argv[2]) || 200;
const BATTLE_SECONDS = 50; // 1戦あたりの想定プレイ時間（スタミナ自然回復の計算用）

// 鍛錬方針：どのステータスを鍛えるか
const PLANS = {
  none:      null,
  balanced:  ['feed', 'train-atk', 'train-def', 'train-spd'],
  attacker:  ['train-atk', 'train-atk', 'feed', 'train-spd'],
  tank:      ['train-def', 'train-def', 'feed', 'train-atk'],
  speedster: ['train-spd', 'train-spd', 'train-atk', 'feed'],
};

function newDragon(attr) {
  return {
    attr, level: 1, exp: 0, stage: 'baby', growthPt: 0,
    trained: { hp: 0, atk: 0, def: 0, spd: 0 },
    trainCount: { atk: 0, def: 0, spd: 0 },
    stamina: B.STA_MAX, staClock: 0,
  };
}

function train(d, plan, i) {
  const type = plan[i % plan.length];
  const t = B.TRAINING[type];
  const mult = B.rollTrainingMult();
  d.trained[t.stat] += B.calcTrainingGain(type, d.trained, d.level, mult);
  if (t.stat !== 'hp') d.trainCount[t.stat]++;
  addGrowth(d, t.growth);
}
function addGrowth(d, pt) {
  if (d.stage !== 'baby') return;
  d.growthPt += pt;
  if (d.growthPt >= B.RAISE_MAX) d.stage = 'adult';
}

function fight(d, enemyLevel) {
  const type = B.decideDragonType(d.trainCount);
  const eAttr = B.pickEnemyAttr(enemyLevel);
  const b = B.createBattle(
    { attr: d.attr, type, stats: B.calcStats(d) },
    { attr: eAttr, level: enemyLevel, stats: B.calcEnemyStats(enemyLevel, eAttr) },
  );
  let guard = 0;
  while (!b.over && guard++ < 200) {
    B.resolveTurn(b, B.autoCommand(b));
  }
  return { win: b.winner === 'player', turns: b.turn };
}

function run(attr, planName, maxBattles = 300) {
  const plan = PLANS[planName];
  const d = newDragon(attr);
  // 孵化直後はスタミナ満タン
  let level = 1, streakLoss = 0, wins = 0, trainIdx = 0;
  const reachedAt = {};
  const lossAt = {};
  const snaps = {};
  const bandFights = [0, 0, 0, 0, 0], bandWins = [0, 0, 0, 0, 0];
  for (let n = 0; n < maxBattles; n++) {
    // スタミナ自然回復
    d.staClock += BATTLE_SECONDS * 1000;
    while (d.staClock >= B.STA_RECOVER_MS) { d.staClock -= B.STA_RECOVER_MS; d.stamina = Math.min(B.STA_MAX, d.stamina + 1); }
    if (plan) while (d.stamina > 0) { d.stamina--; train(d, plan, trainIdx++); }

    const r = fight(d, level);
    const band = level <= 10 ? 0 : level <= 20 ? 1 : level <= 35 ? 2 : level <= 50 ? 3 : 4;
    bandFights[band]++; if (r.win) bandWins[band]++;
    if (r.win) {
      wins++; streakLoss = 0;
      d.exp += B.expForWin(level, B.isBossLevel(level));
      while (d.exp >= B.expToNext(d.level) && d.level < B.LEVEL_MAX) { d.exp -= B.expToNext(d.level); d.level++; d.stamina = B.STA_MAX; }
      d.stamina = Math.min(B.STA_MAX, d.stamina + B.STA_PER_WIN);
      addGrowth(d, 4);
      level++;
      if (!reachedAt[level]) { reachedAt[level] = n + 1; snaps[level] = { dlv: d.level, ...B.calcStats(d), trained: { ...d.trained } }; }
    } else {
      d.exp += Math.round(B.expForWin(level, B.isBossLevel(level)) * B.EXP_ON_LOSE);
      while (d.exp >= B.expToNext(d.level) && d.level < B.LEVEL_MAX) { d.exp -= B.expToNext(d.level); d.level++; d.stamina = B.STA_MAX; }
      lossAt[level] = (lossAt[level] || 0) + 1;
      streakLoss++;
      if (!plan && streakLoss >= 15) break; // 鍛錬しないと詰む
    }
  }
  return { snaps, bandFights, bandWins, level, dragonLv: d.level, stage: d.stage, reachedAt, lossAt, wins, type: B.decideDragonType(d.trainCount), stats: B.calcStats(d) };
}

function summarize() {
  const milestones = [5, 10, 20, 30, 40, 50, 70];
  for (const planName of Object.keys(PLANS)) {
    console.log(`\n=== 方針: ${planName}（300戦） ===`);
    console.log('属性    | 到達Lv(中央値) | 竜Lv | ' + milestones.map(m => `Lv${m}到達(戦)`).join(' | ') + ' | 序盤敗北(Lv1-5) | 勝率 Lv1-10/11-20/21-35/36-50/51+');
    for (const attr of B.ATTR_KEYS) {
      const rs = [];
      for (let i = 0; i < RUNS; i++) rs.push(run(attr, planName));
      const med = arr => { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
      const lv = med(rs.map(r => r.level));
      const dlv = med(rs.map(r => r.dragonLv));
      const ms = milestones.map(m => {
        const xs = rs.map(r => r.reachedAt[m]).filter(Boolean);
        return xs.length >= RUNS / 2 ? String(med(xs)).padStart(4) : '   -';
      });
      const early = rs.reduce((s, r) => s + [1, 2, 3, 4, 5].reduce((a, l) => a + (r.lossAt[l] || 0), 0), 0) / RUNS;
      const wr = [0, 1, 2, 3, 4].map(i => {
        const f = rs.reduce((s, r) => s + r.bandFights[i], 0), w = rs.reduce((s, r) => s + r.bandWins[i], 0);
        return f ? Math.round(100 * w / f) + '%' : '-';
      }).join('/');
      console.log(`${attr.padEnd(7)} | ${String(lv).padStart(13)} | ${String(dlv).padStart(4)} | ` + ms.map(s => s.padStart(12)).join(' | ') + ` | ${early.toFixed(2)} | ${wr}`);
    }
  }
}

function statsProbe() {
  console.log('\n=== 到達時の平均ステータス（balanced方針, fire） vs 敵（平均属性） ===');
  const rs = []; for (let i = 0; i < RUNS; i++) rs.push(run(process.env.ATTR || 'fire', process.env.PLAN || 'balanced'));
  for (const L of [5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
    const xs = rs.map(r => r.snaps[L]).filter(Boolean);
    if (!xs.length) continue;
    const avg = k => (xs.reduce((s, x) => s + x[k], 0) / xs.length).toFixed(0);
    const avgT = k => (xs.reduce((s, x) => s + x.trained[k], 0) / xs.length).toFixed(0);
    const es = B.ATTR_KEYS.map(a => B.calcEnemyStats(L, a));
    const eavg = k => (es.reduce((s, x) => s + x[k], 0) / es.length).toFixed(0);
    console.log(`Lv${L}: 竜Lv${avg('dlv')} hp${avg('hp')} atk${avg('atk')} def${avg('def')} spd${avg('spd')} (鍛錬 hp${avgT('hp')} atk${avgT('atk')} def${avgT('def')} spd${avgT('spd')}) | 敵 hp${eavg('hp')} atk${eavg('atk')} def${eavg('def')} spd${eavg('spd')}`);
  }
}

if (process.env.PROBE) statsProbe();
else summarize();
