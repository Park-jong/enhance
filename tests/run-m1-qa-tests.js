/* M1 QA 보강 테스트 (확률 합 100 / 보호 카운터 / 파괴 / 수입 기준 / 오프라인 / 마이그레이션 / 경제 몬테카를로).
 * 실행: node tests/run-m1-qa-tests.js (외부 의존성 없음). 기존 run-tests.js 와 같은 스타일.
 */
'use strict';
const assert = require('assert');
const path = require('path');

const js = f => path.join(__dirname, '..', 'js', f);
const C = require(js('constants.js'));
const R = require(js('rules.js'));
const I = require(js('idle.js'));
const Q = require(js('quests.js'));
const SV = require(js('save.js'));

const results = { pass: 0, fail: 0 };
let group = '';
function describe(name, fn) { group = name; fn(); }
function test(name, fn) {
  try { fn(); results.pass++; } catch (e) {
    results.fail++;
    console.log(`FAIL  ${group} > ${name}\n      ${e.message.split('\n').join('\n      ')}`);
  }
}

const NOW = 1_800_000_000_000;
const HOUR = 3600 * 1000;
const RICH_GOLD = 1e12;
const ALL_ANVIL_GRADES = [0, 1, 2, 3];
const MAX_PITY_SAMPLE = 12;
const sw = (lv, pity = 0, prot = C.PROTECT_USES, id = 1) => ({ id, lv, pity, prot });
const fresh = () => SV.defaultState(NOW);
const ROLL_HIGH = () => 0.9999;
const rollDestroy = ch => () => (ch.succ + ch.dest / 2) / 100;
const memStorage = init => {
  const m = Object.assign({}, init);
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, dump: m };
};
/** seeded RNG (mulberry32) */
function seeded(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function stateWith(swords, extra) {
  const S = fresh();
  S.swords = swords; S.active = swords[0].id; S.nextSwordId = 100;
  S.best = Math.max(0, ...swords.map(s => s.lv));
  S.gold = RICH_GOLD;
  Object.assign(S.inv, (extra && extra.inv) || {});
  Object.assign(S.use, (extra && extra.use) || {});
  return S;
}

// ============================================================ probability math (m1-pity-cap)
describe('probability math (pity-cap)', () => {
  test('every level/bless/anvil/pity combo: succ+dest+fail = 100 and none negative', () => {
    for (let lv = 0; lv < C.MAX; lv++) for (const bless of [false, true]) for (const g of ALL_ANVIL_GRADES) for (let p = 0; p <= MAX_PITY_SAMPLE; p++) {
      const c = R.chances(sw(lv, p), { bless, anvilGrade: g });
      assert.strictEqual(c.succ + c.dest + c.fail, 100, `lv${lv} b${bless} g${g} p${p}`);
      assert.ok(c.succ >= 0 && c.dest >= 0 && c.fail >= 0);
    }
  });
  test('bonus never exceeds the per-band cap', () => {
    for (let lv = 0; lv < C.MAX; lv++) for (const g of ALL_ANVIL_GRADES) for (let p = 0; p <= MAX_PITY_SAMPLE; p++) {
      const c = R.chances(sw(lv, p), { bless: true, anvilGrade: g });
      assert.ok(c.bonus <= C.BONUS_CAP[R.pityBand(lv)], `lv${lv} g${g} p${p}`);
    }
  });
  test('success never exceeds the 90% ceiling unless base is higher, and never drops below base', () => {
    for (let lv = 0; lv < C.MAX; lv++) for (const g of ALL_ANVIL_GRADES) for (let p = 0; p <= MAX_PITY_SAMPLE; p++) {
      const c = R.chances(sw(lv, p), { bless: true, anvilGrade: g });
      assert.ok(c.succ <= Math.max(C.RATE[lv], C.SUCC_CEIL));
      assert.ok(c.succ >= C.RATE[lv]);
    }
  });
  test('destroy rate is never reduced by bonuses (only clipped when success leaves no room)', () => {
    for (let lv = 0; lv < C.MAX; lv++) for (const g of ALL_ANVIL_GRADES) for (let p = 0; p <= MAX_PITY_SAMPLE; p++) {
      const c = R.chances(sw(lv, p), { bless: true, anvilGrade: g });
      assert.strictEqual(c.dest, Math.min(C.DESTROY[lv], 100 - c.succ), `lv${lv} g${g} p${p}`);
    }
  });
  test('+19 destroy stays DESTROY[19] with maximum bonuses', () => {
    assert.strictEqual(R.chances(sw(19, 10), { bless: true, anvilGrade: 3 }).dest, C.DESTROY[19]);
  });
  test('sure bypasses cap and pity: always 100/0/0 below +10', () => {
    for (let lv = 0; lv < C.SURE_MAX_TARGET; lv++) {
      const c = R.chances(sw(lv, 12), { sure: true, bless: true, anvilGrade: 3 });
      assert.deepStrictEqual([c.succ, c.dest, c.fail], [100, 0, 0]);
    }
  });
  test('empirical frequencies over 40k seeded attempts match chances() (+15, pity 3, bless)', () => {
    const attempts = 40000, tolerancePct = 1.2;
    const rng = seeded(7);
    const ch = R.chances(sw(15, 3), { bless: true });
    let success = 0, destroy = 0;
    for (let i = 0; i < attempts; i++) {
      const S = stateWith([sw(15, 3)], { inv: { bless: 1 }, use: { bless: true } });
      const r = R.attemptEnhance(S, rng);
      if (r.outcome === 'success') success++; else if (r.outcome === 'destroy') destroy++;
    }
    assert.ok(Math.abs(success / attempts * 100 - ch.succ) < tolerancePct, `succ ${success / attempts * 100} vs ${ch.succ}`);
    assert.ok(Math.abs(destroy / attempts * 100 - ch.dest) < tolerancePct, `dest ${destroy / attempts * 100} vs ${ch.dest}`);
  });
});

// ============================================================ protect counter, destroy, pity
describe('protect counter, destroy, pity', () => {
  test('protected destroy adds pity+1 and counts neither destroy nor fail in stats', () => {
    const S = stateWith([sw(12, 0)], { inv: { protect: 5 }, use: { protect: true } });
    const r = R.attemptEnhance(S, rollDestroy(R.chances(S.swords[0], {})));
    assert.strictEqual(r.outcome, 'protected');
    assert.deepStrictEqual([S.swords[0].pity, S.stats.destroy, S.stats.fail, S.stats.protectSaved], [1, 0, 0, 1]);
  });
  test('protect consumes protectNeed(l) = 1 + floor(l/5) and prot decrements by exactly 1', () => {
    const START_STOCK = 20;
    for (const lv of [10, 12, 15, 19]) {
      const need = 1 + Math.floor(lv / 5);
      const S = stateWith([sw(lv)], { inv: { protect: START_STOCK }, use: { protect: true } });
      R.attemptEnhance(S, rollDestroy(R.chances(S.swords[0], {})));
      assert.deepStrictEqual([START_STOCK - S.inv.protect, S.swords[0].prot], [need, C.PROTECT_USES - 1], `lv${lv}`);
    }
  });
  test('prot counter resets on a drop but not on a protected destroy', () => {
    const S = stateWith([sw(12, 0, 1)], { inv: { protect: 5 }, use: { protect: true } });
    R.attemptEnhance(S, rollDestroy(R.chances(S.swords[0], {})));
    assert.strictEqual(S.swords[0].prot, 0);
    R.attemptEnhance(S, ROLL_HIGH);                                   // fail -> drop 12 -> 11
    assert.deepStrictEqual([S.swords[0].lv, S.swords[0].prot], [11, C.PROTECT_USES]);
  });
  test('keepdown-kept fail does not change level, so prot is not reset', () => {
    const S = stateWith([sw(12, 0, 1)], { inv: { keepdown: 2 }, use: { keepdown: true } });
    const r = R.attemptEnhance(S, ROLL_HIGH);
    assert.strictEqual(r.outcome, 'kept');
    assert.deepStrictEqual([S.swords[0].lv, S.swords[0].prot], [12, 1]);
  });
  test('prot counter is per sword', () => {
    const S = stateWith([sw(12, 0, 2, 1), sw(12, 0, 2, 2)], { inv: { protect: 5 }, use: { protect: true } });
    R.attemptEnhance(S, rollDestroy(R.chances(S.swords[0], {})));
    assert.deepStrictEqual(S.swords.map(s => s.prot), [1, 2]);
  });
  test('destroy empties the slot, leaves other sword pity untouched, no free +0 when others exist', () => {
    const S = stateWith([sw(11, 4, 2, 1), sw(6, 3, 2, 2)]);
    const r = R.attemptEnhance(S, rollDestroy(R.chances(S.swords[0], {})));
    assert.strictEqual(r.outcome, 'destroy');
    assert.deepStrictEqual(S.swords, [{ id: 2, lv: 6, prot: 2, pity: 3 }]);
    assert.strictEqual(S.active, C.NO_ACTIVE_SWORD, 'destroy leaves no active sword (3-6 rule)');
    assert.strictEqual(r.freeSword, null);
  });
  test('destroy grants shardGain(l) and stats.shardsGained equals it', () => {
    for (const lv of [5, 10, 15, 19]) {
      const S = stateWith([sw(lv)]);
      R.attemptEnhance(S, rollDestroy(R.chances(S.swords[0], {})));
      assert.deepStrictEqual([S.shards, S.stats.shardsGained, S.stats.destroy], [R.shardGain(lv), R.shardGain(lv), 1], `lv${lv}`);
    }
  });
  test('drop keeps pity (+1) and recomputes the bonus with the new band', () => {
    const S = stateWith([sw(10, 4)]);
    R.attemptEnhance(S, ROLL_HIGH);                                   // drop to +9, pity 5
    assert.deepStrictEqual([S.swords[0].lv, S.swords[0].pity], [9, 5]);
    assert.strictEqual(R.chances(S.swords[0], {}).parts.pity, C.PITY_STEP[1] * 5);   // +9 is band 1
  });
});

// ============================================================ income basis and offline (m1-idle, m1-storage)
describe('income basis and offline', () => {
  const idleState = (activeLv, topLv) => {
    const S = stateWith([sw(activeLv, 0, 2, 1), sw(topLv, 0, 2, 2)]);
    S.gold = 0;
    S.best = topLv; S.idle.autoOn = true; S.idle.lastSeen = NOW; S.idle.boostUntil = 0;
    return S;
  };
  test('topLv is the best sword in storage regardless of active', () => {
    assert.strictEqual(R.topLv(idleState(3, 10)), 10);
  });
  test('manual hunt, auto run and offline all use the top sword, not the active one', () => {
    const S = idleState(3, 10);
    assert.strictEqual(I.manualHuntGold(S, NOW), R.huntReward(10));
    assert.strictEqual(I.autoRunGold(S, NOW), R.autoReward(10));
    S.idle.lastSeen = NOW - HOUR;
    const runs = Math.floor(HOUR / C.AUTO_CD_MS);
    assert.strictEqual(I.settleOffline(S, NOW).gold, Math.floor(runs * R.autoReward(10) * C.OFFLINE_EFF));
  });
  test('after the top sword is sold, income falls to the next best sword', () => {
    const S = idleState(3, 10);
    R.sellSword(S, 2);
    assert.strictEqual(R.topLv(S), 3);
    assert.strictEqual(I.manualHuntGold(S, NOW), R.huntReward(3));
  });
  test('offline: exactly 8h and 100h pay the same (cap) at OFFLINE_EFF', () => {
    const a = idleState(10, 10); a.idle.lastSeen = NOW - C.OFFLINE_CAP_H * HOUR;
    const b = idleState(10, 10); b.idle.lastSeen = NOW - 100 * HOUR;
    const ra = I.settleOffline(a, NOW), rb = I.settleOffline(b, NOW);
    assert.strictEqual(ra.gold, rb.gold);
    assert.strictEqual(ra.gold, Math.floor(C.OFFLINE_CAP_H * HOUR / C.AUTO_CD_MS * R.autoReward(10) * C.OFFLINE_EFF));
    assert.strictEqual(rb.capped, true);
  });
  test('offline settlement twice in a row pays once', () => {
    const S = idleState(10, 10); S.idle.lastSeen = NOW - 5 * HOUR;
    I.settleOffline(S, NOW);
    const g = S.gold;
    assert.strictEqual(I.settleOffline(S, NOW + 1000), null);
    assert.strictEqual(S.gold, g);
  });
  test('offline settlement then save/load then settle again pays nothing more', () => {
    const S = idleState(10, 10); S.idle.lastSeen = NOW - 5 * HOUR;
    I.settleOffline(S, NOW);
    const st = memStorage();
    SV.save(st, S, NOW);
    const T = SV.load(st, NOW + 2000).state;
    const g = T.gold;
    assert.strictEqual(I.settleOffline(T, NOW + 2000), null);
    assert.strictEqual(T.gold, g);
  });
});

// ============================================================ quest exact level
describe('quest exact level', () => {
  test('only the exact level is deliverable for every quest level 2..19', () => {
    for (let lv = 2; lv < C.MAX; lv++) {
      const S = stateWith([sw(lv - 1, 0, 2, 1), sw(lv + 1, 0, 2, 2)]);
      S.quests.list[0] = { id: 1, tier: 'easy', lv, gold: 100, item: null };
      assert.deepStrictEqual(Q.deliverableSlots(S), [], `lv${lv}`);
      S.swords.push(sw(lv, 0, 2, 3));
      assert.deepStrictEqual(Q.deliverableSlots(S), [0], `lv${lv}`);
    }
  });
});

// ============================================================ v1 -> v2 migration
describe('v1 -> v2 migration preserves progress', () => {
  const v1 = {
    gold: 12345, level: 9, best: 14, muted: false,
    inv: { bless: 4, protect: 6 }, use: { bless: true, protect: true },
    found: [true, true, true, true, true, true, true, true, true, true, false, false, false, false, true],
    stats: { tries: 77, success: 40, fail: 20, destroy: 7, earned: 55555 },
  };
  const raw = JSON.stringify(v1);
  test('gold / sword / found / stats / items carried over', () => {
    const S = SV.load(memStorage({ 'sword-enhance-v1': raw }), NOW).state;
    assert.deepStrictEqual([S.gold, S.swords[0].lv, S.best, S.inv.bless, S.inv.protect], [12345, 9, 14, 4, 6]);
    assert.strictEqual(S.found[14], true);
    assert.strictEqual(S.found[10], false);
    assert.deepStrictEqual([S.stats.tries, S.stats.success, S.stats.fail, S.stats.destroy, S.stats.earned], [77, 40, 20, 7, 55555]);
  });
  test('v1 key stays byte-identical after load', () => {
    const st = memStorage({ 'sword-enhance-v1': raw });
    SV.load(st, NOW);
    assert.strictEqual(st.dump['sword-enhance-v1'], raw);
  });
  test('second load reads v2 and keeps progress made after migration', () => {
    const st = memStorage({ 'sword-enhance-v1': raw });
    const first = SV.load(st, NOW).state;
    first.gold += 1;
    SV.save(st, first, NOW + 1);
    const second = SV.load(st, NOW + 2);
    assert.strictEqual(second.source, 'v2');
    assert.strictEqual(second.state.gold, 12346);
  });
  test('a valid v2 save wins over a leftover v1 key', () => {
    const v2 = fresh(); v2.gold = 999;
    const st = memStorage({ 'sword-enhance-v1': raw });
    SV.save(st, v2, NOW);
    const { state, source } = SV.load(st, NOW);
    assert.strictEqual(source, 'v2');
    assert.strictEqual(state.gold, 999);
  });
  test('migrated state can enhance, and saving writes v2 while v1 stays untouched', () => {
    const st = memStorage({ 'sword-enhance-v1': raw });
    const S = SV.load(st, NOW).state;
    assert.strictEqual(R.attemptEnhance(S, () => 0).ok, true);
    SV.save(st, S, NOW);
    assert.strictEqual(JSON.parse(st.dump['sword-enhance-v2']).v, 2);
    assert.strictEqual(st.dump['sword-enhance-v1'], raw);
  });
});

// ============================================================ economy regression (m1-balance section 5)
describe('economy regression vs m1-balance expected values', () => {
  const TOLERANCE = 0.15;
  /** no consumables, destroyed sword replaced for NEW_SWORD_PRICE; returns per-run means */
  function noConsumableMean(target, runs, seed) {
    const rng = seeded(seed);
    let gold = 0, tries = 0;
    for (let i = 0; i < runs; i++) {
      const S = stateWith([sw(0)]);
      while (R.activeSword(S).lv < target) {
        const before = S.gold;
        const r = R.attemptEnhance(S, rng);
        gold += before - S.gold; tries++;
        if (r.outcome === 'destroy') {
          gold += C.NEW_SWORD_PRICE;
          // destroy no longer auto-picks: the player picks the replacement (free +0 or a bought one)
          R.setActive(S, R.bestSword(S).id);
        }
      }
    }
    return { gold: gold / runs, tries: tries / runs };
  }
  const within = (actual, expected, label) =>
    assert.ok(Math.abs(actual - expected) / expected <= TOLERANCE, `${label}: ${actual.toFixed(1)} vs expected ${expected}`);
  test('no consumables +10: ~6,072 G / 20.0 tries', () => {
    const m = noConsumableMean(10, 3000, 11);
    within(m.gold, 6072, 'gold'); within(m.tries, 20.0, 'tries');
  });
  test('no consumables +15: ~859k G / 1,052 tries', () => {
    const m = noConsumableMean(15, 200, 12);
    within(m.gold, 859000, 'gold'); within(m.tries, 1052, 'tries');
  });
});

console.log(`\n${results.pass} passed, ${results.fail} failed`);
process.exit(results.fail ? 1 : 0);
