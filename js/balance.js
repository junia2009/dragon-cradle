/* ============================================================
   Dragon Cradle — balance.js
   ゲームデータとバランス計算（DOM / Three.js 非依存の純粋ロジック）
   ブラウザではグローバル定数として、Node では module.exports として使える。
   `node tools/simulate-balance.js` で勝率カーブを検証できる。
   ============================================================ */
'use strict';

// ------------------------------------------------------------
// 属性
// ------------------------------------------------------------
const ATTR = {
  fire:    { name: '炎ドラゴン', short: '炎', color: '#FF6A3D', emissive: '#E8361A', fogColor: 0x1a0702, raiseBg: 0x241008, role: 'アタッカー' },
  ice:     { name: '氷ドラゴン', short: '氷', color: '#5FD8FF', emissive: '#1C9CC8', fogColor: 0x02121c, raiseBg: 0x081a26, role: 'タンク' },
  thunder: { name: '雷ドラゴン', short: '雷', color: '#FFD447', emissive: '#C99A12', fogColor: 0x141002, raiseBg: 0x1f1a08, role: 'スピード' },
  dark:    { name: '闇ドラゴン', short: '闇', color: '#A779FF', emissive: '#6A2EE8', fogColor: 0x0a0414, raiseBg: 0x150b26, role: 'バランス' },
};
const ATTR_KEYS = ['fire', 'ice', 'thunder', 'dark'];

// 相性：炎→氷→雷→炎 の三すくみ。闇はどれとも等倍（相性ブレのない安定型）
const ATTR_ADVANTAGE = { fire: 'ice', ice: 'thunder', thunder: 'fire' };
const ATTR_STRONG = 1.3;
const ATTR_WEAK   = 0.77;

// Lv1 幼体の基礎値 と Lvごとの成長量。属性ごとの総合力は同等になるよう調整済み
const BASE_STATS = {
  fire:    { hp: 64, atk: 18, def: 10, spd: 14 },
  ice:     { hp: 84, atk: 13, def: 16, spd: 9  },
  thunder: { hp: 58, atk: 15, def: 9,  spd: 20 },
  dark:    { hp: 72, atk: 15, def: 14, spd: 14 },
};
const GROWTH = {
  fire:    { hp: 6.0, atk: 2.2, def: 1.1, spd: 1.2 },
  ice:     { hp: 8.2, atk: 1.5, def: 1.9, spd: 0.9 },
  thunder: { hp: 5.6, atk: 1.8, def: 1.0, spd: 2.0 },
  dark:    { hp: 6.9, atk: 1.85, def: 1.5, spd: 1.4 },
};
const ADULT_MULT = 1.2; // 成体になると素の能力（基礎＋Lv成長）が 1.2 倍

// ------------------------------------------------------------
// 育成
// ------------------------------------------------------------
const HATCH_MAX  = 100;
const HATCH_IDLE = 6000;   // 放置で孵化 +1pt / 6秒
const RAISE_MAX  = 60;     // 成長ゲージ（幼体→成体）
const RAISE_IDLE = 60000;  // 放置で成長 +1pt / 60秒

const STA_MAX        = 5;
const STA_RECOVER_MS = 90000; // 1スタミナ / 90秒
const STA_PER_WIN    = 1;     // 勝利でスタミナ +1（バトル → 育成 の循環）

// 鍛錬：1回あたりの基礎上昇量。効率は「現在Lvの鍛錬目安」に近づくほど落ちる（ソフトキャップ）
const TRAINING = {
  feed:        { stat: 'hp',  gain: 7, growth: 2, label: 'えさ' },
  'train-atk': { stat: 'atk', gain: 2, growth: 3, label: '攻撃鍛錬' },
  'train-def': { stat: 'def', gain: 2, growth: 3, label: '守り鍛錬' },
  'train-spd': { stat: 'spd', gain: 2, growth: 3, label: '速さ鍛錬' },
};
// 鍛錬目安（このLvでの鍛錬量の基準値）。到達時の効率は 50%
function trainingCap(stat, level) {
  return stat === 'hp' ? 40 + 14 * level : 12 + 3 * level;
}
function trainingEfficiency(stat, trained, level) {
  const cap = trainingCap(stat, level);
  return cap / (cap + trained);
}
// 大成功ロール：68% ×1 / 24% ×2 / 8% ×3
function rollTrainingMult(rng = Math.random) {
  const r = rng();
  if (r < 0.08) return 3;
  if (r < 0.32) return 2;
  return 1;
}
// 鍛錬の上昇量を計算（最低1）
function calcTrainingGain(type, trained, level, mult) {
  const t = TRAINING[type];
  const eff = trainingEfficiency(t.stat, trained[t.stat] || 0, level);
  return Math.max(1, Math.round(t.gain * mult * eff));
}

