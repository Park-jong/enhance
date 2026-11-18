/* M1.1 QA tests: ceiling gauge + per-stage success mastery for +15..+19 (F16, docs/design/m1.1-late-correction.md AC 1-14).
 * Rule-level and save-level only (no DOM). Expected values come from the spec tables below, not from js/constants.js.
 * Run: node tests/run-m1.1-qa-tests.js (no external dependencies).
 */
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const js = f => path.join(__dirname, '..', 'js', f);
const C = require(js('constants.js'));
const R = require(js('rules.js'));
const SV = require(js('save.js'));
require(js('fx.js'));
require(js('view.js'));
const V = globalThis.SG.view;

const results = { pass: 0, fail: 0 };
let group = '';
function describe(name, fn) { group = name; fn(); }
function test(name, fn) {
  try { fn(); results.pass++; } catch (e) {
    results.fail++;
    console.log(`FAIL  ${group} > ${name}\n      ${e.message.split('\n').join('\n      ')}`);
  }
}

// ------------------------------------------------------------ spec tables (m1.1-late-correction §4, §12)
const NOW = 1_800_000_000_000;
const RICH_GOLD = 1e12;
const LATE_FROM = 15;
const LATE_TO = 19;
const STAGES = [15, 16, 17, 18, 19];
const STAGE_COUNT = STAGES.length;
const GAUGE_N = [4, 5, 6, 8, 10];
const MASTERY_STEP = [3, 3, 3, 4, 5];
const MASTERY_MAX = [12, 12, 12, 12, 10];
const REC_MAX = [4, 4, 4, 3, 2];
const MAX_SUCC = [46, 41, 36, 33, 29];       // bless + mithril anvil + full mastery, pity 0
const MITHRIL = 3;
const SUCC_CEIL = 90;
const BLESS = 10;
const ANVIL_BONUS = [0, 2, 3, 4];
const BONUS_CAP_LATE = 14;
const ZERO5 = [0, 0, 0, 0, 0];
const SENTINEL_GAUGE = [1, 2, 3, 4, 5];       // valid, never full, distinct per stage
const SENTINEL_MASTERY = [1, 1, 1, 1, 1];
const WORST_ROLL = 0.9999;
const STOCK = 20;
const idx = l => l - LATE_FROM;
const clone = x => JSON.parse(JSON.stringify(x));
const sum = a => a.reduce((s, x) => s + x, 0);

/** Late-game state: active sword at lv, rich, best unlocks the forge. opts: gauge, mastery, inv, use, anvil(grade), sword */
function lateState(lv, opts = {}) {
  const S = SV.defaultState(NOW);
  S.gold = RICH_GOLD;
  S.best = Math.max(lv, C.FORGE_UNLOCK_BEST);
  Object.assign(S.swords[0], { lv }, opts.sword || {});
  if (opts.gauge) S.gauge = opts.gauge.slice();
  if (opts.mastery) S.mastery = opts.mastery.slice();
  Object.assign(S.inv, opts.inv || {});
  Object.assign(S.use, opts.use || {});
  if (opts.anvil) R.addAnvil(S, opts.anvil);
  return S;
}
const withGauge = (i, value, base = ZERO5) => { const g = base.slice(); g[i] = value; return g; };
const fullGauge = i => withGauge(i, GAUGE_N[i]);
const sw = (lv, pity = 0) => ({ id: 1, lv, pity, prot: C.PROTECT_USES });

/** Roll that lands in the middle of the requested outcome band of the CURRENT chances */
function rollFor(S, kind) {
  const ch = R.currentChances(S);
  const mid = { success: ch.succ / 2, destroy: ch.succ + ch.dest / 2, fail: ch.succ + ch.dest + ch.fail / 2 }[kind];
  return () => mid / 100;
}
const attempt = (S, kind) => R.attemptEnhance(S, rollFor(S, kind));
const memStorage = init => {
  const m = Object.assign({}, init);
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, dump: m };
};
const protectStock = { protect: STOCK };
const protectOn = { protect: true };

// Independent re-implementation of the spec formula (§3.3) used as an oracle
function oracle(lv, pity, { bless = false, grade = 0, mastery = 0, gaugeFull = false }) {
  if (lv >= 20) return { succ: 0, dest: 0, fail: 0 };
  if (gaugeFull && lv >= LATE_FROM && lv <= LATE_TO) return { succ: 100, dest: 0, fail: 0 };
  const band = Math.min(3, Math.floor(lv / 5));
  const pityBonus = Math.min([5, 6, 8, 10][band], pity * [1, 1, 2, 2][band]);
  const bonus = Math.min((bless ? BLESS : 0) + ANVIL_BONUS[grade] + pityBonus, [20, 20, 14, 14][band]);
  const i = idx(lv);
  const m = i >= 0 && i < STAGE_COUNT ? Math.min(MASTERY_MAX[i], mastery * MASTERY_STEP[i]) : 0;
  const succ = Math.min(C.RATE[lv] + bonus + m, Math.max(C.RATE[lv], SUCC_CEIL));
  const dest = Math.max(0, Math.min(C.DESTROY[lv], 100 - succ));
  return { succ, dest, fail: 100 - succ - dest };
}
const pick = ch => ({ succ: ch.succ, dest: ch.dest, fail: ch.fail });

// ============================================================ spec constants
describe('M1.1 constants match the spec table', () => {
  test('gauge/mastery tables are exactly the confirmed values', () => {
    assert.deepStrictEqual([C.GAUGE_FROM, C.GAUGE_TO, C.MASTERY_FROM, C.MASTERY_TO], [15, 19, 15, 19]);
    assert.deepStrictEqual(Array.from(C.GAUGE_N), GAUGE_N);
    assert.deepStrictEqual(Array.from(C.MASTERY_STEP), MASTERY_STEP);
    assert.deepStrictEqual(Array.from(C.MASTERY_MAX), MASTERY_MAX);
    assert.deepStrictEqual(Array.from(C.MASTERY_REC_MAX), REC_MAX);
  });
});

