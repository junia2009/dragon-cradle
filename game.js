/* ============================================================
   Dragon Cradle — game.js
   Phase 1: 基盤 / Phase 2: 卵・孵化 / Phase 3: ドラゴンモデル
   ============================================================ */
'use strict';

// ============================================================
// 定数
// ============================================================
const ATTR = {
  fire:    { name: '炎ドラゴン',  color: '#FF4500', emissive: '#FF2000', fogColor: 0x1a0500, raiseBg: 0x3a1a0a },
  ice:     { name: '氷ドラゴン',  color: '#00CFFF', emissive: '#0099BB', fogColor: 0x001a2a, raiseBg: 0x0a2a3a },
  thunder: { name: '雷ドラゴン',  color: '#FFD700', emissive: '#CC9900', fogColor: 0x1a1500, raiseBg: 0x3a3010 },
  dark:    { name: '闇ドラゴン',  color: '#7B2FFF', emissive: '#4a00cc', fogColor: 0x080010, raiseBg: 0x1a0a30 },
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
// 孵化タイミング
const HATCH_TIMING_WINDOW = 0.18; // ±この範囲がPERFECT（0〜1の正規化位置）

// スタミナ
const STA_MAX        = 5;
const STA_RECOVER_MS = 60000; // 1スタミナ回復に60秒

// バトル MP
const MP_MAX        = 5;
const SPECIAL_COST  = 3;

// ドラゴンタイプ（育成傾向で決まる）
const DRAGON_TYPES = {
  balanced: { label: 'バランス型',   special: 'ドラゴンブレス',  color: null },
  attacker: { label: 'アタッカー型', special: 'バーサークブロー', color: '#FF4500' },
  tank:     { label: 'タンク型',    special: 'アイアンウォール', color: '#00CFFF' },
  speedster:{ label: 'スピード型',  special: 'サンダーラッシュ', color: '#FFD700' },
};

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
  // 訓練カウント（個性に影響）
  trainCount: { atk: 0, def: 0, spd: 0 },
  dragonType: 'balanced',
  // バトルMP
  mp: MP_MAX,
  // スタミナ
  stamina: STA_MAX,
};

// セーブデータキー
const SAVE_KEY = 'dragon_cradle_save';