// ------------------------------------------------------------
// レベル・経験値
// ------------------------------------------------------------
const LEVEL_MAX = 99;
// 勝ち続けると「竜Lv ≒ 敵Lv − 1〜2」で推移する設計
function expToNext(level) {
  return Math.round(24 + 12 * level + 0.08 * level * level);
}
function expForWin(enemyLevel, isBoss) {
  const base = 16 + 11 * enemyLevel;
  return Math.round(isBoss ? base * 1.5 : base);
}
const EXP_ON_LOSE = 0.25; // 負けても経験の 25% は得られる（詰み防止）

// ------------------------------------------------------------
// ドラゴンタイプ（鍛錬傾向で決まる）と必殺技
// ------------------------------------------------------------
const DRAGON_TYPES = {
  balanced:  { label: 'バランス型',   special: 'ドラゴンブレス',   desc: '威力2.5倍・属性不利を無視' },
  attacker:  { label: 'アタッカー型', special: 'バーサークブロー', desc: '威力3.0倍・次の被ダメ+30%' },
  tank:      { label: 'タンク型',     special: 'アイアンウォール', desc: '威力1.0倍・被ダメ70%カット・HP12%回復' },
  speedster: { label: 'スピード型',   special: 'サンダーラッシュ', desc: '0.85倍×3連撃・必ず先制・会心率UP' },
};
function decideDragonType(trainCount) {
  const { atk, def, spd } = trainCount;
  const total = atk + def + spd;
  if (total < 4) return 'balanced';
  const max = Math.max(atk, def, spd);
  if (max < total * 0.5) return 'balanced';
  if (atk === max) return 'attacker';
  if (def === max) return 'tank';
  return 'speedster';
}

// ------------------------------------------------------------
// ステータス算出
// ------------------------------------------------------------
// dragon: { attr, level, stage, trained:{hp,atk,def,spd} }
function calcStats(dragon) {
  const b = BASE_STATS[dragon.attr];
  const g = GROWTH[dragon.attr];
  const m = dragon.stage === 'adult' ? ADULT_MULT : 1;
  const tr = dragon.trained || {};
  const lv = dragon.level - 1;
  const out = {};
  ['hp', 'atk', 'def', 'spd'].forEach(k => {
    out[k] = Math.round((b[k] + g[k] * lv) * m + (tr[k] || 0));
  });
  return out;
}

// ------------------------------------------------------------
// 敵
// ------------------------------------------------------------
const BOSS_INTERVAL  = 5;    // 5の倍数Lvはボス
const BOSS_HP_MULT   = 1.4;
const ENEMY_ADULT_LV = 12;   // このLvから敵が成体になる

function isBossLevel(level) { return level % BOSS_INTERVAL === 0; }