// ============================================================ AC1
describe('AC1 gauge +1 on every non-success at the START level', () => {
  const KINDS = [
    ['fail/drop', 'fail', {}, {}],
    ['protected destroy', 'destroy', { inv: protectStock, use: protectOn }, { outcome: 'protected' }],
    ['real destroy', 'destroy', {}, { outcome: 'destroy' }],
  ];
  STAGES.forEach(l => KINDS.forEach(([label, rollKind, opts, expect]) => {
    test(`+${l} ${label}: only gauge[${idx(l)}] gains exactly 1`, () => {
      const S = lateState(l, Object.assign({ gauge: SENTINEL_GAUGE }, opts));
      const r = attempt(S, rollKind);
      assert.ok(r.ok);
      if (expect.outcome) assert.strictEqual(r.outcome, expect.outcome);
      const want = SENTINEL_GAUGE.slice(); want[idx(l)]++;
      assert.deepStrictEqual(S.gauge, want);
    });
  }));
  test('fail at +19 drops the sword to +18 and still credits stage 19', () => {
    const S = lateState(19, { gauge: ZERO5 });
    assert.strictEqual(attempt(S, 'fail').outcome, 'drop');
    assert.strictEqual(S.swords[0].lv, 18);
    assert.deepStrictEqual(S.gauge, [0, 0, 0, 0, 1]);
  });
  test('drop +16 -> +15 credits gauge[1] and NOT gauge[0]', () => {
    const S = lateState(16, { gauge: ZERO5 });
    const r = attempt(S, 'fail');
    assert.deepStrictEqual([r.from, r.to], [16, 15]);
    assert.deepStrictEqual(S.gauge, [0, 1, 0, 0, 0]);
  });
  test('keepdown is not available at +15..+19 (lvRange), so a failure there always drops', () => {
    STAGES.forEach(l => {
      const S = lateState(l, { inv: { keepdown: STOCK } });
      assert.strictEqual(R.setUse(S, 'keepdown', true).reason, 'lvRange', `+${l}`);
    });
  });
  test('a keepdown-kept fail at +14 does not touch any gauge', () => {
    const S = lateState(14, { inv: { keepdown: 1 }, use: { keepdown: true }, gauge: SENTINEL_GAUGE });
    assert.strictEqual(attempt(S, 'fail').outcome, 'kept');
    assert.deepStrictEqual(S.gauge, SENTINEL_GAUGE);
  });
  STAGES.forEach(l => {
    test(`+${l}: gauge = GAUGE_N gives 100/0/0 with gaugeFull; one below does not`, () => {
      const i = idx(l);
      const below = R.currentChances(lateState(l, { gauge: withGauge(i, GAUGE_N[i] - 1) }));
      assert.ok(!below.gaugeFull);
      assert.ok(below.succ < 100);
      const full = R.currentChances(lateState(l, { gauge: fullGauge(i) }));
      assert.deepStrictEqual(pick(full), { succ: 100, dest: 0, fail: 0 });
      assert.strictEqual(full.gaugeFull, true);
    });
    test(`+${l}: fills at exactly ${GAUGE_N[idx(l)]} non-success attempts`, () => {
      const i = idx(l);
      const S = lateState(l);
      for (let n = 1; n <= GAUGE_N[i]; n++) {
        S.swords[0].lv = l;               // undo the drop so every attempt starts at the stage
        assert.ok(!R.isGaugeFull(S, l), `full too early before attempt ${n}`);
        attempt(S, 'fail');
        assert.strictEqual(S.gauge[i], n);
      }
      S.swords[0].lv = l;
      assert.ok(R.isGaugeFull(S, l));
      assert.strictEqual(R.currentChances(S).succ, 100);
    });
  });
  test('gauge never exceeds GAUGE_N even when a full gauge is somehow credited again', () => {
    const S = lateState(15, { gauge: fullGauge(0), use: { sure: false } });
    attempt(S, 'success');          // certain attempt resets
    assert.strictEqual(S.gauge[0], 0);
  });
});

// ============================================================ AC2
describe('AC2 certain attempt locks the tray and consumes nothing', () => {
  const trayOnState = (l, gauge) => lateState(l, {
    gauge, anvil: MITHRIL, sword: { pity: 5, prot: 1 },
    inv: { bless: STOCK, protect: STOCK, keepdown: STOCK, sure: STOCK },
    use: { bless: true, anvil: true, protect: true, keepdown: true, sure: true },
  });
  test('V.REASON.gaugeFull exists (toast text for the refused toggle)', () => {
    assert.strictEqual(typeof V.REASON.gaugeFull, 'string');
    assert.ok(V.REASON.gaugeFull.length > 0);
  });
  STAGES.forEach(l => {
    const i = idx(l);
    test(`+${l} full gauge: every tray toggle blocked with gaugeFull, nothing effective, setUse refuses`, () => {
      const S = trayOnState(l, fullGauge(i));
      const t = R.trayState(S);
      C.TRAY_TOGGLES.forEach(id => {
        assert.strictEqual(t[id].block, 'gaugeFull', id);
        assert.strictEqual(t[id].on, false, id);
        assert.strictEqual(R.effectiveUse(S)[id], false, id);
      });
      const S2 = trayOnState(l, fullGauge(i));
      C.TRAY_TOGGLES.forEach(id => {
        S2.use[id] = false;
        const r = R.setUse(S2, id, true);
        assert.deepStrictEqual([r.ok, r.reason], [false, 'gaugeFull'], id);
        assert.strictEqual(S2.use[id], false, `${id} must stay off`);
      });
    });
    test(`+${l} worst roll still succeeds; pays cost only; stocks/anvil/prot/pity untouched; gauge -> 0`, () => {
      const S = trayOnState(l, fullGauge(i));
      const before = { inv: clone(S.inv), dura: S.anvils[0].dura, prot: S.swords[0].prot, gold: S.gold };
      const r = R.attemptEnhance(S, () => WORST_ROLL);
      assert.strictEqual(r.outcome, 'success');
      assert.strictEqual(before.gold - S.gold, R.cost(l));
      assert.deepStrictEqual(S.inv, before.inv);
      assert.strictEqual(S.anvils[0].dura, before.dura);
      assert.strictEqual(r.anvilBroke, undefined);
      assert.strictEqual(S.gauge[i], 0);
      assert.strictEqual(S.swords[0].pity, 0);
      assert.strictEqual(S.swords[0].lv, l + 1);
      assert.strictEqual(S.swords[0].prot, C.PROTECT_USES);   // new level resets protection uses (existing rule), not consumed
    });
    test(`+${l} toggles unlock again once the certain attempt has been spent`, () => {
      const S = trayOnState(l, fullGauge(i));
      R.attemptEnhance(S, () => WORST_ROLL);
      S.swords[0].lv = l;
      const t = R.trayState(S);
      assert.strictEqual(t.bless.block, null);
      assert.strictEqual(t.protect.block, null);
      assert.ok(!C.TRAY_TOGGLES.some(id => t[id].block === 'gaugeFull'));
      assert.strictEqual(R.setUse(S, 'bless', true).ok, true);
    });
  });
  test('no lock at +14 or below even when every late gauge is full', () => {
    const allFull = GAUGE_N.slice();
    for (let l = 5; l <= 14; l++) {
      const S = trayOnState(l, allFull);
      const t = R.trayState(S);
      C.TRAY_TOGGLES.forEach(id => assert.notStrictEqual(t[id].block, 'gaugeFull', `+${l} ${id}`));
      assert.ok(!R.currentChances(S).gaugeFull);
    }
  });
  test("another stage's full gauge does not lock the tray at the active stage", () => {
    STAGES.forEach(l => STAGES.filter(o => o !== l).forEach(o => {
      const S = trayOnState(l, fullGauge(idx(o)));
      assert.strictEqual(R.trayState(S).bless.block, null, `+${l} with +${o} full`);
      assert.ok(!R.currentChances(S).gaugeFull);
    }));
  });
  test('stored S.use values are not rewritten by a certain attempt', () => {
    const S = trayOnState(15, fullGauge(0));
    R.attemptEnhance(S, () => WORST_ROLL);
    assert.strictEqual(S.use.bless, true);
  });
});

