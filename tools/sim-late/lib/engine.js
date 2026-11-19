/* Agent-based Monte Carlo of a player from a fresh save, driven by the REAL rule modules in js/.
 * Nothing in js/ is modified. Candidate mechanics are wrappers (see mechanics.js):
 *  - guaranteed success  -> SG.config.forceSuccess (read by rules.chances at call time) around one attemptEnhance call
 *  - outside-cap bonus   -> C.RATE[l] raised for the duration of one decision+attempt, then restored
 *  - pity / cap changes  -> C.PITY_STEP / C.PITY_MAX / C.BONUS_CAP array entries swapped for the run, then restored
 * (C is Object.freeze'd shallowly; its arrays stay mutable, which is what makes these wrappers possible.)
 */
'use strict';
const path = require('path');
const JS = path.join(__dirname, '..', '..', '..', 'js');
const C = require(path.join(JS, 'constants.js'));
const R = require(path.join(JS, 'rules.js'));
const F = require(path.join(JS, 'forge.js'));
const I = require(path.join(JS, 'idle.js'));
const SV = require(path.join(JS, 'save.js'));
const CONFIG = globalThis.SG.config;
const { mulberry32 } = require('./prng.js');

const T0 = 1_800_000_000_000;
const MILESTONES = [10, 15, 18, 20];

/** Time model (seconds). Every profile states which variant it uses. */
const TIME = {
  standard: {
    attSkip: 0.6,          // skip ON: 250 ms min interval + click/reaction
    attFull: 1.5,          // skip OFF: 650 ms charge + result read + click
    importantExtra: 0.55,  // skip ON but "important" result (+15 success, first find, +10 destroy): 250+300 ms
    destroyExtra: 0.65,    // skip OFF destroy: shatter 650 ms
    buy: 0.4,              // one shop / exchange / craft click
    huntCd: C.HUNT_CD / 1000,
    sessionSec: 30 * 60,   // 30 min per day
    offlineSec: 23.5 * 3600, // rest of the day offline (settleOffline caps at 8 h, 25 %)
  },
  // Reproduction of the old m1-balance §6.2 "M1 일반, 접속만": continuous play, 0.35 s per attempt, no click cost
  legacy: {
    attSkip: 0.35, attFull: 0.35, importantExtra: 0, destroyExtra: 0, buy: 0,
    huntCd: C.HUNT_CD / 1000, sessionSec: Infinity, offlineSec: 0,
  },
};

function applyConst(over) {
  const saved = [];
  Object.keys(over || {}).forEach(name => {
    Object.keys(over[name]).forEach(i => {
      saved.push([name, i, C[name][i]]);
      C[name][i] = over[name][i];
    });
  });
  return () => saved.reverse().forEach(([name, i, v]) => { C[name][i] = v; });
}