// 敵は「そのLvで標準的に育ったドラゴン」をベースに生成する。
// 序盤はやや弱く（チュートリアル）、Lvが上がるほど標準を上回り、鍛錬が必要になる。
function difficultyCurve(level) {
  return 0.76 + 0.28 * (1 - Math.exp(-(level - 1) / 10)) + 0.0015 * level;
}
// ------------------------------------------------------------
// 敵の種族：出現レベル・能力の傾向（prof）・クセ（trait）
//   pw は種族ごとの強さ補正（tools/tune-enemies.js で、ドラゴン相手と同じ勝率になるよう調整）
// ------------------------------------------------------------
const ENEMY_TRAITS = {
  swift:   { label: '素早い',   desc: '素早く、先に動きやすい' },
  evasive: { label: '回避',     desc: '攻撃をよく避ける' },
  armored: { label: '硬い',     desc: '通常攻撃が効きにくい（必殺技はよく効く）' },
  regen:   { label: '再生',     desc: '毎ターンHPを少し回復する' },
  double:  { label: '連撃',     desc: '通常攻撃が2回攻撃' },
  charger: { label: '溜め上手', desc: '強攻撃の間隔が短い' },
  heavy:   { label: '剛撃',     desc: '強攻撃が特に重い' },
};
const ENEMY_SPECIES = {
  dragon:       { name: null,             attr: null,      minLv: 1,  weight: 2, prof: { hp: 1,    atk: 1,    def: 1,    spd: 1    }, trait: null,      pw: 1 },
  hinoko:       { name: 'ヒノコ',         attr: 'fire',    minLv: 1,  maxLv: 14, prof: { hp: 0.85, atk: 1.05, def: 0.85, spd: 1.3  }, trait: 'swift',   pw: 0.91 },
  yukidama:     { name: 'ユキダマ',       attr: 'ice',     minLv: 1,  maxLv: 18, prof: { hp: 1.05, atk: 0.9,  def: 1.0,  spd: 0.85 }, trait: 'regen',   pw: 0.77 },
  piribee:      { name: 'ピリビー',       attr: 'thunder', minLv: 2,  maxLv: 20, prof: { hp: 0.8,  atk: 0.9,  def: 0.85, spd: 1.35 }, trait: 'double',  pw: 1.05 },
  kageboo:      { name: 'カゲボウ',       attr: 'dark',    minLv: 3,  maxLv: 22, prof: { hp: 0.85, atk: 1.0,  def: 0.9,  spd: 1.2  }, trait: 'evasive', pw: 0.88 },
  flarebat:     { name: 'フレアバット',   attr: 'fire',    minLv: 4,  maxLv: 30, prof: { hp: 0.9,  atk: 1.0,  def: 0.9,  spd: 1.15 }, trait: 'evasive', pw: 0.84 },
  yorukinoko:   { name: 'ヨルキノコ',     attr: 'dark',    minLv: 6,  prof: { hp: 1.1,  atk: 0.9,  def: 1.05, spd: 0.85 }, trait: 'regen',   pw: 0.77 },
  koorigani:    { name: 'コオリガニ',     attr: 'ice',     minLv: 8,  prof: { hp: 1.0,  atk: 0.95, def: 1.4,  spd: 0.7  }, trait: 'armored', pw: 1 },
  magmaturtle:  { name: 'マグマガメ',     attr: 'fire',    minLv: 10, prof: { hp: 1.2,  atk: 0.95, def: 1.3,  spd: 0.65 }, trait: 'armored', pw: 0.94 },
  raijuu:       { name: 'ライジュウ',     attr: 'thunder', minLv: 12, prof: { hp: 1.0,  atk: 1.05, def: 1.0,  spd: 1.05 }, trait: 'charger', pw: 0.87 },
  frostwolf:    { name: 'フロストウルフ', attr: 'ice',     minLv: 14, prof: { hp: 0.9,  atk: 0.95, def: 0.9,  spd: 1.2  }, trait: 'double',  pw: 0.95 },
  stormbird:    { name: 'ストームバード', attr: 'thunder', minLv: 16, prof: { hp: 0.9,  atk: 1.0,  def: 0.9,  spd: 1.2  }, trait: 'evasive', pw: 0.86 },
  shadowknight: { name: 'シャドウナイト', attr: 'dark',    minLv: 18, prof: { hp: 1.1,  atk: 1.05, def: 1.2,  spd: 0.8  }, trait: 'heavy',   pw: 0.84 },
};
const ENEMY_SPECIES_KEYS = Object.keys(ENEMY_SPECIES);

function enemyName(species, attr) {
  return ENEMY_SPECIES[species].name || ATTR[attr].name;
}

// そのLvで出現しうる種族から1体選ぶ。出始めの種族は少し出やすい。ボスは小型以外から
function pickEnemy(level, rng = Math.random) {
  const boss = isBossLevel(level);
  const pool = ENEMY_SPECIES_KEYS.filter(k => {
    const sp = ENEMY_SPECIES[k];
    if (level < sp.minLv) return false;
    if (boss) return !sp.maxLv;
    return !sp.maxLv || level <= sp.maxLv;
  });
  const w = pool.map(k => (ENEMY_SPECIES[k].weight || 1) + (k !== 'dragon' && level - ENEMY_SPECIES[k].minLv < 6 ? 1 : 0));
  let r = rng() * w.reduce((a, b) => a + b, 0);
  let species = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r < 0) { species = pool[i]; break; } }
  const attr = ENEMY_SPECIES[species].attr || ATTR_KEYS[Math.floor(rng() * ATTR_KEYS.length)];
  return { species, attr };
}