// ============================================================
// BGMシステム (Web Audio API — 壮大なオーケストラ風)
// ============================================================
const BGM = (() => {
  let ctx = null;
  let masterGain = null;
  let currentTrack = null;
  let currentNodes = [];
  let muted = false;
  const VOLUME = 0.3;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = muted ? 0 : VOLUME;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function stopAll() {
    currentNodes.forEach(n => { try { n.stop(); } catch(e){} try { n.disconnect(); } catch(e){} });
    currentNodes = [];
    currentTrack = null;
  }

  // ノート発音ヘルパー（アタック→サステイン→リリース）
  function note(ac, type, freq, startT, dur, gainVal, dest) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, startT);
    g.gain.linearRampToValueAtTime(gainVal, startT + 0.04);
    g.gain.setValueAtTime(gainVal, startT + dur - 0.06);
    g.gain.linearRampToValueAtTime(0, startT + dur);
    o.connect(g);
    g.connect(dest);
    o.start(startT);
    o.stop(startT + dur);
    currentNodes.push(o);
  }

  // プラック音（ハープ/チェレスタ風）
  function pluck(ac, freq, startT, decay, gainVal, dest) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, startT);
    g.gain.linearRampToValueAtTime(gainVal, startT + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, startT + decay);
    o.connect(g);
    g.connect(dest);
    o.start(startT);
    o.stop(startT + decay + 0.05);
    currentNodes.push(o);
  }

  // リバーブ風エフェクト
  function createReverb(ac) {
    const convolver = ac.createConvolver();
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
    }
    convolver.buffer = buf;
    return convolver;
  }

  // リバーブ付きバス作成
  function makeBus(ac, dryVal, wetVal) {
    const rev = createReverb(ac);
    rev.connect(masterGain);
    const dry = ac.createGain();
    dry.gain.value = dryVal;
    dry.connect(masterGain);
    const wet = ac.createGain();
    wet.gain.value = wetVal;
    wet.connect(rev);
    const dest = ac.createGain();
    dest.connect(dry);
    dest.connect(wet);
    return dest;
  }

  // === タイトル画面BGM：神秘的なチェレスタ + ゆったりしたパッド ===
  function playTitle() {
    if (currentTrack === 'title') return;
    stopAll();
    currentTrack = 'title';
    const ac = getCtx();
    const dest = makeBus(ac, 0.6, 0.4);

    const loopDur = 16;
    function scheduleLoop(startAt) {
      if (currentTrack !== 'title') return;
      const t0 = startAt || (ac.currentTime + 0.05);

      // ゆったりしたベースパッド（1音ずつ、5度なし）
      const pad = [
        { f: 130.81, t: 0, d: 8 },   // C3
        { f: 174.61, t: 8, d: 8 },   // F3
      ];
      pad.forEach(n => {
        note(ac, 'sine', n.f, t0 + n.t, n.d, 0.08, dest);
      });

      // チェレスタ風メロディ（Cメジャー系、音数を絞る）
      const melody = [
        { f: 523.25, t: 0,    d: 1.2 },  // C5
        { f: 659.25, t: 1.5,  d: 1.2 },  // E5
        { f: 783.99, t: 3,    d: 2.0 },  // G5
        { f: 659.25, t: 5.5,  d: 1.5 },  // E5
        { f: 523.25, t: 7.5,  d: 2.0 },  // C5
        { f: 440.00, t: 10,   d: 1.5 },  // A4
        { f: 493.88, t: 12,   d: 1.5 },  // B4
        { f: 523.25, t: 14,   d: 1.8 },  // C5
      ];
      melody.forEach(n => {
        pluck(ac, n.f, t0 + n.t, n.d, 0.15, dest);
      });

      // ハープアルペジオ（後半、Cメジャーのみ）
      const harp = [261.63, 329.63, 392.00, 523.25];
      harp.forEach((f, i) => {
        pluck(ac, f, t0 + 10 + i * 0.5, 1.5, 0.08, dest);
      });

      const nextStart = t0 + loopDur;
      const delay = (nextStart - ac.currentTime - 0.5) * 1000;
      setTimeout(() => scheduleLoop(nextStart), Math.max(0, delay));
    }
    scheduleLoop();
  }

  // === 育成画面BGM：温かく穏やかなメロディ ===
  function playRaise() {
    if (currentTrack === 'raise') return;
    stopAll();
    currentTrack = 'raise';
    const ac = getCtx();
    const dest = makeBus(ac, 0.7, 0.25);

    const loopDur = 16;
    function scheduleLoop(startAt) {
      if (currentTrack !== 'raise') return;
      const t0 = startAt || (ac.currentTime + 0.05);

      // ベースノート（ルート音のみ、シンプル）
      const bass = [
        { f: 130.81, t: 0,  d: 4 },   // C3
        { f: 146.83, t: 4,  d: 4 },   // D3
        { f: 174.61, t: 8,  d: 4 },   // F3
        { f: 130.81, t: 12, d: 4 },   // C3
      ];
      bass.forEach(n => {
        note(ac, 'sine', n.f, t0 + n.t, n.d, 0.07, dest);
      });

      // 優しいメロディ（三角波、音数控えめ）
      const mel = [
        { f: 523.25, t: 0,   d: 1.2 },  // C5
        { f: 587.33, t: 1.5, d: 1.0 },  // D5
        { f: 659.25, t: 3,   d: 2.0 },  // E5
        { f: 523.25, t: 5.5, d: 1.5 },  // C5
        { f: 440.00, t: 8,   d: 1.5 },  // A4
        { f: 493.88, t: 10,  d: 1.2 },  // B4
        { f: 523.25, t: 12,  d: 2.0 },  // C5
        { f: 392.00, t: 14.5,d: 1.3 },  // G4
      ];
      mel.forEach(n => {
        const st = t0 + n.t;
        const o1 = ac.createOscillator();
        const g1 = ac.createGain();
        o1.type = 'triangle';
        o1.frequency.value = n.f;
        g1.gain.setValueAtTime(0, st);
        g1.gain.linearRampToValueAtTime(0.1, st + 0.05);
        g1.gain.setValueAtTime(0.1, st + n.d * 0.7);
        g1.gain.linearRampToValueAtTime(0, st + n.d);
        o1.connect(g1);
        g1.connect(dest);
        o1.start(st);
        o1.stop(st + n.d + 0.1);
        currentNodes.push(o1);
      });

      // ピチカート（拍頭のみ、4拍に1回）
      const pizzBass = [130.81, 146.83, 174.61, 130.81];
      pizzBass.forEach((f, i) => {
        pluck(ac, f * 2, t0 + i * 4, 0.5, 0.07, dest);
      });

      const nextStart = t0 + loopDur;
      const delay = (nextStart - ac.currentTime - 0.5) * 1000;
      setTimeout(() => scheduleLoop(nextStart), Math.max(0, delay));
    }
    scheduleLoop();
  }

  // === バトル画面BGM: 疾走感のある熱いバトル曲 ===
  function playBattle() {
    if (currentTrack === 'battle') return;
    stopAll();
    currentTrack = 'battle';
    const ac = getCtx();
    const dest = makeBus(ac, 0.75, 0.2);

    // ローパスフィルター（ブラス・メロディ用）
    const lpf = ac.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 2200;
    lpf.connect(dest);

    // ハイパスフィルター（パーカッション用）
    const hpf = ac.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 800;
    hpf.connect(dest);

    const B = 0.4;            // 1拍 = 0.4秒 → BPM150
    const loopDur = B * 64;  // 64拍 = 25.6秒

    function scheduleLoop(startAt) {
      if (currentTrack !== 'battle') return;
      const t0 = startAt || (ac.currentTime + 0.05);

      // === ドライビングベース（8分音符でオクターブパンプ）===
      const bassNotes = [
        // --- セクションA (0-15): Dm→Bb→C→A/Dm ---
        { f: 73.42, t: 0 }, { f: 146.83, t: 1 }, { f: 73.42, t: 2 }, { f: 146.83, t: 3 },
        { f: 58.27, t: 4 }, { f: 116.54, t: 5 }, { f: 58.27, t: 6 }, { f: 116.54, t: 7 },
        { f: 65.41, t: 8 }, { f: 130.81, t: 9 }, { f: 65.41, t: 10 }, { f: 130.81, t: 11 },
        { f: 55.00, t: 12 }, { f: 110.00, t: 13 }, { f: 73.42, t: 14 }, { f: 146.83, t: 15 },
        // --- セクションB (16-31): Gm→Eb→F→Dm (転調感) ---
        { f: 97.99, t: 16 }, { f: 195.99, t: 17 }, { f: 97.99, t: 18 }, { f: 195.99, t: 19 },
        { f: 77.78, t: 20 }, { f: 155.56, t: 21 }, { f: 77.78, t: 22 }, { f: 155.56, t: 23 },
        { f: 87.31, t: 24 }, { f: 174.61, t: 25 }, { f: 87.31, t: 26 }, { f: 174.61, t: 27 },
        { f: 73.42, t: 28 }, { f: 146.83, t: 29 }, { f: 73.42, t: 30 }, { f: 146.83, t: 31 },
        // --- セクションC (32-47): Bb→C→Dm→A (ブレイク→ビルド) ---
        { f: 58.27, t: 32 }, { f: 116.54, t: 33 }, { f: 58.27, t: 34 }, { f: 116.54, t: 35 },
        { f: 65.41, t: 36 }, { f: 130.81, t: 37 }, { f: 65.41, t: 38 }, { f: 130.81, t: 39 },
        { f: 73.42, t: 40 }, { f: 146.83, t: 41 }, { f: 73.42, t: 42 }, { f: 146.83, t: 43 },
        { f: 55.00, t: 44 }, { f: 110.00, t: 45 }, { f: 55.00, t: 46 }, { f: 110.00, t: 47 },
        // --- セクションD (48-63): Dm→Gm→Bb→C→Dm (クライマックス) ---
        { f: 73.42, t: 48 }, { f: 146.83, t: 49 }, { f: 73.42, t: 50 }, { f: 146.83, t: 51 },
        { f: 97.99, t: 52 }, { f: 195.99, t: 53 }, { f: 97.99, t: 54 }, { f: 195.99, t: 55 },
        { f: 58.27, t: 56 }, { f: 116.54, t: 57 }, { f: 65.41, t: 58 }, { f: 130.81, t: 59 },
        { f: 73.42, t: 60 }, { f: 146.83, t: 61 }, { f: 73.42, t: 62 }, { f: 146.83, t: 63 },
      ];
      bassNotes.forEach(n => {
        note(ac, 'sine', n.f, t0 + n.t * B, B * 0.9, 0.12, dest);
        note(ac, 'triangle', n.f * 2, t0 + n.t * B, B * 0.5, 0.04, dest);
      });

      // === パワーコード・ブラス ===
      const chords = [
        // --- セクションA ---
        { notes: [293.66, 440.00], t: 0, d: 1.5 },
        { notes: [293.66, 440.00], t: 3, d: 0.8 },
        { notes: [233.08, 349.23], t: 4, d: 1.5 },
        { notes: [233.08, 349.23], t: 7, d: 0.8 },
        { notes: [261.63, 392.00], t: 8, d: 1.5 },
        { notes: [261.63, 392.00], t: 11, d: 0.8 },
        { notes: [220.00, 329.63], t: 12, d: 1.5 },
        { notes: [293.66, 440.00], t: 14, d: 1.8 },
        // --- セクションB ---
        { notes: [196.00, 293.66], t: 16, d: 1.5 },    // Gm: G3+D4
        { notes: [196.00, 293.66], t: 19, d: 0.8 },
        { notes: [155.56, 233.08], t: 20, d: 1.5 },    // Eb: Eb3+Bb3
        { notes: [155.56, 233.08], t: 23, d: 0.8 },
        { notes: [174.61, 261.63], t: 24, d: 1.5 },    // F: F3+C4
        { notes: [174.61, 261.63], t: 27, d: 0.8 },
        { notes: [293.66, 440.00], t: 28, d: 1.5 },    // Dm
        { notes: [293.66, 440.00], t: 30, d: 1.8 },
        // --- セクションC (ブレイク: コード控えめ、ロングトーン) ---
        { notes: [233.08, 349.23], t: 32, d: 3.5 },    // Bb ロング
        { notes: [261.63, 392.00], t: 36, d: 3.5 },    // C ロング
        { notes: [293.66, 440.00], t: 40, d: 3.5 },    // Dm ロング
        { notes: [220.00, 329.63], t: 44, d: 3.5 },    // Am ロング
        // --- セクションD (クライマックス: 密度高め) ---
        { notes: [293.66, 440.00], t: 48, d: 1.5 },
        { notes: [293.66, 440.00], t: 50, d: 0.8 },
        { notes: [293.66, 440.00], t: 51, d: 0.8 },
        { notes: [196.00, 293.66], t: 52, d: 1.5 },
        { notes: [196.00, 293.66], t: 54, d: 0.8 },
        { notes: [196.00, 293.66], t: 55, d: 0.8 },
        { notes: [233.08, 349.23], t: 56, d: 0.8 },
        { notes: [261.63, 392.00], t: 57, d: 0.8 },
        { notes: [233.08, 349.23], t: 58, d: 0.8 },
        { notes: [261.63, 392.00], t: 59, d: 0.8 },
        { notes: [293.66, 440.00], t: 60, d: 3.8 },    // Dm大解決
      ];
      chords.forEach(ch => {
        ch.notes.forEach(f => {
          note(ac, 'sawtooth', f, t0 + ch.t * B, ch.d * B, 0.035, lpf);
        });
      });

      // === メロディ ===
      const mel = [
        // --- セクションA: 勇壮な主題 ---
        { f: 587.33, t: 0,    d: 0.8 },    // D5
        { f: 659.25, t: 1,    d: 0.8 },    // E5
        { f: 698.46, t: 2,    d: 1.5 },    // F5
        { f: 880.00, t: 3.5,  d: 0.5 },    // A5
        { f: 783.99, t: 4,    d: 0.8 },    // G5
        { f: 698.46, t: 5,    d: 0.8 },    // F5
        { f: 587.33, t: 6,    d: 1.8 },    // D5
        { f: 523.25, t: 8,    d: 0.5 },    // C5
        { f: 587.33, t: 8.5,  d: 0.5 },    // D5
        { f: 698.46, t: 9,    d: 0.5 },    // F5
        { f: 880.00, t: 9.5,  d: 1.5 },    // A5
        { f: 783.99, t: 11,   d: 1.0 },    // G5
        { f: 698.46, t: 12,   d: 0.8 },    // F5
        { f: 659.25, t: 13,   d: 0.8 },    // E5
        { f: 587.33, t: 14,   d: 1.8 },    // D5

        // --- セクションB: 応答フレーズ（高域で展開） ---
        { f: 783.99, t: 16,   d: 0.8 },    // G5
        { f: 880.00, t: 17,   d: 0.8 },    // A5
        { f: 932.33, t: 18,   d: 1.5 },    // Bb5
        { f: 1046.50, t: 19.5, d: 0.5 },   // C6
        { f: 932.33, t: 20,   d: 0.8 },    // Bb5
        { f: 783.99, t: 21,   d: 0.8 },    // G5
        { f: 698.46, t: 22,   d: 1.8 },    // F5
        { f: 880.00, t: 24,   d: 0.5 },    // A5
        { f: 783.99, t: 24.5, d: 0.5 },    // G5
        { f: 698.46, t: 25,   d: 0.5 },    // F5
        { f: 587.33, t: 25.5, d: 1.5 },    // D5
        { f: 659.25, t: 27,   d: 1.0 },    // E5
        { f: 587.33, t: 28,   d: 0.8 },    // D5
        { f: 523.25, t: 29,   d: 0.8 },    // C5
        { f: 587.33, t: 30,   d: 1.8 },    // D5

        // --- セクションC: ブレイク（音数少なめ、溜め） ---
        { f: 466.16, t: 32,   d: 2.0 },    // Bb4 (低く)
        { f: 523.25, t: 34,   d: 2.0 },    // C5
        { f: 587.33, t: 36,   d: 1.0 },    // D5
        { f: 698.46, t: 37,   d: 3.0 },    // F5 (ロング)
        { f: 587.33, t: 40,   d: 1.0 },    // D5
        { f: 659.25, t: 41,   d: 1.0 },    // E5
        { f: 698.46, t: 42,   d: 1.0 },    // F5
        { f: 783.99, t: 43,   d: 1.0 },    // G5 (上昇)
        { f: 880.00, t: 44,   d: 1.0 },    // A5
        { f: 932.33, t: 45,   d: 1.0 },    // Bb5
        { f: 1046.50, t: 46,  d: 1.8 },    // C6 (頂点!)

        // --- セクションD: クライマックス（最も激しく） ---
        { f: 1174.66, t: 48,  d: 0.5 },    // D6
        { f: 1046.50, t: 48.5, d: 0.5 },   // C6
        { f: 880.00, t: 49,   d: 0.5 },    // A5
        { f: 587.33, t: 49.5, d: 0.5 },    // D5
        { f: 783.99, t: 50,   d: 0.8 },    // G5
        { f: 880.00, t: 51,   d: 0.8 },    // A5
        { f: 932.33, t: 52,   d: 0.5 },    // Bb5
        { f: 1046.50, t: 52.5, d: 0.5 },   // C6
        { f: 1174.66, t: 53,  d: 1.0 },    // D6
        { f: 1046.50, t: 54,  d: 0.8 },    // C6
        { f: 932.33, t: 55,   d: 0.8 },    // Bb5
        { f: 880.00, t: 56,   d: 0.5 },    // A5
        { f: 783.99, t: 56.5, d: 0.5 },    // G5
        { f: 698.46, t: 57,   d: 0.5 },    // F5
        { f: 659.25, t: 57.5, d: 0.5 },    // E5
        { f: 587.33, t: 58,   d: 1.0 },    // D5
        { f: 880.00, t: 59,   d: 1.0 },    // A5 (跳躍)
        { f: 587.33, t: 60,   d: 3.8 },    // D5 (大解決ロングトーン)
      ];
      mel.forEach(n => {
        const st = t0 + n.t * B;
        const dur = n.d * B;
        const o1 = ac.createOscillator();
        const g1 = ac.createGain();
        o1.type = 'square';
        o1.frequency.value = n.f;
        g1.gain.setValueAtTime(0, st);
        g1.gain.linearRampToValueAtTime(0.055, st + 0.02);
        g1.gain.setValueAtTime(0.055, st + dur * 0.6);
        g1.gain.linearRampToValueAtTime(0, st + dur);
        o1.connect(g1);
        g1.connect(lpf);
        o1.start(st);
        o1.stop(st + dur + 0.05);
        currentNodes.push(o1);
      });

      // === ティンパニ + スネア ===
      for (let i = 0; i < 64; i++) {
        const st = t0 + i * B;
        // セクションCの前半(32-39)はキック控えめ
        const isBreak = (i >= 32 && i < 40);
        const kickVol = isBreak ? 0.06 : 0.14;

        const ot = ac.createOscillator();
        const gt = ac.createGain();
        ot.type = 'sine';
        ot.frequency.setValueAtTime(80, st);
        ot.frequency.exponentialRampToValueAtTime(40, st + 0.12);
        gt.gain.setValueAtTime(0, st);
        gt.gain.linearRampToValueAtTime(kickVol, st + 0.004);
        gt.gain.exponentialRampToValueAtTime(0.001, st + 0.25);
        ot.connect(gt);
        gt.connect(dest);
        ot.start(st);
        ot.stop(st + 0.3);
        currentNodes.push(ot);

        // スネア風（裏拍のみ、ブレイク中は休み）
        if (i % 2 === 1 && !isBreak) {
          const bufLen = ac.sampleRate * 0.08;
          const noiseBuf = ac.createBuffer(1, bufLen, ac.sampleRate);
          const data = noiseBuf.getChannelData(0);
          for (let j = 0; j < bufLen; j++) data[j] = Math.random() * 2 - 1;
          const ns = ac.createBufferSource();
          ns.buffer = noiseBuf;
          const ng = ac.createGain();
          ng.gain.setValueAtTime(0, st);
          ng.gain.linearRampToValueAtTime(0.1, st + 0.003);
          ng.gain.exponentialRampToValueAtTime(0.001, st + 0.07);
          ns.connect(ng);
          ng.connect(hpf);
          ns.start(st);
          ns.stop(st + 0.1);
          currentNodes.push(ns);
        }
      }

      // === ハイハット風（8分音符刻み） ===
      for (let i = 0; i < 128; i++) {
        const st = t0 + i * B * 0.5;
        const beat = Math.floor(i / 2);
        const isBreak = (beat >= 32 && beat < 40);
        // ブレイク中はハイハット音量下げ
        const baseVol = isBreak ? 0.015 : ((i % 2 === 0) ? 0.04 : 0.025);
        // セクションD(48-)で4分音符の頭にアクセント
        const isClimax = (beat >= 48);
        const vol = (isClimax && i % 4 === 0) ? 0.05 : baseVol;

        const bufLen = ac.sampleRate * 0.03;
        const hhBuf = ac.createBuffer(1, bufLen, ac.sampleRate);
        const hhData = hhBuf.getChannelData(0);
        for (let j = 0; j < bufLen; j++) hhData[j] = Math.random() * 2 - 1;
        const hh = ac.createBufferSource();
        hh.buffer = hhBuf;
        const hhg = ac.createGain();
        hhg.gain.setValueAtTime(0, st);
        hhg.gain.linearRampToValueAtTime(vol, st + 0.002);
        hhg.gain.exponentialRampToValueAtTime(0.001, st + 0.025);
        hh.connect(hhg);
        hhg.connect(hpf);
        hh.start(st);
        hh.stop(st + 0.04);
        currentNodes.push(hh);
      }

      // 次のループを正確なタイミングでスケジュール
      const nextStart = t0 + loopDur;
      const delay = (nextStart - ac.currentTime - 0.3) * 1000;
      setTimeout(() => scheduleLoop(nextStart), Math.max(0, delay));
    }
    scheduleLoop();
  }

  function toggleMute() {
    muted = !muted;
    if (masterGain) masterGain.gain.value = muted ? 0 : VOLUME;
    return muted;
  }

  function isMuted() { return muted; }

  return { playTitle, playRaise, playBattle, stop: stopAll, toggleMute, isMuted, getCtx };
})();

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

  // BGM切り替え
  if (name === 'select' || name === 'hatch') BGM.playTitle();
  else if (name === 'raise' || name === 'record') BGM.playRaise();
  else if (name === 'battle') BGM.playBattle();

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
let hatchResizeHandler = null;