// ============================================================ AC3
describe('AC3 success at stage l zeroes only gauge[l-15]', () => {
  STAGES.forEach(l => {
    test(`+${l} success (partial gauge)`, () => {
      const S = lateState(l, { gauge: SENTINEL_GAUGE });
      assert.strictEqual(attempt(S, 'success').outcome, 'success');
      const want = SENTINEL_GAUGE.slice(); want[idx(l)] = 0;
      assert.deepStrictEqual(S.gauge, want);
    });
    test(`+${l} success from a full gauge keeps the other stages`, () => {
      const i = idx(l);
      const S = lateState(l, { gauge: withGauge(i, GAUGE_N[i], SENTINEL_GAUGE) });
      attempt(S, 'success');
      assert.deepStrictEqual(S.gauge, withGauge(i, 0, SENTINEL_GAUGE));
    });
  });
});

// ============================================================ AC4
describe('AC4 gauge survives destroy / sell / removal / reload', () => {
  test('real destroy keeps the gauge and adds 1', () => {
    const S = lateState(17, { gauge: withGauge(2, 3) });
    assert.strictEqual(attempt(S, 'destroy').outcome, 'destroy');
    assert.strictEqual(S.gauge[2], 4);
  });
  test('a destroy followed by save/load restores the gauge', () => {
    const S = lateState(17, { gauge: withGauge(2, 3) });
    attempt(S, 'destroy');
    const st = memStorage();
    SV.save(st, S, NOW);
    assert.deepStrictEqual(SV.load(st, NOW).state.gauge, [0, 0, 4, 0, 0]);
  });
  test('the sword that replaces a destroyed one inherits the gauge at that stage', () => {
    const S = lateState(16, { gauge: withGauge(1, 2) });
    attempt(S, 'destroy');
    assert.strictEqual(S.swords.length, 1);
    assert.strictEqual(S.swords[0].lv, 0);                 // free +0 sword
    S.swords[0].lv = 16;
    assert.deepStrictEqual(R.gaugeInfo(S, 16), { value: 3, n: 5, full: false });
  });
  test('a full gauge is not lost when the sword is destroyed (it only stays full)', () => {
    const S = lateState(15, { gauge: withGauge(0, 3) });
    attempt(S, 'destroy');
    assert.strictEqual(S.gauge[0], GAUGE_N[0]);
    S.swords[0].lv = 15;
    assert.ok(R.isGaugeFull(S, 15));
  });
  test('a full gauge survives sellSword and removeSword of other swords', () => {
    const S = lateState(18, { gauge: fullGauge(3) });
    const a = R.buySword(S).sword; a.lv = 18;
    const b = R.buySword(S).sword; b.lv = 18;
    assert.ok(R.sellSword(S, a.id).ok);
    R.removeSword(S, b.id);
    assert.deepStrictEqual(S.gauge, fullGauge(3));
    assert.ok(R.isGaugeFull(S, 18));
  });
  test('selling or removing the ACTIVE sword also keeps the gauge', () => {
    const S = lateState(17, { gauge: fullGauge(2) });
    assert.ok(R.sellSword(S, S.active).ok);
    assert.deepStrictEqual(S.gauge, fullGauge(2));
    R.removeSword(S, S.active);
    assert.deepStrictEqual(S.gauge, fullGauge(2));
  });
  test('a full gauge survives save/load', () => {
    const S = lateState(19, { gauge: GAUGE_N.slice() });
    const st = memStorage();
    SV.save(st, S, NOW);
    assert.deepStrictEqual(SV.load(st, NOW).state.gauge, GAUGE_N);
  });
  [0, 0.5, WORST_ROLL].forEach(roll => STAGES.forEach(l => {
    test(`certain attempt at +${l} cannot destroy or fail (roll ${roll})`, () => {
      const S = lateState(l, { gauge: fullGauge(idx(l)) });
      const r = R.attemptEnhance(S, () => roll);
      assert.strictEqual(r.outcome, 'success');
      assert.strictEqual(S.stats.destroy, 0);
      assert.strictEqual(S.swords.length, 1);
    });
  }));
});

