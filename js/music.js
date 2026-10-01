/* ============================================================
   Dragon Cradle — music.js
   インタラクティブミュージックエンジン（Web Audio API / 音声ファイル不要）

   ・ルックアヘッド・スケジューラ（16分音符単位）で全パートを生成
   ・縦の再構成：パート（レイヤー）ごとのゲインを params に応じてクロスフェード
   ・横の再構成：フレーズ境界（4小節）でセクションを切替（通常 ⇄ クライマックス）
   ・スティンガー：勝利 / 敗北 / レベルアップ / 進化 を拍・小節に同期して挿入
   ・ハーモニックSE：タップや鍛錬音を「今鳴っているコード」の構成音で鳴らす

   API:
     Music.play(theme, params)   theme: title|hatch|raise|battle|victory|defeat
     Music.set(params)           intensity, danger, tension, climax, attr, adult, boss
     Music.stinger(name)         victory|defeat|levelup|evolve|hatch
     Music.sfx(name, opts)       効果音
     Music.toggleMute() / isMuted() / unlock() / stop()
   ============================================================ */
'use strict';

const Music = (() => {
  // ----------------------------------------------------------
  // 音楽理論ヘルパー
  // ----------------------------------------------------------
  const MODES = {
    ionian:     [0, 2, 4, 5, 7, 9, 11],
    dorian:     [0, 2, 3, 5, 7, 9, 10],
    phrygian:   [0, 1, 3, 5, 7, 8, 10],
    lydian:     [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    aeolian:    [0, 2, 3, 5, 7, 8, 10],
  };
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  // 音階度数 → MIDI。度数は負数や7以上でもオクターブを跨いで解決する
  function degToMidi(key, deg, oct = 0) {
    const sc = MODES[key.mode];
    const o = Math.floor(deg / 7);
    const i = ((deg % 7) + 7) % 7;
    return key.root + sc[i] + 12 * (o + oct);
  }
  const degF = (key, deg, oct) => mtof(degToMidi(key, deg, oct));
  // 和音（度数 r を根音とする三和音 / 7th）
  const triad = r => [r, r + 2, r + 4];

  // ----------------------------------------------------------
  // 状態
  // ----------------------------------------------------------
  let ctx = null;
  let master, musicGain, musicFilter, sfxGain, reverb, reverbIn, comp;
  let noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('dc_muted') === '1'; } catch (e) { /* noop */ }
  const VOL = { master: 0.8, music: 0.42, sfx: 0.55 };

  const params = {
    intensity: 0.3, // 0..1 盛り上がり（レイヤー数）
    danger: 0,      // 0..1 危険度（ローパス＋心音）
    tension: 0,     // 0..1 緊張（敵の溜め：トレモロ＋スネアロール）
    climax: false,  // クライマックス・セクションへ
    attr: 'fire',   // 育成曲の調・旋法
    adult: false,   // 成体なら編成が厚くなる
    boss: false,    // ボス戦
  };

  let cur = null;      // 再生中のテーマ
  let timer = null;
  const stingerQueue = [];

  // ----------------------------------------------------------
  // 初期化
  // ----------------------------------------------------------
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOL.master;
    master.connect(comp);

    // リバーブ（生成インパルス）
    reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(2.6, 2.4);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.9;
    reverb.connect(revOut);
    revOut.connect(master);
    reverbIn = ctx.createGain();
    reverbIn.gain.value = 1;
    reverbIn.connect(reverb);

    // 音楽バス：危険度でローパスがかかる
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 18000;
    musicFilter.Q.value = 0.7;
    musicGain = ctx.createGain();
    musicGain.gain.value = VOL.music;
    musicFilter.connect(musicGain);
    musicGain.connect(master);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = VOL.sfx;
    sfxGain.connect(master);

    // 共有ノイズバッファ（毎回生成しない）
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) { ctx.suspend(); if (silentEl) silentEl.pause(); }
      else if (cur) { ctx.resume().then(resync).catch(() => {}); }
    });
    return ctx;
  }

  function makeImpulse(seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 200 ? i / 200 : 1);
      }
    }
    return buf;
  }

  // iOS 対策：消音スイッチ ON でも鳴るよう「再生」カテゴリのオーディオセッションにする
  let silentEl = null;
  function silentWavUrl() {
    const n = 800, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  function keepPlaybackSession() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* noop */ }
    if (navigator.audioSession || !/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) || !('ontouchend' in document)) return;
    if (!silentEl) {
      silentEl = document.createElement('audio');
      silentEl.src = silentWavUrl();
      silentEl.loop = true;
      silentEl.setAttribute('playsinline', '');
      silentEl.setAttribute('x-webkit-airplay', 'deny');
    }
    if (silentEl.paused) silentEl.play().catch(() => {});
  }

  // ユーザー操作の中で呼ぶ。suspended / interrupted のどちらからも復帰させる
  function unlock() {
    if (!ensure()) return;
    keepPlaybackSession();
    if (ctx.state !== 'running') {
      ctx.resume().then(resync).catch(() => {});
      // 無音を1サンプル鳴らして出力経路を起こす（古い iOS Safari 対策）
      const src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    }
  }

  // ----------------------------------------------------------
  // 音源（ボイス）
  // ----------------------------------------------------------
  function out(dest, wet) {
    // dest へドライ、リバーブへウェットを送る出力ノード
    const g = ctx.createGain();
    g.connect(dest);
    if (wet > 0) {
      const s = ctx.createGain();
      s.gain.value = wet;
      g.connect(s);
      s.connect(reverbIn);
    }
    return g;
  }

  function adsr(g, t, peak, a, d, s, dur, r) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * s, t + a, Math.max(0.01, d / 3));
    g.gain.setTargetAtTime(0.0001, t + Math.max(a, dur), Math.max(0.01, r / 4));
    return t + Math.max(a, dur) + r;
  }

  function oscNode(type, f, t, detune = 0) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    return o;
  }

  // ふくよかなパッド（デチューンした鋸波×2 → ローパス）
  function pad(dest, t, freqs, dur, vel, bright = 1, wet = 0.5) {
    const o = out(dest, wet);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500 * bright, t);
    lp.frequency.linearRampToValueAtTime(1100 * bright, t + dur * 0.6);
    lp.Q.value = 0.5;
    const g = ctx.createGain();
    const end = adsr(g, t, vel / freqs.length, Math.min(0.8, dur * 0.3), 0.5, 0.85, dur, 1.2);
    lp.connect(g); g.connect(o);
    freqs.forEach(f => {
      [-8, 8].forEach(dt => {
        const v = oscNode('sawtooth', f, t, dt);
        v.connect(lp); v.start(t); v.stop(end);
      });
    });
  }

  // 弦トレモロ（緊張）
  function tremolo(dest, t, f, dur, vel) {
    const o = out(dest, 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2600;
    const g = ctx.createGain();
    const end = adsr(g, t, vel, 0.01, 0.05, 0.7, dur * 0.8, 0.05);
    const v = oscNode('sawtooth', f, t, 4);
    v.connect(lp); lp.connect(g); g.connect(o);
    v.start(t); v.stop(end);
  }

  // チェレスタ / オルゴール
  function bell(dest, t, f, vel, decay = 1.6, wet = 0.45) {
    const o = out(dest, wet);
    [[1, 1, decay], [2, 0.35, decay * 0.6], [4.01, 0.18, decay * 0.25]].forEach(([mul, amp, dc]) => {
      const v = oscNode('sine', f * mul, t);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel * amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dc);
      v.connect(g); g.connect(o);
      v.start(t); v.stop(t + dc + 0.05);
    });
  }

  // ハープ / ピチカート
  function pluck(dest, t, f, vel, decay = 0.5, wet = 0.3) {
    const o = out(dest, wet);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(9000, f * 8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const v = oscNode('triangle', f, t);
    const v2 = oscNode('sawtooth', f, t, 3);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    v.connect(lp); v2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(o);
    v.start(t); v2.start(t); v.stop(t + decay + 0.05); v2.stop(t + decay + 0.05);
  }

  // ベース
  function bass(dest, t, f, dur, vel, gritty = false) {
    const o = out(dest, 0.05);
    const g = ctx.createGain();
    const end = adsr(g, t, vel, 0.008, 0.12, 0.7, dur, 0.08);
    const sub = oscNode('sine', f, t);
    sub.connect(g);
    sub.start(t); sub.stop(end);
    if (gritty) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(260, t + dur);
      lp.Q.value = 4;
      const s = oscNode('sawtooth', f, t);
      const sg = ctx.createGain(); sg.gain.value = 0.45;
      s.connect(lp); lp.connect(sg); sg.connect(g);
      s.start(t); s.stop(end);
    } else {
      const tri = oscNode('triangle', f * 2, t);
      const tg = ctx.createGain(); tg.gain.value = 0.2;
      tri.connect(tg); tg.connect(g);
      tri.start(t); tri.stop(end);
    }
    g.connect(o);
  }

  // リード（ビブラート付き）。style: 'lead'（矩形・戦闘）/ 'horn'（鋸・柔らかめ）/ 'flute'
  function lead(dest, t, f, dur, vel, style = 'lead', wet = 0.3) {
    const o = out(dest, wet);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const type = style === 'lead' ? 'square' : style === 'horn' ? 'sawtooth' : 'triangle';
    const cutoff = style === 'lead' ? 2600 : style === 'horn' ? 1300 : 4000;
    lp.frequency.setValueAtTime(cutoff * 0.6, t);
    lp.frequency.linearRampToValueAtTime(cutoff, t + 0.08);
    const g = ctx.createGain();
    const atk = style === 'horn' ? 0.06 : style === 'flute' ? 0.05 : 0.015;
    const end = adsr(g, t, vel, atk, 0.2, 0.8, dur, 0.12);
    const v = oscNode(type, f, t);
    // ビブラート（音の後半から）
    const lfo = oscNode('sine', 5.5, t);
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(dur > 0.3 ? f * 0.006 : 0, t + Math.min(dur, 0.35));
    lfo.connect(lg); lg.connect(v.frequency);
    v.connect(lp); lp.connect(g); g.connect(o);
    v.start(t); lfo.start(t); v.stop(end); lfo.stop(end);
    if (style !== 'flute') {
      const v2 = oscNode(type, f, t, 7);
      const g2 = ctx.createGain(); g2.gain.value = 0.5;
      v2.connect(g2); g2.connect(lp);
      v2.start(t); v2.stop(end);
    }
  }

  // ブラス・スタブ
  function stab(dest, t, freqs, dur, vel) {
    const o = out(dest, 0.25);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + Math.max(0.08, dur));
    lp.Q.value = 2;
    const g = ctx.createGain();
    const end = adsr(g, t, vel / freqs.length, 0.01, 0.15, 0.5, dur, 0.1);
    lp.connect(g); g.connect(o);
    freqs.forEach(f => [-6, 6].forEach(dt => {
      const v = oscNode('sawtooth', f, t, dt);
      v.connect(lp); v.start(t); v.stop(end);
    }));
  }

  function noise(dest, t, dur, vel, ftype, freq, q = 1, wet = 0.1) {
    const o = out(dest, wet);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(o);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    return f;
  }

  function kick(dest, t, vel, low = 45) {
    const o = out(dest, 0.02);
    const v = oscNode('sine', 150, t);
    v.frequency.exponentialRampToValueAtTime(low, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    v.connect(g); g.connect(o);
    v.start(t); v.stop(t + 0.4);
  }
  function snare(dest, t, vel) {
    noise(dest, t, 0.16, vel, 'bandpass', 1900, 0.8, 0.2);
    const o = out(dest, 0.1);
    const v = oscNode('triangle', 210, t);
    v.frequency.exponentialRampToValueAtTime(140, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    v.connect(g); g.connect(o); v.start(t); v.stop(t + 0.1);
  }
  const hat = (dest, t, vel, open = false) => noise(dest, t, open ? 0.22 : 0.04, vel, 'highpass', 8000, 0.7, 0.05);
  const shaker = (dest, t, vel) => noise(dest, t, 0.06, vel, 'bandpass', 6000, 1.5, 0.1);
  function timpani(dest, t, f, vel) {
    const o = out(dest, 0.5);
    const v = oscNode('sine', f * 1.03, t);
    v.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    v.connect(g); g.connect(o); v.start(t); v.stop(t + 1.2);
    noise(dest, t, 0.08, vel * 0.3, 'lowpass', 600, 1, 0.4);
  }
  function crash(dest, t, vel) { noise(dest, t, 1.8, vel, 'highpass', 5000, 0.5, 0.5); }

  // ----------------------------------------------------------
  // 楽曲データ
  //   メロディ記法: [開始16分, 音階度数, 長さ16分]（1小節=16）
  // ----------------------------------------------------------
  const MEL_CRADLE = [
    [[0, 4, 6], [6, 3, 2], [8, 2, 8]],
    [[0, 0, 6], [6, 1, 2], [8, 2, 8]],
    [[0, 4, 4], [4, 5, 4], [8, 4, 8]],
    [[0, 3, 6], [6, 2, 2], [8, 1, 8]],
    [[0, 4, 6], [6, 3, 2], [8, 2, 4], [12, 4, 4]],
    [[0, 7, 6], [6, 6, 2], [8, 5, 8]],
    [[0, 4, 4], [4, 5, 4], [8, 2, 8]],
    [[0, 1, 8], [8, 0, 8]],
  ];
  const MEL_NEST = [
    [[0, 2, 4], [4, 4, 4], [8, 7, 6], [14, 6, 2]],
    [[0, 5, 8], [8, 3, 8]],
    [[0, 4, 4], [4, 5, 4], [8, 4, 4], [12, 2, 4]],
    [[0, 1, 12], [12, 4, 4]],
    [[0, 2, 4], [4, 4, 4], [8, 7, 6], [14, 8, 2]],
    [[0, 9, 8], [8, 7, 8]],
    [[0, 6, 4], [4, 5, 4], [8, 4, 4], [12, 1, 4]],
    [[0, 0, 16]],
  ];
  const MEL_BATTLE_A = [
    [[0, 0, 2], [2, 1, 2], [4, 2, 6], [10, 4, 2], [12, 3, 4]],
    [[0, 2, 6], [6, 0, 2], [8, -1, 8]],
    [[0, 1, 2], [2, 2, 2], [4, 3, 6], [10, 5, 2], [12, 4, 4]],
    [[0, 4, 12], [12, 6, 4]],
    [[0, 7, 4], [4, 6, 2], [6, 4, 2], [8, 5, 4], [12, 4, 4]],
    [[0, 2, 6], [6, 3, 2], [8, 4, 8]],
    [[0, 3, 4], [4, 2, 4], [8, 1, 4], [12, 3, 4]],
    [[0, 4, 8], [8, 4, 4], [12, 6, 4]],
  ];
  const MEL_BATTLE_B = [
    [[0, 7, 4], [4, 8, 4], [8, 10, 8]],
    [[0, 8, 6], [6, 9, 2], [8, 11, 8]],
    [[0, 12, 6], [6, 11, 2], [8, 10, 4], [12, 9, 4]],
    [[0, 9, 4], [4, 10, 4], [8, 13, 8]],
    [[0, 14, 4], [4, 13, 4], [8, 12, 4], [12, 10, 4]],
    [[0, 11, 6], [6, 10, 2], [8, 8, 8]],
    [[0, 7, 4], [4, 9, 4], [8, 11, 8]],
    [[0, 14, 16]],
  ];

  const RAISE_KEYS = {
    fire:    { root: 62, mode: 'dorian' },     // D ドリアン：素朴で力強い
    ice:     { root: 65, mode: 'lydian' },     // F リディアン：透明感
    thunder: { root: 57, mode: 'mixolydian' }, // A ミクソリディアン：快活
    dark:    { root: 60, mode: 'aeolian' },    // C エオリアン：神秘的
  };

  // 各曲：bpm, key(params), sections, layers(各レイヤーの演奏関数), mix(params→各レイヤー音量)
  const SONGS = {
    // ---------------- タイトル / 孵化：ゆりかごの歌 ----------------
    cradle: {
      bpm: 68,
      key: () => ({ root: 62, mode: 'aeolian' }),
      sections: { A: { prog: [0, 5, 2, 6, 0, 3, 5, 4], mel: MEL_CRADLE } },
      nextSection: () => 'A',
      mix: p => ({
        pad: 1,
        arp: 0.5 + 0.5 * p.intensity,
        melody: p.intensity > 0.2 ? 1 : 0,
        bass: p.intensity > 0.4 ? 1 : 0,
        heart: p.intensity > 0.6 ? Math.min(1, (p.intensity - 0.6) * 4) : 0,
        shimmer: p.intensity > 0.85 ? 1 : 0,
      }),
      layers: {
        pad: (c, d) => { if (c.s === 0) pad(d, c.t, triad(c.chord).map(x => degF(c.key, x, -1)), c.bar, 0.16, 0.9, 0.6); },
        arp: (c, d) => {
          if (c.s % 2) return;
          const pat = [0, 1, 2, 4, 2, 1, 0, 1];
          const tones = triad(c.chord).concat([c.chord + 7, c.chord + 9]);
          bell(d, c.t, degF(c.key, tones[pat[c.s / 2]], 0), 0.05, 1.2);
        },
        melody: (c, d) => playMel(c, d, (t, f, len) => bell(d, t, f, 0.11, Math.max(1.2, len * 1.5), 0.55), 1),
        bass: (c, d) => { if (c.s === 0 || c.s === 8) bass(d, c.t, degF(c.key, c.chord, -2), c.step * 7, 0.22); },
        heart: (c, d) => { if (c.s === 0 || c.s === 3) kick(d, c.t, c.s === 0 ? 0.32 : 0.2, 38); },
        shimmer: (c, d) => {
          const tones = triad(c.chord);
          tremolo(d, c.t, degF(c.key, tones[c.s % 3] + 7, 0), c.step, 0.025);
        },
      },
    },

    // ---------------- 育成：巣のうた（属性で調・旋法が変わる） ----------------
    nest: {
      bpm: 92,
      key: p => RAISE_KEYS[p.attr] || RAISE_KEYS.fire,
      sections: { A: { prog: [0, 3, 5, 4, 0, 3, 4, 0], mel: MEL_NEST } },
      nextSection: () => 'A',
      mix: p => ({
        pad: p.adult ? 1 : 0.6,
        bass: 1,
        arp: 0.6 + 0.4 * p.intensity,
        melody: 1,
        perc: p.adult ? 0.8 : 0.35,
        counter: p.adult ? 0.8 : 0,
      }),
      layers: {
        pad: (c, d) => { if (c.s === 0) pad(d, c.t, triad(c.chord).map(x => degF(c.key, x, -1)), c.bar, 0.14, 1, 0.5); },
        bass: (c, d) => {
          const hits = c.p.adult ? [0, 6, 8, 14] : [0, 8];
          if (hits.includes(c.s)) pluck(d, c.t, degF(c.key, c.s === 6 || c.s === 14 ? c.chord + 4 : c.chord, -2), 0.3, 0.45, 0.15);
        },
        arp: (c, d) => {
          const pat = { 0: 0, 3: 1, 6: 2, 8: 4, 11: 2, 14: 1 };
          if (!(c.s in pat)) return;
          const tones = triad(c.chord).concat([c.chord + 7, c.chord + 9]);
          pluck(d, c.t, degF(c.key, tones[pat[c.s]], 0), 0.07, 0.6, 0.35);
        },
        melody: (c, d) => playMel(c, d, (t, f, len) => {
          if (c.p.adult) lead(d, t, f, len, 0.075, 'horn', 0.4);
          else bell(d, t, f * 2, 0.08, Math.max(1, len * 1.4), 0.5);
        }, 0),
        perc: (c, d) => { if (c.s % 2 === 0) shaker(d, c.t, c.s % 4 === 2 ? 0.05 : 0.025); },
        counter: (c, d) => {
          if (c.s === 8 && c.barIdx % 2 === 1) lead(d, c.t, degF(c.key, c.chord + 2, 0), c.step * 8, 0.04, 'flute', 0.5);
        },
      },
    },

    // ---------------- 戦闘：翼の咆哮 ----------------
    battle: {
      bpm: 148,
      key: p => p.boss ? { root: 50, mode: 'phrygian' } : { root: 50, mode: 'aeolian' },
      sections: {
        A: { prog: [0, 5, 6, 4, 0, 5, 3, 4], mel: MEL_BATTLE_A },
        B: { prog: [3, 4, 5, 6, 3, 4, 0, 0], mel: MEL_BATTLE_B },
      },
      nextSection: p => p.climax ? 'B' : 'A',
      mix: p => ({
        kick: 1, snare: p.intensity > 0.15 ? 1 : 0.5, hats: 1, bass: 1,
        pad: 0.7,
        stabs: p.intensity > 0.25 ? 1 : 0,
        melody: p.intensity > 0.35 ? 1 : 0,
        timpani: p.boss ? 1 : 0,
        tension: p.tension,
        heart: p.danger,
      }),
      layers: {
        kick: (c, d) => {
          const hits = c.sec === 'B' ? [0, 4, 8, 12] : [0, 7, 8];
          if (hits.includes(c.s)) kick(d, c.t, 0.55);
        },
        snare: (c, d) => {
          if (c.s === 4 || c.s === 12) snare(d, c.t, 0.32);
          // フレーズ末のフィル
          if (c.barIdx % 4 === 3 && c.s >= 12) snare(d, c.t, 0.12 + (c.s - 12) * 0.05);
        },
        hats: (c, d) => {
          const sixteenths = c.sec === 'B' || c.p.intensity > 0.7;
          if (sixteenths || c.s % 2 === 0) hat(d, c.t, c.s % 4 === 2 ? 0.09 : 0.045, c.s === 14 && c.barIdx % 2 === 1);
        },
        bass: (c, d) => {
          if (c.s % 2) return;
          const oct = (c.s / 2) % 2 ? -1 : -2;
          bass(d, c.t, degF(c.key, c.chord, oct + 1), c.step * 1.7, 0.2, true);
        },
        pad: (c, d) => { if (c.s === 0) pad(d, c.t, triad(c.chord).map(x => degF(c.key, x, 0)), c.bar, 0.1, 1.4, 0.4); },
        stabs: (c, d) => {
          const hits = { 0: 3, 6: 1.5, 10: 1.5 };
          if (c.s in hits) stab(d, c.t, triad(c.chord).map(x => degF(c.key, x, 0)), c.step * hits[c.s], 0.16);
        },
        melody: (c, d) => playMel(c, d, (t, f, len) => lead(d, t, f, len, 0.085, 'lead', 0.25), 1),
        timpani: (c, d) => {
          if (c.s === 0) timpani(d, c.t, degF(c.key, c.chord, -2), 0.5);
          if (c.barIdx % 2 === 1 && c.s >= 12) timpani(d, c.t, degF(c.key, 0, -2), 0.18 + (c.s - 12) * 0.06);
        },
        tension: (c, d) => {
          const tones = triad(c.chord);
          tremolo(d, c.t, degF(c.key, tones[c.s % 3] + 14, 0), c.step, 0.03);
          if (c.s >= 8) snare(d, c.t, 0.04 + (c.s - 8) * 0.012);
        },
        heart: (c, d) => { if (c.s === 0 || c.s === 3) kick(d, c.t, c.s === 0 ? 0.5 : 0.32, 35); },
      },
    },

    // ---------------- 勝利後：凱旋 ----------------
    victory: {
      bpm: 100,
      key: () => ({ root: 62, mode: 'ionian' }),
      sections: { A: { prog: [0, 3, 4, 0], mel: null } },
      nextSection: () => 'A',
      mix: () => ({ pad: 1, arp: 1, bass: 1 }),
      layers: {
        pad: (c, d) => { if (c.s === 0) pad(d, c.t, triad(c.chord).map(x => degF(c.key, x, -1)), c.bar, 0.13, 1.1, 0.6); },
        arp: (c, d) => {
          if (c.s % 2) return;
          const tones = triad(c.chord).concat([c.chord + 7]);
          bell(d, c.t, degF(c.key, tones[(c.s / 2) % 4], 0), 0.045, 1.0);
        },
        bass: (c, d) => { if (c.s === 0) bass(d, c.t, degF(c.key, c.chord, -2), c.bar * 0.9, 0.2); },
      },
    },

    // ---------------- 敗北後：静寂 ----------------
    defeat: {
      bpm: 60,
      key: () => ({ root: 62, mode: 'aeolian' }),
      sections: { A: { prog: [0, 5, 3, 4], mel: null } },
      nextSection: () => 'A',
      mix: () => ({ pad: 1, bell: 1 }),
      layers: {
        pad: (c, d) => { if (c.s === 0) pad(d, c.t, triad(c.chord).map(x => degF(c.key, x, -1)), c.bar, 0.12, 0.6, 0.7); },
        bell: (c, d) => { if (c.s === 8 && c.barIdx % 2 === 0) bell(d, c.t, degF(c.key, c.chord + 4, 0), 0.04, 2.5, 0.8); },
      },
    },
  };

  const THEMES = {
    title:   { song: 'cradle', params: { intensity: 0.35 } },
    hatch:   { song: 'cradle', params: { intensity: 0.1 } },
    raise:   { song: 'nest' },
    battle:  { song: 'battle', params: { intensity: 0.2, danger: 0, tension: 0, climax: false } },
    victory: { song: 'victory' },
    defeat:  { song: 'defeat' },
  };

  // メロディ演奏ヘルパー
  function playMel(c, d, voice, oct) {
    const mel = c.section.mel;
    if (!mel) return;
    const notes = mel[c.barIdx % mel.length];
    notes.forEach(([st, deg, len]) => {
      if (st === c.s) voice(c.t, degF(c.key, deg, oct), len * c.step);
    });
  }

  // ----------------------------------------------------------
  // トランスポート
  // ----------------------------------------------------------
  function startSong(songName) {
    const song = SONGS[songName];
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
    bus.connect(musicFilter);
    const layers = {};
    const mix = song.mix(params);
    Object.keys(song.layers).forEach(name => {
      const g = ctx.createGain();
      g.gain.value = mix[name] || 0;
      g.connect(bus);
      layers[name] = { gain: g, level: mix[name] || 0 };
    });
    const firstSec = song.nextSection(params);
    cur = {
      name: songName, song, bus, layers,
      step: 0, nextTime: ctx.currentTime + 0.08,
      secName: firstSec, barIdx: 0, key: song.key(params),
    };
    if (!timer) timer = setInterval(tick, 25);
  }

  function stopSong(fade = 0.8) {
    if (!cur) return;
    const bus = cur.bus;
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(0.0001, now + fade);
    setTimeout(() => { try { bus.disconnect(); } catch (e) { /* noop */ } }, (fade + 2.5) * 1000);
    cur = null;
  }

  function resync() {
    if (cur && ctx && cur.nextTime < ctx.currentTime) cur.nextTime = ctx.currentTime + 0.05;
  }

  function applyMix(time) {
    if (!cur) return;
    const mix = cur.song.mix(params);
    Object.keys(cur.layers).forEach(name => {
      const L = cur.layers[name];
      const target = Math.max(0, Math.min(1, mix[name] || 0));
      if (Math.abs(target - L.level) < 0.001) return;
      L.level = target;
      L.gain.gain.cancelScheduledValues(time);
      L.gain.gain.setTargetAtTime(target, time, 0.35);
    });
  }

  function applyDanger() {
    if (!musicFilter) return;
    const now = ctx.currentTime;
    const cutoff = 18000 * Math.pow(1200 / 18000, Math.min(1, params.danger) * 0.85);
    musicFilter.frequency.cancelScheduledValues(now);
    musicFilter.frequency.setTargetAtTime(cutoff, now, 0.4);
  }

  function tick() {
    if (!cur || !ctx || ctx.state !== 'running') return;
    if (cur.nextTime < ctx.currentTime - 0.25) resync();
    const horizon = ctx.currentTime + 0.14;
    const stepDur = 60 / cur.song.bpm / 4;
    while (cur && cur.nextTime < horizon) {
      const t = cur.nextTime;
      const s = cur.step % 16;
      if (s === 0) onBar(t);
      if (s % 4 === 0) flushStingers(t, s === 0);
      if (!cur) break;
      const section = cur.song.sections[cur.secName];
      const c = {
        t, s, p: params, key: cur.key, step: stepDur, bar: stepDur * 16,
        barIdx: cur.barIdx, sec: cur.secName, section,
        chord: section.prog[cur.barIdx % section.prog.length],
      };
      cur.chord = c.chord;
      Object.keys(cur.song.layers).forEach(name => {
        const L = cur.layers[name];
        if (L.level <= 0.001) return;
        cur.song.layers[name](c, L.gain);
      });
      cur.nextTime += stepDur;
      cur.step++;
      if (s === 15) cur.barIdx++;
    }
  }

  function onBar(t) {
    // 横の再構成：4小節のフレーズ境界でセクションを選び直す
    const section = cur.song.sections[cur.secName];
    const want = cur.song.nextSection(params);
    if (cur.barIdx >= section.prog.length) cur.barIdx = 0;
    if (want !== cur.secName && cur.barIdx % 4 === 0) {
      cur.secName = want;
      cur.barIdx = 0;
      if (want === 'B') crash(cur.bus, t, 0.12);
    }
    cur.key = cur.song.key(params);
    applyMix(t);
  }

  // ----------------------------------------------------------
  // スティンガー（拍 / 小節に同期）
  // ----------------------------------------------------------
  const STINGERS = {
    victory: { quant: 'beat', then: 'victory', fn: (t, k) => {
      const K = { root: k.root, mode: 'ionian' };
      [0, 2, 4, 7].forEach((deg, i) => lead(sfxGain, t + i * 0.11, degF(K, deg, 1), 0.16, 0.09, 'lead', 0.3));
      stab(sfxGain, t + 0.44, triad(0).map(x => degF(K, x, 1)), 1.4, 0.24);
      pad(sfxGain, t + 0.44, triad(0).map(x => degF(K, x, 0)), 1.6, 0.2, 1.5, 0.6);
      timpani(sfxGain, t + 0.44, degF(K, 0, -1), 0.5);
      crash(sfxGain, t + 0.44, 0.15);
    } },
    defeat: { quant: 'beat', then: 'defeat', fn: (t, k) => {
      const K = { root: k.root, mode: 'aeolian' };
      [4, 3, 2, 0].forEach((deg, i) => lead(sfxGain, t + i * 0.32, degF(K, deg, 0), 0.4, 0.07, 'horn', 0.5));
      pad(sfxGain, t + 1.28, triad(0).map(x => degF(K, x, -1)), 2.2, 0.18, 0.6, 0.7);
    } },
    levelup: { quant: 'beat', fn: (t, k) => {
      [0, 2, 4, 7, 9].forEach((d, i) => bell(sfxGain, t + i * 0.07, degF(k, (cur ? cur.chord || 0 : 0) + d, 1), 0.1, 0.9));
    } },
    evolve: { quant: 'bar', fn: (t, k) => {
      const K = { root: k.root, mode: 'lydian' };
      for (let i = 0; i < 12; i++) bell(sfxGain, t + i * 0.06, degF(K, i, 0), 0.08, 1.4);
      pad(sfxGain, t + 0.7, [0, 2, 4, 6].map(x => degF(K, x, 0)), 2.5, 0.22, 1.6, 0.8);
      crash(sfxGain, t + 0.7, 0.14);
      timpani(sfxGain, t + 0.7, degF(K, 0, -1), 0.5);
    } },
    hatch: { quant: 'beat', then: null, fn: (t, k) => {
      for (let i = 0; i < 10; i++) bell(sfxGain, t + i * 0.05, degF(k, i * 2, 0), 0.09, 1.2);
      crash(sfxGain, t + 0.5, 0.18);
      pad(sfxGain, t + 0.5, triad(0).map(x => degF({ root: k.root, mode: 'ionian' }, x, 0)), 2.4, 0.2, 1.4, 0.8);
    } },
  };

  function flushStingers(t, isBar) {
    for (let i = 0; i < stingerQueue.length; i++) {
      const q = stingerQueue[i];
      if (q.quant === 'bar' && !isBar) continue;
      stingerQueue.splice(i--, 1);
      const st = STINGERS[q.name];
      st.fn(t, cur.key);
      if (st.then !== undefined) {
        const thenTheme = st.then;
        stopSong(0.3);
        if (thenTheme) {
          setTimeout(() => { if (!cur) play(thenTheme); }, Math.max(0, (t - ctx.currentTime) * 1000 + 1800));
        }
        return;
      }
    }
  }

  function stinger(name) {
    if (!ensure() || !STINGERS[name]) return;
    if (!cur) {
      // 曲が流れていなければ即時
      const st = STINGERS[name];
      st.fn(ctx.currentTime + 0.03, { root: 62, mode: 'aeolian' });
      if (st.then) setTimeout(() => { if (!cur) play(st.then); }, 1800);
      return;
    }
    stingerQueue.push({ name, quant: STINGERS[name].quant });
  }

  // ----------------------------------------------------------
  // 効果音（現在のコードに合わせて音程が決まる）
  // ----------------------------------------------------------
  function chordTone(i, oct = 1) {
    const key = cur ? cur.key : { root: 62, mode: 'aeolian' };
    const chord = cur && cur.chord !== undefined ? cur.chord : 0;
    const tones = triad(chord);
    const o = Math.floor(i / 3);
    return degF(key, tones[((i % 3) + 3) % 3] + 7 * o, oct);
  }

  function sfx(name, opts = {}) {
    if (!ensure() || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    const d = sfxGain;
    switch (name) {
      case 'ui':
        bell(d, t, chordTone(2, 1), 0.05, 0.25, 0.1);
        break;
      case 'select':
        bell(d, t, chordTone(0, 1), 0.08, 0.6);
        bell(d, t + 0.07, chordTone(2, 1), 0.07, 0.8);
        break;
      case 'tap': { // 孵化タップ：判定で和音の高さが変わる
        const q = opts.quality || 'normal';
        if (q === 'perfect') {
          bell(d, t, chordTone(3, 1), 0.13, 1.4);
          bell(d, t + 0.06, chordTone(5, 1), 0.08, 1.4);
          bell(d, t + 0.12, chordTone(6, 1), 0.06, 1.6);
        } else if (q === 'great') {
          bell(d, t, chordTone(2, 1), 0.11, 1.1);
          bell(d, t + 0.06, chordTone(3, 1), 0.06, 1.0);
        } else {
          pluck(d, t, chordTone(0, 0), 0.12, 0.35, 0.2);
        }
        break;
      }
      case 'train': { // 鍛錬：倍率に応じたアルペジオ
        const n = opts.mult >= 3 ? 5 : opts.mult >= 2 ? 3 : 2;
        for (let i = 0; i < n; i++) pluck(d, t + i * 0.06, chordTone(i + 1, 1), 0.12, 0.5, 0.3);
        if (opts.mult >= 3) bell(d, t + n * 0.06, chordTone(n + 2, 1), 0.1, 1.2);
        break;
      }
      case 'feed':
        pluck(d, t, chordTone(0, 0), 0.14, 0.25, 0.1);
        pluck(d, t + 0.09, chordTone(1, 0), 0.12, 0.25, 0.1);
        break;
      case 'nostamina':
        pluck(d, t, chordTone(0, -1), 0.14, 0.3, 0.1);
        pluck(d, t + 0.1, chordTone(0, -1) * 0.94, 0.12, 0.4, 0.1);
        break;
      case 'hit': // プレイヤーの攻撃
        noise(d, t, 0.12, 0.35, 'bandpass', 1400, 0.9, 0.1);
        kick(d, t, 0.45, 60);
        if (opts.crit) {
          bell(d, t + 0.02, chordTone(4, 1), 0.12, 0.6);
          noise(d, t, 0.25, 0.2, 'highpass', 6000, 0.6, 0.3);
        }
        break;
      case 'special': {
        const f = noise(d, t, 0.6, 0.28, 'bandpass', 600, 2, 0.3);
        f.frequency.exponentialRampToValueAtTime(5000, t + 0.5);
        stab(d, t + 0.45, [chordTone(0, 0), chordTone(1, 0), chordTone(2, 0)], 0.5, 0.25);
        crash(d, t + 0.45, 0.12);
        break;
      }
      case 'hurt': // プレイヤーが被弾
        kick(d, t, 0.6, 40);
        noise(d, t, 0.2, 0.22, 'lowpass', 900, 1, 0.1);
        if (opts.heavy) { timpani(d, t, chordTone(0, -2), 0.6); crash(d, t, 0.1); }
        break;
      case 'guard': {
        [1, 1.5].forEach((m, i) => {
          const o = out(d, 0.4);
          const v = oscNode('sine', chordTone(0, 1) * m, t);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.08 / (i + 1), t + 0.005);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
          v.connect(g); g.connect(o); v.start(t); v.stop(t + 1);
        });
        noise(d, t, 0.05, 0.15, 'highpass', 3000, 1, 0.1);
        break;
      }
      case 'evade': {
        const f = noise(d, t, 0.3, 0.2, 'bandpass', 3000, 3, 0.2);
        f.frequency.exponentialRampToValueAtTime(800, t + 0.28);
        break;
      }
      case 'heal':
        for (let i = 0; i < 4; i++) bell(d, t + i * 0.07, chordTone(i + 3, 1), 0.07, 0.8);
        break;
      case 'charge': { // 敵が力をためる
        const o = out(d, 0.3);
        const v = oscNode('sawtooth', 55, t);
        v.frequency.exponentialRampToValueAtTime(110, t + 0.8);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(200, t); lp.frequency.exponentialRampToValueAtTime(1800, t + 0.8);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
        v.connect(lp); lp.connect(g); g.connect(o); v.start(t); v.stop(t + 1);
        break;
      }
      case 'enrage':
        timpani(d, t, chordTone(0, -2), 0.6);
        timpani(d, t + 0.18, chordTone(0, -2), 0.6);
        stab(d, t + 0.36, [chordTone(0, -1), chordTone(1, -1) * 1.06, chordTone(2, -1)], 0.8, 0.25);
        break;
    }
  }

  // ----------------------------------------------------------
  // 公開 API
  // ----------------------------------------------------------
  function play(theme, extra = {}) {
    if (!ensure()) return;
    const th = THEMES[theme];
    if (!th) return;
    Object.assign(params, th.params || {}, extra);
    applyDanger();
    if (cur && cur.name === th.song && cur.theme === theme) { applyMix(ctx.currentTime); return; }
    if (cur && cur.name === th.song) {
      // 同じ曲のまま別テーマ（タイトル→孵化 など）：ミックスだけ変える
      cur.theme = theme;
      applyMix(ctx.currentTime);
      return;
    }
    stingerQueue.length = 0;
    stopSong(0.9);
    startSong(th.song);
    cur.theme = theme;
  }

  function set(p) {
    const prevClimax = params.climax;
    Object.assign(params, p);
    if (!ctx) return;
    if ('danger' in p) applyDanger();
    // tension / danger はすぐに反映、その他は次の小節で
    if (cur && ('tension' in p || 'danger' in p || 'intensity' in p || prevClimax !== params.climax)) applyMix(ctx.currentTime);
  }

  function stop() { stingerQueue.length = 0; if (ctx) stopSong(0.5); }

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('dc_muted', muted ? '1' : '0'); } catch (e) { /* noop */ }
    if (master) {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(muted ? 0 : VOL.master, now, 0.05);
    }
    return muted;
  }

  return {
    play, set, stinger, sfx, stop, unlock, toggleMute,
    isMuted: () => muted,
    isRunning: () => !!ctx && ctx.state === 'running',
    getCtx: () => ensure(),
    get theme() { return cur ? cur.theme : null; },
    get section() { return cur ? cur.secName : null; },
  };
})();