function initHatchScene(attr) {
  const canvas = document.getElementById('hatch-canvas');
  const W = window.innerWidth;
  const H = window.innerHeight;

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

  // クリックで孵化促進（タイミング判定）
  canvas.onclick = () => {
    if (state.stage !== 'egg') return;
    const pts = evalHatchTiming();
    addHatchPt(pts);
    shakeEgg(pts >= 8 ? 0.6 : 0.3);
  };

  if (hatchResizeHandler) window.removeEventListener('resize', hatchResizeHandler);
  hatchResizeHandler = () => {
    if (!hatchRenderer || !hatchCamera) return;
    requestAnimationFrame(() => {
      const W2 = canvas.clientWidth  || window.innerWidth;
      const H2 = canvas.clientHeight || window.innerHeight;
      if (W2 === 0 || H2 === 0) return;
      hatchCamera.aspect = W2 / H2;
      hatchCamera.updateProjectionMatrix();
      hatchRenderer.setSize(W2, H2);
    });
  };
  window.addEventListener('resize', hatchResizeHandler);
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

// ---- タイミング判定 ----
// 卵の揺れ量(swayBase = sin(t*1.6))のピーク時にタップするとPERFECT
function evalHatchTiming() {
  const t = performance.now() * 0.001;
  const sway = Math.abs(Math.sin(t * 1.6)); // 0〜1、1がピーク
  let pts, label, cls;
  if (sway >= 0.85) {
    pts = 10; label = 'PERFECT!! ✨'; cls = 'tap-perfect';
  } else if (sway >= 0.55) {
    pts = 5;  label = 'GREAT! 🔥';    cls = 'tap-great';
  } else {
    pts = 2;  label = 'TAP';           cls = 'tap-normal';
  }
  showTapResult(label, cls);
  return pts;
}

function showTapResult(label, cls) {
  const el = document.getElementById('hatch-tap-result');
  if (!el) return;
  el.textContent = label;
  el.className = 'hatch-tap-result ' + cls;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 700);
}

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

  // 孵化タイミングバーを卵の揺れに同期して動かす
  const barEl = document.getElementById('hatch-timing-bar');
  if (barEl) {
    // sin(t*1.6) を 0〜1 に正規化 → バーのleft位置に変換
    const norm = (Math.sin(t * 1.6) + 1) / 2; // 0〜1
    const wrapW = 260;
    const barW  = 6;
    barEl.style.left = (norm * (wrapW - barW)) + 'px';
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
let raiseScene, raiseCamera, raiseRenderer, raiseAnimId, raiseControls;
let dragonGroup = null;
let attrEffectParticles = [];
let raiseIdleTimer = null;
let staCountdownTimer = null;
let staNextRecovery = 0; // 次回スタミナ回復の予定時刻(ms)
let raiseResizeHandler = null; // resizeリスナ管理用

function initRaiseScene(attr) {
  const canvas = document.getElementById('raise-canvas');

  if (raiseAnimId) { cancelAnimationFrame(raiseAnimId); raiseAnimId = null; }
  if (raiseRenderer) { raiseRenderer.dispose(); }

  // CSS レイアウト確定後にキャンバスサイズを取得
  requestAnimationFrame(() => {
    const W = canvas.clientWidth  || window.innerWidth;
    const H = canvas.clientHeight || window.innerHeight;

  raiseScene = new THREE.Scene();
  raiseScene.background = new THREE.Color(ATTR[attr].raiseBg);
  raiseScene.fog = new THREE.FogExp2(ATTR[attr].raiseBg, 0.018);

  raiseCamera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
  raiseCamera.position.set(0, 1, 10);
  raiseCamera.lookAt(0, 0, 0);

  raiseRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  raiseRenderer.setSize(W, H, false);
  raiseRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  // ライト（明るめ）
  raiseScene.add(new THREE.AmbientLight(0x889aaa, 1.2));
  const hemi = new THREE.HemisphereLight(0xddeeff, 0x445566, 0.8);
  raiseScene.add(hemi);
  const spot = new THREE.SpotLight(hexToThreeColor(ATTR[attr].color), 2.5, 30, Math.PI/5, 0.5);
  spot.position.set(0, 10, 6);
  spot.castShadow = true;
  raiseScene.add(spot);
  const pt = new THREE.PointLight(0x556688, 0.8, 20);
  pt.position.set(-5, 2, -3);
  raiseScene.add(pt);

  // 地面
  const groundGeo = new THREE.PlaneGeometry(60, 60);
  const groundMat = new THREE.MeshStandardMaterial({ color: ATTR[attr].raiseBg, roughness: 0.9, metalness: 0.1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.7;
  raiseScene.add(ground);
  buildDragonModel(attr, state.stage);
  updateRaiseUI();
  animateRaise();

  // 放置タイマー（成長）
  clearInterval(raiseIdleTimer);
  raiseIdleTimer = setInterval(() => {
    if (state.stage === 'baby') addGrowthPt(1);
  }, RAISE_IDLE);

  // スタミナ回復タイマー（1秒ごとに回復判定＋カウントダウン表示を両方処理）
  clearInterval(staCountdownTimer);
  if (state.stamina < STA_MAX && staNextRecovery === 0) {
    staNextRecovery = Date.now() + STA_RECOVER_MS;
  }
  staCountdownTimer = setInterval(() => {
    const timeEl = document.getElementById('sta-recover-time');
    if (state.stamina >= STA_MAX) {
      staNextRecovery = 0;
      if (timeEl) timeEl.textContent = '';
      return;
    }
    // 回復時刻に達していたらスタミナを回復
    if (staNextRecovery > 0 && Date.now() >= staNextRecovery) {
      state.stamina = Math.min(STA_MAX, state.stamina + 1);
      staNextRecovery = state.stamina < STA_MAX ? Date.now() + STA_RECOVER_MS : 0;
      updateStaminaUI();
      saveGame();
    }
    // カウントダウン表示
    if (timeEl) {
      const rem = Math.max(0, Math.ceil((staNextRecovery - Date.now()) / 1000));
      timeEl.textContent = state.stamina >= STA_MAX ? '' : `${rem}s`;
    }
  }, 1000);

  setupRaiseButtons(attr);
  updateRaiseUI();

  // 旧リスナを必ず削除してから再登録（重複覄積を防ぐ）
  if (raiseResizeHandler) window.removeEventListener('resize', raiseResizeHandler);
  raiseResizeHandler = () => {
    if (!raiseRenderer || !raiseCamera) return;
    requestAnimationFrame(() => {
      const W2 = window.innerWidth;
      const H2 = window.innerHeight;
      if (W2 === 0 || H2 === 0) return;
      raiseCamera.aspect = W2 / H2;
      raiseCamera.updateProjectionMatrix();
      raiseRenderer.setSize(W2, H2, false);
    });
  };
  window.addEventListener('resize', raiseResizeHandler);

  // OrbitControlsで360度回転
  if (raiseControls) raiseControls.dispose();
  raiseControls = new THREE.OrbitControls(raiseCamera, canvas);
  raiseControls.target.set(0, 0.5, 0);
  raiseControls.enableDamping = true;
  raiseControls.dampingFactor = 0.08;
  raiseControls.enablePan = false;
  raiseControls.minDistance = 4;
  raiseControls.maxDistance = 20;
  raiseControls.maxPolarAngle = Math.PI * 0.85;
  raiseControls.update();

  }); // requestAnimationFrame end
}

// ---- ドラゴンモデル（スムーズ） ----
function buildDragonModel(attr, stage) {
  if (dragonGroup) raiseScene.remove(dragonGroup);
  attrEffectParticles = [];
  dragonGroup = stage === 'baby'
    ? buildBabyDragon(attr)
    : buildAdultDragon(attr);
  raiseScene.add(dragonGroup);
}

// 幼体：まんまるスムーズちびドラゴン（属性別デザイン）
function buildBabyDragon(attr) {
  const g = new THREE.Group();
  const c  = ATTR[attr].color;
  const em = ATTR[attr].emissive;
  const bodyColor = '#1a2a1a';

  // === 共通ベース：まんまるスムーズ体型 ===
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

  } else if (attr === 'ice') {
    // 氷：結晶の耳 + つるつる尻尾
    [[-0.45, 2.1, 0], [0.45, 2.1, 0]].forEach(([x, y, z]) => {
      const ear = makeCone(0.08, 0.45, c, em, 0.9);
      ear.position.set(x, y, z);
      ear.rotation.z = x < 0 ? 0.3 : -0.3;
      g.add(ear);
      const earTip = makeSphere(0.05, '#ffffff', '#aaddff', 1.0);
      earTip.position.set(x + (x<0 ? -0.06 : 0.06), y + 0.22, z);
      g.add(earTip);
    });
    // 額の結晶
    const gem = makeEllipsoid(0.08, 0.1, 0.06, '#ffffff', '#aaddff', 1.0);
    gem.position.set(0, 1.7, 0.82);
    gem.rotation.z = 0.78;
    g.add(gem);
    // つるつる尻尾
    const tail1 = makeSphere(0.28, bodyColor, em, 0.1);
    tail1.position.set(0, -0.3, -0.85);
    g.add(tail1);
    const tail2 = makeSphere(0.2, bodyColor, em, 0.1);
    tail2.position.set(0, -0.5, -1.2);
    g.add(tail2);
    const tailCrystal = makeEllipsoid(0.1, 0.18, 0.08, c, em, 1.0);
    tailCrystal.position.set(0, -0.45, -1.5);
    tailCrystal.rotation.z = 0.78;
    g.add(tailCrystal);
    // 透明感のある羽（薄い楕円）
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const wing = makeEllipsoid(0.06, 0.4, 0.28, c, em, 0.4);
      wing.position.set(side*0.9, 0.4, -0.08);
      wing.rotation.z = side*0.5;
      g.add(wing);
      const wingTip = makeSphere(0.04, '#ffffff', '#aaddff', 0.9);
      wingTip.position.set(side*1.15, 0.7, -0.08);
      g.add(wingTip);
    });

  } else if (attr === 'thunder') {
    // 雷：ギザ耳（コーン）+ 稲妻マーク + 電気尻尾
    [[-0.4, 2.1, 0.1], [0.4, 2.1, 0.1]].forEach(([x, y, z]) => {
      const ear = makeCone(0.1, 0.5, c, em, 0.9);
      ear.position.set(x, y, z);
      ear.rotation.z = x < 0 ? 0.2 : -0.2;
      g.add(ear);
    });
    // 稲妻ほっぺマーク（小さなコーン×2）
    [[-0.65, 1.05], [0.65, 1.05]].forEach(([x, y]) => {
      const bolt = makeCone(0.04, 0.18, c, em, 1.0);
      bolt.position.set(x, y, 0.72);
      bolt.rotation.z = 0.5;
      g.add(bolt);
      const bolt2 = makeCone(0.03, 0.12, c, em, 1.0);
      bolt2.position.set(x, y-0.1, 0.75);
      bolt2.rotation.z = -0.5;
      g.add(bolt2);
    });
    // ジグザグ尻尾
    const tail1 = makeSphere(0.25, bodyColor, em, 0.1);
    tail1.position.set(0, -0.3, -0.85);
    g.add(tail1);
    const tail2 = makeSphere(0.18, bodyColor, em, 0.1);
    tail2.position.set(0.15, -0.45, -1.2);
    g.add(tail2);
    const tail3 = makeSphere(0.13, bodyColor, em, 0.1);
    tail3.position.set(-0.08, -0.55, -1.5);
    g.add(tail3);
    const tailBolt = makeCone(0.06, 0.25, c, em, 1.0);
    tailBolt.position.set(0.1, -0.5, -1.75);
    tailBolt.rotation.z = 0.6;
    g.add(tailBolt);
    // 鋭い小翼
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const wing = makeEllipsoid(0.06, 0.3, 0.35, c, em, 0.5);
      wing.position.set(side*0.85, 0.3, -0.12);
      wing.rotation.z = side*0.35;
      g.add(wing);
    });

  } else {
    // 闇：浮遊角（コーン）+ 光る目 + 影の翼
    [[-0.3, 2.15, 0.1], [0.3, 2.15, 0.1]].forEach(([x, y, z]) => {
      const horn = makeCone(0.06, 0.45, c, em, 0.9);
      horn.position.set(x, y, z);
      horn.rotation.z = x < 0 ? -0.2 : 0.2;
      horn.rotation.x = -0.2;
      g.add(horn);
    });
    // 影の翼（広めの楕円）
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const wing = makeEllipsoid(0.06, 0.4, 0.42, c, em, 0.35);
      wing.position.set(side*0.95, 0.35, -0.15);
      wing.rotation.z = side*0.45;
      g.add(wing);
      const wingInner = makeEllipsoid(0.03, 0.22, 0.28, bodyColor, em, 0.05);
      wingInner.position.set(side*1.05, 0.25, -0.12);
      wing.rotation.z = side*0.45;
      g.add(wingInner);
    });
    // 影尻尾（徐々にフェード）
    const tail1 = makeSphere(0.28, bodyColor, em, 0.1);
    tail1.position.set(0, -0.3, -0.85);
    g.add(tail1);
    const tail2 = makeSphere(0.2, bodyColor, em, 0.1);
    tail2.position.set(0, -0.5, -1.2);
    g.add(tail2);
    const tailGlow = makeSphere(0.14, c, em, 1.0);
    tailGlow.position.set(0, -0.65, -1.55);
    g.add(tailGlow);
    // 第三の目（おでこの球）
    const thirdEye = makeSphere(0.08, c, em, 1.3);
    thirdEye.position.set(0, 1.7, 0.82);
    g.add(thirdEye);
  }

  addAttrEffect(g, attr, 'baby');
  return g;
}

