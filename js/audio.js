/* 효과음: 큐 이름 → 콘텐츠 팀 큐 또는 합성음(WebAudio). 음원 파일이 오면 SFX_FILES에 경로만 추가하면 된다. */
(function (root) {
  'use strict';
  const SG = root.SG = root.SG || {};

  // 큐 → 음원 파일 경로 (비어 있으면 합성음 사용)
  const SFX_FILES = {};
  // 콘텐츠 큐가 로드되지 않았을 때 대신 쓸 기본 합성음
  const SYNTH_FALLBACK = {
    skipSuccess: 'success', skipFail: 'fail', skipDestroy: 'destroy', skipBigWin: 'fanfare',
    anvilCraft: 'craft', anvilRepair: 'craft', anvilBreak: 'error', questDeliver: 'deliver',
    offlineCollect: 'coin', shardExchange: 'buy', useBooster: 'buy', useKeepdown: 'keep', unlock: 'fanfare',
  };

  SG.createAudio = function createAudio(isMuted) {
    let actx = null;
    function ac() {
      if (isMuted()) return null;
      try {
        if (!actx) actx = new (root.AudioContext || root.webkitAudioContext)();
        if (actx.state === 'suspended') actx.resume();
        return actx;
      } catch (e) { return null; }
    }
    function tone(freq, dur, type = 'sine', vol = .12, delay = 0, slideTo = null) {
      const a = ac(); if (!a) return;
      const t = a.currentTime + delay;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination);
      o.start(t); o.stop(t + dur + .02);
    }
    function noise(dur, vol = .2) {
      const a = ac(); if (!a) return;
      const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = a.createBufferSource();
      const g = a.createGain();
      g.gain.value = vol;
      src.buffer = buf;
      src.connect(g).connect(a.destination);
      src.start();
    }
    const SYNTH = {
      charge:  () => tone(220, .6, 'sawtooth', .035, 0, 880),
      success: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .2, 'triangle', .12, i * .07)),
      fail:    () => tone(220, .28, 'square', .06, 0, 110),
      drop:    () => { tone(330, .2, 'square', .06, 0, 160); tone(160, .3, 'square', .06, .15, 80); },
      destroy: () => { noise(.55, .25); tone(140, .7, 'sawtooth', .1, 0, 40); },
      protect: () => { tone(660, .15, 'sine', .12); tone(990, .3, 'sine', .1, .1); },
      keep:    () => { tone(520, .12, 'sine', .1); tone(520, .2, 'sine', .08, .12); },
      coin:    () => { tone(988, .08, 'square', .05); tone(1319, .14, 'square', .05, .07); },
      error:   () => tone(150, .15, 'square', .06),
      buy:     () => { tone(784, .08, 'triangle', .1); tone(1175, .12, 'triangle', .1, .06); },
      craft:   () => { noise(.12, .15); tone(880, .1, 'square', .05, .08); tone(1320, .18, 'triangle', .08, .16); },
      deliver: () => [659, 784, 988].forEach((f, i) => tone(f, .16, 'triangle', .1, i * .06)),
      fanfare: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, .35, 'triangle', .12, i * .1)),
    };
    function playFile(src) {
      try {
        const p = new Audio(src).play();
        if (p && p.catch) p.catch(() => { /* 자동재생 차단 등 */ });
      } catch (e) { /* 재생 불가 환경 */ }
    }
    /** 우선순위: 음원 파일 → 콘텐츠 팀 큐(assets/m1-sfx.js) → 기본 합성음 → 대체 합성음 */
    function play(cue) {
      if (isMuted()) return;
      if (SFX_FILES[cue]) return playFile(SFX_FILES[cue]);
      if (root.M1_SFX && root.M1_SFX[cue] && root.M1_SFX_PLAY) return root.M1_SFX_PLAY(cue, tone, noise);
      const synth = SYNTH[cue] || SYNTH[SYNTH_FALLBACK[cue]];
      if (synth) synth();
    }
    return { play };
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