// ============================================================ AC5
describe('AC5 no effect at +14 and below, +20 is final', () => {
  const GAUGE_FULL_ALL = GAUGE_N.slice();
  const MASTERY_FULL = REC_MAX.slice();
  const cases = [['sentinels', SENTINEL_GAUGE, SENTINEL_MASTERY], ['all full/max', GAUGE_FULL_ALL, MASTERY_FULL], ['zeros', ZERO5, ZERO5]];
  cases.forEach(([label, gauge, mastery]) => {
    test(`levels 0..14 with success / fail / destroy rolls leave gauge and mastery untouched (${label})`, () => {
      for (let lv = 0; lv <= 14; lv++) {
        ['success', 'fail', 'destroy'].forEach(kind => {
          const S = lateState(lv, { gauge, mastery });
          if (kind === 'destroy' && R.currentChances(S).dest === 0) return;
          const r = attempt(S, kind);
          assert.ok(r.ok, `+${lv} ${kind}`);
          assert.deepStrictEqual(S.gauge, gauge, `gauge +${lv} ${kind}`);
          assert.deepStrictEqual(S.mastery, mastery, `mastery +${lv} ${kind}`);
          assert.strictEqual(r.mastery, null, `payload +${lv} ${kind}`);
        });
      }
    });
  });
  test('+14 -> +15 success is not a mastery record and does not reset gauge[0]', () => {
    const S = lateState(14, { gauge: SENTINEL_GAUGE, mastery: ZERO5 });
    const r = attempt(S, 'success');
    assert.strictEqual(r.to, 15);
    assert.deepStrictEqual(S.mastery, ZERO5);
    assert.deepStrictEqual(S.gauge, SENTINEL_GAUGE);
  });
  test('a sure-ticket success is not a mastery record', () => {
    const S = lateState(5, { inv: { sure: 3 }, use: { sure: true }, mastery: SENTINEL_MASTERY, gauge: SENTINEL_GAUGE });
    const r = attempt(S, 'success');
    assert.strictEqual(r.used.sure, true);
    assert.strictEqual(r.outcome, 'success');
    assert.deepStrictEqual(S.mastery, SENTINEL_MASTERY);
    assert.deepStrictEqual(S.gauge, SENTINEL_GAUGE);
  });
  test('+20 cannot be enhanced and nothing changes', () => {
    const S = lateState(20, { gauge: SENTINEL_GAUGE, mastery: SENTINEL_MASTERY });
    const snap = clone(S);
    const r = R.attemptEnhance(S, () => 0);
    assert.deepStrictEqual([r.ok, r.reason], [false, 'maxLv']);
    assert.deepStrictEqual(clone(S), snap);
    assert.deepStrictEqual(pick(R.chances(sw(20), { gaugeFull: true, mastery: 4 })), { succ: 0, dest: 0, fail: 0 });
  });
});

// ============================================================ AC6
describe('AC6 mastery records', () => {
  STAGES.forEach(l => {
    const i = idx(l);
    test(`+${l} natural success adds 1 to mastery[${i}] only`, () => {
      const S = lateState(l, { mastery: ZERO5 });
      attempt(S, 'success');
      assert.deepStrictEqual(S.mastery, withGauge(i, 1));
    });
    test(`+${l} fail / drop / protected / destroy do not change mastery`, () => {
      [['fail', {}], ['destroy', {}], ['destroy', { inv: protectStock, use: protectOn }]].forEach(([kind, o]) => {
        const S = lateState(l, Object.assign({ mastery: SENTINEL_MASTERY }, o));
        const r = attempt(S, kind);
        assert.deepStrictEqual(S.mastery, SENTINEL_MASTERY, `${kind} ${r.outcome}`);
        assert.strictEqual(r.mastery, null);
      });
    });
    test(`+${l} gauge-guaranteed success counts as a record (user decision)`, () => {
      const S = lateState(l, { gauge: fullGauge(i), mastery: ZERO5 });
      const r = R.attemptEnhance(S, () => WORST_ROLL);
      assert.strictEqual(S.mastery[i], 1);
      assert.ok(r.mastery);
    });
    test(`+${l} once capped at ${REC_MAX[i]}: no more records and no toast payload`, () => {
      const S = lateState(l, { mastery: withGauge(i, REC_MAX[i]) });
      const r = attempt(S, 'success');
      assert.strictEqual(r.outcome, 'success');
      assert.strictEqual(S.mastery[i], REC_MAX[i]);
      assert.strictEqual(r.mastery, null);
    });
    test(`+${l} climbing from 0 gives exactly ${REC_MAX[i]} payloads then none`, () => {
      const S = lateState(l);
      const payloads = [];
      for (let n = 0; n < REC_MAX[i] + 2; n++) {
        S.swords[0].lv = l;
        payloads.push(attempt(S, 'success').mastery);
      }
      assert.strictEqual(payloads.filter(Boolean).length, REC_MAX[i]);
      assert.deepStrictEqual(payloads.slice(REC_MAX[i]), [null, null]);
      assert.strictEqual(sum(payloads.filter(Boolean).map(p => p.gained)), MASTERY_MAX[i]);
    });
  });
  test('toast payload for the first +15 record', () => {
    const S = lateState(15);
    assert.deepStrictEqual(attempt(S, 'success').mastery, { lv: 15, gained: 3, bonus: 3, count: 1, max: 4 });
  });
  test('toast payload for +18: last record (3rd) gained 4, bonus 12, count 3/3', () => {
    const S = lateState(18, { mastery: withGauge(3, 2) });
    assert.deepStrictEqual(attempt(S, 'success').mastery, { lv: 18, gained: 4, bonus: 12, count: 3, max: 3 });
  });
  test('toast payload for +19: last record (2nd) gained 5, bonus 10, count 2/2', () => {
    const S = lateState(19, { mastery: withGauge(4, 1) });
    assert.deepStrictEqual(attempt(S, 'success').mastery, { lv: 19, gained: 5, bonus: 10, count: 2, max: 2 });
  });
  test('V.masteryToastText for the first +16 record', () => {
    const S = lateState(16);
    assert.strictEqual(V.masteryToastText(attempt(S, 'success').mastery), '+16 숙련! 이후 +16 강화 성공률 +3%p');
  });
  test('+19 -> +20 success is recorded on stage 19', () => {
    const S = lateState(19);
    const r = attempt(S, 'success');
    assert.strictEqual(r.to, 20);
    assert.deepStrictEqual(S.mastery, [0, 0, 0, 0, 1]);
    assert.strictEqual(S.best, 20);
  });
  test('a failure then a success on the same sword records exactly one', () => {
    const S = lateState(16);
    attempt(S, 'fail');            // drops to +15
    S.swords[0].lv = 16;
    attempt(S, 'success');
    assert.deepStrictEqual(S.mastery, [0, 1, 0, 0, 0]);
  });
});