// 成体：スムーズ＆かっこいいドラゴン（属性別＋育成タイプ装飾）
function buildAdultDragon(attr) {
  const g = new THREE.Group();
  const c  = ATTR[attr].color;
  const em = ATTR[attr].emissive;
  const bodyColor = '#0d1a0d';
  const bc2 = '#1a2a1a';
  const type = state ? state.dragonType : 'balanced';

  // === 属性別の体型パラメータ（前後に長い流線型、頭は小さめ） ===
  const shapes = {
    fire:    { bRx:0.6, bRy:0.55, bRz:1.0, nR:0.22, nH:1.1, hRx:0.32, hRy:0.28, hRz:0.42, hornH:0.9 },
    ice:     { bRx:0.55, bRy:0.55, bRz:1.0, nR:0.2,  nH:0.95, hRx:0.3, hRy:0.27, hRz:0.4, hornH:0.7 },
    thunder: { bRx:0.5, bRy:0.45, bRz:0.95, nR:0.18, nH:1.15, hRx:0.28, hRy:0.24, hRz:0.4, hornH:0.6 },
    dark:    { bRx:0.58, bRy:0.52, bRz:1.0, nR:0.2,  nH:1.05, hRx:0.3, hRy:0.26, hRz:0.42, hornH:1.0 },
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
  const eyeW = attr === 'thunder' ? 0.08 : 0.085;
  const eyeH = attr === 'thunder' ? 0.04 : attr === 'ice' ? 0.065 : 0.05;
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

  } else if (attr === 'ice') {
    // ---- 結晶角 ----
    [[-0.2, 1.7, 0.5], [0.2, 1.7, 0.5]].forEach(([x,y,z]) => {
      const horn = makeCone(0.055, s.hornH, '#ffffff', '#aaddff', 1.0);
      horn.position.set(x, y, z);
      horn.rotation.z = x<0 ? -0.25 : 0.25;
      horn.rotation.x = -0.2;
      g.add(horn);
      const branch1 = makeCone(0.035, 0.28, c, em, 0.8);
      branch1.position.set(x+(x<0?-0.1:0.1), y+0.05, z);
      branch1.rotation.z = x<0 ? -0.6 : 0.6;
      g.add(branch1);
      const branch2 = makeCone(0.025, 0.18, '#ffffff', '#aaddff', 0.9);
      branch2.position.set(x+(x<0?-0.06:0.06), y+0.22, z-0.04);
      branch2.rotation.z = x<0 ? -0.4 : 0.4;
      g.add(branch2);
      const hornTip = makeSphere(0.025, '#ffffff', '#ffffff', 1.3);
      hornTip.position.set(x+(x<0?-0.06:0.06), y+0.32, z-0.06);
      g.add(hornTip);
    });
    // 額の結晶ティアラ
    for (let i = 0; i < 5; i++) {
      const h = i === 2 ? 0.16 : 0.1;
      const gem = makeCone(0.025, h, i%2===0 ? c : '#ffffff', '#aaddff', 1.0);
      gem.position.set(-0.1+i*0.05, 1.55+h*0.3, 1.0);
      g.add(gem);
    }
    // ---- 翼（解剖学的バットウイング + 氷結晶） ----
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const w = buildBatWing(g, side, {
        bc: c, be: em, bi: 0.4, mc: '#ffffff', me: '#aaddff', mi: 0.25,
      });
      // 翼先端の氷結晶
      [w.tip, w.sp2].forEach((tip, k) => {
        const crystal = makeCone(0.035, 0.15-k*0.03, '#ffffff', '#aaddff', 1.0+k*0.1);
        crystal.position.set(tip[0], tip[1]+0.05, tip[2]);
        crystal.rotation.z = side*(0.8+k*0.3);
        g.add(crystal);
        const shard = makeCone(0.018, 0.09, '#ffffff', '#aaddff', 1.2);
        shard.position.set(tip[0]+side*0.05, tip[1]-0.02, tip[2]);
        shard.rotation.z = side*(1.2+k*0.2);
        g.add(shard);
      });
    });
    // ---- 氷の装甲 ----
    [[-1, 0], [1, 0]].forEach(([side]) => {
      for (let i = 0; i < 3; i++) {
        const armor = makeEllipsoid(0.05, 0.15-i*0.02, 0.28-i*0.04, c, em, 0.45+i*0.1);
        armor.position.set(side*(0.58+i*0.04), -0.08+i*0.15, -0.12+i*0.15);
        g.add(armor);
      }
    });
    for (let i = 0; i < 3; i++) {
      const backPlate = makeEllipsoid(0.28-i*0.05, 0.03, 0.2, '#ffffff', '#aaddff', 0.5+i*0.15);
      backPlate.position.set(0, 0.58+i*0.025, -0.15+i*0.25);
      g.add(backPlate);
    }
    // ---- 尻尾 ----
    const tailData = [
      {r:0.28,p:[0,-0.22,-0.9]},{r:0.22,p:[0,-0.35,-1.4]},{r:0.17,p:[0,-0.45,-1.85]},
      {r:0.13,p:[0,-0.52,-2.25]},{r:0.09,p:[0,-0.58,-2.6]},{r:0.06,p:[0,-0.62,-2.9]},
    ];
    tailData.forEach(({r,p}) => {
      const seg = makeSphere(r, bodyColor, em, 0.15);
      seg.position.set(...p);
      g.add(seg);
    });
    for (let i = 0; i < 3; i++) {
      const tc = makeCone(0.03, 0.14+i*0.025, i===1 ? '#ffffff' : c, '#aaddff', 1.0);
      tc.position.set((i-1)*0.05, -0.58-i*0.015, -3.05-i*0.08);
      tc.rotation.z = (i-1)*0.3;
      g.add(tc);
    }
    // ---- 背びれ ----
    for (let i = 0; i < 7; i++) {
      const spine = makeCone(0.03, 0.2+i*0.03, i%2===0 ? c : '#ffffff', '#aaddff', 0.8);
      spine.position.set(0, 0.6+i*0.012, -0.2+i*0.18);
      spine.rotation.z = (i%2-0.5)*0.12;
      g.add(spine);
    }
    // ---- 体表の霜模様 ----
    for (let i = 0; i < 5; i++) {
      const frost = makeSphere(0.03, '#ffffff', '#aaddff', 0.6+i*0.08);
      frost.position.set(Math.sin(i*1.2)*s.bRx*0.8, Math.cos(i*1.2)*s.bRy*0.6, -0.1+i*0.18);
      g.add(frost);
    }

  } else if (attr === 'thunder') {
    // ---- 角 ----
    [[-0.14, 1.7, 0.65], [0.14, 1.7, 0.65]].forEach(([x,y,z]) => {
      const horn = makeCone(0.045, s.hornH, c, em, 1.0);
      horn.position.set(x, y, z);
      horn.rotation.x = -0.45;
      g.add(horn);
      const spark = makeSphere(0.025, '#ffffff', c, 1.3);
      spark.position.set(x, y+0.28, z-0.08);
      g.add(spark);
    });
    [[-0.28, 1.48, 0.85], [0.28, 1.48, 0.85]].forEach(([x,y,z]) => {
      const sideHorn = makeCone(0.028, 0.25, c, em, 0.8);
      sideHorn.position.set(x, y, z);
      sideHorn.rotation.z = x<0 ? -0.7 : 0.7;
      sideHorn.rotation.x = -0.15;
      g.add(sideHorn);
    });
    // ---- 稲妻模様 ----
    [[-0.28, 1.3, 1.15], [0.28, 1.3, 1.15]].forEach(([x,y,z]) => {
      const bolt1 = makeCone(0.02, 0.16, c, em, 1.0);
      bolt1.position.set(x, y, z);
      bolt1.rotation.z = 0.5;
      g.add(bolt1);
      const bolt2 = makeCone(0.015, 0.12, c, em, 1.0);
      bolt2.position.set(x, y-0.1, z+0.03);
      bolt2.rotation.z = -0.5;
      g.add(bolt2);
    });
    for (let i = 0; i < 3; i++) {
      const neckBolt = makeCylinder(0.01, 0.01, 0.15, c, em, 1.0);
      neckBolt.position.set(0.1*(i%2===0?1:-1), 0.55+i*0.12, 0.55+i*0.04);
      neckBolt.rotation.z = (i%2-0.5)*0.8;
      g.add(neckBolt);
    }
    // ---- 翼（解剖学的バットウイング + 稲妻） ----
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const w = buildBatWing(g, side, {
        bc: c, be: em, bi: 0.5, mc: c, me: em, mi: 0.3,
      });
      // 翼膜上の稲妻ライン
      for (let j = 0; j < 3; j++) {
        const bolt = makeCylinder(0.01, 0.01, 0.35+j*0.06, '#ffffff', c, 1.0);
        bolt.position.set(side*(1.4+j*0.5), 0.7-j*0.15, -0.2-j*0.05);
        bolt.rotation.z = side*(0.5+j*0.2);
        g.add(bolt);
      }
      // 先端のスパーク
      [w.tip, w.sp2].forEach(tip => {
        const spark = makeSphere(0.045, '#ffffff', c, 1.3);
        spark.position.set(...tip);
        g.add(spark);
      });
    });
    // ---- ジグザグ尻尾 ----
    const tailData = [
      {r:0.24,p:[0,-0.15,-0.85]},{r:0.19,p:[0.14,-0.25,-1.25]},{r:0.15,p:[-0.08,-0.35,-1.6]},
      {r:0.12,p:[0.1,-0.42,-1.9]},{r:0.09,p:[-0.06,-0.48,-2.2]},{r:0.06,p:[0.08,-0.52,-2.45]},
      {r:0.04,p:[-0.02,-0.55,-2.65]},
    ];
    tailData.forEach(({r,p}) => {
      const seg = makeSphere(r, bodyColor, em, 0.15);
      seg.position.set(...p);
      g.add(seg);
    });
    for (let i = 0; i < 3; i++) {
      const tailBoltSeg = makeCylinder(0.008, 0.008, 0.12, c, em, 0.9);
      tailBoltSeg.position.set((i%2-0.5)*0.08, -0.2-i*0.1, -0.9-i*0.4);
      tailBoltSeg.rotation.z = (i%2-0.5)*1.2;
      g.add(tailBoltSeg);
    }
    const tailBolt = makeCone(0.045, 0.28, c, em, 1.0);
    tailBolt.position.set(0, -0.53, -2.8);
    tailBolt.rotation.z = 0.5;
    g.add(tailBolt);
    const tailSpark = makeSphere(0.03, '#ffffff', c, 1.3);
    tailSpark.position.set(0.02, -0.5, -2.95);
    g.add(tailSpark);
    // ---- 背びれ ----
    for (let i = 0; i < 9; i++) {
      const spine = makeCone(0.02, 0.12+Math.sin(i*0.8)*0.1, c, em, 0.8);
      spine.position.set(0, 0.45+i*0.01, -0.18+i*0.13);
      g.add(spine);
    }
    // ---- 体の稲妻模様 ----
    for (let i = 0; i < 4; i++) {
      [[-1, 0], [1, 0]].forEach(([side]) => {
        const mark = makeCylinder(0.008, 0.008, 0.12, c, em, 0.8+i*0.1);
        mark.position.set(side*(s.bRx*0.8+0.02), -0.1+i*0.14, -0.08+i*0.16);
        mark.rotation.z = side*(0.8+i*0.2);
        g.add(mark);
      });
    }

  } else {
    // ---- 闇ドラゴン：ミステリアス＆威圧的 ----
    // 角（長い×2 + 枝角×2 + 光る先端）
    [[-0.18, 1.7, 0.35], [0.18, 1.7, 0.35]].forEach(([x,y,z]) => {
      const horn = makeCone(0.05, s.hornH, c, em, 1.0);
      horn.position.set(x, y, z);
      horn.rotation.x = -0.25;
      horn.rotation.z = x<0 ? -0.2 : 0.2;
      g.add(horn);
      const hornMid = makeSphere(0.028, c, em, 0.8);
      hornMid.position.set(x+(x<0?-0.03:0.03), y+0.25, z-0.04);
      g.add(hornMid);
      const hornTip = makeSphere(0.032, '#ffffff', c, 1.4);
      hornTip.position.set(x+(x<0?-0.04:0.04), y+0.4, z-0.08);
      g.add(hornTip);
      // 枝角
      const branch = makeCone(0.028, 0.22, c, em, 0.7);
      branch.position.set(x+(x<0?-0.12:0.12), y+0.12, z);
      branch.rotation.z = x<0 ? -0.7 : 0.7;
      g.add(branch);
    });
    // 後頭部の角（小×2）
    [[-0.24, 1.5, 0.2], [0.24, 1.5, 0.2]].forEach(([x,y,z]) => {
      const backHorn = makeCone(0.032, 0.28, c, em, 0.6);
      backHorn.position.set(x, y, z);
      backHorn.rotation.x = 0.3;
      backHorn.rotation.z = x<0 ? -0.3 : 0.3;
      g.add(backHorn);
    });
    // 第三の目
    const thirdEye = makeSphere(0.06, c, em, 1.4);
    thirdEye.position.set(0, 1.55, 0.85);
    g.add(thirdEye);
    const thirdEyeRing = makeTorus(0.075, 0.012, c, em, 0.8);
    thirdEyeRing.position.set(0, 1.55, 0.87);
    g.add(thirdEyeRing);
    // ---- 光る紋様（体×8 + 首×4） ----
    for (let i = 0; i < 8; i++) {
      [[-1, 0], [1, 0]].forEach(([side]) => {
        const rune = makeSphere(0.028, c, em, 0.7+i*0.06);
        rune.position.set(side*(s.bRx*0.72+0.02), -0.15+i*0.08, -0.3+i*0.1);
        g.add(rune);
      });
    }
    for (let i = 0; i < 4; i++) {
      const neckRune = makeSphere(0.02, c, em, 0.9+i*0.08);
      neckRune.position.set(0.1*(i%2===0?1:-1), 0.55+i*0.12, 0.48+i*0.03);
      g.add(neckRune);
    }
    // ---- 翼（解剖学的バットウイング + 闇のオーラ） ----
    [[-1, 0], [1, 0]].forEach(([side]) => {
      const w = buildBatWing(g, side, {
        bc: c, be: em, bi: 0.35, mc: bodyColor, me: em, mi: 0.05,
      });
      // 翼のエッジグロー
      [w.tip, w.sp2].forEach((tip, k) => {
        const glow = makeSphere(0.035, c, em, 0.9+k*0.2);
        glow.position.set(tip[0], tip[1], tip[2]);
        g.add(glow);
      });
      // 翼膜上の魔法紋様
      for (let k = 0; k < 5; k++) {
        const rune = makeSphere(0.02, c, em, 0.6+k*0.1);
        rune.position.set(side*(1.2+k*0.38), 0.7-k*0.12, -0.18-k*0.03);
        g.add(rune);
      }
    });
    // ---- 長い尻尾（球8個 + 光る先端） ----
    const tailData = [
      {r:0.35,p:[0,-0.3,-1.1]},{r:0.28,p:[0,-0.45,-1.7]},{r:0.22,p:[0.06,-0.58,-2.25]},
      {r:0.17,p:[0.12,-0.68,-2.75]},{r:0.13,p:[0.18,-0.76,-3.2]},{r:0.1,p:[0.22,-0.82,-3.6]},
      {r:0.07,p:[0.25,-0.86,-3.95]},{r:0.05,p:[0.27,-0.88,-4.25]},
    ];
    tailData.forEach(({r,p}) => {
      const seg = makeSphere(r, bodyColor, em, 0.15);
      seg.position.set(...p);
      g.add(seg);
    });
    // 尻尾のグローライン
    for (let i = 0; i < 6; i++) {
      const tailRune = makeSphere(0.025, c, em, 0.6+i*0.1);
      tailRune.position.set(0.03+i*0.04, -0.4-i*0.08, -1.3-i*0.5);
      g.add(tailRune);
    }
    const tailGlow = makeSphere(0.08, c, em, 1.2);
    tailGlow.position.set(0.28, -0.88, -4.5);
    g.add(tailGlow);
    const tailGlow2 = makeSphere(0.04, '#ffffff', c, 1.5);
    tailGlow2.position.set(0.29, -0.87, -4.6);
    g.add(tailGlow2);
    // ---- 背びれ（エーテル風7本 + 浮遊リング） ----
    for (let i = 0; i < 7; i++) {
      const spine = makeCone(0.035, 0.22+i*0.04, c, em, 0.45+i*0.08);
      spine.position.set(0, 0.55+i*0.02, -0.2+i*0.18);
      g.add(spine);
      if (i % 2 === 1) {
        const ring = makeTorus(0.04, 0.008, c, em, 0.6+i*0.05);
        ring.position.set(0, 0.52+i*0.02, -0.2+i*0.18);
        g.add(ring);
      }
    }
    // ---- 浮遊するオーブ（肩の周辺に2個） ----
    [[-0.7, 0.55, 0.08], [0.7, 0.55, 0.08]].forEach(([x,y,z]) => {
      const orb = makeSphere(0.055, c, em, 1.0);
      orb.position.set(x, y, z);
      g.add(orb);
      const orbRing = makeTorus(0.07, 0.008, c, em, 0.7);
      orbRing.position.set(x, y, z);
      orbRing.rotation.x = 0.5;
      g.add(orbRing);
    });
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
  if (state.stamina <= 0) {
    showActionFeedback('💤 スタミナ切れ！');
    return;
  }
  state.stamina--;
  if (state.stamina < STA_MAX && staNextRecovery === 0) {
    staNextRecovery = Date.now() + STA_RECOVER_MS;
  }

  const mult = rollTrainingMult();
  let growPt = 0;
  let msg = '';

  switch (type) {
    case 'feed':
      state.stats.hp += 15 * mult;
      growPt = 2;
      msg = mult >= 3 ? '🍖 大喜び！ ×3!!' : mult >= 2 ? '🍖 おいし！ ×2' : '🍖 もぐもぐ';
      break;
    case 'train-atk':
      state.stats.atk += 2 * mult;
      state.trainCount.atk++;
      growPt = 3;
      msg = mult >= 3 ? '⚔️ CRITICAL!! ×3' : mult >= 2 ? '⚔️ ATK UP ×2' : '⚔️ ATK UP';
      break;
    case 'train-def':
      state.stats.def += 2 * mult;
      state.trainCount.def++;
      growPt = 3;
      msg = mult >= 3 ? '🛡️ CRITICAL!! ×3' : mult >= 2 ? '🛡️ DEF UP ×2' : '🛡️ DEF UP';
      break;
    case 'train-spd':
      state.stats.spd += 2 * mult;
      state.trainCount.spd++;
      growPt = 3;
      msg = mult >= 3 ? '🏃 CRITICAL!! ×3' : mult >= 2 ? '🏃 SPD UP ×2' : '🏃 SPD UP';
      break;
  }

  updateDragonType();
  showActionFeedback(msg, mult >= 3);
  addGrowthPt(growPt);
  updateRaiseUI();
  saveGame();
}