function calcEnemyStats(level, attr, species = 'dragon') {
  const sp = ENEMY_SPECIES[species] || ENEMY_SPECIES.dragon;
  const stage = level >= ENEMY_ADULT_LV ? 'adult' : 'baby';
  // 想定される鍛錬量（そのLvまでに標準的なプレイヤーが積む量）
  const expectTrain = Math.max(0, level - 1);
  const trained = {
    hp:  expectTrain * 6.5,
    atk: expectTrain * 1.7,
    def: expectTrain * 1.7,
    spd: expectTrain * 1.7,
  };
  const s = calcStats({ attr, level, stage, trained });
  const d = difficultyCurve(level);
  const boss = isBossLevel(level);
  const P = sp.prof;
  return {
    hp:  Math.round(s.hp * d * (boss ? BOSS_HP_MULT : 1) * P.hp * sp.pw),
    atk: Math.round(s.atk * d * P.atk),
    def: Math.round(s.def * d * P.def),
    spd: Math.round(s.spd * (0.85 + 0.15 * d) * P.spd),
    stage,
    boss,
    species,
    trait: sp.trait,
  };
}

function pickEnemyAttr(level, rng = Math.random) {
  return pickEnemy(level, rng).attr;
}

// ------------------------------------------------------------
// バトル
// ------------------------------------------------------------
const MP_MAX       = 5;
const MP_START     = 2;
const SPECIAL_COST = 3;
const GUARD_MULT   = 0.35;
const CRIT_MULT    = 1.5;

function getAttrMultiplier(attackerAttr, defenderAttr) {
  if (ATTR_ADVANTAGE[attackerAttr] === defenderAttr) return ATTR_STRONG;
  if (ATTR_ADVANTAGE[defenderAttr] === attackerAttr) return ATTR_WEAK;
  return 1.0;
}

// ATK²/(ATK+DEF) 型：防御で 0 に張り付かず、能力差が素直に効く
function baseDamage(atk, def) {
  return atk * atk / (atk + def);
}
function critChance(spdA, spdD, bonus = 0) {
  return 0.05 + Math.min(0.15, Math.max(0, (spdA / spdD - 1) * 0.25)) + bonus;
}
function evadeChance(spdD, spdA) {
  return Math.min(0.2, Math.max(0, (spdD / spdA - 1) * 0.2));
}

// 敵の行動予告：通常は4ターン周期、ボスは3ターン周期で強攻撃（前のターンに予告）
function enemyIntentFor(battle) {
  const tr = battle.enemy.trait;
  let cycle = battle.enemy.boss ? 3 : 4;
  if (tr === 'charger') cycle = Math.max(2, cycle - 1);
  if (tr === 'heavy') cycle += 1;
  return (battle.turn % cycle === cycle - 1) ? 'heavy' : 'normal';
}

function createBattle(player, enemy, rng = Math.random) {
  // player: { attr, type, stats }, enemy: { attr, level, stats(incl. boss) }
  const b = {
    player: { ...player, hp: player.stats.hp, maxHp: player.stats.hp },
    enemy:  { ...enemy,  hp: enemy.stats.hp,  maxHp: enemy.stats.hp, boss: !!enemy.stats.boss, trait: enemy.stats.trait || null, enraged: false },
    mp: MP_START,
    turn: 0,
    exposed: false,  // バーサーク後の無防備状態
    over: false,
    winner: null,
    rng,
  };
  b.intent = enemyIntentFor(b);
  return b;
}

function canSpecial(b) { return b.mp >= SPECIAL_COST; }

