/*
 * M1 sound cues (data only + tiny player helper).
 *
 * Load with a classic <script> tag (works from file://). No module syntax, no fetch.
 * Playback uses the game's existing WebAudio helpers, passed in by the caller:
 *   tone(freq, dur, type, vol, delay, slideTo)   // delay/slideTo in seconds / Hz
 *   noise(dur, vol)
 *
 * Step format:
 *   { t:'tone',  f:Hz, d:sec, w:waveType, v:volume, at:startSec, to:slideToHz|null }
 *   { t:'noise', d:sec, v:volume, at:startSec }
 *
 * Volume ceilings (existing sfx): tone <= 0.12, noise <= 0.25. All cues stay at or below.
 * Skip cues: skipSuccess/skipFail/skipDestroy <= 0.3 s, skipBigWin <= 0.6 s (total length).
 *
 * Usage (in index.html, after tone/noise are defined):
 *   M1_SFX_PLAY('skipSuccess', tone, noise);
 */
window.M1_SFX = {
  // ---- Effect-skip feedback (m1-idle.md F9) ----
  skipSuccess: [
    { t: 'tone', f: 784,  d: .10, w: 'triangle', v: .08, at: 0,   to: null },
    { t: 'tone', f: 1047, d: .14, w: 'triangle', v: .08, at: .05, to: null }
  ],
  skipFail: [
    { t: 'tone', f: 196, d: .18, w: 'triangle', v: .05, at: 0, to: 120 }
  ],
  skipDestroy: [
    { t: 'noise', d: .20, v: .12, at: 0 },
    { t: 'tone', f: 110, d: .20, w: 'sawtooth', v: .05, at: 0, to: 40 }
  ],
  skipBigWin: [
    { t: 'tone', f: 523,  d: .12, w: 'triangle', v: .10, at: 0,   to: null },
    { t: 'tone', f: 659,  d: .12, w: 'triangle', v: .10, at: .08, to: null },
    { t: 'tone', f: 784,  d: .12, w: 'triangle', v: .10, at: .16, to: null },
    { t: 'tone', f: 1047, d: .32, w: 'triangle', v: .10, at: .24, to: null }
  ],

  // ---- Items / consumables (m1-consumables.md) ----
  itemUse: [
    { t: 'tone', f: 880,  d: .07, w: 'sine', v: .08, at: 0,   to: null },
    { t: 'tone', f: 1320, d: .09, w: 'sine', v: .06, at: .04, to: null }
  ],
  useKeepdown: [
    { t: 'tone', f: 392, d: .12, w: 'sine', v: .08, at: 0,   to: 523 },
    { t: 'tone', f: 587, d: .16, w: 'sine', v: .06, at: .10, to: null }
  ],
  useSure: [
    { t: 'tone', f: 659, d: .08, w: 'triangle', v: .08, at: 0,   to: null },
    { t: 'tone', f: 659, d: .08, w: 'triangle', v: .08, at: .09, to: null },
    { t: 'tone', f: 988, d: .18, w: 'triangle', v: .08, at: .18, to: null }
  ],
  useBooster: [
    { t: 'tone', f: 330, d: .25, w: 'sawtooth', v: .04, at: 0,   to: 660 },
    { t: 'tone', f: 990, d: .20, w: 'sine',     v: .06, at: .15, to: null }
  ],
  useSeal: [
    { t: 'tone',  f: 523, d: .10, w: 'sine', v: .08, at: 0,   to: null },
    { t: 'noise', d: .08, v: .05, at: .05 },
    { t: 'tone',  f: 262, d: .20, w: 'sine', v: .07, at: .05, to: 196 }
  ],
  craft: [
    { t: 'tone', f: 523, d: .10, w: 'triangle', v: .08, at: 0,   to: null },
    { t: 'tone', f: 784, d: .14, w: 'triangle', v: .08, at: .09, to: null }
  ],

  // ---- Anvil / ore (m1-anvil-ore.md) ----
  anvilCraft: [
    { t: 'noise', d: .06, v: .10, at: 0 },
    { t: 'tone',  f: 220, d: .12, w: 'square',   v: .05, at: 0,   to: 180 },
    { t: 'noise', d: .06, v: .10, at: .18 },
    { t: 'tone',  f: 440, d: .30, w: 'triangle', v: .08, at: .18, to: null }
  ],
  anvilBreak: [
    { t: 'noise', d: .30, v: .12, at: 0 },
    { t: 'tone',  f: 180, d: .35, w: 'square',   v: .05, at: 0,   to: 60 },
    { t: 'tone',  f: 120, d: .30, w: 'sawtooth', v: .04, at: .10, to: 40 }
  ],
  anvilRepair: [
    { t: 'tone',  f: 330, d: .08, w: 'square',   v: .05, at: 0,   to: null },
    { t: 'noise', d: .05, v: .06, at: .08 },
    { t: 'tone',  f: 494, d: .12, w: 'triangle', v: .08, at: .12, to: null },
    { t: 'tone',  f: 659, d: .18, w: 'triangle', v: .07, at: .20, to: null }
  ],
  oreGain: [
    { t: 'noise', d: .04, v: .04, at: 0 },
    { t: 'tone',  f: 698, d: .06, w: 'triangle', v: .05, at: 0,   to: null },
    { t: 'tone',  f: 932, d: .08, w: 'triangle', v: .04, at: .04, to: null }
  ],

  // ---- Quest / offline / shards (m1-quest.md, m1-idle.md, m1-protect-shards.md) ----
  questDeliver: [
    { t: 'tone', f: 587, d: .12, w: 'triangle', v: .09, at: 0,   to: null },
    { t: 'tone', f: 880, d: .18, w: 'triangle', v: .09, at: .10, to: null }
  ],
  questComplete: [
    { t: 'tone', f: 523, d: .35, w: 'triangle', v: .09, at: 0,   to: null },
    { t: 'tone', f: 659, d: .35, w: 'triangle', v: .09, at: .10, to: null },
    { t: 'tone', f: 784, d: .35, w: 'triangle', v: .09, at: .20, to: null }
  ],
  offlineCollect: [
    { t: 'tone', f: 392, d: .15, w: 'sine', v: .09, at: 0,   to: null },
    { t: 'tone', f: 523, d: .15, w: 'sine', v: .09, at: .12, to: null },
    { t: 'tone', f: 659, d: .30, w: 'sine', v: .08, at: .24, to: null }
  ],
  shardGain: [
    { t: 'tone', f: 1568, d: .06, w: 'sine', v: .05, at: 0,   to: null },
    { t: 'tone', f: 2093, d: .10, w: 'sine', v: .04, at: .05, to: null }
  ],
  shardExchange: [
    { t: 'tone', f: 1319, d: .07, w: 'triangle', v: .06, at: 0,   to: null },
    { t: 'tone', f: 988,  d: .09, w: 'triangle', v: .06, at: .06, to: null }
  ],
  // Very subtle: fires on each auto-hunt payout tick (m1-idle.md section 2).
  autoHuntTick: [
    { t: 'tone', f: 1400, d: .03, w: 'sine', v: .02, at: 0, to: null }
  ],

  // ---- UI (overview / settings) ----
  tabSwitch: [
    { t: 'tone', f: 880, d: .03, w: 'sine', v: .04, at: 0, to: null }
  ],
  unlock: [
    { t: 'tone', f: 659,  d: .20, w: 'triangle', v: .08, at: 0,    to: null },
    { t: 'tone', f: 880,  d: .20, w: 'triangle', v: .08, at: .08,  to: null },
    { t: 'tone', f: 1319, d: .30, w: 'triangle', v: .08, at: .16,  to: null }
  ],
  toggleOn: [
    { t: 'tone', f: 740, d: .06, w: 'triangle', v: .06, at: 0, to: 990 }
  ],
  toggleOff: [
    { t: 'tone', f: 990, d: .06, w: 'triangle', v: .06, at: 0, to: 660 }
  ]
};