// ============================================================ AC7 / AC8 / AC9
describe('AC7/8/9 mastery bonus math', () => {
  test('+16 mastery 2 + bless + mithril anvil, pity 0 = 15 + 14 + 6 = 35', () => {
    const c = R.chances(sw(16), { bless: true, anvilGrade: MITHRIL, mastery: 2 });
    assert.strictEqual(c.succ, 35);
    assert.strictEqual(c.mastery, 6);
    assert.strictEqual(c.bonus, 14);
  });
  test('masteryBonus maxima [12,12,12,12,10] and 0 outside +15..+19', () => {
    assert.deepStrictEqual(STAGES.map(l => R.masteryBonus(l, 99)), MASTERY_MAX);
    for (let l = 0; l <= 20; l++) if (l < 15 || l > 19) assert.strictEqual(R.masteryBonus(l, 99), 0, `+${l}`);
  });
  test('masteryBonus grows by STEP per record up to the max', () => {
    STAGES.forEach(l => {
      for (let n = 0; n <= 6; n++) {
        assert.strictEqual(R.masteryBonus(l, n), Math.min(MASTERY_MAX[idx(l)], n * MASTERY_STEP[idx(l)]), `+${l} n${n}`);
      }
    });
  });
  test('max success with bless + mithril + full mastery is [46,41,36,33,29] and below 90', () => {
    const got = STAGES.map(l => R.chances(sw(l), { bless: true, anvilGrade: MITHRIL, mastery: REC_MAX[idx(l)] }).succ);
    assert.deepStrictEqual(got, MAX_SUCC);
    got.forEach(s => assert.ok(s < SUCC_CEIL));
  });
  test('max pity does not raise the maximum (raw capped at 14)', () => {
    STAGES.forEach(l => {
      const c = R.chances(sw(l, 99), { bless: true, anvilGrade: MITHRIL, mastery: REC_MAX[idx(l)] });
      assert.strictEqual(c.succ, MAX_SUCC[idx(l)], `+${l}`);
    });
  });
  test('mastery sits OUTSIDE BONUS_CAP: capped bless+anvil+pity still gets the full mastery on top', () => {
    const noMastery = R.chances(sw(15, 10), { bless: true, anvilGrade: MITHRIL });
    const withMastery = R.chances(sw(15, 10), { bless: true, anvilGrade: MITHRIL, mastery: 4 });
    assert.strictEqual(noMastery.raw, 24);
    assert.strictEqual(noMastery.bonus, BONUS_CAP_LATE);
    assert.strictEqual(withMastery.raw, 24);              // mastery is not part of raw
    assert.strictEqual(withMastery.bonus, BONUS_CAP_LATE);
    assert.strictEqual(withMastery.succ - noMastery.succ, 12);
    assert.strictEqual(withMastery.succ, 46);
  });
  test('+15 mastery 4, bless + mithril + max pity: raw 24 -> bonus 14, succ 20 + 14 + 12 = 46', () => {
    const c = R.chances(sw(15, 10), { bless: true, anvilGrade: MITHRIL, mastery: 4 });
    assert.deepStrictEqual([c.raw, c.bonus, c.succ], [24, 14, 46]);
  });
  test('mastery does not lower the destroy rate (only the formula clip)', () => {
    STAGES.forEach(l => {
      const c = R.chances(sw(l), { mastery: REC_MAX[idx(l)] });
      assert.strictEqual(c.dest, C.DESTROY[l], `+${l}`);
    });
  });
  test('exhaustive invariants against the independent oracle', () => {
    let n = 0;
    for (let lv = 0; lv < 20; lv++) for (const pity of [0, 1, 3, 5, 10, 50]) for (const bless of [false, true])
      for (let grade = 0; grade <= 3; grade++) for (const mastery of [0, 1, 2, 3, 4, 5, 99]) for (const gaugeFull of [false, true]) {
        const c = R.chances(sw(lv, pity), { bless, anvilGrade: grade, mastery, gaugeFull });
        const tag = JSON.stringify({ lv, pity, bless, grade, mastery, gaugeFull });
        assert.strictEqual(c.succ + c.dest + c.fail, 100, tag);
        assert.ok(c.dest >= 0 && c.fail >= 0 && c.succ >= 0, tag);
        assert.deepStrictEqual(pick(c), oracle(lv, pity, { bless, grade, mastery, gaugeFull }), tag);
        if (!(gaugeFull && lv >= 15)) {
          assert.ok(c.succ <= Math.max(C.RATE[lv], SUCC_CEIL), tag);
          assert.strictEqual(c.dest, Math.max(0, Math.min(C.DESTROY[lv], 100 - c.succ)), tag);
        }
        n++;
      }
    assert.strictEqual(n, 20 * 6 * 2 * 4 * 7 * 2);
  });
  test('mastery has no effect at +14 and below', () => {
    for (let lv = 0; lv <= 14; lv++) for (const pity of [0, 4, 20]) {
      const base = R.chances(sw(lv, pity), { bless: true, anvilGrade: 2 });
      assert.deepStrictEqual(R.chances(sw(lv, pity), { bless: true, anvilGrade: 2, mastery: 99 }), base, `+${lv}`);
    }
  });
});

// ============================================================ AC10
describe('AC10 mastery survives destroy and sale', () => {
  test('destroy keeps mastery (including the sword-less moment)', () => {
    const S = lateState(17, { mastery: [1, 2, 3, 2, 1] });
    assert.strictEqual(attempt(S, 'destroy').outcome, 'destroy');
    assert.deepStrictEqual(S.mastery, [1, 2, 3, 2, 1]);
  });
  test('sell keeps mastery', () => {
    const S = lateState(16, { mastery: [1, 2, 3, 2, 1] });
    assert.ok(R.sellSword(S, S.active).ok);
    assert.deepStrictEqual(S.mastery, [1, 2, 3, 2, 1]);
  });
  test('a new sword at the same stage gets the stage bonus (same succ as the old one)', () => {
    const S = lateState(16, { mastery: withGauge(1, 2) });
    const before = R.currentChances(S).succ;
    attempt(S, 'destroy');
    S.swords[0].lv = 16;
    assert.strictEqual(R.currentChances(S).succ, before);
    assert.strictEqual(R.currentChances(S).succ, 15 + 6);
  });
});

