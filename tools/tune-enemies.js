#!/usr/bin/env node
/* ============================================================
   Dragon Cradle — 敵種族の強さ補正（pw）の調整ツール
   使い方: node tools/tune-enemies.js [fights]
   各種族について、標準的に育った竜が「ドラゴンの敵」と戦うときと同じ勝率になる
   HP 補正 pw を二分探索で求め、balance.js に書く値を出力する。
   ============================================================ */
'use strict';
const B = require('../js/balance.js');

const N = Number(process.argv[2]) || 300;
const LEVELS = [6, 12, 21, 31, 46];

// 標準的に育った竜（敵の想定と同じ鍛錬量）
function stdPlayer(attr, level) {
  const t = Math.max(0, level - 1);
  return {
    attr, type: 'balanced',
    stats: B.calcStats({ attr, level, stage: level >= 8 ? 'adult' : 'baby', trained: { hp: t * 6.5, atk: t * 1.7, def: t * 1.7, spd: t * 1.7 } }),
  };
}

function winRate(species, level, pw) {
  const sp = B.ENEMY_SPECIES[species];
  const saved = sp.pw;
  sp.pw = pw;
  let w = 0, n = 0;
  for (const pa of B.ATTR_KEYS) {
    for (let i = 0; i < N; i++) {
      const ea = sp.attr || B.ATTR_KEYS[i % 4];
      const b = B.createBattle(stdPlayer(pa, level), { attr: ea, level, stats: B.calcEnemyStats(level, ea, species) });
      let g = 0;
      while (!b.over && g++ < 200) B.resolveTurn(b, B.autoCommand(b));
      if (b.winner === 'player') w++;
      n++;
    }
  }
  sp.pw = saved;
  return w / n;
}

const levelsFor = sp => LEVELS.filter(L => L >= sp.minLv && (!sp.maxLv || L <= sp.maxLv + 4));
const avgWin = (species, pw, levels) => levels.reduce((s, L) => s + winRate(species, L, pw), 0) / levels.length;

const out = {};
for (const species of B.ENEMY_SPECIES_KEYS) {
  if (species === 'dragon') continue;
  const sp = B.ENEMY_SPECIES[species];
  const levels = levelsFor(sp);
  const target = avgWin('dragon', 1, levels);
  let lo = 0.4, hi = 2.2;
  for (let k = 0; k < 12; k++) {
    const mid = (lo + hi) / 2;
    if (avgWin(species, mid, levels) > target) lo = mid; else hi = mid;
  }
  const pw = Math.round((lo + hi) / 2 * 100) / 100;
  out[species] = pw;
  console.log(`${species.padEnd(13)} Lv[${levels.join(',')}] 目標勝率 ${(target * 100).toFixed(1)}%  pw=${pw}  （補正前 ${(avgWin(species, 1, levels) * 100).toFixed(1)}% → 補正後 ${(avgWin(species, pw, levels) * 100).toFixed(1)}%）`);
}
console.log('\n' + JSON.stringify(out));