/** Run one player. profile: policy object (profiles.js). mech: combined mechanic (mechanics.js). */
function runOne(profile, mech, timeModel, seed, capH) {
  const tm = TIME[timeModel];
  const rng = mulberry32(seed);
  const S = SV.defaultState(T0);
  const st = {
    now: T0, active: 0, huntT: 0, enhT: 0, buyT: 0, attempts: 0, income: C.START_GOLD,
    day: 1, sessionLeft: tm.sessionSec, nextAutoAt: T0, ms: {}, used: { bless: 0, protect: 0, keepdown: 0, sure: 0, sure2: 0 },
    forced: 0, fused: 0, lateAttempts: 0, att19: 0, forced19: 0, tm, rng, profile,
  };
  const ctx = { S, st, C, R, F, I, tm, rng,
    buy(id) { const r = R.buyShopItem(S, id, st.now); if (r.ok) advance(tm.buy, 'buy'); return r.ok; },
    click() { advance(tm.buy, 'buy'); },
    hunt() { hunt(); },
  };
  mech.init(S, ctx);

  function advance(dt, kind) {
    st.now += dt * 1000;
    st.active += dt;
    st.sessionLeft -= dt;
    if (kind === 'hunt') st.huntT += dt; else if (kind === 'enh') st.enhT += dt; else st.buyT += dt;
    if (S.idle.autoOn) {
      const a = I.runAutoCatchup(S, st.now, st.nextAutoAt, rng);
      st.nextAutoAt = a.nextAutoAt;
      st.income += a.gold;
    }
  }
  function hunt() {
    const r = I.manualHunt(S, st.now, rng);
    st.income += r.gold;
    advance(tm.huntCd / profile.huntEff, 'hunt');
  }
  function sessionCheck() {
    if (!S.idle.autoOn && I.autoUnlocked(S)) { I.setAutoOn(S, true); st.nextAutoAt = st.now + I.autoInterval(S); }
    if (st.sessionLeft > 0) return;
    S.idle.lastSeen = st.now;
    st.now += tm.offlineSec * 1000;
    const o = I.settleOffline(S, st.now);
    if (o) st.income += o.gold;
    st.nextAutoAt = st.now + I.autoInterval(S);
    st.day++;
    st.sessionLeft = tm.sessionSec;
  }
  function record(r) {
    MILESTONES.forEach(m => {
      if (S.best >= m && !st.ms[m]) {
        st.ms[m] = {
          attempts: st.attempts, gold: st.income - S.gold, h: st.active / 3600, days: st.day,
          huntFrac: st.huntT / st.active, destroys: S.stats.destroy, forced: st.forced, fused: st.fused,
          used: Object.assign({}, st.used), lateAttempts: st.lateAttempts, att19: st.att19, forced19: st.forced19,
          via: r && r.outcome === 'success' && r.to === m ? (r._forced ? 'forced' : 'roll') : 'other',
        };
      }
    });
  }

  const capSec = capH * 3600;
  while (S.best < C.MAX && st.active < capSec) {
    sessionCheck();
    if (!R.activeSword(S)) R.setActive(S, R.bestSword(S).id);   // after a destroy: player picks a sword
    profile.manage(S, ctx);
    mech.manage(S, ctx, profile);
    record(null);                                 // fusion can raise best outside an attempt
    const sw = R.activeSword(S);
    if (sw.lv >= C.MAX || S.best >= C.MAX) break;
    const restore = mech.levelOverrides(S, sw);   // outside-cap base bonus (B, C)
    const forced = mech.forced(S, sw, ctx);       // guaranteed this attempt (A gauge full / E sure2)
    const plan = forced ? { use: {}, buy: {}, gold: 0 } : profile.plan(S, sw, ctx);
    if (!forced) mech.planHook(S, sw, plan, ctx);
    const need = R.cost(sw.lv) + (plan.gold || 0) + (forced ? forced.gold || 0 : 0);
    if (S.gold < need) { restore(); hunt(); continue; }

    if (forced && forced.pay) forced.pay(S, ctx);
    Object.keys(plan.buy).forEach(id => {
      for (let i = 0; i < plan.buy[id]; i++) ctx.buy(id);
    });
    C.TRAY_TOGGLES.forEach(id => { S.use[id] = false; });
    if (!forced) C.TRAY_TOGGLES.forEach(id => { if (plan.use[id]) R.setUse(S, id, true); });
    const use = R.effectiveUse(S);
    const invBefore = { protect: S.inv.protect, keepdown: S.inv.keepdown };
    const restoreIn = forced ? () => {} : mech.inCapOverrides(S, sw, use);   // in-cap bonus needs the final toggles
    if (forced) CONFIG.forceSuccess = true;
    const r = R.attemptEnhance(S, rng);
    CONFIG.forceSuccess = false;
    restoreIn();
    restore();
    if (!r.ok) throw new Error('attempt failed: ' + r.reason);
    st.attempts++;
    if (r.from >= 15) st.lateAttempts++;
    if (r.from === 19) { st.att19++; if (forced) st.forced19++; }
    if (forced) { st.forced++; r._forced = true; }
    if (use.bless) st.used.bless++;
    if (use.sure) st.used.sure++;
    st.used.protect += invBefore.protect - S.inv.protect;
    st.used.keepdown += invBefore.keepdown - S.inv.keepdown;
    mech.post(S, r, ctx, forced);

    const skip = profile.skip;
    const important = (r.outcome === 'success' && (r.to >= C.SKIP_KEEP_LV || r.firstFound)) ||
      (r.outcome === 'destroy' && r.from >= C.SKIP_KEEP_DESTROY_LV);
    let dt = skip ? tm.attSkip + (important ? tm.importantExtra : 0) : tm.attFull + (r.outcome === 'destroy' ? tm.destroyExtra : 0);
    advance(dt, 'enh');
    record(r);
  }
  return { ms: st.ms, endH: st.active / 3600, reached: S.best >= C.MAX, best: S.best };
}

/** Run n seeded players. Constant overrides (F) are applied once around the batch and always restored. */
function runMany(profile, mech, timeModel, n, seed0, capH) {
  const restore = applyConst(mech.consts);
  try {
    const out = [];
    for (let i = 0; i < n; i++) out.push(runOne(profile, mech, timeModel, seed0 + i, capH));
    return out;
  } finally {
    restore();
  }
}

module.exports = { C, R, F, I, SV, CONFIG, TIME, MILESTONES, runOne, runMany, applyConst };