function rollTrainingMult() {
  const r = Math.random();
  if (r < 0.15) return 3; // 15%: ×3 CRITICAL
  if (r < 0.40) return 2; // 25%: ×2 NICE
  return 1;               // 60%: 通常
}

function updateStaminaUI() {
  const wrap = document.getElementById('stamina-dots');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < STA_MAX; i++) {
    const dot = document.createElement('div');
    dot.className = 'sta-dot' + (i < state.stamina ? ' filled' : '');
    wrap.appendChild(dot);
  }
  const timeEl = document.getElementById('sta-recover-time');
  if (!timeEl) return;
  if (state.stamina >= STA_MAX) {
    timeEl.textContent = '';
  } else {
    const rem = Math.max(0, Math.ceil((staNextRecovery - Date.now()) / 1000));
    timeEl.textContent = `${rem}s`;
  }
}

function updateDragonType() {
  const { atk, def, spd } = state.trainCount;
  const total = atk + def + spd;
  if (total < 3) { state.dragonType = 'balanced'; return; }
  const max = Math.max(atk, def, spd);
  const threshold = total * 0.5;
  if (max < threshold) { state.dragonType = 'balanced'; }
  else if (atk === max) { state.dragonType = 'attacker'; }
  else if (def === max) { state.dragonType = 'tank'; }
  else                  { state.dragonType = 'speedster'; }
  updateTypeLabelUI();
}