// ============================================================ AC11 (+ storage AC 20-21)
describe('AC11 save fields gauge / mastery', () => {
  const loadWith = fields => {
    const base = clone(SV.defaultState(NOW));
    delete base.gauge; delete base.mastery;
    const st = memStorage({ [C.SAVE_KEY]: JSON.stringify(Object.assign(base, fields)) });
    return SV.load(st, NOW).state;
  };
  const norm = fields => SV.normalize(Object.assign(clone(SV.defaultState(NOW)), fields), NOW);

  test('defaultState has two zero arrays of 5', () => {
    const S = SV.defaultState(NOW);
    assert.deepStrictEqual(S.gauge, ZERO5);
    assert.deepStrictEqual(S.mastery, ZERO5);
  });
  test('SAVE_KEY and SAVE_VERSION are unchanged (v2, no migration)', () => {
    assert.strictEqual(C.SAVE_KEY, 'sword-enhance-v2');
    assert.strictEqual(SV.SAVE_VERSION, 2);
  });
  test('an old v2 save without the fields loads zeros and keeps its other fields', () => {
    const base = clone(SV.defaultState(NOW));
    delete base.gauge; delete base.mastery;
    base.gold = 777; base.best = 9; base.shards = 41;
    base.swords = [{ id: 3, lv: 9, prot: 1, pity: 4 }]; base.nextSwordId = 4; base.active = 3;
    const r = SV.load(memStorage({ [C.SAVE_KEY]: JSON.stringify(base) }), NOW);
    assert.strictEqual(r.source, 'v2');
    assert.deepStrictEqual([r.state.gauge, r.state.mastery], [ZERO5, ZERO5]);
    assert.deepStrictEqual([r.state.gold, r.state.best, r.state.shards], [777, 9, 41]);
    assert.deepStrictEqual(r.state.swords, [{ id: 3, lv: 9, prot: 1, pity: 4 }]);
  });
  test('gauge [-1,99,2.7,"a",null,7] -> [0,5,2,0,0]; mastery "x" -> zeros', () => {
    const S = loadWith({ gauge: [-1, 99, 2.7, 'a', null, 7], mastery: 'x' });
    assert.deepStrictEqual(S.gauge, [0, 5, 2, 0, 0]);
    assert.deepStrictEqual(S.mastery, ZERO5);
  });
  test('short arrays are zero-padded, long arrays truncated to 5', () => {
    assert.deepStrictEqual(norm({ gauge: [1, 2], mastery: [3] }).gauge, [1, 2, 0, 0, 0]);
    assert.deepStrictEqual(norm({ gauge: [1, 2], mastery: [3] }).mastery, [3, 0, 0, 0, 0]);
    const long = norm({ gauge: [1, 1, 1, 1, 1, 1, 1, 1], mastery: [1, 1, 1, 1, 1, 1, 1] });
    assert.strictEqual(long.gauge.length, STAGE_COUNT);
    assert.strictEqual(long.mastery.length, STAGE_COUNT);
    assert.deepStrictEqual(norm({ gauge: [], mastery: [] }).gauge, ZERO5);
  });
  test('huge values clamp per stage (gauge to GAUGE_N, mastery to REC_MAX)', () => {
    const huge = Array(STAGE_COUNT).fill(1e30);
    assert.deepStrictEqual(norm({ gauge: huge, mastery: huge }).gauge, GAUGE_N);
    assert.deepStrictEqual(norm({ gauge: huge, mastery: huge }).mastery, REC_MAX);
    const big = Array(STAGE_COUNT).fill(Number.MAX_SAFE_INTEGER);
    assert.deepStrictEqual(norm({ gauge: big, mastery: big }).mastery, REC_MAX);
  });
  test('values just above the per-stage max clamp to the max, at the max stay', () => {
    assert.deepStrictEqual(norm({ gauge: GAUGE_N.map(n => n + 1) }).gauge, GAUGE_N);
    assert.deepStrictEqual(norm({ gauge: GAUGE_N }).gauge, GAUGE_N);
    assert.deepStrictEqual(norm({ mastery: REC_MAX.map(n => n + 1) }).mastery, REC_MAX);
    assert.deepStrictEqual(norm({ mastery: REC_MAX }).mastery, REC_MAX);
  });
  test('negative values clamp to 0', () => {
    assert.deepStrictEqual(norm({ gauge: [-5, -1, -0.5, -1e30, -Infinity], mastery: [-5, -1, -0.5, -1e30, -Infinity] }).gauge, ZERO5);
    assert.deepStrictEqual(norm({ gauge: [-5, -1, -0.5, -1e30, -Infinity], mastery: [-5, -1, -0.5, -1e30, -Infinity] }).mastery, ZERO5);
  });
  test('NaN / Infinity entries still produce valid in-range integers', () => {
    const S = norm({ gauge: [NaN, Infinity, NaN, Infinity, NaN], mastery: [Infinity, NaN, Infinity, NaN, Infinity] });
    S.gauge.forEach((v, i) => assert.ok(Number.isInteger(v) && v >= 0 && v <= GAUGE_N[i], `gauge[${i}]=${v}`));
    S.mastery.forEach((v, i) => assert.ok(Number.isInteger(v) && v >= 0 && v <= REC_MAX[i], `mastery[${i}]=${v}`));
  });
  test('fractions are floored; numeric strings are accepted as numbers; junk strings become 0', () => {
    assert.deepStrictEqual(norm({ gauge: [1.9, 2.1, '3', '4.8', ''] }).gauge, [1, 2, 3, 4, 0]);
    assert.deepStrictEqual(norm({ mastery: ['2', 'abc', {}, [], true] }).mastery, [2, 0, 0, 0, 0]);
  });
  test('non-array inputs fall back to zeros', () => {
    [undefined, null, 'x', 7, true, {}, { 0: 3, 1: 3 }, () => 1].forEach(bad => {
      const S = norm({ gauge: bad, mastery: bad });
      assert.deepStrictEqual(S.gauge, ZERO5, String(bad));
      assert.deepStrictEqual(S.mastery, ZERO5, String(bad));
    });
  });
  test('a normalized state never aliases the input arrays', () => {
    const g = [1, 1, 1, 1, 1];
    const S = norm({ gauge: g });
    S.gauge[0] = 4;
    assert.strictEqual(g[0], 1);
  });
  test('save -> load and save -> peek roundtrip both arrays', () => {
    const S = lateState(16, { gauge: [3, 5, 1, 0, 9], mastery: [4, 0, 2, 3, 1] });
    const st = memStorage();
    assert.ok(SV.save(st, S, NOW));
    const raw = JSON.parse(st.dump[C.SAVE_KEY]);
    assert.deepStrictEqual([raw.gauge, raw.mastery], [[3, 5, 1, 0, 9], [4, 0, 2, 3, 1]]);
    assert.deepStrictEqual(SV.load(st, NOW).state.gauge, [3, 5, 1, 0, 9]);
    assert.deepStrictEqual(SV.load(st, NOW).state.mastery, [4, 0, 2, 3, 1]);
    assert.deepStrictEqual(SV.peek(st, NOW).gauge, [3, 5, 1, 0, 9]);
    assert.deepStrictEqual(SV.peek(st, NOW).mastery, [4, 0, 2, 3, 1]);
  });
  test('roundtrip is idempotent: normalize(normalize(x)) equals normalize(x)', () => {
    const once = norm({ gauge: [-1, 99, 2.7, 'a', null, 7], mastery: [9, 9, 9, 9, 9] });
    assert.deepStrictEqual(SV.normalize(clone(once), NOW), once);
  });
  test('v1 migration gives zeros for both fields', () => {
    const st = memStorage({ [C.SAVE_KEY_V1]: JSON.stringify({ gold: 5000, level: 7, best: 8 }) });
    const r = SV.load(st, NOW);
    assert.strictEqual(r.source, 'v1');
    assert.deepStrictEqual([r.state.gauge, r.state.mastery], [ZERO5, ZERO5]);
    const m = SV.migrateV1({ gold: 1, level: 3 }, NOW);
    assert.deepStrictEqual([m.gauge, m.mastery], [ZERO5, ZERO5]);
  });
  test('a brand-new or corrupt load gives zeros', () => {
    assert.deepStrictEqual(SV.load(memStorage(), NOW).state.gauge, ZERO5);
    assert.deepStrictEqual(SV.load(memStorage({ [C.SAVE_KEY]: '{bad' }), NOW).state.mastery, ZERO5);
  });
});