// 1回の攻撃判定。events に結果を積む
function strike(b, from, power, opts, events) {
  const rng = b.rng;
  const A = from === 'player' ? b.player : b.enemy;
  const D = from === 'player' ? b.enemy  : b.player;
  const target = from === 'player' ? 'enemy' : 'player';
  const as = A.stats, ds = D.stats;
  const evadeBonus = (target === 'enemy' && b.enemy.trait === 'evasive') ? 0.12 : 0;
  if (!opts.noEvade && rng() < Math.min(0.32, evadeChance(ds.spd, as.spd) + evadeBonus)) {
    events.push({ type: 'evade', target });
    return 0;
  }
  let mult = getAttrMultiplier(A.attr, D.attr);
  if (opts.ignoreWeak) mult = Math.max(1, mult);
  const crit = rng() < critChance(as.spd, ds.spd, opts.critBonus || 0);
  let atk = as.atk;
  if (from === 'enemy' && b.enemy.enraged) atk *= 1.2;
  let dmg = baseDamage(atk, ds.def) * power * mult * (crit ? CRIT_MULT : 1) * (0.92 + rng() * 0.16);
  if (target === 'player') {
    if (b.guardMult) dmg *= b.guardMult;
    if (b.exposed) dmg *= 1.3;
  }
  // 硬い敵：通常攻撃は 0.75 倍、必殺技は 1.15 倍
  if (target === 'enemy' && b.enemy.trait === 'armored') dmg *= opts.special ? 1.15 : 0.75;
  dmg = Math.max(1, Math.round(dmg));
  D.hp = Math.max(0, D.hp - dmg);
  events.push({ type: 'damage', target, amount: dmg, crit, attrMult: mult, heavy: !!opts.heavy, guarded: target === 'player' && !!b.guardMult });
  return dmg;
}

function playerAct(b, cmd, events) {
  const type = b.player.type;
  if (cmd === 'attack') {
    events.push({ type: 'action', who: 'player', cmd });
    strike(b, 'player', 1.0, {}, events);
    b.mp = Math.min(MP_MAX, b.mp + 1);
  } else if (cmd === 'special') {
    b.mp -= SPECIAL_COST;
    events.push({ type: 'action', who: 'player', cmd, special: type });
    if (type === 'attacker') {
      strike(b, 'player', 3.0, { special: true }, events);
      b.exposed = true;
    } else if (type === 'tank') {
      strike(b, 'player', 1.0, { special: true }, events);
      const heal = Math.round(b.player.maxHp * 0.12);
      const before = b.player.hp;
      b.player.hp = Math.min(b.player.maxHp, b.player.hp + heal);
      events.push({ type: 'heal', target: 'player', amount: b.player.hp - before });
    } else if (type === 'speedster') {
      for (let i = 0; i < 3 && b.enemy.hp > 0; i++) {
        strike(b, 'player', 0.85, { critBonus: 0.15, special: true }, events);
      }
    } else {
      strike(b, 'player', 2.5, { ignoreWeak: true, special: true }, events);
    }
  }
}

function enemyAct(b, events) {
  const heavy = b.intent === 'heavy';
  events.push({ type: 'action', who: 'enemy', cmd: heavy ? 'heavy' : 'attack' });
  const tr = b.enemy.trait;
  if (!heavy && tr === 'double') {
    strike(b, 'enemy', 0.6, {}, events);
    if (b.player.hp > 0) strike(b, 'enemy', 0.6, {}, events);
    return;
  }
  let power = heavy ? (b.enemy.boss ? 2.3 : 2.0) : 1.0;
  if (heavy && tr === 'heavy') power += 0.5;
  strike(b, 'enemy', power, { heavy }, events);
}

function checkEnd(b, events) {
  if (b.over) return true;
  if (b.enemy.hp <= 0) { b.over = true; b.winner = 'player'; events.push({ type: 'end', winner: 'player' }); return true; }
  if (b.player.hp <= 0) { b.over = true; b.winner = 'enemy'; events.push({ type: 'end', winner: 'enemy' }); return true; }
  return false;
}