function updateTypeLabelUI() {
  const el = document.getElementById('dragon-type-label');
  if (!el) return;
  const t = DRAGON_TYPES[state.dragonType];
  el.textContent = `${t.label} ／ 必殺技：${t.special}`;
}

let feedbackTimeout = null;
function showActionFeedback(msg, isCritical = false) {
  const el = document.getElementById('action-feedback');
  if (!el) return;
  el.textContent = msg;
  el.style.opacity = '1';
  el.classList.toggle('feedback-critical', isCritical);
  clearTimeout(feedbackTimeout);
  feedbackTimeout = setTimeout(() => {
    el.style.opacity = '0';
    el.classList.remove('feedback-critical');
  }, 1500);
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
  updateTypeLabelUI();
  updateStaminaUI();
}

// ---- 育成シーンアニメーション ----
function animateRaise() {
  raiseAnimId = requestAnimationFrame(animateRaise);
  const t = performance.now() * 0.001;

  if (raiseControls) raiseControls.update();

  if (dragonGroup) {
    // ゆっくり浮遊
    dragonGroup.position.y = Math.sin(t * 0.8) * 0.12;
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
const AUTO_COMMAND_DELAY = 500; // 自動戦闘のコマンド実行遅延(ms)
const AUTO_NEXT_BATTLE_DELAY = 1500; // 自動戦闘で次の敵へ進むまでの遅延(ms)

function initBattleScene(attr) {
  const canvas = document.getElementById('battle-canvas');
  const W = canvas.clientWidth  || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;

  if (battleAnimId) { cancelAnimationFrame(battleAnimId); battleAnimId = null; }
  if (battleRenderer) { battleRenderer.dispose(); }

  battleScene = new THREE.Scene();
  const battleBg = 0x1a1020;
  battleScene.background = new THREE.Color(battleBg);
  battleScene.fog = new THREE.FogExp2(battleBg, 0.018);

  battleCamera = new THREE.PerspectiveCamera(50, W / H, 0.1, 200);
  battleCamera.position.set(0, 1.5, 8);
  battleCamera.lookAt(0, 0.5, 0);

  battleRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  battleRenderer.setSize(W, H);
  battleRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  battleRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  battleRenderer.toneMappingExposure = 1.2;

  battleScene.add(new THREE.AmbientLight(0x889aaa, 1.0));
  const hemi = new THREE.HemisphereLight(0xddeeff, 0x445566, 0.6);
  battleScene.add(hemi);
  const ptPlayer = new THREE.PointLight(hexToThreeColor(ATTR[attr].color), 1.5, 20);
  ptPlayer.position.set(-4, 3, 4);
  battleScene.add(ptPlayer);

  const enemyAttr = getRandomEnemyAttr(attr);
  const ptEnemy = new THREE.PointLight(hexToThreeColor(ATTR[enemyAttr].color), 1.5, 20);
  ptEnemy.position.set(4, 3, 4);
  battleScene.add(ptEnemy);

  // 地面
  const bGroundGeo = new THREE.PlaneGeometry(60, 60);
  const bGroundMat = new THREE.MeshStandardMaterial({ color: battleBg, roughness: 0.9, metalness: 0.1 });
  const bGround = new THREE.Mesh(bGroundGeo, bGroundMat);
  bGround.rotation.x = -Math.PI / 2;
  bGround.position.y = -0.7;
  battleScene.add(bGround);

  // プレイヤードラゴン（左）
  playerDragonGroup = state.stage === 'adult' ? buildAdultDragon(attr) : buildBabyDragon(attr);
  playerDragonGroup.position.set(-3, 0, 0);
  playerDragonGroup.rotation.y = 0.6;
  playerDragonGroup.scale.setScalar(1.1);
  battleScene.add(playerDragonGroup);

  // 敵ドラゴン（右）
  enemyDragonGroup = buildAdultDragon(enemyAttr);
  enemyDragonGroup.position.set(3, 0, 0);
  enemyDragonGroup.rotation.y = -0.6;  // 左向き（プレイヤー方向）
  enemyDragonGroup.scale.setScalar(1.1);
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
    playerGuarding: false,
    enemyIntent: null,    // 敵の予告行動
    autoMode: false,      // 自動戦闘モード
  };
  state.mp = MP_MAX;

  updateBattleUI();
  updateMpUI();
  document.getElementById('battle-result').classList.add('hidden');
  document.getElementById('battle-commands').classList.add('hidden');
  clearBattleLog();

  animateBattle();

  // バトル開始（少し待ってから）
  setTimeout(() => startTurn(), 800);

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
    hp:  Math.round(30 * Math.pow(1.15, level - 1)),
    atk: Math.round(8  * Math.pow(1.12, level - 1)),
    def: Math.round(3  * Math.pow(1.08, level - 1)),
    spd: Math.round(5  * Math.pow(1.08, level - 1)),
  };
}