// ============================================================ AC12
describe('AC12 test page (forced success) never records progress', () => {
  /** Same load order as test.html, in an isolated VM context (real process config stays untouched) */
  function loadTestModeSG() {
    const ctx = { console, Math, Date, JSON, Object, Array, Number, String, Set, Map, Error };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    ['test-mode.js', 'constants.js', 'rules.js', 'forge.js', 'idle.js', 'quests.js', 'save.js']
      .forEach(f => vm.runInContext(fs.readFileSync(js(f), 'utf8'), ctx, { filename: f }));
    return ctx.SG;
  }
  const T = loadTestModeSG();
  const makeState = (l, gauge) => {
    const S = T.save.defaultState(NOW);
    S.gold = RICH_GOLD; S.best = l; S.swords[0].lv = l;
    S.gauge = gauge.slice(); S.mastery = SENTINEL_MASTERY.slice();
    return S;
  };
  const json = x => JSON.stringify(x);
  [false, true].forEach(withFull => STAGES.forEach(l => [0, WORST_ROLL].forEach(roll => {
    test(`+${l} forced attempt ${withFull ? 'with' : 'without'} a full gauge (roll ${roll}): gauge/mastery unchanged, payload null`, () => {
      const gauge = withFull ? withGauge(idx(l), GAUGE_N[idx(l)], SENTINEL_GAUGE) : SENTINEL_GAUGE;
      const S = makeState(l, gauge);
      const r = T.rules.attemptEnhance(S, () => roll);
      assert.strictEqual(r.outcome, 'success');
      assert.strictEqual(S.swords[0].lv, l + 1);
      assert.strictEqual(json(S.gauge), json(gauge));
      assert.strictEqual(json(S.mastery), json(SENTINEL_MASTERY));
      assert.strictEqual(r.mastery, null);
    });
  })));
  test('the test config uses a different save key and has no legacy key', () => {
    assert.notStrictEqual(T.C.SAVE_KEY, 'sword-enhance-v2');
    assert.strictEqual(T.C.SAVE_KEY_V1, null);
    assert.strictEqual(T.config.forceSuccess, true);
  });
  test('a long forced run from +0 to +20 leaves both arrays untouched', () => {
    const S = makeState(0, SENTINEL_GAUGE);
    for (let n = 0; n < 20; n++) T.rules.attemptEnhance(S, () => WORST_ROLL);
    assert.strictEqual(S.swords[0].lv, 20);
    assert.strictEqual(json(S.gauge), json(SENTINEL_GAUGE));
    assert.strictEqual(json(S.mastery), json(SENTINEL_MASTERY));
  });
  test('the real (non-test) config does not force success and uses the real save key', () => {
    assert.strictEqual(globalThis.SG.config.forceSuccess, false);
    assert.strictEqual(C.SAVE_KEY, 'sword-enhance-v2');
    assert.strictEqual(R.chances(sw(15), {}).succ, C.RATE[15]);
    assert.ok(!R.chances(sw(15), {}).forced);
  });
});

// ============================================================ AC13 (DOM-free part)
describe('AC13 displayed values equal applied values (rule level)', () => {
  test('gaugeInfo exists only for +15..+19 and mirrors the state', () => {
    const S = lateState(15, { gauge: [4, 2, 0, 8, 1] });
    for (let l = 0; l <= 20; l++) {
      const g = R.gaugeInfo(S, l);
      if (l < 15 || l > 19) { assert.strictEqual(g, null, `+${l}`); continue; }
      const i = idx(l);
      assert.deepStrictEqual(g, { value: S.gauge[i], n: GAUGE_N[i], full: S.gauge[i] >= GAUGE_N[i] }, `+${l}`);
    }
  });
  test('currentChances before the attempt deep-equals r.chances (stages x mastery x gauge x bless/anvil/pity)', () => {
    let n = 0;
    for (const l of STAGES) for (const mastery of [0, 2, REC_MAX[idx(l)]]) for (const full of [false, true])
      for (const bless of [false, true]) for (const grade of [0, MITHRIL]) for (const pity of [0, 4]) {
        const S = lateState(l, {
          gauge: full ? fullGauge(idx(l)) : ZERO5, mastery: withGauge(idx(l), mastery), sword: { pity },
          inv: { bless: bless ? 1 : 0 }, use: { bless }, anvil: grade || 0,
        });
        S.use.anvil = !!grade;
        const shown = clone(R.currentChances(S));
        const expected = oracle(l, pity, { bless, grade, mastery, gaugeFull: full });
        assert.deepStrictEqual(pick(shown), expected, `shown ${JSON.stringify({ l, mastery, full, bless, grade, pity })}`);
        const r = R.attemptEnhance(S, () => 0);
        assert.deepStrictEqual(clone(r.chances), shown, JSON.stringify({ l, mastery, full, bless, grade, pity }));
        n++;
      }
    assert.strictEqual(n, 5 * 3 * 2 * 2 * 2 * 2);
  });
  test('r.gaugeBefore holds the pre-attempt gauge (not the updated one)', () => {
    const S = lateState(17, { gauge: withGauge(2, 3) });
    const r = attempt(S, 'fail');
    assert.deepStrictEqual(r.gaugeBefore, { value: 3, n: 6, full: false });
    assert.strictEqual(S.gauge[2], 4);
  });
  test('r.gaugeBefore of a certain attempt is full; below +15 it is null', () => {
    const S = lateState(16, { gauge: fullGauge(1) });
    assert.deepStrictEqual(R.attemptEnhance(S, () => 0).gaugeBefore, { value: 5, n: 5, full: true });
    assert.strictEqual(R.attemptEnhance(lateState(14), () => 0).gaugeBefore, null);
  });
  test('mastery payload appears only when a record is earned', () => {
    STAGES.forEach(l => {
      const S1 = lateState(l);
      assert.ok(attempt(S1, 'success').mastery, `+${l} success`);
      assert.strictEqual(attempt(lateState(l), 'fail').mastery, null, `+${l} fail`);
      assert.strictEqual(attempt(lateState(l), 'destroy').mastery, null, `+${l} destroy`);
    });
    assert.strictEqual(attempt(lateState(10), 'success').mastery, null);
  });
  test('toast payload gained matches the change in displayed mastery bonus', () => {
    STAGES.forEach(l => {
      const S = lateState(l);
      for (let k = 0; k < REC_MAX[idx(l)]; k++) {
        S.swords[0].lv = l;
        const before = R.currentChances(S).mastery;
        const m = attempt(S, 'success').mastery;
        S.swords[0].lv = l;
        assert.strictEqual(R.currentChances(S).mastery - before, m.gained, `+${l} #${k + 1}`);
      }
    });
  });
});