// 1ターンを解決し、演出用のイベント列を返す
function resolveTurn(b, cmd) {
  const events = [];
  if (b.over) return events;
  if (cmd === 'special' && !canSpecial(b)) cmd = 'attack';
  const type = b.player.type;

  // 防御系は行動順に関係なく即時発動
  b.guardMult = 0;
  if (cmd === 'guard') {
    b.guardMult = GUARD_MULT;
    b.mp = Math.min(MP_MAX, b.mp + 2);
    events.push({ type: 'action', who: 'player', cmd: 'guard' });
  } else if (cmd === 'special' && type === 'tank') {
    b.guardMult = 0.3;
  }
  const wasExposed = b.exposed;

  // 行動順：SPD比較（±12%の揺らぎ）。サンダーラッシュは必ず先制
  const rng = b.rng;
  const pSpd = b.player.stats.spd * (0.88 + rng() * 0.24);
  const eSpd = b.enemy.stats.spd  * (0.88 + rng() * 0.24);
  const playerFirst = cmd === 'guard' || (cmd === 'special' && type === 'speedster') || pSpd >= eSpd;

  if (playerFirst) {
    if (cmd !== 'guard') playerAct(b, cmd, events);
    if (!checkEnd(b, events)) { enemyAct(b, events); checkEnd(b, events); }
  } else {
    enemyAct(b, events);
    if (!checkEnd(b, events)) { playerAct(b, cmd, events); checkEnd(b, events); }
  }

  if (wasExposed) b.exposed = false;  // 無防備は1ターン限り
  b.guardMult = 0;

  // 再生する敵：ターンの終わりに最大HPの6%を回復
  if (!b.over && b.enemy.trait === 'regen' && b.enemy.hp < b.enemy.maxHp) {
    const before = b.enemy.hp;
    b.enemy.hp = Math.min(b.enemy.maxHp, b.enemy.hp + Math.round(b.enemy.maxHp * 0.06));
    events.push({ type: 'heal', target: 'enemy', amount: b.enemy.hp - before });
  }

  // ボスは HP50% 以下で激昂（ATK+20%）
  if (!b.over && b.enemy.boss && !b.enemy.enraged && b.enemy.hp <= b.enemy.maxHp * 0.5) {
    b.enemy.enraged = true;
    events.push({ type: 'enrage' });
  }

  b.turn++;
  if (!b.over) b.intent = enemyIntentFor(b);
  return events;
}

// 自動戦闘 AI（強攻撃はガード、必殺技は溜まったら使い、トドメは通常攻撃で）
function autoCommand(b) {
  const p = b.player, e = b.enemy;
  const hpRatio = p.hp / p.maxHp;
  if (b.intent === 'heavy') {
    if (canSpecial(b) && p.type === 'tank') return 'special';
    return 'guard';
  }
  if (canSpecial(b)) {
    // 通常攻撃でトドメを刺せるなら MP を温存
    const est = baseDamage(p.stats.atk, e.stats.def) * getAttrMultiplier(p.attr, e.attr) * 0.9;
    if (e.hp <= est) return 'attack';
    // バーサークは HP に余裕があるときだけ
    if (p.type === 'attacker' && hpRatio < 0.35) return 'attack';
    return 'special';
  }
  return 'attack';
}

// ------------------------------------------------------------
// スコア
// ------------------------------------------------------------
function scoreForWin(enemyLevel, streak, isBoss, turns) {
  const base = 100 * enemyLevel;
  const streakBonus = 25 * Math.min(streak, 20);
  const speedBonus = Math.max(0, 8 - turns) * 10 * enemyLevel;
  return Math.round((base + streakBonus + speedBonus) * (isBoss ? 2 : 1));
}

const BalanceAPI = {
  ATTR, ATTR_KEYS, BASE_STATS, GROWTH, ADULT_MULT,
  EXP_ON_LOSE, HATCH_MAX, HATCH_IDLE, RAISE_MAX, RAISE_IDLE,
  STA_MAX, STA_RECOVER_MS, STA_PER_WIN, TRAINING, LEVEL_MAX,
  DRAGON_TYPES, MP_MAX, MP_START, SPECIAL_COST, ENEMY_ADULT_LV,
  trainingCap, trainingEfficiency, rollTrainingMult, calcTrainingGain,
  expToNext, expForWin, decideDragonType, calcStats,
  isBossLevel, calcEnemyStats, pickEnemyAttr, pickEnemy, enemyName, difficultyCurve,
  ENEMY_SPECIES, ENEMY_SPECIES_KEYS, ENEMY_TRAITS,
  getAttrMultiplier, baseDamage, critChance, evadeChance,
  createBattle, resolveTurn, canSpecial, autoCommand, enemyIntentFor,
  scoreForWin,
};
if (typeof module !== 'undefined' && module.exports) module.exports = BalanceAPI;