function getAttrMultiplier(attackerAttr, defenderAttr) {
  const advantage = { fire:'ice', ice:'thunder', thunder:'fire' };
  const disadvantage = { ice:'fire', thunder:'ice', fire:'thunder' };
  if (advantage[attackerAttr] === defenderAttr) return 1.5;
  if (disadvantage[attackerAttr] === defenderAttr) return 0.7;
  return 1.0;
}

// ---- ターン開始：コマンド選択を待つ ----
function startTurn() {
  if (!battleState || !battleState.running) return;

  // 敵の行動を予告決定
  battleState.enemyIntent = decideEnemyIntent();
  battleState.playerGuarding = false;

  // コマンドUI表示
  const cmdEl = document.getElementById('battle-commands');
  cmdEl.classList.remove('hidden');
  updateEnemyIntentUI();
  updateMpUI();
  setupCommandButtons();

  // 自動戦闘モードの場合、自動でコマンド実行
  if (battleState.autoMode) {
    scheduleAutoCommand();
  }
}

// 自動戦闘モード：AIコマンド決定
function decideAutoCommand() {
  // 敵が強攻撃を溜めている場合はガード優先
  if (battleState.enemyIntent === 'heavy') {
    return 'guard';
  }
  // MPが十分なら必殺技を使用
  if (state.mp >= SPECIAL_COST) {
    return 'special';
  }
  // それ以外は通常攻撃
  return 'attack';
}

// 自動コマンド実行をスケジュール
function scheduleAutoCommand() {
  setTimeout(() => {
    if (!battleState || !battleState.running || !battleState.autoMode) return;
    const cmd = decideAutoCommand();
    executeCommand(cmd);
  }, AUTO_COMMAND_DELAY);
}

// 自動戦闘モード切替
function toggleAutoMode() {
  if (!battleState || !battleState.running) return;
  battleState.autoMode = !battleState.autoMode;

  const btn = document.getElementById('cmd-auto');
  if (btn) {
    btn.textContent = battleState.autoMode ? '🤖 自動 ON' : '🤖 自動';
    btn.classList.toggle('active', battleState.autoMode);
  }

  // 自動モードON時、コマンドUIが表示中なら即座に自動行動開始
  if (battleState.autoMode) {
    addBattleLog('🤖 自動戦闘モード ON');
    const cmdEl = document.getElementById('battle-commands');
    if (cmdEl && !cmdEl.classList.contains('hidden')) {
      scheduleAutoCommand();
    }
  } else {
    addBattleLog('🤖 自動戦闘モード OFF');
  }
}

function decideEnemyIntent() {
  // 敵が「強攻撃」か「通常攻撃」かをランダムに予告
  const r = Math.random();
  if (r < 0.3 && battleState.turn % 3 === 2) return 'heavy'; // 3ターンに1回強攻撃
  return 'normal';
}