// ============================================================ AC14
describe('AC14 regression: zero gauge/mastery equals the old formula', () => {
  test('mastery:0 and gaugeFull:false give the same result as omitting them (all levels/pity/bless/anvil/sure)', () => {
    let n = 0;
    for (let lv = 0; lv <= 20; lv++) for (const pity of [0, 3, 10, 50]) for (const bless of [false, true])
      for (let grade = 0; grade <= 3; grade++) for (const sure of [false, true]) {
        const plain = R.chances(sw(lv, pity), { bless, anvilGrade: grade, sure });
        const withZero = R.chances(sw(lv, pity), { bless, anvilGrade: grade, sure, mastery: 0, gaugeFull: false });
        assert.deepStrictEqual(withZero, plain, JSON.stringify({ lv, pity, bless, grade, sure }));
        n++;
      }
    assert.strictEqual(n, 21 * 4 * 2 * 4 * 2);
  });
  test('chances() with no opts at all still works', () => {
    assert.deepStrictEqual(pick(R.chances(sw(15))), { succ: 20, dest: 25, fail: 55 });
  });
  test('pity-cap AC1: +15 plain = 20 / 25 / 55', () => {
    assert.deepStrictEqual(pick(R.chances(sw(15), {})), { succ: 20, dest: 25, fail: 55 });
  });
  test('pity-cap AC2: +15 pity 3 -> 26', () => {
    assert.strictEqual(R.chances(sw(15, 3), {}).succ, 26);
  });
  test('pity-cap AC3/5: raw 24 -> cap 14 -> 34; +7 with bless+iron+pity 6 -> 78', () => {
    const c = R.chances(sw(15, 10), { bless: true, anvilGrade: MITHRIL });
    assert.deepStrictEqual([c.raw, c.bonus, c.succ, c.capped], [24, 14, 34, true]);
    assert.strictEqual(R.chances(sw(7, 6), { bless: true, anvilGrade: 1 }).succ, 78);
  });
  test('pity-cap AC4/8/11: +0 bless stays 95; +2 formula case clips at 90', () => {
    assert.strictEqual(R.chances(sw(0), { bless: true }).succ, 95);
    assert.strictEqual(R.chances(sw(2, 5), { bless: true, anvilGrade: 3 }).succ, 90);
  });
  test('pity-cap AC8: fail adds 1 pity, success resets it', () => {
    const S = lateState(12, { sword: { pity: 2 } });
    attempt(S, 'fail');
    assert.strictEqual(S.swords[0].pity, 3);
    attempt(S, 'success');
    assert.strictEqual(S.swords[0].pity, 0);
  });
  test('pity-cap AC8: protected destroy adds 1 pity and protectSaved, not stats.fail', () => {
    const S = lateState(15, { inv: protectStock, use: protectOn, sword: { pity: 1 } });
    const r = attempt(S, 'destroy');
    assert.strictEqual(r.outcome, 'protected');
    assert.strictEqual(S.swords[0].pity, 2);
    assert.strictEqual(S.stats.protectSaved, 1);
    assert.strictEqual(S.stats.fail, 0);
  });
  test('pity-cap AC9: a drop (+12 -> +11) keeps the pity and re-bands the bonus', () => {
    const S = lateState(12, { sword: { pity: 4 } });
    attempt(S, 'fail');
    assert.strictEqual(S.swords[0].lv, 11);
    assert.strictEqual(S.swords[0].pity, 5);
    assert.strictEqual(R.chances(S.swords[0], {}).bonus, 8);          // band +10..14: 5 * 2 = 10, capped by PITY_MAX 8
  });
  test('pity-cap AC10: the destroyed sword takes its pity along, other swords keep theirs', () => {
    const S = lateState(10, { sword: { pity: 4 } });
    const other = R.buySword(S).sword; other.lv = 6; other.pity = 3;
    attempt(S, 'destroy');
    assert.ok(!S.swords.some(s => s.pity === 4));
    assert.strictEqual(R.findSword(S, other.id).pity, 3);
  });
  test('pity-cap AC11: a sure ticket gives 100/0/0 regardless of pity and resets pity', () => {
    const S = lateState(5, { inv: { sure: 1 }, use: { sure: true }, sword: { pity: 4 } });
    const r = attempt(S, 'success');
    assert.deepStrictEqual(pick(r.chances), { succ: 100, dest: 0, fail: 0 });
    assert.strictEqual(S.swords[0].pity, 0);
    assert.strictEqual(S.inv.sure, 0);
  });
  test('pity-cap AC12: pity survives save/load', () => {
    const S = lateState(14, { sword: { pity: 6 } });
    const st = memStorage();
    SV.save(st, S, NOW);
    assert.strictEqual(SV.load(st, NOW).state.swords[0].pity, 6);
  });
});

console.log(`${results.pass} passed, ${results.fail} failed`);
process.exit(results.fail ? 1 : 0);
