/* Wrapper self-check: the sim mechanics behave as the proposal specifies, using the real rules.
 * Usage: node tools/sim-late/selfcheck.js
 */
'use strict';
const assert = require('assert');
const E = require('./lib/engine.js');
const M = require('./lib/mechanics.js');
const { C, R, SV, CONFIG } = E;

const T = 1_800_000_000_000;
const fresh = lv => { const S = SV.defaultState(T); S.swords[0].lv = lv; S.best = lv; S.gold = 1e9; return S; };
const snapshot = () => JSON.stringify([C.RATE, C.BONUS_CAP, C.PITY_STEP, C.PITY_MAX, CONFIG.forceSuccess]);
const before = snapshot();
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// A: gauge full -> guaranteed success (100 / 0) even with a roll that would otherwise fail, then reset to 0
{
  const mech = M.combine([M.gauge({ N: [4, 5, 6, 8, 10] })]);
  const S = fresh(19); mech.init(S);
  S._gauge[19] = 10;
  const sw = R.activeSword(S);
  const f = mech.forced(S, sw, {});
  ok(f && f.by === 'A', 'gauge full at +19 must force');
  CONFIG.forceSuccess = true;
  ok(R.chances(sw, {}).succ === 100 && R.chances(sw, {}).dest === 0, 'forced chances 100/0');
  const r = R.attemptEnhance(S, () => 0.9999);
  CONFIG.forceSuccess = false;
  mech.post(S, r, {});
  ok(r.outcome === 'success' && S.best === 20 && S._gauge[19] === 0, 'forced success resets gauge');
  const S2 = fresh(15); mech.init(S2);
  const r2 = R.attemptEnhance(S2, () => 0.9999);   // plain fail -> drop to +14, gauge[15] +1
  mech.post(S2, r2, {});
  ok(r2.outcome === 'drop' && S2._gauge[15] === 1, 'non-success at +15 adds 1 to gauge[15]');
  ok(!mech.forced(S2, R.activeSword(S2), {}), 'no guarantee below +15');
}

// C: smith bonus sits outside BONUS_CAP and is removed after the attempt
{
  const mech = M.combine([M.smith({ countFrom: 10, tries: [100, 250, 500, 1000, 2000], bonus: [0, 2, 4, 6, 8, 10], bonusFrom: 10 })]);
  const S = fresh(15); mech.init(S); S._smith = 2000;
  const sw = R.activeSword(S);
  const capped = R.chances(sw, { bless: true, anvilGrade: 3 }).succ;   // 20 + 14
  const restore = mech.levelOverrides(S, sw);
  const boosted = R.chances(sw, { bless: true, anvilGrade: 3 }).succ;
  restore();
  ok(capped === 34 && boosted === 44, `outside-cap smith +10 at +15: ${capped} -> ${boosted}`);
  ok(R.chances(sw, {}).succ === 20, 'RATE restored after override');
  // ceiling headroom: worst case anywhere in +10..+19 stays far below SUCC_CEIL
  let maxSucc = 0;
  for (let l = 10; l < 20; l++) {
    const s = fresh(l); s._smith = 2000; const w = R.activeSword(s); w.pity = 10;
    const rs = mech.levelOverrides(s, w);
    maxSucc = Math.max(maxSucc, R.chances(w, { bless: true, anvilGrade: 3 }).succ);
    rs();
  }
  ok(maxSucc === 69 && maxSucc < C.SUCC_CEIL, `max success +10..+19 with package = ${maxSucc}% (< ${C.SUCC_CEIL})`);
}

// F: constant overrides are restored by runMany
{
  const P = require('./lib/profiles.js');
  E.runMany(P.heavy, M.combine([M.pityCap({ BONUS_CAP: { 3: 18 }, PITY_MAX: { 3: 15 }, PITY_STEP: { 3: 3 } })]), 'standard', 3, 1, 5);
  ok(snapshot() === before, 'constants restored after F batch');
}

console.log(`selfcheck: ${n} checks passed`);