function updateEnemyIntentUI() {
  const el = document.getElementById('enemy-intent');
  if (!el) return;
  if (battleState.enemyIntent === 'heavy') {
    el.textContent = '⚠️ 敵が力をためている…';
    el.style.color  = '#ff5252';
  } else {
    el.textContent = '敵が攻撃を狙っている';
    el.style.color  = '#7986cb';
  }
}

function setupCommandButtons() {
  const type = DRAGON_TYPES[state.dragonType];
  const spEl = document.getElementById('cmd-special');
  const costEl = document.getElementById('mp-cost-label');
  spEl.textContent = `✨ ${type.special}`;
  if (costEl) costEl.textContent = ` (MP${SPECIAL_COST})`;

  const canSpecial = state.mp >= SPECIAL_COST;
  spEl.disabled = !canSpecial;
  spEl.style.opacity = canSpecial ? '1' : '0.35';

  document.getElementById('cmd-attack').onclick   = () => executeCommand('attack');
  document.getElementById('cmd-special').onclick  = () => { if (canSpecial) executeCommand('special'); };
  document.getElementById('cmd-guard').onclick    = () => executeCommand('guard');
  document.getElementById('cmd-auto').onclick     = () => toggleAutoMode();

  // 自動モードボタンの表示状態を更新
  const autoBtn = document.getElementById('cmd-auto');
  if (autoBtn && battleState) {
    autoBtn.textContent = battleState.autoMode ? '🤖 自動 ON' : '🤖 自動';
    autoBtn.classList.toggle('active', battleState.autoMode);
  }
}

function executeCommand(cmd) {
  if (!battleState || !battleState.running) return;
  document.getElementById('battle-commands').classList.add('hidden');

  const ps = state.stats;
  const es = battleState.enemyStats;

  // --- プレイヤー行動 ---
  if (cmd === 'guard') {
    battleState.playerGuarding = true;
    addBattleLog('🛡️ 守りの姿勢を取った！');
    // MPを1回復
    state.mp = Math.min(MP_MAX, state.mp + 1);
  } else if (cmd === 'attack') {
    const mult = getAttrMultiplier(state.attr, battleState.enemyAttr);
    const dmg  = Math.max(1, Math.floor((ps.atk - es.def * 0.5) * mult));
    battleState.enemyHP = Math.max(0, battleState.enemyHP - dmg);
    const multText = mult > 1 ? ' 🔥効果抜群！' : mult < 1 ? ' 💧いまひとつ…' : '';
    addBattleLog(`▶ ${dmg}ダメージ${multText}`);
    flashDragon(enemyDragonGroup);
    state.mp = Math.min(MP_MAX, state.mp + 1);
  } else if (cmd === 'special') {
    state.mp -= SPECIAL_COST;
    const mult = getAttrMultiplier(state.attr, battleState.enemyAttr);
    const dmg  = Math.max(1, Math.floor((ps.atk * 2.2 - es.def * 0.3) * mult));
    battleState.enemyHP = Math.max(0, battleState.enemyHP - dmg);
    const multText = mult > 1 ? ' 🔥効果抜群！' : mult < 1 ? ' 💧いまひとつ…' : '';
    const spName = DRAGON_TYPES[state.dragonType].special;
    addBattleLog(`✨ ${spName}！ ${dmg}ダメージ！${multText}`);
    flashDragon(enemyDragonGroup);
    flashDragon(playerDragonGroup); // 必殺技自身も光る
  }

  updateBattleUI();
  updateMpUI();
  if (checkBattleEnd()) return;

  // --- 少し間を置いて敵行動 ---
  setTimeout(() => enemyAction(), 700);
}

function enemyAction() {
  if (!battleState || !battleState.running) return;
  const es = battleState.enemyStats;
  const ps = state.stats;

  // SPDによる回避判定（プレイヤーSPDが敵SPDより高いほど回避しやすい）
  const speedDiff = ps.spd - es.spd;
  const evasionChance = Math.max(0, Math.min(0.3, speedDiff * 0.012));
  if (Math.random() < evasionChance) {
    addBattleLog(`💨 すばやく回避した！`);
    battleState.turn++;
    setTimeout(() => startTurn(), 600);
    return;
  }

  let dmg;
  if (battleState.enemyIntent === 'heavy') {
    // 強攻撃
    const raw = Math.max(1, Math.floor(es.atk * 1.8 - ps.def * 0.3));
    dmg = battleState.playerGuarding ? Math.ceil(raw * 0.4) : raw;
    const guardText = battleState.playerGuarding ? ' (ガード！)' : '';
    addBattleLog(`◀ 強攻撃！ ${dmg}ダメージ${guardText}`);
  } else {
    const mult = getAttrMultiplier(battleState.enemyAttr, state.attr);
    const raw  = Math.max(1, Math.floor((es.atk - ps.def * 0.5) * mult));
    dmg = battleState.playerGuarding ? Math.ceil(raw * 0.4) : raw;
    const multText = mult > 1 ? ' 🔥効果抜群！' : mult < 1 ? ' 💧いまひとつ…' : '';
    const guardText = battleState.playerGuarding ? ' (ガード！)' : '';
    addBattleLog(`◀ ${dmg}ダメージ${multText}${guardText}`);
  }
  battleState.playerHP = Math.max(0, battleState.playerHP - dmg);
  flashDragon(playerDragonGroup);
  updateBattleUI();

  if (checkBattleEnd()) return;

  // 次のターンへ
  battleState.turn++;
  setTimeout(() => startTurn(), 600);
}

// (旧runBattleTurnは削除 → startTurn/executeCommandに統合)

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
  const wasAutoMode = battleState.autoMode;
  battleState.autoMode = false;

  // 自動モードボタンの表示をリセット
  const autoBtn = document.getElementById('cmd-auto');
  if (autoBtn) {
    autoBtn.textContent = '🤖 自動';
    autoBtn.classList.remove('active');
  }

  if (win) {
    state.streak++;
    state.totalWin++;
    state.battleLevel++;

    const battleScore = state.battleLevel * 100;
    const streakBonus = state.streak * 50;
    const statBonus = (state.stats.hp + state.stats.atk + state.stats.def + state.stats.spd) / 5;
    const gained = Math.round((battleScore + streakBonus) * (statBonus / 30));
    state.score += gained;

    addBattleLog(`🏆 勝利！ +${gained}pt`);
    showBattleResult(true, gained, wasAutoMode);
  } else {
    addBattleLog('💀 敗北…');
    showBattleResult(false, 0, false);
    state.streak = 0;
    state.battleLevel = Math.max(1, state.battleLevel - 1);
  }

  updateRecord();
  saveGame();
}

function showBattleResult(win, score, autoMode) {
  const resultEl = document.getElementById('battle-result');
  const titleEl  = document.getElementById('battle-result-title');
  const scoreEl  = document.getElementById('battle-result-score');

  resultEl.classList.remove('hidden');
  document.getElementById('battle-commands').classList.add('hidden');
  titleEl.textContent = win ? '🏆 勝利！' : '💀 敗北';
  titleEl.style.color = win ? '#69f0ae' : '#ff5252';
  scoreEl.textContent = win ? `+${score} pt` : 'スコア変化なし';

  const goNextBattle = () => {
    resultEl.classList.add('hidden');
    if (battleAnimId) cancelAnimationFrame(battleAnimId);
    showScreen('battle');
    initBattleScene(state.attr);
  };

  document.getElementById('btn-next-battle').onclick = goNextBattle;
  document.getElementById('btn-back-raise').onclick = () => {
    if (battleAnimId) cancelAnimationFrame(battleAnimId);
    showScreen('raise');
    initRaiseScene(state.attr);
  };

  // 自動戦闘モードがONだった場合、勝利時は自動で次の敵へ
  if (win && autoMode) {
    addBattleLog('🤖 自動で次の敵へ…');
    setTimeout(() => {
      goNextBattle();
      // 次の戦闘でも自動モードをONにする（startTurnが自動コマンドを開始する）
      if (battleState) {
        battleState.autoMode = true;
        const autoBtn = document.getElementById('cmd-auto');
        if (autoBtn) {
          autoBtn.textContent = '🤖 自動 ON';
          autoBtn.classList.add('active');
        }
      }
    }, AUTO_NEXT_BATTLE_DELAY);
  }
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

function updateMpUI() {
  const bar  = document.getElementById('mp-bar');
  const text = document.getElementById('mp-text');
  if (bar)  bar.style.width  = (state.mp / MP_MAX * 100) + '%';
  if (text) text.textContent = `${state.mp}/${MP_MAX}`;
}

function addBattleLog(msg) {
  const log = document.getElementById('battle-log');
  if (!log) return;
  const line = document.createElement('div');
  line.textContent = msg;
  line.className = 'battle-log-line fade-in';
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
    trainCount: state.trainCount,
    dragonType: state.dragonType,
    stamina: state.stamina,
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

// BGMミュートボタン
document.getElementById('bgm-toggle').addEventListener('click', () => {
  const m = BGM.toggleMute();
  document.getElementById('bgm-toggle').textContent = m ? '🔇' : '🔊';
});
// 初回タップでAudioContext起動
document.addEventListener('click', () => { BGM.getCtx(); }, { once: true });

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
      trainCount: saved.trainCount || { atk: 0, def: 0, spd: 0 },
      dragonType: saved.dragonType || 'balanced',
      stamina: saved.stamina ?? STA_MAX,
    });
    // 放置中のスタミナ回復
    if (saved.savedAt && state.stamina < STA_MAX) {
      const recovered = Math.floor((Date.now() - saved.savedAt) / STA_RECOVER_MS);
      state.stamina = Math.min(STA_MAX, state.stamina + recovered);
    }

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