// Plays a cue by name using the game's tone()/noise() helpers.
// Unknown names are ignored silently. Noise steps with at > 0 are delayed via setTimeout,
// because the existing noise(dur, vol) has no delay parameter.
window.M1_SFX_PLAY = function (name, toneFn, noiseFn) {
  var cue = window.M1_SFX && window.M1_SFX[name];
  if (!cue || typeof toneFn !== 'function') return;
  cue.forEach(function (s) {
    if (s.t === 'tone') {
      toneFn(s.f, s.d, s.w, s.v, s.at, s.to);
    } else if (s.t === 'noise' && typeof noiseFn === 'function') {
      if (s.at > 0) setTimeout(function () { noiseFn(s.d, s.v); }, s.at * 1000);
      else noiseFn(s.d, s.v);
    }
  });
};

// Korean one-line descriptions per cue (for docs / sound test panel).
window.M1_SFX_DESC = {
  skipSuccess:    '효과 스킵 중 강화 성공: 짧은 상승 2음 (0.3초 이내)',
  skipFail:       '효과 스킵 중 실패/하락: 짧은 하강음 (0.3초 이내)',
  skipDestroy:    '효과 스킵 중 파괴: 짧은 충격음 (0.3초 이내)',
  skipBigWin:     '효과 스킵 중 +15 이상 성공·첫 도감 등록·best 갱신 등 중요 결과: 짧은 팡파르 (0.6초 이내)',
  itemUse:        '소모품 사용(일반): 가벼운 맑은 2음',
  useKeepdown:    '하락 방지 주문서 사용: 위로 살짝 올라가는 음',
  useSure:        '확정 강화권 사용: 또렷한 3음 상승',
  useBooster:     '골드 부스터 사용: 상승 스윕 후 반짝임',
  useSeal:        '감정 인장 사용: 도장 찍는 짧은 타격음',
  anvilCraft:     '모루 제작: 망치 타격 2회와 완성음',
  anvilBreak:     '모루 파손: 금속이 갈라지는 하강음',
  anvilRepair:    '모루 수리: 가벼운 두드림 후 상승 음',
  craft:          '제작(일반) 완료: 짧은 상승 2음',
  questDeliver:   '의뢰 납품: 동전 소리 같은 2음',
  questComplete:  '의뢰 완료(보상 확정): 짧은 3음 아르페지오',
  offlineCollect: '자리 비운 동안 보상 받기: 따뜻한 3음 환영음',
  shardGain:      '파편 획득: 유리 같은 높은 반짝임',
  shardExchange:  '파편 교환: 짧은 하강 반짝임',
  autoHuntTick:   '자동 사냥 1회 지급: 거의 들리지 않는 미세한 틱',
  oreGain:        '광석 획득: 가벼운 톡 소리 + 짧은 음',
  tabSwitch:      '탭 전환: 짧은 클릭 틱',
  unlock:         '신규 요소 해금: 3음 상승 팡파르',
  toggleOn:       '토글 켜짐: 위로 미끄러지는 짧은 음',
  toggleOff:      '토글 꺼짐: 아래로 미끄러지는 짧은 음'
};
