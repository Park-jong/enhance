/* 순수 규칙 모듈 테스트. 실행: node tests/run-tests.js (외부 의존성 없음) */
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const js = f => path.join(__dirname, '..', 'js', f);
const C = require(js('constants.js'));
const R = require(js('rules.js'));
const F = require(js('forge.js'));
const I = require(js('idle.js'));
const Q = require(js('quests.js'));
const SV = require(js('save.js'));
const A = require(js('achievements.js'));
const E = require(js('events.js'));
const RB = require(js('rebirth.js'));

// ------------------------------------------------------------ 하네스
const results = { pass: 0, fail: 0 };
let group = '';
function describe(name, fn) { group = name; fn(); }
function test(name, fn) {
  try {
    fn();
    results.pass++;
  } catch (e) {
    results.fail++;
    console.log(`FAIL  ${group} > ${name}\n      ${e.message.split('\n').join('\n      ')}`);
  }
}

const NOW = 1_800_000_000_000;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const fresh = (now = NOW) => SV.defaultState(now);
/** 고정 값 rng: 값 배열을 순서대로 반환(마지막 값 반복) */
const seq = (...vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
const ROLL_SUCCESS = () => 0;          // roll 0 → 항상 성공 칸
const ROLL_HIGH = () => 0.9999;        // roll 99.99 → 실패 칸
/** 파괴 칸 안에 떨어지는 rng: succ ≤ roll < succ+dest */
const rollDestroy = ch => () => (ch.succ + ch.dest / 2) / 100;

function stateWith(opts) {
  const S = fresh();
  Object.assign(S.swords[0], opts.sword || {});
  if (opts.swords) { S.swords = opts.swords; S.active = opts.active || opts.swords[0].id; S.nextSwordId = 100; }
  Object.assign(S.inv, opts.inv || {});
  Object.assign(S.use, opts.use || {});
  Object.assign(S, opts.top || {});
  S.best = Math.max(S.best, ...S.swords.map(s => s.lv));
  return S;
}
function memStorage(init) {
  const m = Object.assign({}, init);
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, dump: m };
}

// ============================================================ 공식
describe('formulas', () => {
  test('M0 formulas unchanged', () => {
    assert.strictEqual(R.cost(0), 20);
    assert.strictEqual(R.cost(10), 1600);
    assert.strictEqual(R.sell(0), 0);
    assert.strictEqual(R.sell(1), 60);
    assert.strictEqual(R.protectNeed(12), 3);
    assert.strictEqual(R.huntReward(0), 10);
  });
  test('autoReward(+10)=160, autoReward(+5)=18, min 10', () => {
    assert.strictEqual(R.autoReward(10), 160);
    assert.strictEqual(R.autoReward(5), 18);
    assert.strictEqual(R.autoReward(0), 10);
  });
  test('shardGain examples', () => {
    assert.deepStrictEqual([5, 9, 10, 14, 15, 19].map(R.shardGain), [10, 18, 30, 42, 60, 76]);
  });
  test('boosterPrice: best=10 → 16900, best<=7 → 3000', () => {
    assert.strictEqual(R.boosterPrice(10), 16900);
    assert.strictEqual(R.boosterPrice(7), 3000);
    assert.strictEqual(R.boosterPrice(0), 3000);
  });
  test('pityBand bands', () => {
    assert.deepStrictEqual([0, 4, 5, 9, 10, 14, 15, 19].map(R.pityBand), [0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

// ============================================================ chances (F7 + cap)
describe('chances', () => {
  const sw = (lv, pity = 0) => ({ lv, pity, prot: 2 });
  test('+15 no bonus: 20/25/55', () => {
    const c = R.chances(sw(15), {});
    assert.deepStrictEqual([c.succ, c.dest, c.fail], [20, 25, 55]);
  });
  test('+15 pity 3 → 26', () => assert.strictEqual(R.chances(sw(15, 3), {}).succ, 26));
  test('+15 pity 10 + bless + anvil_3 → raw 24, bonus 14, succ 34, capped', () => {
    const c = R.chances(sw(15, 10), { bless: true, anvilGrade: 3 });
    assert.strictEqual(c.raw, 24);
    assert.strictEqual(c.bonus, 14);
    assert.strictEqual(c.succ, 34);
    assert.strictEqual(c.capped, true);
  });
  test('+0 bless stays 95 (ceiling never below base)', () => assert.strictEqual(R.chances(sw(0), { bless: true }).succ, 95));
  test('+7 bless + iron + max pity → 78', () => {
    const c = R.chances(sw(7, 10), { bless: true, anvilGrade: 1 });
    assert.strictEqual(c.raw, 18);
    assert.strictEqual(c.succ, 78);
    assert.strictEqual(c.capped, false);
  });
  test('+2 raw 20 → 90 (SUCC_CEIL), capped', () => {
    const c = R.chances(sw(2, 10), { bless: true, anvilGrade: 3 });  // 10 + 4 + 5 = 19
    assert.strictEqual(c.succ, 90);
    assert.strictEqual(c.capped, true);
  });
  test('+19 dest stays 33/35 when room', () => {
    const c = R.chances(sw(19), { bless: true });
    assert.strictEqual(c.dest, C.DESTROY[19]);
  });
  test('band cap: +10..14 cap 14, +5..9 cap 20', () => {
    assert.strictEqual(R.chances(sw(10, 10), { bless: true, anvilGrade: 3 }).bonus, 14);
    assert.strictEqual(R.chances(sw(9, 10), { bless: true, anvilGrade: 3 }).bonus, 20);
  });
  test('sure: 100/0/0 below +10, ignored at +10', () => {
    const c = R.chances(sw(9, 5), { sure: true, bless: true });
    assert.deepStrictEqual([c.succ, c.dest, c.fail], [100, 0, 0]);
    assert.strictEqual(R.chances(sw(10), { sure: true }).succ, 45);
  });
  test('exhaustive: sum 100, dest>=0, succ<=max(base,ceil), bonus<=cap', () => {
    for (let lv = 0; lv < C.MAX; lv++) for (const bless of [false, true]) for (let g = 0; g <= 3; g++) for (let p = 0; p <= 10; p++) {
      const c = R.chances(sw(lv, p), { bless, anvilGrade: g });
      assert.strictEqual(c.succ + c.dest + c.fail, 100);
      assert.ok(c.dest >= 0 && c.fail >= 0);
      assert.ok(c.succ <= Math.max(C.RATE[lv], C.SUCC_CEIL));
      assert.ok(c.bonus <= C.BONUS_CAP[R.pityBand(lv)]);
    }
  });
  test('at MAX: all zero', () => assert.strictEqual(R.chances(sw(20), {}).succ, 0));
});

// ============================================================ 강화 시도: pity / protect / shards / keepdown / sure
describe('attemptEnhance', () => {
  test('success: lv+1, pity 0, prot reset, gold paid, found/best', () => {
    const S = stateWith({ sword: { lv: 4, pity: 3, prot: 1 }, top: { gold: 10000 } });
    const r = R.attemptEnhance(S, ROLL_SUCCESS);
    assert.strictEqual(r.outcome, 'success');
    assert.deepStrictEqual([S.swords[0].lv, S.swords[0].pity, S.swords[0].prot], [5, 0, 2]);
    assert.strictEqual(S.gold, 10000 - R.cost(4));
    assert.ok(S.found[5] && S.best === 5 && r.firstFound && r.newBest);
  });
  test('no gold → rejected, state unchanged', () => {
    const S = stateWith({ sword: { lv: 10 }, top: { gold: 5 } });
    const before = JSON.stringify(S);
    assert.strictEqual(R.attemptEnhance(S, ROLL_SUCCESS).reason, 'noGold');
    assert.strictEqual(JSON.stringify(S), before);
  });
  test('fail below DROP_FROM: lv kept, pity+1, prot unchanged', () => {
    const S = stateWith({ sword: { lv: 7, prot: 1 }, top: { gold: 10000 } });
    const r = R.attemptEnhance(S, ROLL_HIGH);
    assert.strictEqual(r.outcome, 'fail');
    assert.deepStrictEqual([S.swords[0].lv, S.swords[0].pity, S.swords[0].prot], [7, 1, 1]);
  });
  test('drop: +12 → +11, prot reset to 2, pity kept+1', () => {
    const S = stateWith({ sword: { lv: 12, prot: 0, pity: 2 }, top: { gold: 1e6 } });
    const r = R.attemptEnhance(S, ROLL_HIGH);
    assert.strictEqual(r.outcome, 'drop');
    assert.deepStrictEqual([S.swords[0].lv, S.swords[0].prot, S.swords[0].pity], [11, 2, 3]);
  });
  test('protect: two saves at +12, third destroys without consuming', () => {
    const S = stateWith({ sword: { lv: 12 }, inv: { protect: 10 }, use: { protect: true }, top: { gold: 1e7 } });
    const sw = S.swords[0];
    const dest = () => rollDestroy(R.chances(sw, {}));
    let r = R.attemptEnhance(S, dest());
    assert.strictEqual(r.outcome, 'protected');
    assert.deepStrictEqual([sw.lv, S.inv.protect, sw.prot, S.stats.protectSaved, S.shards, sw.pity], [12, 7, 1, 1, 0, 1]);
    r = R.attemptEnhance(S, dest());
    assert.strictEqual(r.outcome, 'protected');
    assert.deepStrictEqual([sw.prot, S.inv.protect], [0, 4]);
    assert.strictEqual(R.trayState(S).protect.block, 'protExhausted');
    r = R.attemptEnhance(S, rollDestroy(R.chances(sw, {})));
    assert.strictEqual(r.outcome, 'destroy');
    assert.strictEqual(S.inv.protect, 4);
    assert.strictEqual(S.shards, R.shardGain(12));
  });
  test('protect counter resets on success after exhaustion', () => {
    const S = stateWith({ sword: { lv: 12, prot: 0 }, top: { gold: 1e7 } });
    R.attemptEnhance(S, ROLL_SUCCESS);
    assert.deepStrictEqual([S.swords[0].lv, S.swords[0].prot], [13, 2]);
  });
  test('protect not consumed on success / normal fail', () => {
    const S = stateWith({ sword: { lv: 12 }, inv: { protect: 10 }, use: { protect: true }, top: { gold: 1e7 } });
    R.attemptEnhance(S, ROLL_HIGH);
    assert.deepStrictEqual([S.inv.protect, S.swords[0].prot], [10, 2]);
  });
  test('protect blocked if stock < need', () => {
    const S = stateWith({ sword: { lv: 12 }, inv: { protect: 2 }, use: { protect: true } });
    assert.strictEqual(R.trayState(S).protect.block, 'needMore');
    assert.strictEqual(R.trayState(S).protect.on, false);
  });
  test('protect row not applicable at +0..+4', () => {
    const S = stateWith({ sword: { lv: 3 }, inv: { protect: 5 } });
    assert.strictEqual(R.trayState(S).protect.block, 'noDestroy');
  });
  test('destroy +10 unprotected: shards +30, stats, slot emptied, free +0 (not activated)', () => {
    const S = stateWith({ sword: { lv: 10, pity: 4 }, top: { gold: 1e6 } });
    const r = R.attemptEnhance(S, rollDestroy(R.chances(S.swords[0], {})));
    assert.strictEqual(r.outcome, 'destroy');
    assert.deepStrictEqual([S.shards, S.stats.shardsGained, S.stats.destroy], [30, 30, 1]);
    assert.strictEqual(S.swords.length, 1);
    assert.strictEqual(S.swords[0].lv, 0);
    assert.strictEqual(S.swords[0].pity, 0);
    assert.ok(r.freeSword && S.active === C.NO_ACTIVE_SWORD && R.activeSword(S) === null);
  });
  test('destroy active with others: no sword becomes active (3-6), no free sword', () => {
    const S = stateWith({ swords: [{ id: 1, lv: 10, prot: 2, pity: 4 }, { id: 2, lv: 3, prot: 2, pity: 3 }, { id: 3, lv: 6, prot: 2, pity: 0 }], active: 1, top: { gold: 1e6 } });
    const r = R.attemptEnhance(S, rollDestroy(R.chances(S.swords[0], {})));
    assert.strictEqual(r.freeSword, null);
    assert.strictEqual(S.active, C.NO_ACTIVE_SWORD);
    assert.strictEqual(S.swords.length, 2);
    assert.strictEqual(R.findSword(S, 2).pity, 3);
  });
  test('keepdown at +12 fail: lv kept, consumed; not consumed on success', () => {
    const S = stateWith({ sword: { lv: 12 }, inv: { keepdown: 2 }, use: { keepdown: true }, top: { gold: 1e7 } });
    let r = R.attemptEnhance(S, ROLL_HIGH);
    assert.strictEqual(r.outcome, 'kept');
    assert.deepStrictEqual([S.swords[0].lv, S.inv.keepdown, S.swords[0].pity], [12, 1, 1]);
    r = R.attemptEnhance(S, ROLL_SUCCESS);
    assert.strictEqual(S.inv.keepdown, 1);
  });
  test('keepdown validity: invalid at +9 and +15, valid +10..+14', () => {
    for (const [lv, ok] of [[9, false], [10, true], [14, true], [15, false], [19, false]]) {
      const S = stateWith({ sword: { lv }, inv: { keepdown: 1 } });
      assert.strictEqual(R.trayState(S).keepdown.block === null, ok, `lv ${lv}`);
    }
  });
  test('keepdown at +15 fail still drops', () => {
    const S = stateWith({ sword: { lv: 15 }, inv: { keepdown: 1 }, use: { keepdown: true }, top: { gold: 1e7 } });
    assert.strictEqual(R.attemptEnhance(S, ROLL_HIGH).outcome, 'drop');
    assert.strictEqual(S.inv.keepdown, 1);
  });
  test('protect + keepdown: destroy uses protect only, fail uses keepdown only', () => {
    const S = stateWith({ sword: { lv: 12 }, inv: { keepdown: 3, protect: 9 }, use: { keepdown: true, protect: true }, top: { gold: 1e7 } });
    R.attemptEnhance(S, rollDestroy(R.chances(S.swords[0], {})));
    assert.deepStrictEqual([S.inv.protect, S.inv.keepdown], [6, 3]);
    R.attemptEnhance(S, ROLL_HIGH);
    assert.deepStrictEqual([S.inv.protect, S.inv.keepdown], [6, 2]);
  });
  test('sure at +7: 100%, consumed, other toggles blocked and not consumed, pity reset', () => {
    const S = stateWith({ sword: { lv: 7, pity: 3 }, inv: { sure: 1, bless: 2 }, use: { bless: true }, top: { gold: 1e6 } });
    assert.ok(R.setUse(S, 'sure', true).ok);
    assert.strictEqual(S.use.bless, false);
    assert.strictEqual(R.setUse(S, 'bless', true).reason, 'sureExclusive');
    const r = R.attemptEnhance(S, ROLL_HIGH);    // even worst roll succeeds
    assert.strictEqual(r.outcome, 'success');
    assert.strictEqual(r.chances.succ, 100);
    assert.deepStrictEqual([S.inv.sure, S.inv.bless, S.swords[0].pity], [0, 2, 0]);
  });
  test('sure invalid at +10', () => {
    const S = stateWith({ sword: { lv: 10 }, inv: { sure: 1 } });
    assert.strictEqual(R.trayState(S).sure.block, 'lvTooHigh');
    assert.strictEqual(R.setUse(S, 'sure', true).ok, false);
  });
  test('bless consumed every attempt regardless of outcome', () => {
    const S = stateWith({ sword: { lv: 6 }, inv: { bless: 2 }, use: { bless: true }, top: { gold: 1e6 } });
    R.attemptEnhance(S, ROLL_HIGH);
    assert.strictEqual(S.inv.bless, 1);
    R.attemptEnhance(S, ROLL_SUCCESS);
    assert.strictEqual(S.inv.bless, 0);
    assert.strictEqual(S.use.bless, false);   // auto-cleared at 0
  });
  test('pity per sword: switching keeps other sword pity', () => {
    const S = stateWith({ swords: [{ id: 1, lv: 7, prot: 2, pity: 3 }, { id: 2, lv: 7, prot: 2, pity: 0 }], active: 1, top: { gold: 1e6 } });
    R.setActive(S, 2);
    R.attemptEnhance(S, ROLL_HIGH);
    assert.deepStrictEqual([R.findSword(S, 1).pity, R.findSword(S, 2).pity], [3, 1]);
  });
});

// ============================================================ 모루 (F3/F8)
describe('anvil', () => {
  const forgeState = extra => {
    const S = stateWith({ sword: { lv: 8 }, top: Object.assign({ gold: 1e6 }, extra || {}) });
    S.best = Math.max(S.best, 8);
    return S;
  };
  test('anvil_1 ON at +8: +2%p, dura -1 on any outcome; OFF: unchanged', () => {
    const S = forgeState();
    R.addAnvil(S, 1);
    R.setUse(S, 'anvil', true);
    const r = R.attemptEnhance(S, ROLL_HIGH);
    assert.strictEqual(r.chances.parts.anvil, 2);
    assert.strictEqual(S.anvils[0].dura, 29);
    R.setUse(S, 'anvil', false);
    R.attemptEnhance(S, ROLL_HIGH);
    assert.strictEqual(S.anvils[0].dura, 29);
  });
  test('dura 1 → broken: toggle off, stays equipped, then blocked', () => {
    const S = forgeState();
    const a = R.addAnvil(S, 1);
    a.dura = 1;
    R.setUse(S, 'anvil', true);
    const r = R.attemptEnhance(S, ROLL_HIGH);
    assert.ok(r.anvilBroke);
    assert.deepStrictEqual([a.dura, S.use.anvil, S.anvilEq], [0, false, a.id]);
    assert.strictEqual(R.trayState(S).anvil.block, 'broken');
  });
  test('sure + anvil: anvil not used', () => {
    const S = forgeState({});
    S.swords[0].lv = 7;
    R.addAnvil(S, 1);
    S.inv.sure = 1;
    R.setUse(S, 'anvil', true);
    R.setUse(S, 'sure', true);
    R.attemptEnhance(S, ROLL_SUCCESS);
    assert.strictEqual(S.anvils[0].dura, 30);
  });
  test('repair broken anvil_2 with iron 40 + silver 40 → dura 40', () => {
    const S = forgeState();
    const a = R.addAnvil(S, 2);
    a.dura = 0;
    S.ore.iron = 50; S.ore.silver = 45;
    const r = F.repairAnvil(S, a.id);
    assert.ok(r.ok);
    assert.deepStrictEqual([a.dura, S.ore.iron, S.ore.silver], [40, 10, 5]);
  });
  test('partial repair cost proportional, ceil, min 1; intact → blocked', () => {
    const a = { id: 1, g: 2, dura: 39 };
    assert.deepStrictEqual(F.repairCost(a).ore, { iron: 1, silver: 1 });
    assert.deepStrictEqual(F.repairCost({ id: 1, g: 1, dura: 15 }).ore, { iron: 15 });
    assert.strictEqual(F.repairCost({ id: 1, g: 1, dura: 30 }), null);
  });
  test('repair/craft blocked when ore short', () => {
    const S = forgeState();
    const a = R.addAnvil(S, 2);
    a.dura = 0;
    S.ore.iron = 40; S.ore.silver = 10;
    assert.strictEqual(F.repairBlock(S, a.id), 'noResource');
    assert.strictEqual(F.craftBlock(S, 1), 'noResource');
    assert.deepStrictEqual(F.shortfall(S, F.craftCost(1)).ore, { iron: 20 });
  });
  test('craft anvil_1: iron -60, {g:1,dura:30}, crafted+1; full at ANVIL_OWN_MAX', () => {
    const S = forgeState();
    S.ore.iron = 1000;
    const r = F.craftAnvil(S, 1);
    assert.ok(r.ok);
    assert.deepStrictEqual([S.ore.iron, S.anvils[0].g, S.anvils[0].dura, S.stats.crafted], [940, 1, 30, 1]);
    while (S.anvils.length < C.ANVIL_OWN_MAX) R.addAnvil(S, 1);
    assert.strictEqual(F.craftAnvil(S, 1).reason, 'full');
    assert.strictEqual(R.buyShopItem(S, 'anvil_1', NOW).reason, 'full');
    S.shards = 999;
    assert.strictEqual(R.exchangeShards(S, 'anvil_1').reason, 'full');
  });
  test('craft anvil_2 costs ore + gold', () => {
    const S = forgeState({ gold: 6000 });
    Object.assign(S.ore, { iron: 100, silver: 60 });
    assert.ok(F.craftAnvil(S, 2).ok);
    assert.deepStrictEqual([S.gold, S.ore.iron, S.ore.silver], [1000, 0, 0]);
  });
  test('forge locked below best 5', () => {
    const S = fresh();
    S.ore.iron = 100;
    assert.strictEqual(F.craftAnvil(S, 1).reason, 'locked');
  });
  test('bless + anvil_3 summed then capped', () => {
    const S = stateWith({ sword: { lv: 15, pity: 10 }, inv: { bless: 1 }, use: { bless: true }, top: { gold: 1e7 } });
    R.addAnvil(S, 3);
    R.setUse(S, 'anvil', true);
    const r = R.attemptEnhance(S, ROLL_HIGH);
    assert.deepStrictEqual([r.chances.raw, r.chances.bonus, r.chances.succ], [24, 14, 34]);
  });
});

// ============================================================ 광석
describe('ore', () => {
  test('best 6: only iron; best 7: silver; best 12: mithril 0/1 with ~0.5 avg', () => {
    const S = fresh();
    S.best = 6;
    assert.deepStrictEqual(F.rollOre(S, () => 0), { iron: 2 });
    S.best = 7;
    assert.deepStrictEqual(F.rollOre(S, () => 0), { iron: 2, silver: 1 });
    S.best = 12;
    assert.strictEqual(F.rollOre(S, () => 0.49).mithril, 1);
    assert.strictEqual(F.rollOre(S, () => 0.5).mithril, 0);
    let total = 0;
    let x = 12345;
    const lcg = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 1000; i++) total += F.rollOre(S, lcg).mithril;
    assert.ok(total > 430 && total < 570, `mithril avg ${total / 1000}`);
  });
  test('offline 1000 runs at 25% → mithril exactly 125', () => {
    const S = fresh();
    S.best = 12;
    assert.strictEqual(F.expectedOre(S, 1000, C.OFFLINE_EFF).mithril, 125);
  });
  test('ORE_MAX cap', () => {
    const S = fresh();
    S.ore.iron = C.ORE_MAX - 1;
    assert.deepStrictEqual(F.addOre(S, { iron: 5 }), { iron: 1 });
    assert.strictEqual(S.ore.iron, C.ORE_MAX);
  });
  test('manual hunt gives gold + ore based on best sword in storage', () => {
    const S = stateWith({ swords: [{ id: 1, lv: 2, prot: 2, pity: 0 }, { id: 2, lv: 9, prot: 2, pity: 0 }], active: 1 });
    const g0 = S.gold;
    const r = I.manualHunt(S, NOW, () => 0.99);
    assert.strictEqual(r.gold, R.huntReward(9));
    assert.strictEqual(S.gold, g0 + R.huntReward(9));
    assert.deepStrictEqual(r.ore, { iron: 2, silver: 1 });
  });
});

describe('income basis topLv', () => {
  test('active +2, storage +8 → huntReward(8)/autoReward(8); after selling +8 → next best', () => {
    const S = stateWith({ swords: [{ id: 1, lv: 2, prot: 2, pity: 0 }, { id: 2, lv: 8, prot: 2, pity: 0 }, { id: 3, lv: 5, prot: 2, pity: 0 }], active: 1 });
    assert.strictEqual(R.topLv(S), 8);
    assert.strictEqual(I.manualHuntGold(S, NOW), R.huntReward(8));
    assert.strictEqual(I.autoRunGold(S, NOW), R.autoReward(8));
    R.setActive(S, 3);
    assert.strictEqual(I.manualHuntGold(S, NOW), R.huntReward(8));   // switching does not change income
    R.sellSword(S, 2);
    assert.strictEqual(I.manualHuntGold(S, NOW), R.huntReward(5));
  });
});

// ============================================================ 보관함 (F5)
describe('storage slots', () => {
  test('buy sword: -100G, +0 added, active unchanged; full/no gold rejected', () => {
    const S = fresh();
    const r = R.buySword(S);
    assert.ok(r.ok);
    assert.deepStrictEqual([S.gold, S.swords.length, S.active], [200, 2, 1]);
    R.buySword(S);
    assert.strictEqual(R.buySword(S).reason, 'slotsFull');
    const T = fresh();
    T.gold = 50;
    assert.strictEqual(R.buySword(T).reason, 'noGold');
    assert.strictEqual(T.swords.length, 1);
  });
  test('sell inactive +9: only it removed, gold += sell(9), active untouched', () => {
    const S = stateWith({ swords: [{ id: 1, lv: 5, prot: 1, pity: 2 }, { id: 2, lv: 9, prot: 2, pity: 0 }], active: 1 });
    const g0 = S.gold;
    const r = R.sellSword(S, 2);
    assert.ok(r.ok);
    assert.strictEqual(S.gold, g0 + R.sell(9));
    assert.deepStrictEqual(S.swords, [{ id: 1, lv: 5, prot: 1, pity: 2 }]);
    assert.strictEqual(S.active, 1);
  });
  test('sell last sword grants free +0; +0 cannot be sold', () => {
    const S = stateWith({ sword: { lv: 3 } });
    const r = R.sellSword(S, 1);
    assert.ok(r.freeSword);
    assert.strictEqual(S.swords.length, 1);
    assert.strictEqual(S.active, r.freeSword.id);
    assert.strictEqual(R.sellSword(S, S.active).reason, 'zeroLv');
  });
  test('sword ids never reused', () => {
    const S = stateWith({ sword: { lv: 3 } });
    R.sellSword(S, 1);
    assert.strictEqual(S.swords[0].id, 2);
  });
  test('setActive', () => {
    const S = fresh();
    R.buySword(S);
    assert.ok(R.setActive(S, 2).ok);
    assert.strictEqual(S.active, 2);
    assert.strictEqual(R.setActive(S, 99).reason, 'notFound');
  });
  test('expand: slots 3→4 for 3000G, up to SLOT_MAX then rejected', () => {
    const S = fresh();
    S.gold = 1e7;
    assert.ok(R.expandSlots(S).ok);
    assert.deepStrictEqual([S.slots, S.gold], [4, 1e7 - 3000]);
    while (S.slots < C.SLOT_MAX) R.expandSlots(S);
    assert.strictEqual(R.expandCost(S), null);
    assert.strictEqual(R.expandSlots(S).reason, 'slotsMax');
    assert.strictEqual(S.gold, 1e7 - C.SLOT_EXPAND_COST.reduce((a, b) => a + b, 0));
  });
  test('seal on sell: floor(sell×1.3), consumed, toggle off; off → normal', () => {
    const S = stateWith({ sword: { lv: 9 }, inv: { seal: 1 } });
    R.setSeal(S, true);
    const r = R.sellSword(S, 1);
    assert.strictEqual(r.gold, Math.floor(R.sell(9) * C.SEAL_MULT));
    assert.deepStrictEqual([S.inv.seal, S.use.seal], [0, false]);
  });
});

// ============================================================ 상점 / 파편 교환 / 부스터
describe('shop, shards, booster', () => {
  test('shop prices and stack cap', () => {
    const S = fresh();
    S.gold = 1e7;
    assert.ok(R.buyShopItem(S, 'keepdown', NOW).ok);
    assert.strictEqual(S.gold, 1e7 - 3000);
    S.inv.bless = C.STACK_MAX;
    assert.strictEqual(R.buyShopItem(S, 'bless', NOW).reason, 'full');
  });
  test('booster/seal/anvil locked before best 5', () => {
    const S = fresh();
    S.gold = 1e7;
    assert.strictEqual(R.buyShopItem(S, 'booster', NOW).reason, 'locked');
    assert.strictEqual(R.buyShopItem(S, 'seal', NOW).reason, 'locked');
    assert.strictEqual(R.buyShopItem(S, 'anvil_1', NOW).reason, 'locked');
  });
  test('booster shop: applies immediately, no inventory, price by best, max 60 min', () => {
    const S = fresh();
    S.best = 10;
    S.gold = 1e7;
    const r = R.buyShopItem(S, 'booster', NOW);
    assert.strictEqual(r.price, 16900);
    assert.strictEqual(S.inv.booster, 0);
    assert.strictEqual(S.idle.boostUntil, NOW + 10 * MIN);
    for (let i = 0; i < 5; i++) assert.ok(R.buyShopItem(S, 'booster', NOW).ok);
    assert.strictEqual(S.idle.boostUntil, NOW + 60 * MIN);
    assert.strictEqual(R.buyShopItem(S, 'booster', NOW).reason, 'boostMax');
  });
  test('booster from inventory extends and caps', () => {
    const S = fresh();
    S.inv.booster = 3;
    S.idle.boostUntil = NOW + 45 * MIN;
    assert.ok(R.useBoosterFromInv(S, NOW).ok);
    assert.strictEqual(S.idle.boostUntil, NOW + 55 * MIN);
    assert.strictEqual(R.useBoosterFromInv(S, NOW).reason, 'boostMax');
    assert.strictEqual(S.inv.booster, 2);
  });
  test('booster ×1.5 on manual hunt (floor) and expires', () => {
    const S = stateWith({ sword: { lv: 9 } });
    S.idle.boostUntil = NOW + 1000;
    assert.strictEqual(I.manualHuntGold(S, NOW), Math.floor(R.huntReward(9) * 1.5));
    assert.strictEqual(I.manualHuntGold(S, NOW + 1000), R.huntReward(9));
  });
  test('shard exchange: protect costs 25 shards → inv.protect+1; insufficient/full blocked', () => {
    const S = fresh();
    S.best = 5;
    S.shards = 30;
    assert.ok(R.exchangeShards(S, 'protect').ok);
    assert.deepStrictEqual([S.shards, S.inv.protect], [5, 1]);
    assert.strictEqual(R.exchangeShards(S, 'protect').reason, 'noShards');
    S.shards = 100;
    S.inv.bless = C.STACK_MAX;
    assert.strictEqual(R.exchangeShards(S, 'bless').reason, 'full');
    assert.strictEqual(R.exchangeShards(S, 'anvil_3').reason, 'notFound');
    assert.strictEqual(R.exchangeShards(S, 'booster').reason, 'notFound');
  });
  test('shard exchange anvil_2 adds an anvil instance', () => {
    const S = fresh();
    S.best = 5;
    S.shards = 50;
    assert.ok(R.exchangeShards(S, 'anvil_2').ok);
    assert.deepStrictEqual(S.anvils[0], { id: 1, g: 2, dura: 40 });
    assert.strictEqual(S.anvilEq, 1);
  });
});

// ============================================================ 자동 사냥 / 오프라인 (F1/F10)
describe('idle', () => {
  const idleState = (lv = 10) => {
    const S = stateWith({ swords: [{ id: 1, lv: 2, prot: 2, pity: 0 }, { id: 2, lv, prot: 2, pity: 0 }], active: 1 });
    S.idle.autoOn = true;
    return S;
  };
  test('auto locked below best 5', () => {
    const S = fresh();
    assert.strictEqual(I.setAutoOn(S, true).reason, 'locked');
    S.best = 5;
    assert.ok(I.setAutoOn(S, true).ok);
  });
  test('auto run after 5s: autoReward(best sword lv) gold + ore', () => {
    const S = idleState(10);
    const g0 = S.gold;
    const r = I.runAutoCatchup(S, NOW + 5000, NOW + 5000, () => 0.99);
    assert.strictEqual(r.runs, 1);
    assert.strictEqual(S.gold - g0, 160);
    assert.deepStrictEqual(r.ore, { iron: 2, silver: 1 });
    assert.strictEqual(r.nextAutoAt, NOW + 10000);
  });
  test('30s catch-up → 6 runs at full efficiency, capped at AUTO_CATCHUP_MAX', () => {
    const S = idleState(10);
    assert.strictEqual(I.runAutoCatchup(S, NOW + 30000, NOW + 5000, () => 0.99).runs, 6);
    const T = idleState(10);
    const r = I.runAutoCatchup(T, NOW + 10 * MIN, NOW + 5000, () => 0.99);
    assert.strictEqual(r.runs, C.AUTO_CATCHUP_MAX);
    assert.strictEqual(r.nextAutoAt, NOW + 10 * MIN + 5000);
  });
  test('auto off → no runs', () => {
    const S = idleState(10);
    S.idle.autoOn = false;
    assert.strictEqual(I.runAutoCatchup(S, NOW + 60000, NOW, () => 0).runs, 0);
  });
  test('offline 10h with cap 8h: 8h worth at 25%, uses best sword', () => {
    const S = idleState(10);
    S.idle.lastSeen = NOW - 10 * HOUR;
    const g0 = S.gold;
    const r = I.settleOffline(S, NOW);
    const runs = Math.floor(8 * HOUR / 5000);
    assert.strictEqual(r.runs, runs);
    assert.strictEqual(r.capped, true);
    assert.strictEqual(r.capH, 8);
    assert.strictEqual(r.gold, Math.floor(runs * 160 * 0.25));
    assert.strictEqual(S.gold - g0, r.gold);
    assert.strictEqual(r.ore.iron, Math.floor(runs * 2 * 0.25));
    assert.strictEqual(S.stats.offlineGold, r.gold);
    assert.strictEqual(S.idle.lastSeen, NOW);
  });
  test('offline: auto off or locked → nothing; lastSeen updated', () => {
    const S = idleState(10);
    S.idle.autoOn = false;
    S.idle.lastSeen = NOW - 5 * HOUR;
    assert.strictEqual(I.settleOffline(S, NOW), null);
    assert.strictEqual(S.idle.lastSeen, NOW);
  });
  test('offline < 60s → null (catch-up handles)', () => {
    const S = idleState(10);
    S.idle.lastSeen = NOW - 30000;
    assert.strictEqual(I.settleOffline(S, NOW), null);
    assert.strictEqual(S.idle.lastSeen, NOW - 30000);
  });
  test('lastSeen in future → 0 and no error', () => {
    const S = idleState(10);
    S.idle.lastSeen = NOW + HOUR;
    const g0 = S.gold;
    assert.strictEqual(I.settleOffline(S, NOW), null);
    assert.strictEqual(S.gold, g0);
  });
  test('no double payout on immediate re-settle', () => {
    const S = idleState(10);
    S.idle.lastSeen = NOW - 2 * HOUR;
    I.settleOffline(S, NOW);
    const g1 = S.gold;
    assert.strictEqual(I.settleOffline(S, NOW + 1000), null);
    assert.strictEqual(S.gold, g1);
  });
  test('booster overlapping half the window → ×1.25', () => {
    const S = idleState(10);
    S.idle.lastSeen = NOW - 2 * HOUR;
    S.idle.boostUntil = NOW - HOUR;
    const r = I.settleOffline(S, NOW);
    assert.strictEqual(r.boostFactor, 1.25);
    assert.strictEqual(r.gold, Math.floor(r.runs * 160 * 0.25 * 1.25));
  });
  test('upgrades: speed 3 → 3800ms, offline 2 → 10h, costs grow, max blocks', () => {
    const S = idleState(10);
    S.gold = 1e8;
    for (let i = 0; i < 3; i++) I.buyUpgrade(S, 'speed');
    assert.strictEqual(I.autoInterval(S), 3800);
    I.buyUpgrade(S, 'offline'); I.buyUpgrade(S, 'offline');
    assert.strictEqual(I.offlineCapH(S), 10);
    assert.deepStrictEqual([0, 1, 2, 3, 4].map(n => I.upgradeCost('speed', n)), [3000, 6600, 14520, 31940, 70280]);
    assert.strictEqual(I.upgradeCost('gold', 4), 117130);
    while (S.idle.up.gold < C.UP_MAX) I.buyUpgrade(S, 'gold');
    assert.strictEqual(I.buyUpgrade(S, 'gold').reason, 'max');
    assert.strictEqual(I.autoRunGold(S, NOW), Math.round(160 * 1.5));
  });
});

// ============================================================ 의뢰 (F4)
describe('quests', () => {
  const qState = best => {
    const S = fresh();
    S.best = best;
    return S;
  };
  test('locked at best 2, three quests at best 3', () => {
    const S = qState(2);
    assert.deepStrictEqual(Q.refreshQuests(S, NOW, () => 0.5), []);
    S.best = 3;
    assert.deepStrictEqual(Q.refreshQuests(S, NOW, () => 0.5), [0, 1, 2]);
  });
  test('best 10 → levels 5/7/9, no duplicates in general', () => {
    const S = qState(10);
    Q.refreshQuests(S, NOW, () => 0.5);
    assert.deepStrictEqual(S.quests.list.map(q => q.lv), [5, 7, 9]);
    for (let best = 3; best <= 20; best++) {
      const T = qState(best);
      Q.refreshQuests(T, NOW, () => 0.5);
      const lvs = T.quests.list.map(q => q.lv);
      assert.strictEqual(new Set(lvs).size, 3, `best ${best}: ${lvs}`);
      assert.ok(lvs.every(l => l <= C.MAX));
    }
  });
  test('gold = round(sell×mult/10)×10 and always > sell', () => {
    for (const tier of C.QUEST_TIERS) for (let lv = 1; lv <= 20; lv++) {
      const g = Q.questGold(tier, lv);
      assert.strictEqual(g % 10, 0);
      assert.ok(g > R.sell(lv));
    }
  });
  test('item chance and pool: easy shard qty = shardGain(max(5,lv))', () => {
    const S = qState(4);   // easy lv 2
    const q = Q.makeQuest(S, 0, seq(0, 0.99));   // chance pass, last pool entry (shard)
    assert.deepStrictEqual(q.item, { id: 'shard', n: R.shardGain(5) });
    const none = Q.makeQuest(S, 0, () => 0.6);   // 0.6 >= 0.5 → no item
    assert.strictEqual(none.item, null);
  });
  test('deliver +7 inactive: sword removed, gold, item, stats, cooldown', () => {
    const S = stateWith({ swords: [{ id: 1, lv: 12, prot: 2, pity: 0 }, { id: 2, lv: 7, prot: 2, pity: 0 }], active: 1 });
    S.quests.list[1] = { id: 1, tier: 'normal', lv: 7, gold: 5000, item: { id: 'protect', n: 1 } };
    const g0 = S.gold;
    const r = Q.deliver(S, 1, NOW);
    assert.ok(r.ok);
    assert.strictEqual(S.gold, g0 + 5000);
    assert.strictEqual(S.inv.protect, 1);
    assert.strictEqual(S.stats.delivered, 1);
    assert.strictEqual(S.quests.list[1], null);
    assert.strictEqual(S.quests.readyAt[1], NOW + 300000);
    assert.deepStrictEqual(S.swords.map(s => s.id), [1]);
  });
  test('exact level required: +6 and +8 do not satisfy +7', () => {
    const S = stateWith({ swords: [{ id: 1, lv: 6, prot: 2, pity: 0 }, { id: 2, lv: 8, prot: 2, pity: 0 }], active: 1 });
    S.quests.list[1] = { id: 1, tier: 'normal', lv: 7, gold: 5000, item: null };
    assert.strictEqual(Q.deliver(S, 1, NOW).reason, 'noSword');
    assert.deepStrictEqual(Q.deliverableSlots(S), []);
  });
  test('prefers inactive sword when both match', () => {
    const S = stateWith({ swords: [{ id: 1, lv: 7, prot: 2, pity: 0 }, { id: 5, lv: 7, prot: 2, pity: 0 }, { id: 3, lv: 7, prot: 2, pity: 0 }], active: 1 });
    S.quests.list[1] = { id: 1, tier: 'normal', lv: 7, gold: 100, item: null };
    const r = Q.deliver(S, 1, NOW);
    assert.strictEqual(r.swordId, 3);
    assert.strictEqual(S.active, 1);
  });
  test('only active sword: needs confirm, then free +0 becomes active', () => {
    const S = stateWith({ sword: { lv: 7 } });
    S.quests.list[1] = { id: 1, tier: 'normal', lv: 7, gold: 100, item: null };
    assert.strictEqual(Q.deliver(S, 1, NOW).reason, 'needConfirm');
    const r = Q.deliver(S, 1, NOW, { confirmActive: true });
    assert.ok(r.ok && r.freeSword);
    assert.strictEqual(S.active, r.freeSword.id);
    assert.strictEqual(S.swords[0].lv, 0);
  });
  test('reroll: blocked while waiting; charges and replaces', () => {
    const S = qState(10);
    S.gold = 1e6;
    S.quests.readyAt[0] = NOW + 1000;
    assert.strictEqual(Q.rerollQuest(S, 0, () => 0.5).reason, 'waiting');
    Q.refreshQuests(S, NOW, () => 0.5);
    const old = S.quests.list[1];
    const r = Q.rerollQuest(S, 1, () => 0.5);
    assert.ok(r.ok);
    assert.strictEqual(r.price, Math.max(200, 3 * R.cost(10)));
    assert.strictEqual(S.gold, 1e6 - r.price);
    assert.notStrictEqual(S.quests.list[1].id, old.id);
  });
  test('cooldown elapsed while closed (5 min later) → regenerated', () => {
    const S = qState(10);
    S.quests.readyAt = [NOW + 300000, 0, 0];
    Q.refreshQuests(S, NOW, () => 0.5);
    assert.strictEqual(S.quests.list[0], null);
    Q.refreshQuests(S, NOW + 300000, () => 0.5);
    assert.ok(S.quests.list[0]);
  });
  test('clock rollback: readyAt too far in the future is clamped', () => {
    const S = qState(10);
    S.quests.readyAt[0] = NOW + 10 * HOUR;
    Q.refreshQuests(S, NOW, () => 0.5);
    assert.strictEqual(S.quests.readyAt[0], NOW + 300000);
  });
  test('seal ON on delivery: gold ×1.3 only, seal consumed', () => {
    const S = stateWith({ swords: [{ id: 1, lv: 12, prot: 2, pity: 0 }, { id: 2, lv: 7, prot: 2, pity: 0 }], active: 1, inv: { seal: 1 } });
    R.setSeal(S, true);
    S.quests.list[2] = { id: 1, tier: 'hard', lv: 7, gold: 1000, item: { id: 'sure', n: 2 } };
    const g0 = S.gold;
    const r = Q.deliver(S, 2, NOW);
    assert.strictEqual(S.gold - g0, 1300);
    assert.deepStrictEqual([S.inv.seal, S.use.seal, S.inv.sure, r.sealed], [0, false, 2, true]);
  });
  test('anvil reward at ANVIL_OWN_MAX → shards instead', () => {
    const S = stateWith({ swords: [{ id: 1, lv: 12, prot: 2, pity: 0 }, { id: 2, lv: 9, prot: 2, pity: 0 }], active: 1 });
    while (S.anvils.length < C.ANVIL_OWN_MAX) R.addAnvil(S, 1);
    S.quests.list[2] = { id: 1, tier: 'hard', lv: 9, gold: 1000, item: { id: 'anvil_2', n: 1 } };
    const r = Q.deliver(S, 2, NOW);
    assert.deepStrictEqual(r.reward, { id: 'anvil_2', granted: 0, fallbackShards: C.SHARD_COST.anvil_2 });
    assert.strictEqual(S.shards, C.SHARD_COST.anvil_2);
  });
  test('booster reward at stack cap → protect-value shards; partial stack grant', () => {
    const S = fresh();
    S.inv.booster = C.STACK_MAX;
    assert.strictEqual(Q.grantReward(S, { id: 'booster', n: 1 }).fallbackShards, C.SHARD_COST.protect);
    S.inv.bless = C.STACK_MAX - 1;
    const r = Q.grantReward(S, { id: 'bless', n: 2 });
    assert.deepStrictEqual([r.granted, r.fallbackShards, S.inv.bless], [1, C.SHARD_COST.bless, C.STACK_MAX]);
  });
});

// ============================================================ 저장 / 마이그레이션 (F5, REQ-009)
describe('save & migrate', () => {
  const v1Full = {
    gold: 5000, level: 7, best: 12, muted: true,
    inv: { bless: 3, protect: 2 }, use: { bless: true, protect: false },
    found: [true, true, true, true, true, true, true, true, false, false, false, false, true],
    stats: { tries: 40, success: 20, fail: 15, destroy: 5, earned: 9000 },
  };
  test('v1 full → v2 mapping, v2 written, v1 key kept', () => {
    const st = memStorage({ 'sword-enhance-v1': JSON.stringify(v1Full) });
    const { state: S, source } = SV.load(st, NOW);
    assert.strictEqual(source, 'v1');
    assert.deepStrictEqual(S.swords, [{ id: 1, lv: 7, prot: 2, pity: 0, trait: null }]);
    assert.deepStrictEqual([S.active, S.gold, S.best, S.settings.muted], [1, 5000, 12, true]);
    assert.deepStrictEqual([S.inv.bless, S.inv.protect, S.use.bless, S.use.protect], [3, 2, true, false]);
    assert.strictEqual(S.found.length, 21);
    assert.strictEqual(S.found[12], true);
    assert.strictEqual(S.found[9], false);   // not back-filled up to best
    assert.deepStrictEqual(S.stats, { tries: 40, success: 20, fail: 15, destroy: 5, earned: 9000, shardsGained: 0, protectSaved: 0, delivered: 0, crafted: 0, huntGold: 0, offlineGold: 0, sinkGold: 0, traitRolls: 0,
      hunts: 0, sells: 0, autoRuns: 0, dailyDone: 0, dailyAll: 0, rewardGold: 0, eventsSeen: 0 });
    assert.strictEqual(S.idle.lastSeen, NOW);
    assert.ok(st.dump['sword-enhance-v2']);
    assert.ok(st.dump['sword-enhance-v1']);
    assert.strictEqual(JSON.parse(st.dump['sword-enhance-v2']).v, 2);
  });
  test('v1 best < level → best = level', () => {
    const S = SV.migrateV1({ gold: 10, level: 5, best: 3 }, NOW);
    assert.strictEqual(S.best, 5);
  });
  test('v1 minimal / partial shapes', () => {
    const S = SV.migrateV1({ gold: 777 }, NOW);
    assert.deepStrictEqual([S.gold, S.swords[0].lv, S.best, S.inv.bless], [777, 0, 0, 0]);
    const T = SV.migrateV1({ level: 25, gold: -5, inv: { bless: 500 }, use: { bless: 'yes' }, found: 'x', stats: null }, NOW);
    assert.deepStrictEqual([T.swords[0].lv, T.gold, T.inv.bless, T.use.bless, T.found[0], T.best], [20, 0, 99, false, true, 20]);
    const U = SV.migrateV1({ level: '6', gold: '1200' }, NOW);
    assert.deepStrictEqual([U.swords[0].lv, U.gold], [6, 1200]);
  });
  test('v1 with protect 5 → inv.protect 5 and prot 2', () => {
    const S = SV.migrateV1({ level: 3, inv: { protect: 5 } }, NOW);
    assert.deepStrictEqual([S.inv.protect, S.swords[0].prot], [5, 2]);
  });
  test('use.* true with zero stock cleaned to false', () => {
    const S = SV.migrateV1({ level: 3, use: { bless: true, protect: true }, inv: { bless: 0, protect: 0 } }, NOW);
    assert.deepStrictEqual([S.use.bless, S.use.protect], [false, false]);
  });
  test('corrupt v1 JSON → default, no throw', () => {
    const st = memStorage({ 'sword-enhance-v1': '{gold:' });
    const { state, source } = SV.load(st, NOW);
    assert.strictEqual(source, 'corrupt');
    assert.strictEqual(state.gold, C.START_GOLD);
  });
  test('corrupt v2 JSON / non-object → default', () => {
    for (const raw of ['not json', '42', 'null', '[]']) {
      const { state, source } = SV.load(memStorage({ 'sword-enhance-v2': raw }), NOW);
      assert.strictEqual(source, 'corrupt', raw);
      assert.strictEqual(state.swords.length, 1);
    }
  });
  test('storage that throws → new game', () => {
    const bad = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    const { state } = SV.load(bad, NOW);
    assert.strictEqual(state.gold, C.START_GOLD);
    assert.strictEqual(SV.save(bad, state, NOW), false);
  });
  test('new game defaults', () => {
    const { state: S, source } = SV.load(memStorage(), NOW);
    assert.strictEqual(source, 'new');
    assert.deepStrictEqual(S.swords, [{ id: 1, lv: 0, prot: 2, pity: 0, trait: null }]);
    assert.deepStrictEqual([S.slots, S.gold, S.shards, S.anvilEq, S.quests.list.length], [3, 300, 0, null, 3]);
    assert.deepStrictEqual(S.inv, { bless: 0, protect: 0, keepdown: 0, sure: 0, booster: 0, seal: 0 });
    assert.deepStrictEqual(S.idle.up, { speed: 0, gold: 0, offline: 0 });
    assert.deepStrictEqual(S.settings, { muted: false, skipFx: false });
  });
  test('v2 round trip preserves swords/prot/pity/slots/anvils/quests/settings', () => {
    const S = fresh();
    S.gold = 1e6;
    R.buySword(S); R.expandSlots(S);
    S.swords[0].lv = 9; S.swords[0].pity = 3; S.swords[1].prot = 1;
    S.best = 9;
    R.addAnvil(S, 2); S.anvils[0].dura = 12;
    S.ore.silver = 44;
    S.settings.skipFx = true;
    Q.refreshQuests(S, NOW, () => 0.5);
    const st = memStorage();
    SV.save(st, S, NOW + 5);
    const { state: T, source } = SV.load(st, NOW + 10);
    assert.strictEqual(source, 'v2');
    assert.deepStrictEqual(T, S);
    assert.strictEqual(T.idle.lastSeen, NOW + 5);
  });
  test('v2 integrity fixes', () => {
    const d = fresh();
    d.swords = [{ id: 3, lv: 30, prot: 9, pity: -2 }, { id: 3, lv: 1 }, { id: 'x' }, { id: 4, lv: 5, prot: 2, pity: 0 },
      { id: 5 }, { id: 6 }, { id: 7 }];
    d.slots = 2;
    d.active = 99;
    d.inv.bless = -4;
    d.gold = -10;
    d.anvils = [{ id: 1, g: 9, dura: 5 }, { id: 2, g: 1, dura: 99 }];
    d.anvilEq = 1;
    d.quests.list = [{ id: 1, tier: 'hard', lv: 3 }, 'junk'];
    const S = SV.normalize(JSON.parse(JSON.stringify(d)), NOW);
    assert.deepStrictEqual(S.swords[0], { id: 3, lv: 20, prot: 2, pity: 0, trait: null });
    assert.strictEqual(S.swords.length, 5);
    assert.strictEqual(S.slots, 5);
    assert.strictEqual(S.active, 3);
    assert.deepStrictEqual([S.inv.bless, S.gold], [0, 0]);
    assert.deepStrictEqual(S.anvils, [{ id: 2, g: 1, dura: 30 }]);
    assert.strictEqual(S.anvilEq, null);
    assert.deepStrictEqual(S.quests.list, [null, null, null]);
    assert.strictEqual(S.best, 20);
    assert.ok(S.nextSwordId > 7);
  });
  test('empty swords → free +0', () => {
    const d = fresh();
    d.swords = [];
    d.nextSwordId = 9;
    const S = SV.normalize(d, NOW);
    assert.deepStrictEqual(S.swords, [{ id: 9, lv: 0, prot: 2, pity: 0, trait: null }]);
    assert.strictEqual(S.active, 9);
  });
});

// ============================================================ M1 QA 수정 1차 회귀
describe('fix round 1: tray "no effect" only for bonus toggles (#1)', () => {
  const rich = (sword, inv, use) => stateWith({ sword, inv, use, top: { gold: 1e9 } });
  test('protect / keepdown / sure with anvil off are never "no effect"', () => {
    const p = rich({ lv: 12 }, { protect: 9 }, { protect: true });
    const k = rich({ lv: 12 }, { keepdown: 2 }, { keepdown: true });
    const s = rich({ lv: 5 }, { sure: 1 }, { sure: true });
    assert.deepStrictEqual([R.bonusWasted(p, 'protect'), R.bonusWasted(k, 'keepdown'), R.bonusWasted(s, 'sure')], [false, false, false]);
  });
  test('bless and anvil report "no effect" only when the cap swallows them', () => {
    // +12 band cap 14: pity 4 → 8, bless 10, anvil g3 4 → raw 22. Without anvil still capped; without bless 12 < 14
    const S = rich({ lv: 12, pity: 4 }, { bless: 1 }, { bless: true, anvil: true });
    S.anvils = [{ id: 1, g: 3, dura: 50 }];
    S.anvilEq = 1;
    assert.strictEqual(R.bonusWasted(S, 'anvil'), true);
    assert.strictEqual(R.bonusWasted(S, 'bless'), false);
    const low = rich({ lv: 0 }, { bless: 1 }, { bless: true });   // 95% base is above the 90% ceiling
    assert.strictEqual(R.bonusWasted(low, 'bless'), true);
  });
  test('unknown or off toggles are not "no effect"', () => {
    const S = rich({ lv: 12 }, { bless: 1 }, { bless: false });
    assert.strictEqual(R.bonusWasted(S, 'bless'), false);
    assert.strictEqual(R.bonusWasted(S, 'constructor'), false);
  });
});

describe('fix round 1: crafted quest items in saves (#4)', () => {
  const CRAFTED_IDS = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'];
  const saveWithQuest = (slot, quest) => {
    const d = fresh();
    d.best = 15;
    d.swords = [{ id: 1, lv: quest.lv, prot: 2, pity: 0 }, { id: 2, lv: 15, prot: 2, pity: 0 }];
    d.active = 2;
    d.quests.list[slot] = quest;
    return JSON.parse(JSON.stringify(d));
  };
  test('prototype-named item ids are dropped on load and delivery pays exactly once', () => {
    CRAFTED_IDS.forEach(id => {
      const S = SV.normalize(saveWithQuest(2, { id: 1, tier: 'hard', lv: 7, gold: 1000, item: { id, n: 3 } }), NOW);
      assert.strictEqual(S.quests.list[2].item, null, id);
      const gold = S.gold;
      const r = Q.deliver(S, 2, NOW, {});
      assert.strictEqual(r.ok, true, id);
      assert.strictEqual(S.gold, gold + Q.questGold('hard', 7), id);
      assert.strictEqual(S.quests.list[2], null, id);
      assert.strictEqual(Q.deliver(S, 2, NOW, {}).ok, false, id);
    });
  });
  test('items that exist but are not in this tier pool are dropped', () => {
    const S = SV.normalize(saveWithQuest(0, { id: 1, tier: 'easy', lv: 7, gold: 1, item: { id: 'anvil_3', n: 1 } }), NOW);
    assert.strictEqual(S.quests.list[0].item, null);
    const T = SV.normalize(saveWithQuest(0, { id: 1, tier: 'easy', lv: 7, gold: 1, item: { id: 'booster', n: 1 } }), NOW);
    assert.strictEqual(T.quests.list[0].item, null);
  });
  test('quest gold and item quantity are recomputed from the pool, not trusted', () => {
    const S = SV.normalize(saveWithQuest(1, { id: 1, tier: 'normal', lv: 7, gold: 999999999, item: { id: 'protect', n: 99 } }), NOW);
    assert.deepStrictEqual(S.quests.list[1], { id: 1, tier: 'normal', lv: 7, gold: Q.questGold('normal', 7), item: { id: 'protect', n: 1 } });
    const T = SV.normalize(saveWithQuest(0, { id: 1, tier: 'easy', lv: 10, gold: 5, item: { id: 'shard', n: 5000 } }), NOW);
    assert.deepStrictEqual(T.quests.list[0].item, { id: 'shard', n: R.shardGain(10) });
  });
  test('grantItem / grantReward / deliver tolerate a bogus in-memory item without throwing', () => {
    const S = stateWith({ swords: [{ id: 1, lv: 7, prot: 2, pity: 0 }, { id: 2, lv: 15, prot: 2, pity: 0 }], active: 2, top: { best: 15 } });
    assert.strictEqual(R.grantItem(S, 'constructor', 1), 0);
    assert.strictEqual(R.capacityFor(S, '__proto__'), 0);
    S.quests.list[2] = { id: 1, tier: 'hard', lv: 7, gold: 1000, item: { id: 'constructor', n: 2 } };
    const shards = S.shards;
    const r = Q.deliver(S, 2, NOW, {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(S.shards, shards);
    assert.ok(Number.isFinite(S.shards));
    assert.strictEqual(S.quests.list[2], null);
  });
});

describe('fix round 1: own-property checks and save clamps', () => {
  test('prototype-named ids are rejected by setUse / exchange / upgrade', () => {
    const S = stateWith({ top: { best: 10, gold: 1e9, shards: 999 } });
    assert.deepStrictEqual(R.setUse(S, 'constructor', true), { ok: false, reason: 'notFound' });
    assert.deepStrictEqual(R.setUse(S, '__proto__', false), { ok: false, reason: 'notFound' });
    assert.strictEqual(R.exchangeBlock(S, 'constructor'), 'notFound');
    assert.strictEqual(R.exchangeBlock(S, 'toString'), 'notFound');
    assert.strictEqual(I.upgradeBlock(S, 'constructor'), 'notFound');
    assert.strictEqual(I.upgradeBlock(S, 'valueOf'), 'notFound');
  });
  test('integers clamp to MAX_SAFE_INTEGER; boostUntil to now + BOOSTER_MAX_MIN', () => {
    const d = fresh();
    d.gold = 1e300;
    d.stats.tries = '9e99';
    d.idle.boostUntil = NOW + 1000 * HOUR;
    const S = SV.normalize(JSON.parse(JSON.stringify(d)), NOW);
    assert.strictEqual(S.gold, Number.MAX_SAFE_INTEGER);
    assert.strictEqual(S.stats.tries, Number.MAX_SAFE_INTEGER);
    assert.strictEqual(S.idle.boostUntil, NOW + C.BOOSTER_MAX_MIN * MIN);
  });
  test('anvilEq is coerced to an integer; a string active is malformed and falls back to the best sword', () => {
    const d = fresh();
    d.swords = [{ id: 1, lv: 9 }, { id: 2, lv: 3 }];
    d.active = '2';
    d.anvils = [{ id: 1, g: 1, dura: 10 }, { id: 4, g: 2, dura: 10 }];
    d.anvilEq = '4';
    const S = SV.normalize(JSON.parse(JSON.stringify(d)), NOW);
    assert.strictEqual(S.active, 1);   // 3-6 S5: '2' is not an integer -> best sword (id 1, lv 9)
    assert.strictEqual(S.anvilEq, 4);
    d.anvilEq = { id: 4 };
    assert.strictEqual(SV.normalize(JSON.parse(JSON.stringify(d)), NOW).anvilEq, null);
  });
  test('corrupt v2 is backed up before it can be overwritten', () => {
    const st = memStorage({ [C.SAVE_KEY]: '{broken' });
    const r = SV.load(st, NOW);
    assert.strictEqual(r.source, 'corrupt');
    assert.strictEqual(r.backedUp, true);
    assert.strictEqual(st.dump[SV.CORRUPT_BACKUP_KEY], '{broken');
    assert.strictEqual(SV.CORRUPT_BACKUP_KEY, C.SAVE_KEY + '-corrupt');
  });
});

// ============================================================ M1 QA 수정 2차 회귀
/** setItem 호출을 기록하는 메모리 저장소 */
function countingStorage(init) {
  const st = memStorage(init);
  const writes = [];
  const setItem = st.setItem;
  st.setItem = (k, v) => { writes.push(k); setItem(k, v); };
  st.writes = writes;
  return st;
}

describe('AC 34: read-only SV.peek returns { state, corrupt, raw }', () => {
  const NO_SAVE = { state: null, corrupt: false };
  test('valid v2 → { state (normalized), corrupt:false }, no writes', () => {
    const st = countingStorage();
    SV.save(st, Object.assign(fresh(), { gold: 1234 }), NOW);
    st.writes.length = 0;
    const r = SV.peek(st, NOW + MIN);
    assert.deepStrictEqual(Object.keys(r).sort(), ['corrupt', 'state']);
    assert.strictEqual(r.corrupt, false);
    assert.strictEqual(r.state.gold, 1234);
    assert.strictEqual(r.state.idle.lastSeen, NOW);
    assert.deepStrictEqual(st.writes, []);
  });
  test('corrupt v2 → { state:null, corrupt:true, raw } and the backup key is not written', () => {
    for (const raw of ['{broken', '[]', '5', 'null', ' ']) {
      const st = countingStorage({ [C.SAVE_KEY]: raw });
      assert.deepStrictEqual(SV.peek(st, NOW), { state: null, corrupt: true, raw }, raw);
      assert.deepStrictEqual(st.writes, [], raw);
    }
  });
  test('missing or empty-string v2 → { state:null, corrupt:false }; v1 is not migrated', () => {
    const st = countingStorage({ [C.SAVE_KEY_V1]: JSON.stringify({ gold: 5, level: 3 }) });
    assert.deepStrictEqual(SV.peek(st, NOW), NO_SAVE);
    assert.deepStrictEqual(st.writes, []);
    assert.deepStrictEqual(SV.peek(memStorage(), NOW), NO_SAVE);
    assert.deepStrictEqual(SV.peek(memStorage({ [C.SAVE_KEY]: '' }), NOW), NO_SAVE);
  });
  test('REQ-031: a throwing getItem is reported as readFailed, not as "no save"', () => {
    assert.deepStrictEqual(SV.peek({ getItem() { throw new Error('denied'); } }, NOW), { state: null, corrupt: false, readFailed: true });
  });
  test('REQ-031: load still starts a new game when the v2 read throws (start behavior unchanged)', () => {
    const r = SV.load({ getItem() { throw new Error('denied'); }, setItem() {} }, NOW);
    assert.strictEqual(r.source, 'new');
  });
});

describe('fix round 2: corrupt save bookkeeping', () => {
  test('reloading the same corrupt v2 does not write the backup a second time', () => {
    const st = countingStorage({ [C.SAVE_KEY]: '{broken' });
    SV.load(st, NOW);
    const r = SV.load(st, NOW + 1);
    assert.deepStrictEqual(st.writes, [SV.CORRUPT_BACKUP_KEY]);
    assert.strictEqual(r.backedUp, true);
    assert.strictEqual(r.keptAt, SV.CORRUPT_BACKUP_KEY);
  });
  test('failed backup → keptAt null', () => {
    const st = { getItem: k => (k === C.SAVE_KEY ? '{broken' : null), setItem() { throw new Error('quota'); } };
    assert.strictEqual(SV.load(st, NOW).keptAt, null);
  });
  test('corrupt v1 → original stays at the v1 key (keptAt), nothing written', () => {
    const st = countingStorage({ [C.SAVE_KEY_V1]: '{gold:' });
    const r = SV.load(st, NOW);
    assert.strictEqual(r.source, 'corrupt');
    assert.strictEqual(r.keptAt, C.SAVE_KEY_V1);
    assert.deepStrictEqual(st.writes, []);
    assert.strictEqual(st.dump[C.SAVE_KEY_V1], '{gold:');
    assert.strictEqual(r.earlierBackupAt, null);
  });
});

describe('AC 18: corrupt v2 backup key is write-once', () => {
  test('empty backup key → written, keptAt = backup key, no earlier backup', () => {
    const st = countingStorage({ [C.SAVE_KEY]: 'AAA' });
    const r = SV.load(st, NOW);
    assert.deepStrictEqual(st.writes, [SV.CORRUPT_BACKUP_KEY]);
    assert.strictEqual(r.keptAt, SV.CORRUPT_BACKUP_KEY);
    assert.strictEqual(r.earlierBackupAt, null);
  });
  test('a different, later corrupt save never overwrites the existing backup', () => {
    const st = countingStorage({ [C.SAVE_KEY]: 'AAA' });
    SV.load(st, NOW);
    st.dump[C.SAVE_KEY] = 'BBB';
    st.writes.length = 0;
    const r = SV.load(st, NOW + 1);
    assert.strictEqual(st.dump[SV.CORRUPT_BACKUP_KEY], 'AAA');
    assert.deepStrictEqual(st.writes, []);
    assert.strictEqual(r.source, 'corrupt');
    assert.strictEqual(r.backedUp, false);
    assert.strictEqual(r.keptAt, null, 'this corrupt original is not kept anywhere');
    assert.strictEqual(r.earlierBackupAt, SV.CORRUPT_BACKUP_KEY);
  });
  test('a pre-existing backup from outside this session is also preserved', () => {
    const st = countingStorage({ [C.SAVE_KEY]: '{broken', [SV.CORRUPT_BACKUP_KEY]: 'older' });
    const r = SV.load(st, NOW);
    assert.strictEqual(st.dump[SV.CORRUPT_BACKUP_KEY], 'older');
    assert.deepStrictEqual(st.writes, []);
    assert.strictEqual(r.earlierBackupAt, SV.CORRUPT_BACKUP_KEY);
  });
  test('an empty-string backup counts as empty and is filled', () => {
    const st = memStorage({ [C.SAVE_KEY]: '{broken', [SV.CORRUPT_BACKUP_KEY]: '' });
    const r = SV.load(st, NOW);
    assert.strictEqual(st.dump[SV.CORRUPT_BACKUP_KEY], '{broken');
    assert.strictEqual(r.keptAt, SV.CORRUPT_BACKUP_KEY);
  });
  test('failed backup write → keptAt null and no earlier backup claimed', () => {
    const st = { getItem: k => (k === C.SAVE_KEY ? '{broken' : null), setItem() { throw new Error('quota'); } };
    const r = SV.load(st, NOW);
    assert.strictEqual(r.backedUp, false);
    assert.strictEqual(r.earlierBackupAt, null);
  });
});

describe('fix round 2: tray cap note when bless and anvil are both capped', () => {
  const capped = (lv, pity, use) => {
    const S = stateWith({ sword: { lv, pity }, inv: { bless: 1 }, use, top: { gold: 1e9 } });
    S.anvils = [{ id: 1, g: 3, dura: 50 }];
    S.anvilEq = 1;
    return S;
  };
  test('+15 pity 10 with bless + anvil_3: each alone is redundant, together they matter → partial', () => {
    const S = capped(15, 10, { bless: true, anvil: true });
    assert.deepStrictEqual([R.bonusWasted(S, 'bless'), R.bonusWasted(S, 'anvil')], [true, true]);
    const opts = { bless: true, anvilGrade: 3 };
    const sw15 = R.activeSword(S);
    assert.ok(R.chances(sw15, { bless: false, anvilGrade: 0 }).succ < R.chances(sw15, opts).succ, 'turning both off lowers the rate');
    assert.deepStrictEqual([R.bonusCapNote(S, 'bless'), R.bonusCapNote(S, 'anvil')], ['partial', 'partial']);
  });
  test('only one redundant bonus → wasted for it, null for the other', () => {
    const S = capped(12, 4, { bless: true, anvil: true });
    assert.deepStrictEqual([R.bonusCapNote(S, 'anvil'), R.bonusCapNote(S, 'bless')], ['wasted', null]);
  });
  test('+0 (base above ceiling): bless wasted, anvil not usable below its level → wasted / null', () => {
    const S = capped(0, 0, { bless: true, anvil: true });
    assert.deepStrictEqual([R.bonusCapNote(S, 'bless'), R.bonusCapNote(S, 'anvil')], ['wasted', null]);
  });
  test('non-bonus and off toggles → null', () => {
    const S = capped(15, 10, { bless: false, protect: true });
    assert.deepStrictEqual(['bless', 'protect', 'keepdown', 'constructor'].map(id => R.bonusCapNote(S, id)), [null, null, null, null]);
  });
});

// ============================================================ 테스트 페이지 설정 (test.html: js/test-mode.js)
/** test.html과 같은 순서로 테스트 설정 + 규칙 모듈을 새 VM 문맥에 올린다(이 프로세스의 실제 설정과 분리) */
function loadTestModeSG() {
  const ctx = { console, Math, Date, JSON, Object, Array, Number, String, Set, Map, Error };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['test-mode.js', 'constants.js', 'events.js', 'rules.js', 'forge.js', 'idle.js', 'quests.js', 'save.js', 'rebirth.js']
    .forEach(f => vm.runInContext(fs.readFileSync(js(f), 'utf8'), ctx, { filename: f }));
  return ctx.SG;
}
/** getItem 호출 키까지 기록하는 메모리 저장소 */
function recordingStorage(init) {
  const st = countingStorage(init);
  st.reads = [];
  const getItem = st.getItem;
  st.getItem = k => { st.reads.push(k); return getItem(k); };
  return st;
}
const REAL_KEYS = ['sword-enhance-v2', 'sword-enhance-v1', 'sword-enhance-v2-corrupt'];
const realSaves = () => ({
  'sword-enhance-v2': JSON.stringify(Object.assign(fresh(), { gold: 4242 })),
  'sword-enhance-v1': JSON.stringify({ gold: 5000, level: 7 }),
  'sword-enhance-v2-corrupt': '{old',
});

describe('test page config: forced success', () => {
  const T = loadTestModeSG();
  const PITY_SAMPLES = [0, 3, 50];
  const eachCombo = fn => {
    for (let lv = 0; lv < C.MAX; lv++) {
      for (const bless of [false, true]) {
        for (let anvilGrade = 0; anvilGrade < C.ANVIL_BONUS.length; anvilGrade++) {
          for (const pity of PITY_SAMPLES) {
            for (const sure of [false, true]) fn({ lv, pity }, { bless, anvilGrade, sure });
          }
        }
      }
    }
  };
  test('every level/band, with and without bless/anvil/pity/sure → succ 100, dest 0, fail 0', () => {
    let n = 0;
    eachCombo((sw, opts) => {
      const ch = T.rules.chances(sw, opts);
      assert.deepStrictEqual([ch.succ, ch.dest, ch.fail], [100, 0, 0], JSON.stringify([sw, opts]));
      n++;
    });
    assert.strictEqual(n, C.MAX * 2 * C.ANVIL_BONUS.length * PITY_SAMPLES.length * 2);
  });
  test('+20 stays not enhanceable', () => {
    assert.strictEqual(T.rules.chances({ lv: C.MAX, pity: 0 }).succ, 0);
  });
  test('attemptEnhance with the worst roll succeeds from every level up to +20 (bless/anvil/protect on)', () => {
    const S = T.save.defaultState(NOW);
    S.gold = 1e12;
    S.inv.bless = 50; S.inv.protect = 99; S.inv.keepdown = 50;
    S.anvils = [{ id: 1, g: 3, dura: 50 }]; S.anvilEq = 1;
    for (let lv = 0; lv < C.MAX; lv++) {
      S.use.bless = true; S.use.protect = true; S.use.anvil = true; S.use.keepdown = true;
      const r = T.rules.attemptEnhance(S, ROLL_HIGH);
      assert.strictEqual(r.outcome, 'success', `+${lv}`);
      assert.strictEqual(r.to, lv + 1);
    }
    assert.strictEqual(S.stats.destroy + S.stats.fail, 0);
    assert.strictEqual(S.best, C.MAX);
  });
  test('toggling config.forceSuccess off at runtime restores the normal table', () => {
    T.config.forceSuccess = false;
    try {
      for (let lv = 0; lv < C.MAX; lv++) {
        const ch = T.rules.chances({ lv, pity: 0 }, {});
        assert.deepStrictEqual([ch.succ, ch.dest], [C.RATE[lv], C.DESTROY[lv]], `+${lv}`);
      }
    } finally {
      T.config.forceSuccess = true;
    }
    assert.strictEqual(T.rules.chances({ lv: 19, pity: 0 }).succ, 100);
  });
  const sureOnState = sure => {
    const S = T.save.defaultState(NOW);
    S.gold = 1e9;
    S.inv.sure = sure;
    assert.ok(T.rules.setUse(S, 'sure', true).ok);
    return S;
  };
  test('forced attempt with the sure toggle on keeps the ticket and the toggle (last ticket too)', () => {
    const S = sureOnState(1);
    for (let n = 0; n < 3; n++) {
      const r = T.rules.attemptEnhance(S, ROLL_HIGH);
      assert.strictEqual(r.outcome, 'success');
      assert.ok(r.chances.forced);
      assert.ok(!r.ranOut.includes('sure'));
    }
    assert.deepStrictEqual([S.inv.sure, S.use.sure, T.rules.trayState(S).sure.on], [1, true, true]);
  });
  test('with config.forceSuccess off at runtime the sure ticket is consumed by 1', () => {
    const S = sureOnState(2);
    T.config.forceSuccess = false;
    try {
      const r = T.rules.attemptEnhance(S, ROLL_HIGH);
      assert.strictEqual(r.outcome, 'success');
      assert.ok(r.chances.sure && !r.chances.forced);
    } finally {
      T.config.forceSuccess = true;
    }
    assert.deepStrictEqual([S.inv.sure, S.use.sure], [1, true]);
  });
});

describe('real config is unchanged', () => {
  test('main.js: useSure sound is skipped for forced attempts', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
    assert.ok(src.includes("if (r.used.sure && !r.chances.forced) sfx('useSure')"));
  });
  test('defaults: forceSuccess off, real save keys', () => {
    assert.strictEqual(globalThis.SG.config.forceSuccess, false);
    assert.strictEqual(C.SAVE_KEY, 'sword-enhance-v2');
    assert.strictEqual(C.SAVE_KEY_V1, 'sword-enhance-v1');
    assert.strictEqual(SV.CORRUPT_BACKUP_KEY, 'sword-enhance-v2-corrupt');
  });
  test('chances without bonuses = RATE / DESTROY table at every level', () => {
    for (let lv = 0; lv < C.MAX; lv++) {
      const ch = R.chances({ lv, pity: 0 }, {});
      assert.deepStrictEqual([ch.succ, ch.dest, ch.fail], [C.RATE[lv], C.DESTROY[lv], 100 - C.RATE[lv] - C.DESTROY[lv]], `+${lv}`);
      assert.ok(!ch.forced);
    }
  });
  test('worst roll still fails/destroys in the real game', () => {
    assert.strictEqual(R.attemptEnhance(stateWith({ top: { gold: 1e9 } }), ROLL_HIGH).outcome, 'fail');
  });
  test('the last sure ticket is consumed by 1 and its toggle turns off in the real game', () => {
    const S = stateWith({ sword: { lv: 5 }, inv: { sure: 1 }, top: { gold: 1e9 } });
    assert.ok(R.setUse(S, 'sure', true).ok);
    const r = R.attemptEnhance(S, ROLL_HIGH);
    assert.ok(r.chances.sure && !r.chances.forced);
    assert.deepStrictEqual([S.inv.sure, S.use.sure, r.ranOut.includes('sure')], [0, false, true]);
  });
});

describe('test page config: separate save keys', () => {
  const T = loadTestModeSG();
  test('test save key, no v1 key, backup key derived from the test key', () => {
    assert.strictEqual(T.C.SAVE_KEY, 'sword-enhance-test');
    assert.strictEqual(T.C.SAVE_KEY_V1, null);
    assert.strictEqual(T.save.CORRUPT_BACKUP_KEY, 'sword-enhance-test-corrupt');
    REAL_KEYS.forEach(k => assert.ok(![T.C.SAVE_KEY, T.save.CORRUPT_BACKUP_KEY].includes(k), k));
  });
  test('load with only real saves present: new game, reads only the test key, writes nothing', () => {
    const st = recordingStorage(realSaves());
    const r = T.save.load(st, NOW);
    assert.strictEqual(r.source, 'new');
    assert.strictEqual(r.state.gold, C.START_GOLD);
    assert.deepStrictEqual(st.reads, ['sword-enhance-test']);
    assert.deepStrictEqual(st.writes, []);
  });
  test('save writes only the test key; real saves stay byte-identical', () => {
    const before = realSaves();
    const st = countingStorage(realSaves());
    T.save.save(st, T.save.defaultState(NOW), NOW);
    assert.deepStrictEqual(st.writes, ['sword-enhance-test']);
    REAL_KEYS.forEach(k => assert.strictEqual(st.dump[k], before[k], k));
  });
  test('corrupt test save is backed up to the test backup key only', () => {
    const before = realSaves();
    const st = countingStorage(Object.assign(realSaves(), { 'sword-enhance-test': '{broken' }));
    const r = T.save.load(st, NOW);
    assert.strictEqual(r.source, 'corrupt');
    assert.strictEqual(r.keptAt, 'sword-enhance-test-corrupt');
    assert.deepStrictEqual(st.writes, ['sword-enhance-test-corrupt']);
    REAL_KEYS.forEach(k => assert.strictEqual(st.dump[k], before[k], k));
  });
  test('the real config never reads the test key', () => {
    const st = recordingStorage({ 'sword-enhance-test': JSON.stringify(Object.assign(fresh(), { gold: 999999 })) });
    const r = SV.load(st, NOW);
    assert.strictEqual(r.source, 'new');
    assert.ok(!st.reads.includes('sword-enhance-test'));
  });
});

// ============================================================ M1.1 천장 게이지 + 성공 숙련 (m1.1-late-correction §12)
describe('M1.1 ceiling gauge and stage mastery', () => {
  const RICH = 1e12;
  const lateState = (lv, extra = {}) => {
    const S = stateWith({ sword: Object.assign({ lv }, extra.sword), inv: extra.inv, use: extra.use, top: { gold: RICH } });
    if (extra.gauge) S.gauge = extra.gauge.slice();
    if (extra.mastery) S.mastery = extra.mastery.slice();
    if (extra.anvil) { S.anvils = [{ id: 1, g: extra.anvil, dura: C.ANVIL_DURA[extra.anvil] }]; S.anvilEq = 1; S.nextAnvilId = 2; }
    return S;
  };
  const destroyRoll = S => rollDestroy(R.currentChances(S));
  const triple = c => [c.succ, c.dest, c.fail];

  test('constants: per-stage arrays and REC_MAX = ceil(MAX/STEP) = [4,4,4,3,2]', () => {
    assert.deepStrictEqual([C.GAUGE_FROM, C.GAUGE_TO, C.MASTERY_FROM, C.MASTERY_TO], [15, 19, 15, 19]);
    assert.deepStrictEqual(C.GAUGE_N, [4, 5, 6, 8, 10]);
    assert.deepStrictEqual(C.MASTERY_STEP, [3, 3, 3, 4, 5]);
    assert.deepStrictEqual(C.MASTERY_MAX, [12, 12, 12, 12, 10]);
    assert.deepStrictEqual(C.MASTERY_REC_MAX, [4, 4, 4, 3, 2]);
    assert.deepStrictEqual([C.BONUS_CAP, C.PITY_STEP, C.PITY_MAX, C.SUCC_CEIL], [[20, 20, 14, 14], [1, 1, 2, 2], [5, 6, 8, 10], 90]);
  });

  // AC 1
  test('AC1: +16 drop, protected destroy and destroy each add 1 to gauge[1]; at 5 chances are 100/0/0', () => {
    const S = lateState(16, { inv: { protect: 99 } });
    R.attemptEnhance(S, ROLL_HIGH);                                   // drop +16 → +15
    assert.deepStrictEqual([S.swords[0].lv, S.gauge[1]], [15, 1]);
    S.swords[0].lv = 16;
    assert.ok(R.setUse(S, 'protect', true).ok);
    assert.strictEqual(R.attemptEnhance(S, destroyRoll(S)).outcome, 'protected');
    assert.strictEqual(S.gauge[1], 2);
    R.setUse(S, 'protect', false);
    assert.strictEqual(R.attemptEnhance(S, destroyRoll(S)).outcome, 'destroy');
    assert.strictEqual(S.gauge[1], 3);
    assert.deepStrictEqual(S.gauge, [0, 3, 0, 0, 0]);
    S.gauge[1] = 5;
    assert.deepStrictEqual(triple(R.chances({ lv: 16, pity: 0 }, { gaugeFull: true })), [100, 0, 0]);
    S.swords[0].lv = 16;
    assert.ok(R.setActive(S, S.swords[0].id).ok);                   // destroy leaves no active sword (3-6)
    const c = R.currentChances(S);
    assert.deepStrictEqual(triple(c), [100, 0, 0]);
    assert.strictEqual(c.gaugeFull, true);
  });
  test('AC1: gauge is keyed on the attempt start level and clamps at GAUGE_N', () => {
    const S = lateState(16, { gauge: [0, 4, 0, 0, 0] });
    R.attemptEnhance(S, ROLL_HIGH);                                   // +16 → +15: counts for +16
    assert.deepStrictEqual(S.gauge, [0, 5, 0, 0, 0]);
    R.attemptEnhance(S, ROLL_HIGH);                                   // +15 → +14: counts for +15
    assert.deepStrictEqual(S.gauge, [1, 5, 0, 0, 0]);
  });
  test('gaugeFull flag is ignored outside +15..+19; sure keeps priority', () => {
    for (const lv of [0, 9, 14]) assert.strictEqual(R.chances({ lv, pity: 0 }, { gaugeFull: true }).succ, C.RATE[lv]);
    assert.ok(R.chances({ lv: 9, pity: 0 }, { gaugeFull: true, sure: true }).sure);
  });

  // AC 2
  test('AC2: full gauge locks bless/anvil/protect/keepdown/sure with reason gaugeFull', () => {
    const S = lateState(17, { gauge: [0, 0, 6, 0, 0], inv: { bless: 5, protect: 20, keepdown: 5, sure: 5 }, anvil: 3 });
    const tray = R.trayState(S);
    C.TRAY_TOGGLES.forEach(id => assert.deepStrictEqual(tray[id], { on: false, block: 'gaugeFull' }, id));
    assert.strictEqual(R.setUse(S, 'bless', true).reason, 'gaugeFull');
    assert.ok(R.setUse(S, 'bless', false).ok, 'switching off is always allowed');
  });
  test('AC2: guaranteed attempt consumes nothing but cost(l), keeps saved use flags and succeeds on the worst roll', () => {
    const S = lateState(17, { gauge: [0, 0, 5, 0, 0], inv: { bless: 5, protect: 20 }, anvil: 3, sword: { prot: 1, pity: 3 } });
    ['bless', 'anvil', 'protect'].forEach(id => assert.ok(R.setUse(S, id, true).ok, id));
    R.attemptEnhance(S, ROLL_HIGH);                                   // fail → gauge 6/6 (full)
    assert.strictEqual(S.gauge[2], 6);
    S.swords[0].lv = 17;
    const use = Object.assign({}, S.use);
    const before = { gold: S.gold, bless: S.inv.bless, protect: S.inv.protect, dura: S.anvils[0].dura, prot: S.swords[0].prot };
    const r = R.attemptEnhance(S, ROLL_HIGH);
    assert.strictEqual(r.outcome, 'success');
    assert.ok(r.chances.gaugeFull);
    assert.strictEqual(S.gold, before.gold - R.cost(17));
    assert.deepStrictEqual([S.inv.bless, S.inv.protect, S.anvils[0].dura], [before.bless, before.protect, before.dura]);
    assert.deepStrictEqual(S.use, use);
    assert.deepStrictEqual([S.swords[0].lv, S.swords[0].pity, S.gauge[2]], [18, 0, 0]);
    assert.ok(Object.values(r.used).every(v => v === false), 'no toggle applied');
  });
  test('AC2: a full gauge also makes bonusWasted / cap notes inert', () => {
    const S = lateState(15, { gauge: [4, 0, 0, 0, 0], inv: { bless: 5 }, use: { bless: true }, anvil: 3 });
    S.use.anvil = true;
    ['bless', 'anvil'].forEach(id => assert.strictEqual(R.bonusCapNote(S, id), null, id));
  });

  // AC 3
  test('AC3: success at l resets only gauge[l-15]', () => {
    const S = lateState(18, { gauge: [3, 4, 5, 7, 9] });
    R.attemptEnhance(S, ROLL_SUCCESS);
    assert.deepStrictEqual(S.gauge, [3, 4, 5, 0, 9]);
  });

  // AC 4
  test('AC4: destroy keeps (and bumps) the gauge, survives reload; a full gauge is not lost by destroy', () => {
    const S = lateState(16, { gauge: [0, 4, 6, 0, 0] });
    assert.strictEqual(R.attemptEnhance(S, destroyRoll(S)).outcome, 'destroy');
    assert.deepStrictEqual(S.gauge, [0, 5, 6, 0, 0]);
    const st = memStorage();
    SV.save(st, S, NOW);
    const T = SV.load(st, NOW).state;
    assert.deepStrictEqual(T.gauge, [0, 5, 6, 0, 0]);
    T.swords[0].lv = 16;                                              // the next sword reaching +16 inherits the full gauge
    assert.strictEqual(T.active, C.NO_ACTIVE_SWORD);                  // destroy leaves no active sword, also after reload (3-6)
    assert.ok(R.setActive(T, T.swords[0].id).ok);
    assert.strictEqual(R.attemptEnhance(T, ROLL_HIGH).outcome, 'success');
    assert.deepStrictEqual(T.gauge, [0, 0, 6, 0, 0]);
  });

  // AC 5
  test('AC5: attempts at +14 and below never touch gauge or mastery', () => {
    for (const lv of [0, 5, 9, 10, 14]) {
      for (const rng of [ROLL_SUCCESS, ROLL_HIGH]) {
        const S = lateState(lv, { gauge: [1, 2, 3, 4, 5], mastery: [1, 1, 1, 1, 1] });
        R.attemptEnhance(S, rng);
        assert.deepStrictEqual([S.gauge, S.mastery], [[1, 2, 3, 4, 5], [1, 1, 1, 1, 1]], `+${lv}`);
      }
      const D = lateState(lv, { gauge: [1, 2, 3, 4, 5] });
      if (C.DESTROY[lv] > 0) R.attemptEnhance(D, destroyRoll(D));
      assert.deepStrictEqual(D.gauge, [1, 2, 3, 4, 5], `destroy +${lv}`);
    }
  });
  test('AC5: +14 → +15 success records nothing (sure tickets cannot reach +15 either)', () => {
    const S = lateState(14);
    R.attemptEnhance(S, ROLL_SUCCESS);
    assert.deepStrictEqual([S.swords[0].lv, S.mastery, S.gauge], [15, [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]);
    const T = lateState(9, { inv: { sure: 1 } });
    R.setUse(T, 'sure', true);
    R.attemptEnhance(T, ROLL_HIGH);
    assert.deepStrictEqual(T.mastery, [0, 0, 0, 0, 0]);
  });

  // AC 6
  test('AC6: natural and gauge-guaranteed successes add mastery; fail/drop/destroy do not', () => {
    const S = lateState(16);
    let r = R.attemptEnhance(S, ROLL_SUCCESS);
    assert.deepStrictEqual(S.mastery, [0, 1, 0, 0, 0]);
    assert.deepStrictEqual(r.mastery, { lv: 16, gained: 3, bonus: 3, count: 1, max: 4 });
    S.swords[0].lv = 16;
    r = R.attemptEnhance(S, ROLL_HIGH);
    assert.strictEqual(r.outcome, 'drop');
    assert.strictEqual(r.mastery, null);
    S.swords[0].lv = 16;
    R.attemptEnhance(S, destroyRoll(S));
    assert.deepStrictEqual(S.mastery, [0, 1, 0, 0, 0]);
    const G = lateState(19, { gauge: [0, 0, 0, 0, 10] });
    r = R.attemptEnhance(G, ROLL_HIGH);
    assert.deepStrictEqual([r.outcome, G.swords[0].lv, G.mastery[4], r.mastery.gained], ['success', 20, 1, 5]);
  });
  test('AC6: gaugeBefore reports the pre-attempt gauge for display', () => {
    const S = lateState(15, { gauge: [2, 0, 0, 0, 0] });
    const r = R.attemptEnhance(S, ROLL_HIGH);
    assert.deepStrictEqual(r.gaugeBefore, { value: 2, n: 4, full: false });
    assert.strictEqual(S.gauge[0], 3);
    assert.strictEqual(R.attemptEnhance(lateState(14), ROLL_HIGH).gaugeBefore, null);
  });

  // AC 7
  test('AC7: mastery[1]=2 at +16 with bless + mithril, pity 0 → 15 + 14 + 6 = 35', () => {
    assert.strictEqual(R.chances({ lv: 16, pity: 0 }, { bless: true, anvilGrade: 3, mastery: 2 }).succ, 35);
    const S = lateState(16, { mastery: [0, 2, 0, 0, 0], inv: { bless: 1 }, use: { bless: true }, anvil: 3 });
    S.use.anvil = true;
    const c = R.currentChances(S);
    assert.deepStrictEqual([c.succ, c.bonus, c.mastery, c.capped], [35, 14, 6, false]);
    assert.strictEqual(c.dest, C.DESTROY[16]);
  });

  // AC 8
  test('AC8: maximum mastery is +12%p (+19: +10%p) and records never exceed REC_MAX', () => {
    C.MASTERY_REC_MAX.forEach((max, i) => {
      const lv = C.MASTERY_FROM + i;
      assert.strictEqual(R.masteryBonus(lv, max), C.MASTERY_MAX[i]);
      assert.strictEqual(R.masteryBonus(lv, max + 5), C.MASTERY_MAX[i]);
      const S = lateState(lv, { mastery: C.MASTERY_REC_MAX });
      const r = R.attemptEnhance(S, ROLL_SUCCESS);
      assert.strictEqual(S.mastery[i], max, `+${lv}`);
      assert.strictEqual(r.mastery, null, 'no record, no toast');
    });
    assert.deepStrictEqual([R.masteryBonus(15, 4), R.masteryBonus(19, 2), R.masteryBonus(14, 4), R.masteryBonus(20, 4)], [12, 10, 0, 0]);
  });

  // AC 9
  test('AC9: mastery[0]=4 at +15 with bless + mithril + max pity → raw 24 capped 14 → 46', () => {
    const c = R.chances({ lv: 15, pity: 10 }, { bless: true, anvilGrade: 3, mastery: 4 });
    assert.deepStrictEqual([c.raw, c.bonus, c.mastery, c.succ], [24, 14, 12, 46]);
  });
  test('AC9: max success table 46/41/36/33/29 never reaches 90', () => {
    const max = C.MASTERY_REC_MAX.map((rec, i) => R.chances({ lv: 15 + i, pity: 0 }, { bless: true, anvilGrade: 3, mastery: rec }).succ);
    assert.deepStrictEqual(max, [46, 41, 36, 33, 29]);
  });
  test('AC9: exhaustive with mastery/gaugeFull: sum 100, dest >= 0, succ <= max(base, ceil), dest never lowered by mastery', () => {
    for (let lv = 0; lv < C.MAX; lv++) for (const bless of [false, true]) for (let g = 0; g <= 3; g++) for (const p of [0, 3, 10]) {
      for (let m = 0; m <= 6; m++) for (const gaugeFull of [false, true]) {
        const c = R.chances({ lv, pity: p }, { bless, anvilGrade: g, mastery: m, gaugeFull });
        const tag = JSON.stringify([lv, bless, g, p, m, gaugeFull]);
        assert.strictEqual(c.succ + c.dest + c.fail, 100, tag);
        assert.ok(c.dest >= 0 && c.fail >= 0, tag);
        if (c.gaugeFull) continue;
        assert.ok(c.succ <= Math.max(C.RATE[lv], C.SUCC_CEIL), tag);
        assert.ok(c.bonus <= C.BONUS_CAP[R.pityBand(lv)], tag);
        assert.strictEqual(c.dest, Math.min(C.DESTROY[lv], 100 - c.succ), tag);
      }
    }
  });

  // AC 10
  test('AC10: mastery and gauge survive destroy and selling', () => {
    const S = lateState(17, { mastery: [2, 1, 0, 0, 0], gauge: [1, 1, 1, 1, 1] });
    R.attemptEnhance(S, destroyRoll(S));
    assert.deepStrictEqual([S.mastery, S.gauge], [[2, 1, 0, 0, 0], [1, 1, 2, 1, 1]]);
    S.swords[0].lv = 18;
    R.sellSword(S, S.swords[0].id);
    assert.deepStrictEqual([S.mastery, S.gauge], [[2, 1, 0, 0, 0], [1, 1, 2, 1, 1]]);
  });

  // AC 11 (+ m1-storage AC 20-21)
  test('AC11: an old v2 save without gauge/mastery loads zeros and keeps other fields', () => {
    const old = fresh();
    delete old.gauge; delete old.mastery;
    old.gold = 4321; old.swords[0].lv = 16; old.best = 16;
    const st = memStorage({ 'sword-enhance-v2': JSON.stringify(old) });
    const { state: S, source } = SV.load(st, NOW);
    assert.strictEqual(source, 'v2');
    assert.deepStrictEqual([S.gauge, S.mastery], [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]);
    assert.deepStrictEqual([S.gold, S.swords[0].lv, S.v], [4321, 16, 2]);
  });
  test('AC11: storage AC21 example gauge=[-1,99,2.7,"a",null,7], mastery="x" → clamped, survives a round trip', () => {
    const S = SV.normalize(Object.assign(fresh(), { gauge: [-1, 99, 2.7, 'a', null, 7], mastery: 'x' }), NOW);
    assert.deepStrictEqual(S.gauge, [0, 5, 2, 0, 0]);
    assert.deepStrictEqual(S.mastery, [0, 0, 0, 0, 0]);
    const st = memStorage();
    SV.save(st, S, NOW);
    assert.deepStrictEqual(SV.load(st, NOW).state.gauge, [0, 5, 2, 0, 0]);
  });
  test('AC11: short / long / huge / fractional / non-array values follow the §5 rules', () => {
    const norm = (gauge, mastery) => SV.normalize(Object.assign(fresh(), { gauge, mastery }), NOW);
    assert.deepStrictEqual(norm([3], [9, 9, 9, 9, 9, 9]).gauge, [3, 0, 0, 0, 0]);
    assert.deepStrictEqual(norm([3], [9, 9, 9, 9, 9, 9]).mastery, [4, 4, 4, 3, 2]);
    assert.deepStrictEqual(norm([1e300, -1e300, '3', 3.99, true], [1.5, -2, {}, [], 2.9]).gauge, [4, 0, 3, 3, 0]);
    assert.deepStrictEqual(norm([0], [1.5, -2, {}, [], 2.9]).mastery, [1, 0, 0, 0, 2]);
    for (const bad of [null, 5, 'abc', {}, { 0: 3, length: 5 }]) {
      const T = norm(bad, bad);
      assert.deepStrictEqual([T.gauge, T.mastery], [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]], JSON.stringify(bad));
    }
  });
  test('new game and v1 migration start with zero gauge/mastery', () => {
    assert.deepStrictEqual([fresh().gauge, fresh().mastery], [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]);
    const M = SV.migrateV1({ level: 16, gold: 10 }, NOW);
    assert.deepStrictEqual([M.gauge, M.mastery], [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]);
  });

  // AC 12
  test('AC12: test-page forced successes leave gauge/mastery alone and never touch the real save', () => {
    const T = loadTestModeSG();
    const S = T.save.defaultState(NOW);
    S.gold = RICH;
    S.swords[0].lv = 15;
    S.gauge = [1, 2, 3, 4, 5];
    S.mastery = [1, 0, 0, 0, 0];
    for (let lv = 15; lv < C.MAX; lv++) {
      const r = T.rules.attemptEnhance(S, ROLL_HIGH);
      assert.deepStrictEqual([r.outcome, r.mastery], ['success', null], `+${lv}`);
    }
    assert.deepStrictEqual([Array.from(S.gauge), Array.from(S.mastery)], [[1, 2, 3, 4, 5], [1, 0, 0, 0, 0]]);
    const real = Object.assign(fresh(), { gauge: [2, 2, 2, 2, 2], mastery: [3, 3, 3, 3, 2] });
    const st = countingStorage({ 'sword-enhance-v2': JSON.stringify(real) });
    T.save.save(st, S, NOW);
    assert.deepStrictEqual(st.writes, ['sword-enhance-test']);
    assert.deepStrictEqual(SV.load(st, NOW).state.gauge, [2, 2, 2, 2, 2]);
    assert.deepStrictEqual(SV.load(st, NOW).state.mastery, [3, 3, 3, 3, 2]);
  });

  // AC 14
  test('AC14: with zero gauge/mastery the injected options give exactly the M1 chances', () => {
    for (let lv = 0; lv < C.MAX; lv++) for (const p of [0, 4, 10]) for (const bless of [false, true]) {
      const S = lateState(lv, { sword: { pity: p }, inv: { bless: 1 }, anvil: 3 });
      S.use.bless = bless;
      S.use.anvil = true;
      const use = R.effectiveUse(S);
      const legacy = R.chances(S.swords[0], { bless: use.bless, anvilGrade: use.anvil ? 3 : 0, sure: use.sure });
      assert.deepStrictEqual(R.currentChances(S), legacy, `+${lv} p${p} bless ${bless}`);
    }
  });
});

// ============================================================ 3-6 보관함 사용성: 활성 없음 상태 / 칸 순서 이동
describe('3-6 no active sword after destroy', () => {
  const NONE = C.NO_ACTIVE_SWORD;
  const two = () => stateWith({ swords: [{ id: 1, lv: 12, prot: 2, pity: 3 }, { id: 2, lv: 7, prot: 2, pity: 0 }], active: 1, top: { gold: 1e7 } });
  const destroyed = () => {
    const S = two();
    assert.strictEqual(R.attemptEnhance(S, rollDestroy(R.currentChances(S))).outcome, 'destroy');
    return S;
  };
  const snap = S => JSON.stringify(S);

  test('activeSword is null when S.active is NO_ACTIVE_SWORD (no fallback to swords[0])', () => {
    const S = two();
    S.active = NONE;
    assert.strictEqual(R.activeSword(S), null);
    assert.strictEqual(NONE, 0);
  });
  test('destroy result reports no new active sword', () => {
    const S = two();
    const r = R.attemptEnhance(S, rollDestroy(R.currentChances(S)));
    assert.deepStrictEqual([r.outcome, r.newActiveId, S.active], ['destroy', NONE, NONE]);
  });
  test('attemptEnhance with no active sword fails noActive and changes nothing (Space spam is harmless)', () => {
    const S = destroyed();
    const before = snap(S);
    for (let i = 0; i < 5; i++) assert.strictEqual(R.attemptEnhance(S, ROLL_SUCCESS).reason, 'noActive');
    assert.strictEqual(snap(S), before);
  });
  test('currentChances and enhanceOpts are null with no active sword', () => {
    const S = destroyed();
    assert.strictEqual(R.currentChances(S), null);
    assert.strictEqual(R.enhanceOpts(S), null);
  });
  test('tray: every toggle blocked with noActive, nothing applied; setUse refuses tray toggles but setSeal still works', () => {
    const S = destroyed();
    Object.assign(S.inv, { bless: 3, protect: 9, keepdown: 2, sure: 1, seal: 1 });
    S.use.bless = true;
    const t = R.trayState(S);
    C.TRAY_TOGGLES.forEach(id => assert.deepStrictEqual(t[id], { on: false, block: 'noActive' }, id));
    assert.ok(C.TRAY_TOGGLES.every(id => R.effectiveUse(S)[id] === false));
    assert.strictEqual(R.setUse(S, 'protect', true).reason, 'noActive');
    assert.ok(R.setSeal(S, true).ok);
    assert.ok(C.TRAY_TOGGLES.every(id => R.bonusWasted(S, id) === false && R.bonusCapNote(S, id) === null));
  });
  test('income stays on topLv: hunt / auto / offline unaffected by having no active sword', () => {
    const S = two();
    const hunt = I.manualHuntGold(S, NOW);
    const auto = I.autoRunGold(S, NOW);
    S.active = NONE;
    assert.deepStrictEqual([R.topLv(S), I.manualHuntGold(S, NOW), I.autoRunGold(S, NOW)], [12, hunt, auto]);
  });
  test('destroying the last sword grants the free +0 but does not activate it', () => {
    const S = stateWith({ sword: { lv: 9 }, top: { gold: 1e6 } });
    const r = R.attemptEnhance(S, rollDestroy(R.currentChances(S)));
    assert.ok(r.freeSword);
    assert.deepStrictEqual([S.swords.length, S.swords[0].lv, S.active], [1, 0, NONE]);
  });
  test('setActive picks a sword from the none state; id 0 is not a sword', () => {
    const S = destroyed();
    assert.strictEqual(R.setActive(S, NONE).reason, 'notFound');
    assert.ok(R.setActive(S, 2).ok);
    assert.strictEqual(R.activeSword(S).id, 2);
  });
  test('selling / delivering the active sword still auto-picks the best sword (unchanged)', () => {
    const S = stateWith({ swords: [{ id: 1, lv: 5, prot: 2, pity: 0 }, { id: 2, lv: 9, prot: 2, pity: 0 }, { id: 3, lv: 3, prot: 2, pity: 0 }], active: 1 });
    assert.ok(R.sellSword(S, 1).ok);
    assert.strictEqual(S.active, 2);
    assert.deepStrictEqual(R.removeSword(S, 2), { freeSword: null, activeId: 3 });
  });
  test('removing a non-active sword while none is active keeps none (no surprise activation)', () => {
    const S = destroyed();
    assert.ok(R.sellSword(S, 2).ok);
    assert.strictEqual(S.active, NONE);
    assert.strictEqual(S.swords.length, 1);                       // last sword sold → free +0, still not active
  });
  test('removeSword with pickNext:false leaves none; default picks the best', () => {
    const S = two();
    assert.deepStrictEqual(R.removeSword(S, 1, { pickNext: false }), { freeSword: null, activeId: NONE });
    const T = two();
    assert.deepStrictEqual(R.removeSword(T, 1), { freeSword: null, activeId: 2 });
  });
  test('quests with no active sword: candidate needs no confirm, delivery keeps none', () => {
    const S = destroyed();
    S.best = 12;
    S.quests.list[1] = { id: 1, tier: 'normal', lv: 7, gold: 100, item: null };
    assert.strictEqual(Q.candidate(S, S.quests.list[1]).id, 2);
    const r = Q.deliver(S, 1, NOW);
    assert.ok(r.ok && r.freeSword);
    assert.strictEqual(S.active, NONE);
  });
  test('save: active 0 persists through save/load and normalize is idempotent', () => {
    const S = destroyed();
    const st = memStorage();
    SV.save(st, S, NOW);
    const T = SV.load(st, NOW).state;
    assert.strictEqual(T.active, NONE);
    assert.deepStrictEqual(SV.normalize(JSON.parse(JSON.stringify(T)), NOW), T);
  });
  test('save: a missing / dangling / malformed active still falls back to the best sword', () => {
    const swords = [{ id: 3, lv: 2, prot: 2, pity: 0 }, { id: 5, lv: 8, prot: 2, pity: 0 }];
    for (const active of [99, -1, '0', null, undefined, 'x', 1e20]) {
      assert.strictEqual(SV.normalize({ swords, active }, NOW).active, 5, String(active));
    }
    assert.strictEqual(SV.normalize({ swords, active: 3 }, NOW).active, 3);
    assert.strictEqual(SV.normalize({ swords, active: 0 }, NOW).active, NONE);
  });
});

describe('3-6 storage slot reorder (moveSword)', () => {
  const ids = S => S.swords.map(s => s.id);
  const four = () => stateWith({
    swords: [1, 2, 3, 4].map(id => ({ id, lv: id, prot: 2, pity: id })), active: 2,
  });
  test('moves a sword forward and backward; toIndex is the slot among the other swords', () => {
    const S = four();
    assert.deepStrictEqual(R.moveSword(S, 1, 2), { ok: true, from: 0, to: 2, moved: true });
    assert.deepStrictEqual(ids(S), [2, 3, 1, 4]);
    assert.deepStrictEqual(R.moveSword(S, 4, 0), { ok: true, from: 3, to: 0, moved: true });
    assert.deepStrictEqual(ids(S), [4, 2, 3, 1]);
  });
  test('out-of-range indexes clamp to the ends; same slot is ok but not moved', () => {
    const S = four();
    R.moveSword(S, 2, 99);
    assert.deepStrictEqual(ids(S), [1, 3, 4, 2]);
    R.moveSword(S, 4, -5);
    assert.deepStrictEqual(ids(S), [4, 1, 3, 2]);
    assert.deepStrictEqual(R.moveSword(S, 3, 2), { ok: true, from: 2, to: 2, moved: false });
    assert.deepStrictEqual(ids(S), [4, 1, 3, 2]);
  });
  test('unknown id / bad index fail without changing the order', () => {
    const S = four();
    assert.strictEqual(R.moveSword(S, 99, 0).reason, 'notFound');
    assert.strictEqual(R.moveSword(S, 1, NaN).reason, 'badIndex');
    assert.deepStrictEqual(ids(S), [1, 2, 3, 4]);
  });
  test('reorder keeps the active sword, sword data and next id unchanged', () => {
    const S = four();
    const before = JSON.stringify(S.swords.slice().sort((a, b) => a.id - b.id));
    R.moveSword(S, 2, 3);
    assert.strictEqual(S.active, 2);
    assert.strictEqual(R.activeSword(S).lv, 2);
    assert.strictEqual(JSON.stringify(S.swords.slice().sort((a, b) => a.id - b.id)), before);
    assert.strictEqual(S.nextSwordId, 100);
  });
  test('the new order persists through save/load', () => {
    const S = four();
    R.moveSword(S, 1, 3);
    const st = memStorage();
    SV.save(st, S, NOW);
    assert.deepStrictEqual(ids(SV.load(st, NOW).state), [2, 3, 4, 1]);
  });
});

// ------------------------------------------------------------ 3-6 QA: array order now matters for tie-breaks
describe('3-6 QA: slot order effects on ties', () => {
  const tied = order => { const S = stateWith({ swords: order.map(id => ({ id, lv: 8, prot: 2, pity: 0 })) }); S.active = C.NO_ACTIVE_SWORD; return S; };
  test('bestSword on equal stages is the first slot, so reordering changes the winner', () => {
    const S = tied([1, 2, 3]);
    assert.strictEqual(R.bestSword(S).id, 1);
    R.moveSword(S, 3, 0);
    assert.strictEqual(R.bestSword(S).id, 3);
  });
  test('selling the active sword auto-picks the first-slot sword among tied bests', () => {
    const S = tied([1, 2, 3]);
    S.swords.push({ id: 4, lv: 3, prot: 2, pity: 0 });
    S.nextSwordId = 5; S.active = 4;
    R.moveSword(S, 3, 0);
    assert.ok(R.sellSword(S, 4).ok);
    assert.strictEqual(S.active, 3);
  });
  test('quest candidate among same-stage swords ignores slot order (inactive first, then smaller id)', () => {
    const S = tied([3, 1, 2]);
    S.active = 1; S.best = C.UNLOCK.quests;
    const quest = { id: 1, tier: 'normal', lv: 8, gold: 10, item: null };
    const before = Q.candidate(S, quest).id;
    R.moveSword(S, 2, 0);
    const after = Q.candidate(S, quest).id;
    assert.strictEqual(before, after);
    assert.strictEqual(after, 2);
  });
  test('sell and bestSword with no active sword do not throw; selling a non-active sword keeps none', () => {
    const S = tied([1, 2]);
    assert.strictEqual(R.activeSword(S), null);
    assert.ok(R.sellSword(S, 2).ok);
    assert.strictEqual(S.active, C.NO_ACTIVE_SWORD);
  });
});

describe('3-6 QA: save normalization of active', () => {
  const loadActive = v => {
    const d = JSON.parse(JSON.stringify(SV.defaultState(NOW)));
    d.swords = [{ id: 1, lv: 2, prot: 2, pity: 0 }, { id: 2, lv: 5, prot: 2, pity: 0 }];
    d.nextSwordId = 3; d.active = v;
    const st = memStorage({ [C.SAVE_KEY]: JSON.stringify(d) });
    return SV.load(st, NOW).state.active;
  };
  test('0 stays none; negative, fractional, string, null, NaN-like and dangling ids fall back to the best sword (id 2)', () => {
    assert.strictEqual(loadActive(0), C.NO_ACTIVE_SWORD);
    for (const v of [-1, 1.5, '0', '2', null, undefined, {}, [], 99, true]) {
      const a = loadActive(v);
      assert.strictEqual(a, 2, 'value ' + JSON.stringify(v) + ' -> ' + a);
    }
  });
  test('a valid id is kept; the key stays sword-enhance-v2', () => {
    assert.strictEqual(loadActive(1), 1);
    assert.strictEqual(C.SAVE_KEY, 'sword-enhance-v2');
  });
});

// ============================================================ 3-3 REQ-012 M1 잔여 개선
describe('REQ-012 #3: empty-string v2 counts as no v2', () => {
  const v1 = { gold: 5000, level: 7, best: 8 };
  test('empty v2 + valid v1 → v1 migrates (not masked as corrupt), no backup written', () => {
    const st = memStorage({ [C.SAVE_KEY]: '', [C.SAVE_KEY_V1]: JSON.stringify(v1) });
    const r = SV.load(st, NOW);
    assert.strictEqual(r.source, 'v1');
    assert.strictEqual(r.state.swords[0].lv, 7);
    assert.strictEqual(SV.CORRUPT_BACKUP_KEY in st.dump, false);
    assert.strictEqual(JSON.parse(st.dump[C.SAVE_KEY]).gold, 5000);
  });
  test('empty v2 alone → new game, no backup', () => {
    const st = memStorage({ [C.SAVE_KEY]: '' });
    const r = SV.load(st, NOW);
    assert.strictEqual(r.source, 'new');
    assert.strictEqual(SV.CORRUPT_BACKUP_KEY in st.dump, false);
  });
  test('whitespace-only v2 is still unreadable → corrupt with backup', () => {
    const st = memStorage({ [C.SAVE_KEY]: ' ' });
    assert.strictEqual(SV.load(st, NOW).source, 'corrupt');
    assert.strictEqual(st.dump[SV.CORRUPT_BACKUP_KEY], ' ');
  });
});

describe('REQ-012 #8: corrupt result keeps one source of truth', () => {
  test('backedUp is true exactly when keptAt is the backup key (written / same / occupied / failed / corrupt v1)', () => {
    const failing = { getItem: k => (k === C.SAVE_KEY ? '{bad' : null), setItem: () => { throw new Error('quota'); } };
    const cases = [
      SV.load(memStorage({ [C.SAVE_KEY]: '{bad' }), NOW),
      SV.load(memStorage({ [C.SAVE_KEY]: '{bad', [SV.CORRUPT_BACKUP_KEY]: '{bad' }), NOW),
      SV.load(memStorage({ [C.SAVE_KEY]: '{bad', [SV.CORRUPT_BACKUP_KEY]: '{old' }), NOW),
      SV.load(failing, NOW),
      SV.load(memStorage({ [C.SAVE_KEY_V1]: '{bad' }), NOW),
    ];
    assert.deepStrictEqual(cases.map(r => [r.backedUp, r.keptAt, r.earlierBackupAt]), [
      [true, SV.CORRUPT_BACKUP_KEY, null],
      [true, SV.CORRUPT_BACKUP_KEY, null],
      [false, null, SV.CORRUPT_BACKUP_KEY],
      [false, null, null],
      [false, C.SAVE_KEY_V1, null],
    ]);
    const CORRUPT_KEYS = ['backedUp', 'earlierBackupAt', 'keptAt', 'source', 'state'];
    // 손상 v2에는 백업 결과와 원문이 더해진다(보호 모드용, 3-4). 손상 v1은 v1 키를 쓰지 않으므로 필요 없다
    cases.slice(0, 4).forEach(r => assert.deepStrictEqual(Object.keys(r).sort(), ['backedUp', 'backup', 'earlierBackupAt', 'keptAt', 'raw', 'source', 'state']));
    assert.deepStrictEqual(cases.map(r => r.backup), ['written', 'same', 'occupied', 'failed', undefined]);
    assert.ok(cases.slice(0, 4).every(r => r.raw === '{bad'));
    assert.deepStrictEqual(Object.keys(cases[4]).sort(), CORRUPT_KEYS);
  });
  test('non-corrupt results are { state, source } only', () => {
    assert.deepStrictEqual(Object.keys(SV.load(memStorage(), NOW)).sort(), ['source', 'state']);
  });
});

describe('REQ-012 #6a: consumables that ran out switch their toggle off', () => {
  test('last bless used → r.ranOut = [bless], toggle off', () => {
    const S = stateWith({ sword: { lv: 3 }, inv: { bless: 1 }, use: { bless: true } });
    const r = R.attemptEnhance(S, ROLL_HIGH);
    assert.deepStrictEqual(r.ranOut, ['bless']);
    assert.strictEqual(S.use.bless, false);
  });
  test('stock left, toggle off, or anvil broke → not reported as ran out', () => {
    const S = stateWith({ sword: { lv: 3 }, inv: { bless: 2 }, use: { bless: true } });
    assert.deepStrictEqual(R.attemptEnhance(S, ROLL_HIGH).ranOut, []);
    const T = stateWith({ sword: { lv: 3 }, inv: { bless: 0 } });
    assert.deepStrictEqual(R.attemptEnhance(T, ROLL_HIGH).ranOut, []);
    const A = stateWith({ sword: { lv: 6 } });
    A.anvils = [{ id: 1, g: 1, dura: 1 }]; A.anvilEq = 1; A.use.anvil = true;
    const ra = R.attemptEnhance(A, ROLL_HIGH);
    assert.ok(ra.anvilBroke && A.use.anvil === false);
    assert.deepStrictEqual(ra.ranOut, []);
  });
  test('the last protects spent on a save → [protect]; seal is never reported (not a tray toggle)', () => {
    const S = stateWith({ sword: { lv: 6 }, inv: { protect: R.protectNeed(6), seal: 0 }, use: { protect: true, seal: true } });
    const r = R.attemptEnhance(S, rollDestroy(R.currentChances(S)));
    assert.strictEqual(r.outcome, 'protected');
    assert.deepStrictEqual(r.ranOut, ['protect']);
  });
  test('cleanupUse returns the ids it switched off for lack of stock', () => {
    const S = stateWith({ inv: { bless: 0, keepdown: 1 }, use: { bless: true, keepdown: true } });
    assert.deepStrictEqual(R.cleanupUse(S), ['bless']);
    assert.deepStrictEqual(R.cleanupUse(S), []);
  });
});

describe('REQ-012 #12-13: derived numbers and setSeal', () => {
  test('setSeal: on needs stock, off always allowed; setUse no longer takes seal', () => {
    const S = fresh();
    assert.strictEqual(R.setSeal(S, true).reason, 'noStock');
    S.inv.seal = 1;
    assert.ok(R.setSeal(S, true).ok && S.use.seal === true);
    assert.ok(R.setSeal(S, false).ok && S.use.seal === false);
    assert.strictEqual(R.setUse(S, 'seal', true).reason, 'notFound');
  });
  test('payoutPreview matches what payWithSeal pays', () => {
    const S = fresh();
    S.inv.seal = 1;
    assert.strictEqual(R.payoutPreview(S, 1001), 1001);
    S.use.seal = true;
    const preview = R.payoutPreview(S, 1001);
    assert.strictEqual(preview, Math.floor(1001 * C.SEAL_MULT));
    assert.strictEqual(R.payWithSeal(S, 1001).gold, preview);
  });
  test('saved use keys = tray toggles + seal', () => {
    assert.deepStrictEqual(Object.keys(fresh().use).sort(), C.TRAY_TOGGLES.concat('seal').sort());
  });
  test('item descriptions are built from the constants', () => {
    assert.ok(C.ITEMS.bless.desc.includes(`+${C.BLESS_BONUS}%p`));
    assert.ok(C.ITEMS.protect.desc.includes(`최대 ${C.PROTECT_USES}회`));
    assert.ok(C.ITEMS.keepdown.desc.startsWith(`+${C.DROP_FROM}~+${C.KEEPDOWN_MAX_LV - 1}`));
    assert.ok(C.ITEMS.sure.desc.startsWith(`+${C.SURE_MAX_TARGET - 1} 이하`));
    assert.strictEqual(C.ITEMS.booster.desc, `${C.BOOSTER_DURATION_MIN}분간 사냥·자동·오프라인 골드 ×${C.BOOSTER_MULT}`);
    assert.ok(C.ITEMS.seal.desc.endsWith(`×${C.SEAL_MULT}`));
  });
  test('upgradeValue is the single source for interval / gold factor / offline cap', () => {
    const S = fresh();
    for (let n = 0; n <= C.UP_MAX; n++) {
      S.idle.up = { speed: n, gold: n, offline: n };
      assert.strictEqual(I.autoInterval(S), I.upgradeValue('speed', n));
      assert.strictEqual(I.goldUpFactor(S), I.upgradeValue('gold', n));
      assert.strictEqual(I.offlineCapH(S), I.upgradeValue('offline', n));
    }
    assert.strictEqual(I.upgradeValue('speed', 0), C.AUTO_CD_MS);
    assert.strictEqual(I.upgradeValue('offline', 0), C.OFFLINE_CAP_H);
  });
  test('MAX_PARTICLES covers the largest single burst (+20 success)', () => {
    assert.ok(C.MAX_PARTICLES >= 40 + C.MAX * 5);
  });
});

describe('REQ-012 #4 #5 #10: tab guard (js/tab-guard.js)', () => {
  const createTabGuard = require(js('tab-guard.js'));
  const KEY = 'save-key';
  const makeGuard = () => {
    const listeners = {};
    const el = () => ({ hidden: true, inert: false, focused: 0, clicks: [], focus() { this.focused++; }, addEventListener(t, f) { this.clicks.push(f); } });
    const area = {};
    const env = { overlay: el(), button: el(), header: el(), main: el(), area, suspends: 0, takeovers: 0 };
    env.guard = createTabGuard({
      win: { addEventListener: (t, f) => { listeners[t] = f; } }, key: KEY, storageArea: area,
      overlay: env.overlay, takeoverButton: env.button, inertEls: [env.header, env.main],
      onSuspend: () => { env.suspends++; }, onTakeOver: () => { env.takeovers++; env.lockedAtTakeover = !env.overlay.hidden || env.guard.isSuspended(); },
    });
    env.storage = e => listeners.storage(e);
    env.locked = () => env.guard.isSuspended() && !env.overlay.hidden && env.header.inert && env.main.inert;
    return env;
  };
  test('starts unlocked; the save key locks, focuses the takeover button and runs onSuspend once', () => {
    const g = makeGuard();
    assert.ok(!g.guard.isSuspended() && g.overlay.hidden && !g.header.inert);
    g.storage({ key: KEY });
    g.storage({ key: KEY });
    assert.ok(g.locked());
    assert.strictEqual(g.suspends, 1);
    assert.strictEqual(g.button.focused, 1);
  });
  test('other keys never lock', () => {
    const g = makeGuard();
    g.storage({ key: 'other', storageArea: g.area });
    assert.ok(!g.guard.isSuspended() && g.overlay.hidden);
  });
  test('clear (key null): locks for our storage or a missing storageArea, ignored for another storage area', () => {
    const other = makeGuard();
    other.storage({ key: null, storageArea: {} });
    assert.ok(!other.guard.isSuspended(), 'sessionStorage.clear() in another tab does not lock');
    const ours = makeGuard();
    ours.storage({ key: null, storageArea: ours.area });
    assert.ok(ours.locked());
    const legacy = makeGuard();
    legacy.storage({ key: null });
    assert.ok(legacy.locked(), 'event without storageArea keeps the old behavior (lock)');
  });
  test('whenActive drops input while suspended; takeover unlocks then calls onTakeOver', () => {
    const g = makeGuard();
    let calls = 0;
    const act = g.guard.whenActive(x => { calls += x; return 'done'; });
    assert.strictEqual(act(2), 'done');
    g.storage({ key: KEY });
    assert.strictEqual(act(5), undefined);
    g.button.clicks[0]();
    assert.ok(!g.guard.isSuspended() && g.overlay.hidden && !g.header.inert && !g.main.inert);
    assert.strictEqual(g.takeovers, 1);
    assert.strictEqual(g.lockedAtTakeover, false, 'onTakeOver runs after the lock is released');
    assert.strictEqual(act(1), 'done');
    assert.strictEqual(calls, 3);
  });
});

// ============================================================ 3-4 저장 안전 (m1-storage AC 30~36)
/** 키별로 setItem을 실패시킬 수 있는 메모리 저장소: failing = Set(키) */
function quotaStorage(init, failing) {
  const st = countingStorage(init);
  const setItem = st.setItem;
  st.setItem = (k, v) => { if (failing.has(k)) throw new Error('QuotaExceededError'); setItem(k, v); };
  return st;
}
const BROKEN = '{broken save';
const BACKUP = SV.CORRUPT_BACKUP_KEY;

describe('AC 35: empty-string v1 is no save (REQ-028)', () => {
  test("v1 '' with v2 missing or '' → new game, no backup, no corrupt result, no writes", () => {
    for (const init of [{ [C.SAVE_KEY_V1]: '' }, { [C.SAVE_KEY]: '', [C.SAVE_KEY_V1]: '' }]) {
      const st = countingStorage(init);
      const r = SV.load(st, NOW);
      assert.strictEqual(r.source, 'new', JSON.stringify(init));
      assert.deepStrictEqual(st.writes, []);
      assert.strictEqual(st.dump[C.SAVE_KEY_V1], '');
    }
  });
  test('non-empty unparsable v1 keeps the old behavior: corrupt, v1 key untouched, no v2 backup', () => {
    const st = countingStorage({ [C.SAVE_KEY_V1]: '{gold:' });
    const r = SV.load(st, NOW);
    assert.strictEqual(r.source, 'corrupt');
    assert.strictEqual(r.keptAt, C.SAVE_KEY_V1);
    assert.deepStrictEqual(st.writes, []);
  });
});

describe('save keeper: single write gate and protected mode (AC 30~33, 36)', () => {
  test('AC 30: corrupt v2 whose backup fails → protected; every save is blocked and the raw stays; lastSeen still advances', () => {
    const st = quotaStorage({ [C.SAVE_KEY]: BROKEN }, new Set([BACKUP]));
    const keeper = SV.createSaveKeeper(st);
    const r = keeper.load(NOW);
    assert.strictEqual(r.source, 'corrupt');
    assert.strictEqual(r.backup, 'failed');
    assert.ok(keeper.isProtected());
    assert.strictEqual(keeper.guardedRaw(), BROKEN);
    st.writes.length = 0;
    const S = r.state;
    assert.strictEqual(keeper.save(S, NOW + MIN), 'blocked');
    assert.strictEqual(S.idle.lastSeen, NOW + MIN, 'memory state stays current for offline settlement');
    assert.strictEqual(keeper.save(S, NOW + 2 * MIN), 'blocked');
    assert.deepStrictEqual(st.writes, []);
    assert.strictEqual(st.dump[C.SAVE_KEY], BROKEN);
    assert.strictEqual(keeper.lastSaveFailed(), false, 'a blocked save is not a failed save');
  });
  test('AC 18: written / same / occupied at load → not protected, saving resumes', () => {
    const cases = [
      [{ [C.SAVE_KEY]: BROKEN }, 'written'],
      [{ [C.SAVE_KEY]: BROKEN, [BACKUP]: BROKEN }, 'same'],
      [{ [C.SAVE_KEY]: BROKEN, [BACKUP]: '{older' }, 'occupied'],
    ];
    for (const [init, backup] of cases) {
      const st = memStorage(init);
      const keeper = SV.createSaveKeeper(st);
      const r = keeper.load(NOW);
      assert.strictEqual(r.backup, backup);
      assert.ok(!keeper.isProtected(), backup);
      assert.strictEqual(keeper.save(r.state, NOW), 'saved');
      assert.strictEqual(JSON.parse(st.dump[C.SAVE_KEY]).v, 2);
      assert.strictEqual(st.dump[BACKUP], init[BACKUP] || BROKEN, 'backup key is write-once');
    }
  });
  test('AC 31: retry that fails keeps protection and storage; retry that succeeds backs up and releases', () => {
    const failing = new Set([BACKUP]);
    const st = quotaStorage({ [C.SAVE_KEY]: BROKEN }, failing);
    const keeper = SV.createSaveKeeper(st);
    const S = keeper.load(NOW).state;
    st.writes.length = 0;
    assert.strictEqual(keeper.retryBackup(), 'failed');
    assert.ok(keeper.isProtected());
    assert.deepStrictEqual([st.dump[C.SAVE_KEY], BACKUP in st.dump], [BROKEN, false]);
    failing.clear();
    assert.strictEqual(keeper.retryBackup(), 'written');
    assert.ok(!keeper.isProtected() && keeper.guardedRaw() === null);
    assert.strictEqual(st.dump[BACKUP], BROKEN);
    assert.strictEqual(keeper.save(S, NOW), 'saved');
    assert.strictEqual(keeper.retryBackup(), null, 'retry outside protected mode does nothing');
  });
  test('AC 32: abandon releases protection so the next save overwrites the raw (backup key untouched)', () => {
    const st = quotaStorage({ [C.SAVE_KEY]: BROKEN }, new Set([BACKUP]));
    const keeper = SV.createSaveKeeper(st);
    const S = keeper.load(NOW).state;
    keeper.abandon();
    assert.ok(!keeper.isProtected());
    assert.strictEqual(keeper.save(S, NOW), 'saved');
    assert.strictEqual(JSON.parse(st.dump[C.SAVE_KEY]).gold, C.START_GOLD);
    assert.strictEqual(BACKUP in st.dump, false);
  });
  test('AC 33: checkStored backs up a newly found corrupt raw once and never returns a state for it', () => {
    const st = countingStorage();
    const keeper = SV.createSaveKeeper(st);
    keeper.load(NOW);
    st.dump[C.SAVE_KEY] = BROKEN;
    st.writes.length = 0;
    assert.deepStrictEqual(keeper.checkStored(NOW), { state: null, backup: 'written' });
    assert.deepStrictEqual(st.writes, [BACKUP], 'backup happens before any save');
    assert.deepStrictEqual(keeper.checkStored(NOW), { state: null, backup: null }, 'the same raw is not handled twice');
    st.dump[C.SAVE_KEY] = '{another';
    assert.deepStrictEqual(keeper.checkStored(NOW), { state: null, backup: 'occupied' });
    assert.strictEqual(st.dump[BACKUP], BROKEN);
    assert.ok(!keeper.isProtected());
  });
  test('AC 33: checkStored with a failing backup enters protected mode; a later valid save in the key ends it', () => {
    const st = quotaStorage({}, new Set([BACKUP]));
    const keeper = SV.createSaveKeeper(st);
    keeper.load(NOW);
    st.dump[C.SAVE_KEY] = BROKEN;
    assert.deepStrictEqual(keeper.checkStored(NOW), { state: null, backup: 'failed' });
    assert.ok(keeper.isProtected());
    assert.strictEqual(keeper.save(fresh(), NOW), 'blocked');
    assert.strictEqual(st.dump[C.SAVE_KEY], BROKEN);
    // 다른 탭이 유효한 저장으로 덮어쓰면 지킬 원문이 저장 키에 없으므로 보호를 끝낸다
    st.dump[C.SAVE_KEY] = JSON.stringify(Object.assign(fresh(), { gold: 999 }));
    const r = keeper.checkStored(NOW);
    assert.strictEqual(r.state.gold, 999);
    assert.ok(!keeper.isProtected());
  });
  test('AC 36: lastSaveFailed follows the last save attempt', () => {
    const failing = new Set([C.SAVE_KEY]);
    const st = quotaStorage({}, failing);
    const keeper = SV.createSaveKeeper(st);
    const S = keeper.load(NOW).state;
    assert.strictEqual(keeper.save(S, NOW), 'failed');
    assert.strictEqual(keeper.save(S, NOW + 1), 'failed');
    assert.ok(keeper.lastSaveFailed());
    failing.clear();
    assert.strictEqual(keeper.save(S, NOW + 2), 'saved');
    assert.ok(!keeper.lastSaveFailed());
  });
});

describe('REQ-031: a failing read does not end protected mode', () => {
  /** getItem을 도중에 실패시킬 수 있는 저장소 */
  function flakyReadStorage(init, failing) {
    const st = quotaStorage(init, failing);
    const getItem = st.getItem;
    st.readFails = false;
    st.getItem = k => { if (st.readFails) throw new Error('SecurityError'); return getItem(k); };
    return st;
  }
  test('checkStored with a throwing read keeps protection, adopts nothing and backs up nothing', () => {
    const st = flakyReadStorage({ [C.SAVE_KEY]: BROKEN }, new Set([BACKUP]));
    const keeper = SV.createSaveKeeper(st);
    keeper.load(NOW);
    assert.ok(keeper.isProtected());
    st.readFails = true;
    assert.deepStrictEqual(keeper.checkStored(NOW), { state: null, backup: null });
    assert.ok(keeper.isProtected(), 'protection kept while the save key cannot be read');
    assert.strictEqual(keeper.guardedRaw(), BROKEN);
    assert.strictEqual(keeper.save(fresh(), NOW), 'blocked');
    assert.strictEqual(st.dump[C.SAVE_KEY], BROKEN);
    // 다시 읽히면 같은 원문이므로 그대로 보호, 유효 저장으로 바뀌었으면 그때 끝낸다
    st.readFails = false;
    assert.deepStrictEqual(keeper.checkStored(NOW), { state: null, backup: null });
    assert.ok(keeper.isProtected());
    st.dump[C.SAVE_KEY] = JSON.stringify(Object.assign(fresh(), { gold: 777 }));
    assert.strictEqual(keeper.checkStored(NOW).state.gold, 777);
    assert.ok(!keeper.isProtected());
  });
  test('a throwing read does not forget an already handled corrupt raw (no second backup attempt)', () => {
    const st = flakyReadStorage({}, new Set());
    const keeper = SV.createSaveKeeper(st);
    keeper.load(NOW);
    st.dump[C.SAVE_KEY] = BROKEN;
    assert.strictEqual(keeper.checkStored(NOW).backup, 'written');
    st.readFails = true;
    keeper.checkStored(NOW);
    st.readFails = false;
    st.writes.length = 0;
    assert.deepStrictEqual(keeper.checkStored(NOW), { state: null, backup: null });
    assert.deepStrictEqual(st.writes, []);
  });
  test('load routes a corrupt start through the same bookkeeping as checkStored (same raw is not handled twice)', () => {
    const st = quotaStorage({ [C.SAVE_KEY]: BROKEN }, new Set());
    const keeper = SV.createSaveKeeper(st);
    assert.strictEqual(keeper.load(NOW).backup, 'written');
    assert.ok(!keeper.isProtected());
    assert.deepStrictEqual(keeper.checkStored(NOW), { state: null, backup: null });
  });
});

// ============================================================ M2-A F14 검 특성 + 골드 사용처 (m2-traits §14, m2-overview §I)
/** 호출 횟수를 세는 rng: 값 배열을 순서대로(마지막 값 반복) */
const countedSeq = (...vals) => { const f = () => vals[Math.min(f.calls++, vals.length - 1)]; f.calls = 0; return f; };
const sword = (id, lv, trait = null, extra = {}) => Object.assign({ id, lv, prot: C.PROTECT_USES, pity: 0, trait }, extra);
const tr = (k, t) => ({ k, t });
/** 모루 장착(토글 ON) 상태의 단일 검 */
function anvilState(lv, trait, dura = C.ANVIL_DURA[3]) {
  const S = stateWith({ swords: [sword(1, lv, trait)], top: { gold: 1e12 } });
  S.anvils = [{ id: 1, g: 3, dura }]; S.anvilEq = 1; S.nextAnvilId = 2;
  assert.ok(R.setUse(S, 'anvil', true).ok);
  return S;
}
const H = l => R.huntReward(l);

describe('M2-A traits: constants (m2-traits §12, m2-overview §E)', () => {
  test('trait tables match the spec and weights sum to 100', () => {
    assert.deepStrictEqual(C.TRAIT_KINDS, ['hunt', 'work', 'trade', 'ore', 'shard', 'anvil']);
    assert.deepStrictEqual(C.TRAIT_KIND_WEIGHT, { hunt: 20, work: 15, trade: 20, ore: 15, shard: 15, anvil: 15 });
    assert.deepStrictEqual(C.TRAIT_KINDS.map(k => C.TRAITS[k].values), [[10, 20, 30], [15, 30, 45], [10, 20, 30], [20, 40, 60], [15, 30, 50], [15, 30, 45]]);
    assert.strictEqual(C.TRAIT_KINDS.reduce((a, k) => a + C.TRAIT_KIND_WEIGHT[k], 0), 100);
    assert.deepStrictEqual([C.TRAIT_TIER_WEIGHT, C.TRAIT_TIER_MAX, C.TRAIT_ROLL_LV], [[70, 25, 5], 3, 5]);
    assert.deepStrictEqual(C.TRAIT_TIER_NAME, ['평범한', '정교한', '완벽한']);
    assert.deepStrictEqual([C.TRAIT_MGMT_UNLOCK_BEST, C.TRAIT_PRICE_ROUND, C.TRAIT_REKIND_MULT, C.TRAIT_TIER_UP_MULT], [13, 100, 80, [200, 500]]);
    assert.deepStrictEqual([C.MONUMENT_FROM, C.MONUMENT_COUNT, C.MONUMENT_MULT], [13, 8, 150]);
    assert.strictEqual(C.MONUMENT_COUNT, C.MAX - C.MONUMENT_FROM + 1);
  });
  test('traitDef / traitValue use own properties only', () => {
    assert.strictEqual(R.traitDef('hunt').name, '약탈자');
    ['constructor', '__proto__', 'toString', 'x', 3, null, undefined, ['hunt']].forEach(k => assert.strictEqual(R.traitDef(k), null, String(k)));
    assert.strictEqual(R.traitValue(sword(1, 9, tr('ore', 3)), 'ore'), 60);
    assert.strictEqual(R.traitValue(sword(1, 9, tr('ore', 3)), 'hunt'), 0);
    assert.strictEqual(R.traitValue(sword(1, 9), 'ore'), 0);
    assert.strictEqual(R.traitValue({ id: 1, lv: 9 }, 'ore'), 0, 'swords without the field read as no trait');
  });
});

describe('M2-A traits: chances never read traits (AC 1-4)', () => {
  const TRAITS = [null, tr('hunt', 1), tr('anvil', 3), tr('trade', 2), tr('shard', 3), tr('work', 1), tr('ore', 2)];
  test('AC1: every chances() field is identical for any trait (all levels, opts, pity)', () => {
    for (let lv = 0; lv <= C.MAX; lv++) {
      for (const opts of [{}, { bless: true, anvilGrade: 3 }, { sure: true }, { gaugeFull: true }, { mastery: 4, bless: true }]) {
        for (const pity of [0, 4, 20]) {
          const base = JSON.stringify(R.chances({ lv, pity, trait: null }, opts));
          TRAITS.forEach(t => assert.strictEqual(JSON.stringify(R.chances({ lv, pity, trait: t }, Object.assign({ trait: t }, opts))), base, `${lv} ${JSON.stringify(t)}`));
        }
      }
    }
  });
  test('AC1: chances() source does not mention trait', () => {
    assert.ok(!/trait/i.test(R.chances.toString()));
  });
  test('AC2: two swords with different traits and the same rng give the same outcome/pity/gauge/mastery/gold (no anvil)', () => {
    for (const roll of [0, 0.1, 0.2, 0.5, 0.9999]) {
      const run = trait => {
        const S = stateWith({ swords: [sword(1, 16, trait, { pity: 2 })], top: { gold: 1e9 } });
        const r = R.attemptEnhance(S, countedSeq(roll));
        return JSON.stringify([r.outcome, r.pity, S.gauge, S.mastery, S.gold, S.shards - (r.shards || 0)]);
      };
      const base = run(null);
      TRAITS.forEach(t => assert.strictEqual(run(t), base, `${roll} ${JSON.stringify(t)}`));
    }
  });
  test('AC3: a full gauge is a guaranteed success with the same gauge/mastery update for any trait', () => {
    const run = trait => {
      const S = stateWith({ swords: [sword(1, 16, trait)], top: { gold: 1e9 } });
      S.gauge = [0, 5, 0, 0, 0];
      const r = R.attemptEnhance(S, () => 0.9999);
      return JSON.stringify([r.outcome, S.gauge, S.mastery]);
    };
    TRAITS.forEach(t => assert.strictEqual(run(t), run(null)));
    assert.ok(run(tr('anvil', 3)).includes('success'));
  });
  test('AC4: attemptEnhance without an anvil-trait roll uses the rng exactly once', () => {
    const cases = [stateWith({ swords: [sword(1, 12)], top: { gold: 1e9 } }),
      stateWith({ swords: [sword(1, 12, tr('hunt', 3))], top: { gold: 1e9 } }),
      anvilState(12, null), anvilState(12, tr('shard', 3))];
    cases.forEach((S, i) => {
      const rng = countedSeq(0.5);
      R.attemptEnhance(S, rng);
      assert.strictEqual(rng.calls, 1, 'case ' + i);
    });
  });
});

describe('M2-A traits: engraving (AC 5-13, 54)', () => {
  test('AC5: +4 → +5 success, then engravePending engraves it (traitRolls +1, listed); +4 swords are not engraved', () => {
    const S = stateWith({ swords: [sword(1, 4), sword(2, 4)], top: { gold: 1e9 } });
    assert.strictEqual(R.attemptEnhance(S, ROLL_SUCCESS).outcome, 'success');
    const out = R.engravePending(S, seq(0, 0));
    assert.deepStrictEqual(out, [{ id: 1, k: 'hunt', t: 1 }]);
    assert.deepStrictEqual([S.swords[0].trait, S.swords[1].trait, S.stats.traitRolls], [tr('hunt', 1), null, 1]);
  });
  test('AC6: weighted boundaries use < (0,0 → hunt 1; .99,.99 → anvil 3; .20,.70 → work 2)', () => {
    const roll = (a, b) => { const S = stateWith({ swords: [sword(1, 5)] }); R.engravePending(S, seq(a, b)); return S.swords[0].trait; };
    assert.deepStrictEqual(roll(0, 0), tr('hunt', 1));
    assert.deepStrictEqual(roll(0.99, 0.99), tr('anvil', 3));
    assert.deepStrictEqual(roll(0.20, 0.70), tr('work', 2));
    assert.deepStrictEqual(roll(0.1999, 0.6999), tr('hunt', 1));
    assert.deepStrictEqual(roll(0.35, 0.95), tr('trade', 3));
  });
  test('AC7/AC54: three pending swords use 6 rng calls in array order (kind, tier) per sword; others untouched', () => {
    const S = stateWith({ swords: [sword(7, 9), sword(2, 3), sword(5, 5), sword(1, 12)] });
    const rng = countedSeq(0, 0, 0.2, 0.7, 0.99, 0.99);
    const out = R.engravePending(S, rng);
    assert.strictEqual(rng.calls, 6);
    assert.deepStrictEqual(out, [{ id: 7, k: 'hunt', t: 1 }, { id: 5, k: 'work', t: 2 }, { id: 1, k: 'anvil', t: 3 }]);
    assert.strictEqual(S.swords[1].trait, null);
    assert.strictEqual(S.stats.traitRolls, 3);
  });
  test('AC8/AC54: engravePending is idempotent (no change, 0 rng calls, empty list)', () => {
    const S = stateWith({ swords: [sword(1, 9, tr('ore', 2)), sword(2, 2)] });
    const rng = countedSeq(0.5);
    assert.deepStrictEqual(R.engravePending(S, rng), []);
    assert.deepStrictEqual([rng.calls, S.swords[0].trait, S.stats.traitRolls], [0, tr('ore', 2), 0]);
  });
  test('AC9: trait normalization of bad saved values (no throw)', () => {
    const cases = [['x', null], [[], null], [{ k: 'constructor', t: 2 }, null], [{ k: '__proto__', t: 2 }, null],
      [{ k: 'hunt', t: 9 }, tr('hunt', 3)], [{ k: 'hunt', t: 0 }, tr('hunt', 1)], [{ k: 'hunt', t: '2' }, tr('hunt', 2)],
      [{ k: 'hunt' }, tr('hunt', 1)], [{ k: 'hunt', t: 2.5 }, tr('hunt', 2)], [{ k: 'hunt', t: 'z' }, tr('hunt', 1)],
      [{ k: 'ore', t: 3, extra: 1 }, tr('ore', 3)], [7, null], [null, null], [{ k: ['hunt'], t: 1 }, null], [undefined, null]];
    cases.forEach(([raw, want]) => {
      const d = fresh(); d.swords = [{ id: 1, lv: 6, prot: 2, pity: 0, trait: raw }];
      const S = SV.normalize(JSON.parse(JSON.stringify(d)), NOW);
      assert.deepStrictEqual(S.swords[0].trait, want, JSON.stringify(raw));
    });
  });
  test('AC10/AC11: an old v2 save (+7, +2, no trait field) loads both as null; boot engraving gives only +7 a trait, gold unchanged', () => {
    const d = fresh(); d.gold = 4321; d.best = 7;
    d.swords = [{ id: 1, lv: 7, prot: 2, pity: 0 }, { id: 2, lv: 2, prot: 2, pity: 0 }]; d.nextSwordId = 3;
    const raw = JSON.stringify(d);
    const S = SV.load(memStorage({ [C.SAVE_KEY]: raw }), NOW).state;
    assert.deepStrictEqual(S.swords.map(s => s.trait), [null, null]);
    assert.deepStrictEqual(SV.load(memStorage({ [C.SAVE_KEY]: raw }), NOW).state, S, 'loading is deterministic');
    const out = R.engravePending(S, seq(0.5, 0.5));
    assert.deepStrictEqual(out.map(e => e.id), [1]);
    assert.deepStrictEqual([S.swords[0].trait, S.swords[1].trait, S.gold], [tr('trade', 1), null, 4321]);
  });
  test('AC12: later successes of an engraved sword do not reroll', () => {
    const S = stateWith({ swords: [sword(1, 5, tr('shard', 2))], top: { gold: 1e9 } });
    R.attemptEnhance(S, ROLL_SUCCESS);
    assert.deepStrictEqual(R.engravePending(S, countedSeq(0)), []);
    assert.deepStrictEqual([S.swords[0].lv, S.swords[0].trait], [6, tr('shard', 2)]);
  });
  test('AC13: bought and free +0 swords have trait null', () => {
    const S = stateWith({ swords: [sword(1, 9, tr('hunt', 1))], top: { gold: 1e9 } });
    assert.strictEqual(R.buySword(S).sword.trait, null);
    assert.strictEqual(fresh().swords[0].trait, null);
    const T = stateWith({ swords: [sword(1, 9, tr('hunt', 1))] });
    assert.strictEqual(R.sellSword(T, 1).freeSword.trait, null);
  });
});

describe('M2-A traits: sword lifecycle (AC 14-22)', () => {
  test('AC14: a kept failure keeps the trait', () => {
    const S = stateWith({ swords: [sword(1, 6, tr('hunt', 2))], top: { gold: 1e9 } });
    assert.strictEqual(R.attemptEnhance(S, ROLL_HIGH).outcome, 'fail');
    assert.deepStrictEqual(S.swords[0].trait, tr('hunt', 2));
  });
  test('AC15: drops keep the trait, and falling below +5 never rerolls', () => {
    const S = stateWith({ swords: [sword(1, 11, tr('work', 3))], top: { gold: 1e9 } });
    assert.strictEqual(R.attemptEnhance(S, ROLL_HIGH).outcome, 'drop');
    assert.deepStrictEqual([S.swords[0].lv, S.swords[0].trait], [10, tr('work', 3)]);
    S.swords[0].lv = 4;
    assert.deepStrictEqual(R.engravePending(S, countedSeq(0)), []);
    assert.deepStrictEqual(S.swords[0].trait, tr('work', 3));
  });
  test('AC16/AC21: destroying the only sword (no protection) gives a free +0 with trait null', () => {
    const S = stateWith({ swords: [sword(1, 12, tr('trade', 3))], top: { gold: 1e9 } });
    const r = R.attemptEnhance(S, rollDestroy(R.currentChances(S)));
    assert.strictEqual(r.outcome, 'destroy');
    assert.deepStrictEqual(S.swords.map(s => [s.lv, s.trait]), [[0, null]]);
  });
  test('AC17: a protected destroy keeps the trait and gives no collector bonus', () => {
    const S = stateWith({ swords: [sword(1, 12, tr('shard', 3))], inv: { protect: 10 }, top: { gold: 1e9 } });
    R.setUse(S, 'protect', true);
    const r = R.attemptEnhance(S, rollDestroy(R.currentChances(S)));
    assert.deepStrictEqual([r.outcome, r.shards, S.shards, S.swords[0].trait], ['protected', undefined, 0, tr('shard', 3)]);
  });
  test('AC18/AC19/AC20: moveSword, setActive and expandSlots keep every trait; income trait unchanged', () => {
    const S = stateWith({ swords: [sword(1, 9, tr('hunt', 3)), sword(2, 4), sword(3, 9, tr('work', 1))], top: { gold: 1e9 } });
    const traits = () => JSON.stringify(S.swords.map(s => [s.id, s.trait]).sort((a, b) => a[0] - b[0]));
    const before = traits();
    const income = () => C.TRAIT_KINDS.map(k => R.incomeTrait(S, k)).join();
    const incomeBefore = income();
    R.moveSword(S, 1, 2);
    assert.deepStrictEqual(R.findSword(S, 1).trait, tr('hunt', 3));
    R.setActive(S, 2);
    assert.strictEqual(income(), incomeBefore);
    R.expandSlots(S);
    assert.strictEqual(traits(), before);
  });
  test('AC21: selling or delivering the last sword gives a free +0 with trait null', () => {
    const S = stateWith({ swords: [sword(1, 7, tr('trade', 1))], top: { best: 10 } });
    S.quests.list[1] = { id: 1, tier: 'normal', lv: 7, gold: 999, item: null };
    const r = Q.deliver(S, 1, NOW, { confirmActive: true });
    assert.strictEqual(r.freeSword.trait, null);
  });
  test('AC22: save → load keeps traits, sinkGold, traitRolls and monuments', () => {
    const S = fresh();
    S.gold = 1e6;
    R.buySword(S);
    S.swords[0].lv = 9; S.swords[0].trait = tr('anvil', 2); S.swords[1].trait = tr('ore', 3);
    S.best = 15; S.stats.sinkGold = 12345; S.stats.traitRolls = 7; S.monuments[2] = 1;
    const st = memStorage();
    SV.save(st, S, NOW + 5);
    const T = SV.load(st, NOW + 10).state;
    assert.deepStrictEqual(T, S);
  });
});

describe('M2-A traits: income traits (AC 23-27a)', () => {
  test('AC23: top sword {hunt,3} → floor(huntReward(10) × 130 / 100); none → old value; non-top hunt has no effect', () => {
    const S = stateWith({ swords: [sword(1, 10, tr('hunt', 3)), sword(2, 6, tr('hunt', 3))] });
    assert.strictEqual(I.manualHuntGold(S, NOW), Math.floor(H(10) * 130 / 100));
    S.swords[0].trait = null;
    assert.strictEqual(I.manualHuntGold(S, NOW), Math.floor(H(10) * 1));
    const r = I.manualHunt(S, NOW, () => 0.9);
    assert.strictEqual(r.gold, H(10));
  });
  test('AC24: booster ×1.5 + {hunt,2} → floor(huntReward × 120 × 1.5 / 100); harvest upgrades do not change manual hunts', () => {
    const S = stateWith({ swords: [sword(1, 13, tr('hunt', 2))] });
    S.idle.boostUntil = NOW + MIN;
    const want = Math.floor(H(13) * 120 * 1.5 / 100);
    assert.strictEqual(I.manualHuntGold(S, NOW), want);
    S.idle.up.gold = 5;
    assert.strictEqual(I.manualHuntGold(S, NOW), want);
  });
  test('AC25: tied top swords {work,1} and {work,3} → max 45% (not summed), order-free; hunt+work apply separately', () => {
    const S = stateWith({ swords: [sword(1, 12, tr('work', 1)), sword(2, 12, tr('work', 3))] });
    S.idle.up.gold = 3; S.idle.boostUntil = NOW + MIN;
    const want = Math.round(R.autoReward(12) * I.goldUpFactor(S) * 1.5 * 145 / 100);
    assert.strictEqual(I.autoRunGold(S, NOW), want);
    S.swords.reverse();
    assert.strictEqual(I.autoRunGold(S, NOW), want);
    S.swords[0].trait = tr('hunt', 2);
    assert.strictEqual(I.autoRunGold(S, NOW), Math.round(R.autoReward(12) * I.goldUpFactor(S) * 1.5 * 115 / 100));
    assert.strictEqual(I.manualHuntGold(S, NOW), Math.floor(H(12) * 120 * 1.5 / 100));
    assert.strictEqual(R.incomeTrait(S, 'work'), 1.15);
    assert.deepStrictEqual(R.incomeSwords(S).map(s => s.id).sort(), [1, 2]);
  });
  test('AC26: offline {work,2} with upgrades and partial booster overlap; non-work top = old formula; removing the top sword recomputes', () => {
    const make = trait => {
      const S = stateWith({ swords: [sword(1, 11, trait), sword(2, 9, tr('work', 3))] });
      S.idle.autoOn = true; S.idle.up.gold = 2; S.idle.lastSeen = NOW - 3 * HOUR; S.idle.boostUntil = NOW - 2 * HOUR;
      return S;
    };
    const S = make(tr('work', 2));
    const r = I.settleOffline(S, NOW);
    const gu = 1 + C.UP_GOLD_STEP * 2;
    assert.strictEqual(r.gold, Math.floor(r.runs * R.autoReward(11) * gu * C.OFFLINE_EFF * r.boostFactor * 130 / 100));
    const T = make(tr('hunt', 3));
    const rt = I.settleOffline(T, NOW);
    assert.strictEqual(rt.gold, Math.floor(rt.runs * R.autoReward(11) * gu * C.OFFLINE_EFF * rt.boostFactor));
    const U = make(null);
    R.sellSword(U, 1);
    assert.strictEqual(R.incomeTraitValue(U, 'work'), 45, 'the remaining top sword now counts');
  });
  test('AC27: {ore,3} rollOre — iron 320% → rng .19 gives 4, .21 gives 3; mithril 80% → .79 gives 1, .81 gives 0; same rng call count', () => {
    const S = stateWith({ swords: [sword(1, 12, tr('ore', 3))] });
    assert.strictEqual(F.rollOre(S, () => 0.19).iron, 4);
    assert.strictEqual(F.rollOre(S, () => 0.21).iron, 3);
    assert.strictEqual(F.rollOre(S, () => 0.79).mithril, 1);
    assert.strictEqual(F.rollOre(S, () => 0.81).mithril, 0);
    const rng = countedSeq(0.5);
    F.rollOre(S, rng);
    assert.strictEqual(rng.calls, 3, 'one call per unlocked ore, as before');
    const low = stateWith({ swords: [sword(1, 6, tr('ore', 3))] });
    assert.deepStrictEqual(Object.keys(F.rollOre(low, () => 0)), ['iron'], 'locked ores stay locked');
    const plain = stateWith({ swords: [sword(1, 12, tr('hunt', 3))] });
    assert.deepStrictEqual(F.rollOre(plain, () => 0.49), { iron: 2, silver: 1, mithril: 1 });
  });
  test('AC27a: expectedOre = floor(runs × rate × (100+v) × eff / 100); no miner = old value; ORE_MAX still caps', () => {
    const S = stateWith({ swords: [sword(1, 12, tr('ore', 2))] });
    const runs = 777;
    const got = F.expectedOre(S, runs, C.OFFLINE_EFF);
    C.ORES.forEach(k => assert.strictEqual(got[k], Math.floor(runs * C.ORE_PER_HUNT[k] * 140 * C.OFFLINE_EFF / 100), k));
    S.swords[0].trait = null;
    C.ORES.forEach(k => assert.strictEqual(F.expectedOre(S, runs, C.OFFLINE_EFF)[k], Math.floor(runs * C.ORE_PER_HUNT[k] * C.OFFLINE_EFF)));
    S.ore.iron = C.ORE_MAX - 3;
    S.swords[0].trait = tr('ore', 3);
    assert.strictEqual(F.addOre(S, F.expectedOre(S, 1e6, C.OFFLINE_EFF)).iron, 3);
    assert.strictEqual(S.ore.iron, C.ORE_MAX);
  });
  // 5-B 표시: 대장간·방치 탭의 "사냥당 +x"는 rollOre가 실제로 주는 양의 평균과 같아야 한다
  test('5-B orePerHunt (display) = exact mean of rollOre over a uniform rng grid, with and without a miner', () => {
    const GRID = 100;
    const meanOre = (S, k) => {
      let total = 0;
      for (let i = 0; i < GRID; i++) total += F.rollOre(S, () => (i + 0.5) / GRID)[k];
      return total / GRID;
    };
    [null, tr('ore', 1), tr('ore', 2), tr('ore', 3), tr('hunt', 3)].forEach(trait => {
      const S = stateWith({ swords: [sword(1, 12, trait)] });
      C.ORES.forEach(k => assert.strictEqual(F.orePerHunt(S, k), meanOre(S, k), `${JSON.stringify(trait)} ${k}`));
    });
    const miner = stateWith({ swords: [sword(1, 12, tr('ore', 3)), sword(2, 4, tr('ore', 1))] });
    assert.deepStrictEqual(C.ORES.map(k => F.orePerHunt(miner, k)), [3.2, 1.6, 0.8], 'only the top sword counts: +60%');
  });
});

describe('M2-A traits: trade traits (AC 28-32)', () => {
  const sellCase = (trait, seal) => {
    const S = stateWith({ swords: [sword(1, 12), sword(2, 9, trait)], inv: { seal: 1 } });
    if (seal) R.setSeal(S, true);
    return S;
  };
  test('AC28: selling a non-active {trade,2} +9 → floor(floor(sell × 120/100) × SEAL_MULT); earned matches; non-trade = old', () => {
    const want = {
      'trade-seal': Math.floor(Math.floor(R.sell(9) * 120 / 100) * C.SEAL_MULT),
      'trade-plain': Math.floor(R.sell(9) * 120 / 100),
      'none-seal': Math.floor(R.sell(9) * C.SEAL_MULT),
      'none-plain': R.sell(9),
    };
    [['trade', tr('trade', 2)], ['none', tr('hunt', 3)]].forEach(([name, trait]) => [true, false].forEach(seal => {
      const S = sellCase(trait, seal);
      const r = R.sellSword(S, 2);
      const key = `${name}-${seal ? 'seal' : 'plain'}`;
      assert.deepStrictEqual([r.gold, S.stats.earned, r.sealed], [want[key], want[key], seal], key);
    }));
  });
  const deliverCase = (trait, seal) => {
    const S = stateWith({ swords: [sword(1, 12), sword(2, 7, trait)], inv: { seal: 1 }, top: { best: 12 } });
    S.quests.list[1] = { id: 4, tier: 'normal', lv: 7, gold: Q.questGold('normal', 7), item: null };
    if (seal) R.setSeal(S, true);
    return S;
  };
  test('AC29: delivering with {trade,1} → floor(floor(gold × 110/100) × SEAL_MULT) or floor(gold × 110/100); stored quest gold unchanged', () => {
    const base = Q.questGold('normal', 7);
    [[tr('trade', 1), true, Math.floor(Math.floor(base * 110 / 100) * C.SEAL_MULT)],
      [tr('trade', 1), false, Math.floor(base * 110 / 100)],
      [null, true, Math.floor(base * C.SEAL_MULT)], [null, false, base]].forEach(([trait, seal, want]) => {
      const S = deliverCase(trait, seal);
      const r = Q.deliver(S, 1, NOW);
      assert.deepStrictEqual([r.gold, r.quest.gold], [want, base], JSON.stringify([trait, seal]));
    });
  });
  test('AC30: candidate order (non-active first, then id) ignores traits; swordId picks a traited sword', () => {
    const S = stateWith({ swords: [sword(1, 7), sword(5, 7, tr('trade', 3)), sword(3, 7)], top: { best: 12 } });
    S.quests.list[1] = { id: 4, tier: 'normal', lv: 7, gold: 1000, item: null };
    assert.strictEqual(Q.candidate(S, S.quests.list[1]).id, 3);
    const r = Q.deliver(S, 1, NOW, { swordId: 5 });
    assert.deepStrictEqual([r.swordId, r.gold], [5, 1300]);
  });
  test('AC30a: payoutPreview(S, amount, sword) equals the actual sell and deliver payout (seal on/off × trade on/off)', () => {
    [tr('trade', 3), null].forEach(trait => [true, false].forEach(seal => {
      const S = sellCase(trait, seal);
      const preview = R.payoutPreview(S, R.sell(9), R.findSword(S, 2));
      assert.strictEqual(R.sellSword(S, 2).gold, preview, JSON.stringify([trait, seal, 'sell']));
      const D = deliverCase(trait, seal);
      const dPreview = R.payoutPreview(D, D.quests.list[1].gold, Q.candidate(D, D.quests.list[1]));
      assert.strictEqual(Q.deliver(D, 1, NOW).gold, dPreview, JSON.stringify([trait, seal, 'deliver']));
    }));
    const S = sellCase(null, true);
    assert.strictEqual(R.payoutPreview(S, 1001), Math.floor(1001 * C.SEAL_MULT), 'old two-argument form unchanged');
  });
  test('AC31: {shard,2} +10 destroyed → floor(shardGain(10) × 130/100) into S.shards and stats; non-collector = shardGain', () => {
    [[tr('shard', 2), Math.floor(R.shardGain(10) * 130 / 100)], [tr('trade', 3), R.shardGain(10)], [null, R.shardGain(10)]].forEach(([trait, want]) => {
      const S = stateWith({ swords: [sword(1, 10, trait), sword(2, 3)], top: { gold: 1e9 } });
      const r = R.attemptEnhance(S, rollDestroy(R.currentChances(S)));
      assert.deepStrictEqual([r.outcome, r.shards, S.shards, S.stats.shardsGained], ['destroy', want, want, want], JSON.stringify(trait));
    });
  });
  test('AC32: shard exchange and quest shard rewards ignore traits', () => {
    const S = stateWith({ swords: [sword(1, 10, tr('shard', 3))], top: { shards: 100 } });
    assert.strictEqual(R.exchangeShards(S, 'protect').cost, C.SHARD_COST.protect);
    assert.strictEqual(S.shards, 100 - C.SHARD_COST.protect);
    const g = Q.grantReward(S, { id: 'shard', n: 12 });
    assert.deepStrictEqual([g.granted, S.shards], [12, 100 - C.SHARD_COST.protect + 12]);
  });
});

describe('M2-A traits: smith (anvil) trait (AC 33-38)', () => {
  test('AC33: {anvil,3} 45% — next rng .40 keeps durability, .50 spends 1', () => {
    const S = anvilState(12, tr('anvil', 3));
    const r = R.attemptEnhance(S, countedSeq(0.9999, 0.40));
    assert.deepStrictEqual([S.anvils[0].dura, r.anvilKept], [C.ANVIL_DURA[3], true]);
    const T = anvilState(12, tr('anvil', 3));
    const rt = R.attemptEnhance(T, countedSeq(0.9999, 0.50));
    assert.deepStrictEqual([T.anvils[0].dura, rt.anvilKept], [C.ANVIL_DURA[3] - 1, undefined]);
  });
  test('AC34: durability 1 — a kept roll does not break the anvil; a failed roll breaks it', () => {
    const S = anvilState(12, tr('anvil', 3), 1);
    const r = R.attemptEnhance(S, countedSeq(0.9999, 0.1));
    assert.deepStrictEqual([S.anvils[0].dura, r.anvilBroke], [1, undefined]);
    const T = anvilState(12, tr('anvil', 3), 1);
    const rt = R.attemptEnhance(T, countedSeq(0.9999, 0.9));
    assert.deepStrictEqual([T.anvils[0].dura, rt.anvilBroke], [0, true]);
  });
  test('AC35: toggle off or no anvil → no smith roll (1 rng call)', () => {
    const S = anvilState(12, tr('anvil', 3));
    R.setUse(S, 'anvil', false);
    const rng = countedSeq(0.9999, 0);
    R.attemptEnhance(S, rng);
    assert.deepStrictEqual([rng.calls, S.anvils[0].dura], [1, C.ANVIL_DURA[3]]);
    const T = stateWith({ swords: [sword(1, 12, tr('anvil', 3))], top: { gold: 1e9 } });
    const rt = countedSeq(0.9999, 0);
    R.attemptEnhance(T, rt);
    assert.strictEqual(rt.calls, 1);
  });
  test('AC36: a guaranteed (full gauge) attempt uses no anvil and no smith roll', () => {
    const S = anvilState(16, tr('anvil', 3));
    S.gauge = [0, 5, 0, 0, 0];
    const rng = countedSeq(0.9999, 0);
    const r = R.attemptEnhance(S, rng);
    assert.deepStrictEqual([r.outcome, rng.calls, S.anvils[0].dura], ['success', 1, C.ANVIL_DURA[3]]);
  });
  test('AC37: test-page forced success still runs the smith roll normally', () => {
    const T = loadTestModeSG();
    const S = T.save.defaultState(NOW);
    S.gold = 1e9; S.best = 12; S.swords[0].lv = 12; S.swords[0].trait = { k: 'anvil', t: 3 };
    S.anvils = [{ id: 1, g: 3, dura: 10 }]; S.anvilEq = 1; S.use.anvil = true;
    const rng = countedSeq(0.9999, 0.1);
    const r = T.rules.attemptEnhance(S, rng);
    assert.deepStrictEqual([r.outcome, rng.calls, S.anvils[0].dura], ['success', 2, 10]);
  });
  test('AC38: a destroyed smith sword (no protection) still gets its roll, read from the removed sword', () => {
    const S = anvilState(12, tr('anvil', 3));
    S.swords.push(sword(2, 3));
    const roll = (R.currentChances(S).succ + R.currentChances(S).dest / 2) / 100;
    const rng = countedSeq(roll, 0.1);
    const r = R.attemptEnhance(S, rng);
    assert.deepStrictEqual([r.outcome, rng.calls, S.anvils[0].dura, r.anvilKept], ['destroy', 2, C.ANVIL_DURA[3], true]);
  });
});

describe('M2-A sinks: trait re-kind / tier up (AC 39-44, overview I.1 I.2 I.9)', () => {
  const rich = (best, trait, extra = {}) => stateWith({ swords: [sword(1, Math.min(best, 12), trait), sword(2, 4, extra.other || null)], top: { best, gold: extra.gold === undefined ? 1e9 : extra.gold } });
  const snapshot = S => JSON.stringify([S.gold, S.swords, S.stats]);
  test('I.1/I.2: prices at best 13 / 15 / 20 and invalid tiers', () => {
    const at = best => Object.assign(fresh(), { best });
    assert.deepStrictEqual([13, 15, 20].map(b => R.traitRekindCost(at(b))), [214100, 732600, 15877000]);
    assert.deepStrictEqual([13, 15, 20].map(b => R.traitTierUpCost(at(b), 1)), [535200, 1831600, 39692400]);
    assert.deepStrictEqual([13, 15, 20].map(b => R.traitTierUpCost(at(b), 2)), [1338000, 4579000, 99231000]);
    [0, 3, 1.5, '1', null, undefined].forEach(t => assert.strictEqual(R.traitTierUpCost(at(15), t), null, String(t)));
  });
  test('AC39/I.9: best 12 → locked with gold, trait and rng unchanged; best 13 → allowed', () => {
    const S = rich(12, tr('hunt', 1));
    const before = snapshot(S);
    const rng = countedSeq(0.5);
    assert.deepStrictEqual([R.rerollKind(S, 1, rng), R.upgradeTier(S, 1)], [{ ok: false, reason: 'locked' }, { ok: false, reason: 'locked' }]);
    assert.deepStrictEqual([snapshot(S), rng.calls], [before, 0]);
    const T = rich(13, tr('hunt', 1));
    assert.ok(R.upgradeTier(T, 1).ok && R.rerollKind(T, 1, () => 0).ok);
  });
  test('AC40: notFound → locked → noTrait → maxTier → noGold, every failure leaves state and rng untouched', () => {
    const cases = [
      [rich(12, null), 99, 'notFound', 'notFound'],
      [rich(12, null), 1, 'locked', 'locked'],
      [rich(13, null), 1, 'noTrait', 'noTrait'],
      [rich(13, tr('hunt', 3), { gold: 0 }), 1, 'noGold', 'maxTier'],
      [rich(13, tr('hunt', 1), { gold: 1000 }), 1, 'noGold', 'noGold'],
    ];
    cases.forEach(([S, id, rekind, tierUp]) => {
      const before = snapshot(S);
      const rng = countedSeq(0.5);
      assert.strictEqual(R.rerollKind(S, id, rng).reason, rekind);
      assert.strictEqual(R.upgradeTier(S, id).reason, tierUp);
      assert.strictEqual(R.rerollKindBlock(S, id), rekind);
      assert.strictEqual(R.upgradeTierBlock(S, id), tierUp);
      assert.deepStrictEqual([snapshot(S), rng.calls], [before, 0], rekind);
    });
  });
  test('AC41: upgradeTier {hunt,1} → t2 for 200H (sinkGold += price, traitRolls unchanged); t2 → t3 for 500H', () => {
    const S = rich(15, tr('hunt', 1));
    const p1 = R.upgradeTier(S, 1);
    assert.deepStrictEqual([p1.price, S.swords[0].trait, S.gold, S.stats.sinkGold, S.stats.traitRolls],
      [Math.round(200 * H(15) / 100) * 100, tr('hunt', 2), 1e9 - p1.price, p1.price, 0]);
    const p2 = R.upgradeTier(S, 1);
    assert.deepStrictEqual([p2.price, S.swords[0].trait, S.stats.sinkGold], [Math.round(500 * H(15) / 100) * 100, tr('hunt', 3), p1.price + p2.price]);
    assert.strictEqual(R.upgradeTier(S, 1).reason, 'maxTier');
  });
  test('AC42: rerollKind {hunt,2} → another kind, tier kept, 80H paid into sinkGold, traitRolls +1, one rng call', () => {
    const S = rich(15, tr('hunt', 2));
    const rng = countedSeq(0.5);
    const r = R.rerollKind(S, 1, rng);
    assert.ok(r.ok);
    assert.notStrictEqual(S.swords[0].trait.k, 'hunt');
    assert.deepStrictEqual([S.swords[0].trait.t, r.price, S.gold, S.stats.sinkGold, S.stats.traitRolls, rng.calls],
      [2, R.traitRekindCost(S), 1e9 - r.price, r.price, 1, 1]);
  });
  test('AC43: rng 0 → first other kind, 0.9999 → last kind; reweighted shares; never the current kind', () => {
    const kindAt = (cur, u) => { const S = rich(13, tr(cur, 1)); R.rerollKind(S, 1, () => u); return S.swords[0].trait.k; };
    assert.strictEqual(kindAt('hunt', 0), 'work');
    assert.strictEqual(kindAt('hunt', 0.9999), 'anvil');
    assert.strictEqual(kindAt('anvil', 0.9999), 'shard');
    const N = 6800;   // every share N × w / (100 − w_cur) is an integer for w ∈ {15, 20}, rest ∈ {80, 85}
    C.TRAIT_KINDS.forEach(cur => {
      const counts = {};
      for (let i = 0; i < N; i++) { const k = kindAt(cur, (i + 0.5) / N); counts[k] = (counts[k] || 0) + 1; }
      assert.ok(!counts[cur], cur);
      const rest = 100 - C.TRAIT_KIND_WEIGHT[cur];
      C.TRAIT_KINDS.filter(k => k !== cur).forEach(k => assert.strictEqual(counts[k], N * C.TRAIT_KIND_WEIGHT[k] / rest, `${cur}→${k}`));
    });
  });
  test('AC44: management works on a non-active, non-top sword', () => {
    const S = rich(14, tr('hunt', 1), { other: tr('ore', 1) });
    assert.strictEqual(S.active, 1);
    assert.ok(R.upgradeTier(S, 2).ok);
    assert.ok(R.rerollKind(S, 2, () => 0).ok);
    assert.deepStrictEqual(S.swords[1].trait, tr('hunt', 2));
  });
  test('I.8: sink purchases never change chances, gauge, mastery or BONUS_CAP', () => {
    const S = rich(16, tr('hunt', 1));
    S.swords[0].lv = 16; S.gauge = [1, 2, 0, 0, 0]; S.mastery = [1, 1, 0, 0, 0];
    const look = () => JSON.stringify([R.currentChances(S), S.gauge, S.mastery, C.BONUS_CAP]);
    const before = look();
    assert.ok(R.upgradeTier(S, 1).ok && R.rerollKind(S, 1, () => 0.3).ok && R.buyMonument(S, 13).ok);
    assert.strictEqual(look(), before);
  });
});

describe('M2-A monuments (overview C.3 M1-M5, I.3 I.4)', () => {
  test('I.3: monumentCost 13 / 15 / 20 and the 13..20 total', () => {
    assert.deepStrictEqual([13, 15, 20].map(R.monumentCost), [401400, 1373700, 29769300]);
    let total = 0;
    for (let L = 13; L <= 20; L++) total += R.monumentCost(L);
    assert.strictEqual(total, 64320100);
  });
  test('M1: buy → {ok, price}, gold −price, monuments[L-13]=1, sinkGold += price', () => {
    const S = Object.assign(fresh(), { best: 15, gold: 2e6 });
    const r = R.buyMonument(S, 15);
    assert.deepStrictEqual(r, { ok: true, price: 1373700 });
    assert.deepStrictEqual([S.gold, S.monuments, S.stats.sinkGold], [2e6 - 1373700, [0, 0, 1, 0, 0, 0, 0, 0], 1373700]);
  });
  test('M2-M5 and check order invalid → owned → notReached → noGold (state unchanged)', () => {
    const S = Object.assign(fresh(), { best: 14, gold: 1000 });
    S.monuments[7] = 1;   // owned +20 above best: kept, and 'owned' is checked before 'notReached'
    const cases = [[12, 'invalid'], [21, 'invalid'], [13.5, 'invalid'], ['13', 'invalid'], [20, 'owned'], [15, 'notReached'], [14, 'noGold']];
    const before = JSON.stringify(S);
    cases.forEach(([L, reason]) => {
      assert.deepStrictEqual(R.buyMonument(S, L), { ok: false, reason }, String(L));
      assert.strictEqual(R.monumentBlock(S, L), reason);
    });
    assert.strictEqual(JSON.stringify(S), before);
  });
});

describe('M2-A save fields (AC 46-48, overview I.5 I.6)', () => {
  test('AC46: new game — trait null, sinkGold 0, traitRolls 0, 8 empty monuments', () => {
    const S = SV.load(memStorage(), NOW).state;
    assert.deepStrictEqual([S.swords[0].trait, S.stats.sinkGold, S.stats.traitRolls, S.monuments], [null, 0, 0, [0, 0, 0, 0, 0, 0, 0, 0]]);
  });
  test('AC47/I.6: sinkGold / traitRolls missing, negative, string or fractional → non-negative integers', () => {
    [[undefined, 0], [-5, 0], ['abc', 0], ['12', 12], [3.7, 3], [null, 0]].forEach(([v, want]) => {
      const d = JSON.parse(JSON.stringify(fresh()));
      d.stats.sinkGold = v; d.stats.traitRolls = v;
      if (v === undefined) { delete d.stats.sinkGold; delete d.stats.traitRolls; }
      const S = SV.normalize(d, NOW);
      assert.deepStrictEqual([S.stats.sinkGold, S.stats.traitRolls], [want, want], String(v));
    });
  });
  test('I.6: an old save without batch-A fields gets defaults, keeps the rest, stays v2 and round-trips', () => {
    const d = JSON.parse(JSON.stringify(fresh()));
    delete d.monuments; delete d.stats.sinkGold; delete d.stats.traitRolls;
    d.swords = [{ id: 1, lv: 8, prot: 1, pity: 2 }]; d.gold = 999; d.best = 8;
    const st = memStorage({ [C.SAVE_KEY]: JSON.stringify(d) });
    const S = SV.load(st, NOW).state;
    assert.deepStrictEqual([S.v, S.gold, S.best, S.swords, S.monuments.length, S.stats.sinkGold],
      [2, 999, 8, [{ id: 1, lv: 8, prot: 1, pity: 2, trait: null }], 8, 0]);
    SV.save(st, S, NOW);
    assert.deepStrictEqual(SV.load(st, NOW).state, S);
  });
  test('I.5: monuments normalization (missing, non-array, short, long, mixed values; L above best kept)', () => {
    const load = m => { const d = JSON.parse(JSON.stringify(fresh())); if (m === undefined) delete d.monuments; else d.monuments = m; return SV.normalize(d, NOW).monuments; };
    const Z = [0, 0, 0, 0, 0, 0, 0, 0];
    assert.deepStrictEqual(load(undefined), Z);
    assert.deepStrictEqual(load('x'), Z);
    assert.deepStrictEqual(load({ 0: 1 }), Z);
    assert.deepStrictEqual(load([1, 0, 1]), [1, 0, 1, 0, 0, 0, 0, 0]);
    assert.deepStrictEqual(load([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), [1, 1, 1, 1, 1, 1, 1, 1]);
    assert.deepStrictEqual(load([2, 0, 'a', null, '', false, true, -1]), [1, 0, 1, 0, 0, 0, 1, 1]);
    const d = JSON.parse(JSON.stringify(fresh())); d.best = 3; d.monuments = [0, 0, 0, 0, 0, 0, 0, 1];
    assert.strictEqual(SV.normalize(d, NOW).monuments[7], 1, 'ownership above best is not corrected');
  });
  test('AC48: a save re-written by an old client (trait fields dropped) loads cleanly and is re-engraved at boot', () => {
    const S = fresh();
    S.swords = [sword(1, 9, tr('work', 3)), sword(2, 1)]; S.nextSwordId = 3; S.best = 9;
    const oldClient = JSON.parse(JSON.stringify(S));
    oldClient.swords.forEach(s => { delete s.trait; });
    delete oldClient.monuments;
    const T = SV.normalize(oldClient, NOW);
    assert.deepStrictEqual(T.swords.map(s => s.trait), [null, null]);
    assert.deepStrictEqual(R.engravePending(T, seq(0.99, 0)).map(e => e.id), [1]);
  });
});

describe('M2-A setTrait test hook (AC 49)', () => {
  test('setTrait sets {trade,3}; bad kind/tier → badTrait, missing sword → notFound, both unchanged', () => {
    const S = stateWith({ swords: [sword(1, 6, tr('hunt', 1))] });
    assert.deepStrictEqual(R.setTrait(S, 1, 'trade', 3), { ok: true });
    assert.deepStrictEqual(S.swords[0].trait, tr('trade', 3));
    [['x', 1], ['constructor', 1], ['hunt', 0], ['hunt', 4], ['hunt', 1.5], ['hunt', '2']].forEach(([k, t]) => {
      assert.deepStrictEqual(R.setTrait(S, 1, k, t), { ok: false, reason: 'badTrait' }, `${k} ${t}`);
    });
    assert.deepStrictEqual(R.setTrait(S, 9, 'hunt', 1), { ok: false, reason: 'notFound' });
    assert.deepStrictEqual(S.swords[0].trait, tr('trade', 3));
  });
  test('index.html and its UI scripts have no setTrait entry point', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(!html.includes('setTrait'));
    ['main.js', 'view.js', 'strip-drag.js', 'tab-guard.js'].forEach(f => assert.ok(!fs.readFileSync(js(f), 'utf8').includes('setTrait'), f));
  });
});

describe('M2-A regression: no traits and no monuments keep every old output and rng sequence', () => {
  test('I.7: M1 numbers unchanged', () => {
    assert.deepStrictEqual([13, 15, 20].map(H), [2676, 9158, 198462]);
    assert.deepStrictEqual([R.autoReward(15), R.boosterPrice(15), R.cost(15), R.sell(15)], [1432, 366300, 14320, 305280]);
    assert.deepStrictEqual([C.SLOT_EXPAND_COST, C.UP_COST_BASE, C.PRICE],
      [[3000, 10000, 30000, 80000, 200000], { speed: 3000, gold: 5000, offline: 4000 }, { bless: 1500, protect: 4000, keepdown: 3000, sure: 1500, seal: 2000 }]);
  });
  // 시드 고정 시나리오(강화·모루·보호·하락 방지·사냥·자동·판매·납품·인장·부스터·오프라인 700회).
  // 기대 해시는 특성 도입 전 코드(커밋 7c1634c)에서 같은 시나리오로 만든 값이다. engravePending은 main.js 몫이라 부르지 않는다
  const PRE_TRAIT_SHA = 'a537857d5b17740b10f68f5c6e2fb18b49f18cc15bd86ed2fe158bb98ee78599';
  const OLD_STATS = ['tries', 'success', 'fail', 'destroy', 'earned', 'shardsGained', 'protectSaved', 'delivered', 'crafted', 'huntGold', 'offlineGold'];
  function lcgCounted(seed) {
    let s = seed >>> 0;
    const f = () => { f.calls++; s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    f.calls = 0;
    return f;
  }
  function regressionScenario(seed) {
    const rng = lcgCounted(seed);
    const S = SV.defaultState(NOW);
    let t = NOW;
    S.gold = 5e7; S.slots = 5;
    Object.assign(S.inv, { bless: 60, protect: 99, keepdown: 30, seal: 6, booster: 2 });
    R.addAnvil(S, 3); R.addAnvil(S, 2);
    let nextAuto = t;
    let outcomes = '';
    const gold = [];
    for (let i = 0; i < 700; i++) {
      if (!R.activeSword(S)) R.setActive(S, R.bestSword(S).id);
      R.setUse(S, 'bless', i % 3 === 0);
      R.setUse(S, 'anvil', true);
      R.setUse(S, 'protect', i % 2 === 0);
      R.setUse(S, 'keepdown', i % 4 !== 0);
      const r = R.attemptEnhance(S, rng);
      outcomes += r.ok ? r.outcome[0] : 'x';
      S.anvils.forEach(a => { if (a.dura <= 0) { C.ORES.forEach(k => { S.ore[k] = Math.max(S.ore[k], 200); }); F.repairAnvil(S, a.id); } });
      if (i % 50 === 25) R.setActive(S, S.swords.reduce((lo, s) => (s.lv < lo.lv ? s : lo), S.swords[0]).id);
      if (i % 50 === 45) R.setActive(S, R.bestSword(S).id);
      if (i === 40) R.useBoosterFromInv(S, t);
      if (i % 5 === 0) { const h = I.manualHunt(S, t, rng); gold.push(h.gold, h.ore.iron || 0, h.ore.silver || 0, h.ore.mithril || 0); }
      if (i % 7 === 0) {
        if (!S.idle.autoOn) I.setAutoOn(S, true);
        const a = I.runAutoCatchup(S, t, nextAuto, rng);
        nextAuto = a.nextAutoAt;
        gold.push(a.gold, a.ore.iron || 0, a.ore.mithril || 0);
      }
      if (S.swords.length < S.slots && R.activeSword(S) && R.activeSword(S).lv >= 11) R.buySword(S);
      const spare = S.swords.find(s => s.id !== S.active && s.lv >= 6 && s.lv <= 9);
      if (spare && i % 11 === 0) {
        R.setSeal(S, i % 22 === 0);
        gold.push(R.sellSword(S, spare.id).gold);
      }
      Q.refreshQuests(S, t, rng);
      Q.deliverableSlots(S).forEach(slot => {
        R.setSeal(S, slot === 1);
        const d = Q.deliver(S, slot, t, { confirmActive: true });
        gold.push(d.ok ? d.gold : -1);
      });
      t += 3000;
    }
    S.idle.boostUntil = t + 30 * 60 * 1000;
    S.idle.lastSeen = t;
    const off = I.settleOffline(S, t + 3 * 3600 * 1000);
    return {
      calls: rng.calls, outcomes, gold, off: off && { gold: off.gold, ore: off.ore, runs: off.runs },
      S: {
        gold: S.gold, shards: S.shards, best: S.best, active: S.active,
        swords: S.swords.map(s => [s.id, s.lv, s.prot, s.pity]),
        stats: OLD_STATS.map(k => S.stats[k]), ore: S.ore, inv: S.inv,
        anvils: S.anvils.map(a => [a.id, a.g, a.dura]), gauge: S.gauge, mastery: S.mastery,
        quests: S.quests.list.map(q => q && [q.id, q.lv, q.gold, q.item && q.item.id]),
      },
      traits: S.swords.map(s => s.trait), sinkGold: S.stats.sinkGold, traitRolls: S.stats.traitRolls, monuments: S.monuments,
    };
  }
  test('seeded 700-attempt scenario matches the pre-trait digest (outputs and 2362 rng calls)', () => {
    const d = regressionScenario(20261120);
    const { traits, sinkGold, traitRolls, monuments } = d;
    delete d.traits; delete d.sinkGold; delete d.traitRolls; delete d.monuments;
    const sha = require('crypto').createHash('sha256').update(JSON.stringify(d)).digest('hex');
    assert.deepStrictEqual([d.calls, d.S.best, d.S.gold], [2362, 18, 52715667]);
    assert.strictEqual(sha, PRE_TRAIT_SHA);
    assert.ok(traits.every(t => t === null), 'rules alone never engrave');
    assert.deepStrictEqual([sinkGold, traitRolls, monuments], [0, 0, [0, 0, 0, 0, 0, 0, 0, 0]]);
  });
  test('v=0 paths: traits of kinds that do not apply leave hunt/auto/offline/ore/sell/shard outputs unchanged', () => {
    const make = trait => {
      const S = stateWith({ swords: [sword(1, 12, trait), sword(2, 9, trait)], inv: { seal: 1 } });
      S.idle.autoOn = true; S.idle.up.gold = 3; S.idle.lastSeen = NOW - 2 * HOUR; S.idle.boostUntil = NOW - HOUR;
      return S;
    };
    const outputs = S => JSON.stringify([I.manualHuntGold(S, NOW), I.autoRunGold(S, NOW), F.rollOre(S, () => 0.3), F.expectedOre(S, 999, 0.25),
      R.payoutPreview(S, R.sell(9), R.findSword(S, 2)), I.settleOffline(S, NOW)]);
    const base = outputs(make(null));
    assert.strictEqual(outputs(make(tr('anvil', 3))), base);
    assert.strictEqual(outputs(make(tr('shard', 3))), base);
  });
});

// ============================================================ M2-B F12 업적·일일 과제 (m2-achievements §16 AC 1~54)
// rng는 위의 countedSeq(고정 값 + 호출 횟수)만 쓴다. 실제 Math.random 없음(V6)
const KST = -540;
const tzEnv = off => ({ tzOffsetMin: () => off });
/** 지역(오프셋 off) 04:00에 dayKey가 d가 되는 시각 */
const dayStartMs = (d, off = KST) => d * C.DAY_MS + C.DAILY_RESET_HOUR * HOUR + off * MIN;
const D0 = 20777;
const ACTIVE = { active: true };
const json = x => JSON.stringify(x);
function dailyState(best = 5) {
  const S = fresh();
  S.best = best;
  S.swords[0].lv = best;
  return S;
}
const task = (e, goal, base = 0, item = null, claimed = 0) => ({ e, goal, base, item, claimed });
/** 세 과제(hunts 10, success 4, delivered 1)를 가진 세트. done이면 지표를 목표만큼 올린다 */
function withSet(S, opts = {}) {
  S.daily = { maxDay: opts.day || D0, tasks: [task('hunt_s', 10), task('succ_m', 4, 0, opts.item || null), task('dlv_l', 1)], bonus: 0 };
  if (opts.done) Object.assign(S.stats, { hunts: 10, success: 4, delivered: 1 });
  return S;
}
const generate = (S, rng) => A.generateDaily(S, D0, rng).tasks;

describe('F12 day key and clock (AC 1-10c)', () => {
  test('AC1: KST 04:00 boundary 1795114799000 → 20776, 1795114800000 → 20777', () => {
    assert.deepStrictEqual([A.dayKey(1795114799000, KST), A.dayKey(1795114800000, KST)], [20776, 20777]);
  });
  test('AC2: UTC and EST 04:00 boundaries → 20776/20777', () => {
    assert.deepStrictEqual([A.dayKey(1795147199000, 0), A.dayKey(1795147200000, 0)], [20776, 20777]);
    assert.deepStrictEqual([A.dayKey(1795165199000, 300), A.dayKey(1795165200000, 300)], [20776, 20777]);
  });
  test('AC2 extra: 03:59 / 04:00 / 04:01 local across offsets -540, 0, 300, 330, -600', () => {
    [-540, 0, 300, 330, -600].forEach(off => {
      const t = dayStartMs(D0, off);
      assert.deepStrictEqual([A.dayKey(t - MIN, off), A.dayKey(t, off), A.dayKey(t + MIN, off)], [D0 - 1, D0, D0], `off ${off}`);
    });
  });
  test('AC3: a time-dependent tzOffsetMin is called with nowMs and gives the same day for the same nowMs', () => {
    const switchAt = dayStartMs(D0, 300) - 2 * HOUR;
    const calls = [];
    const env = { tzOffsetMin: ms => { calls.push(ms); return ms < switchAt ? 300 : 240; } };
    const t = dayStartMs(D0, 240) + MIN;
    const a = dailyState(); const b = dailyState();
    A.refreshDaily(a, t, countedSeq(0), env);
    A.refreshDaily(b, t, countedSeq(0), env);
    assert.deepStrictEqual([a.daily.maxDay, b.daily.maxDay], [A.dayKey(t, 240), A.dayKey(t, 240)]);
    assert.ok(calls.length === 2 && calls.every(ms => ms === t));
  });
  test('AC4: best 4 → locked, daily and rng untouched; best 5 → a set is created', () => {
    const S = dailyState(4);
    const before = json(S.daily);
    const rng = countedSeq(0);
    assert.deepStrictEqual(A.refreshDaily(S, dayStartMs(D0), rng, tzEnv(KST)), { created: false, reason: 'locked' });
    assert.deepStrictEqual([json(S.daily), rng.calls], [before, 0]);
    assert.strictEqual(A.refreshDaily(dailyState(5), dayStartMs(D0), rng, tzEnv(KST)).created, true);
  });
  test('AC5: new game best 5 on day 20777 → created, maxDay 20777, 3 tasks, exactly 9 rng calls', () => {
    const S = dailyState();
    const rng = countedSeq(0);
    assert.deepStrictEqual(A.refreshDaily(S, dayStartMs(D0), rng, tzEnv(KST)), { created: true, day: D0 });
    assert.deepStrictEqual([S.daily.maxDay, S.daily.tasks.length, S.daily.bonus, rng.calls], [D0, 3, 0, 9]);
  });
  test('AC6: same day again → same, 0 rng calls, set unchanged (also at 23:59 local of that day)', () => {
    const S = dailyState();
    A.refreshDaily(S, dayStartMs(D0), countedSeq(0), tzEnv(KST));
    const before = json(S.daily);
    const rng = countedSeq(0.5);
    assert.deepStrictEqual(A.refreshDaily(S, dayStartMs(D0 + 1) - MIN, rng, tzEnv(KST)), { created: false, reason: 'same' });
    assert.deepStrictEqual([json(S.daily), rng.calls], [before, 0]);
  });
  test('AC7: clock one day back → rollback, set/progress/claims/rng unchanged', () => {
    const S = withSet(dailyState(13), { done: true });
    assert.ok(A.claimDaily(S, 0, ACTIVE).ok);
    const before = json(S);
    const rng = countedSeq(0);
    assert.deepStrictEqual(A.refreshDaily(S, dayStartMs(D0 - 1), rng, tzEnv(KST)), { created: false, reason: 'rollback' });
    assert.deepStrictEqual([json(S), rng.calls], [before, 0]);
  });
  test('AC8: back to the original day → same, and the claimed task cannot be claimed again', () => {
    const S = withSet(dailyState(13), { done: true });
    A.claimDaily(S, 0, ACTIVE);
    A.refreshDaily(S, dayStartMs(D0 - 1), countedSeq(0), tzEnv(KST));
    assert.strictEqual(A.refreshDaily(S, dayStartMs(D0), countedSeq(0), tzEnv(KST)).reason, 'same');
    assert.deepStrictEqual(A.claimDaily(S, 0, ACTIVE), { ok: false, reason: 'claimed' });
  });
  test('AC9: one day forward → one new set, maxDay 20778, previous progress and claims discarded', () => {
    const S = withSet(dailyState(13), { done: true });
    A.claimDaily(S, 0, ACTIVE); A.claimDaily(S, 'bonus', ACTIVE);
    const r = A.refreshDaily(S, dayStartMs(D0 + 1), countedSeq(0), tzEnv(KST));
    assert.deepStrictEqual(r, { created: true, day: D0 + 1 });
    assert.strictEqual(S.daily.bonus, 0);
    assert.ok(S.daily.tasks.every((t, i) => t.claimed === 0 && A.dailyProgress(S, i) === 0));
  });
  test('AC10: jumps of +30, +8, +10000 days each create exactly one set (9 rng calls) and set maxDay', () => {
    [30, 8, 10000].forEach(n => {
      const S = withSet(dailyState());
      const rng = countedSeq(0);
      assert.deepStrictEqual(A.refreshDaily(S, dayStartMs(D0 + n), rng, tzEnv(KST)), { created: true, day: D0 + n });
      assert.strictEqual(rng.calls, 9);
      assert.strictEqual(A.refreshDaily(S, dayStartMs(D0 + n) + HOUR, rng, tzEnv(KST)).reason, 'same');
      assert.strictEqual(rng.calls, 9, `+${n}: no second set`);
    });
  });
  test('AC10a: after a +30 jump the real date (20778) is a rollback until it catches up', () => {
    const S = withSet(dailyState());
    A.refreshDaily(S, dayStartMs(D0 + 30), countedSeq(0), tzEnv(KST));
    assert.strictEqual(A.refreshDaily(S, dayStartMs(D0 + 1), countedSeq(0), tzEnv(KST)).reason, 'rollback');
    assert.strictEqual(A.refreshDaily(S, dayStartMs(D0 + 31), countedSeq(0), tzEnv(KST)).created, true);
  });
  test('AC10b: a week offline with auto ON → offline settle then one set, no stacked or carried-over rewards', () => {
    const S = withSet(dailyState(8), { done: true });
    S.idle.autoOn = true;
    S.idle.lastSeen = dayStartMs(D0) + HOUR;
    const t = S.idle.lastSeen + 7 * 24 * HOUR;
    const stats = json([S.stats.autoRuns, S.stats.hunts, S.stats.huntGold]);
    const off = I.settleOffline(S, t);
    assert.ok(off.gold > 0);
    assert.strictEqual(json([S.stats.autoRuns, S.stats.hunts, S.stats.huntGold]), stats);
    const rng = countedSeq(0);
    assert.strictEqual(A.refreshDaily(S, t, rng, tzEnv(KST)).created, true);
    assert.strictEqual(rng.calls, 9);
    assert.ok(S.daily.tasks.every((x, i) => !A.dailyDone(S, i)) && A.claimableCount(S) === 0, 'previous unclaimed rewards are gone');
  });
  test('AC10c: NaN / Infinity / string now → badClock, state unchanged; a non-finite offset is badClock too', () => {
    [NaN, Infinity, '1795114800000', undefined].forEach(now => {
      const S = dailyState();
      const before = json(S);
      assert.deepStrictEqual(A.refreshDaily(S, now, countedSeq(0), tzEnv(KST)), { created: false, reason: 'badClock' });
      assert.strictEqual(json(S), before);
    });
    assert.strictEqual(A.refreshDaily(dailyState(), dayStartMs(D0), countedSeq(0), tzEnv(NaN)).reason, 'badClock');
  });
  test('V8: far-future clock (year 5000) → badClock; a save → normalize → refreshDaily loop never creates a set', () => {
    const t = Date.UTC(5000, 0, 1);
    assert.ok(A.dayKey(t, KST) > C.DAILY_MAXDAY_CAP);
    let S = withSet(dailyState());
    let created = 0;
    for (let i = 0; i < 5; i++) {
      const rng = countedSeq(0.5);
      const r = A.refreshDaily(S, t, rng, tzEnv(KST));
      if (r.created) created++;
      assert.deepStrictEqual([r.reason, rng.calls], ['badClock', 0], `round ${i}`);
      S = SV.normalize(JSON.parse(JSON.stringify(S)), NOW);
    }
    assert.deepStrictEqual([created, S.daily.maxDay, S.daily.tasks.length], [0, D0, 3]);
  });
  test('V8: dayKey exactly DAILY_MAXDAY_CAP creates once and is "same" after reload; CAP + 1 is badClock', () => {
    let S = dailyState();
    const cap = dayStartMs(C.DAILY_MAXDAY_CAP);
    assert.strictEqual(A.refreshDaily(S, cap, countedSeq(0.5), tzEnv(KST)).created, true);
    S = SV.normalize(JSON.parse(JSON.stringify(S)), NOW);
    assert.strictEqual(A.refreshDaily(S, cap + HOUR, countedSeq(0.5), tzEnv(KST)).reason, 'same');
    assert.strictEqual(A.refreshDaily(S, dayStartMs(C.DAILY_MAXDAY_CAP + 1), countedSeq(0.5), tzEnv(KST)).reason, 'badClock');
  });
});

describe('F12 daily generation (AC 11-18b)', () => {
  test('AC11: all-zero rng at best 5 → hunt_s/succ_m/dlv_l, every task has a shard item, 9 calls', () => {
    const rng = countedSeq(0);
    const tasks = generate(dailyState(), rng);
    assert.deepStrictEqual(tasks.map(t => [t.e, t.item]), [['hunt_s', 'shard'], ['succ_m', 'shard'], ['dlv_l', 'shard']]);
    assert.strictEqual(rng.calls, 9);
  });
  test('AC11: per slot the rng order is (entry, has item, item kind)', () => {
    const tasks = generate(dailyState(), countedSeq(0.99, 0.0, 0.99, 0.0, 0.5, 0.0, 0.0, 0.39, 0.0));
    assert.deepStrictEqual(tasks.map(t => [t.e, t.item]), [['tries_s', 'ore'], ['succ_m', null], ['dlv_l', 'shard']]);
  });
  test('AC12: fewer than 6 anvils, all 0.99 → tries_s, craft_m, hunt_l, no items, 9 calls', () => {
    const rng = countedSeq(0.99);
    const tasks = generate(dailyState(), rng);
    assert.deepStrictEqual(tasks.map(t => [t.e, t.item]), [['tries_s', null], ['craft_m', null], ['hunt_l', null]]);
    assert.strictEqual(rng.calls, 9);
  });
  test('AC13: slot 2 drops entries whose metric an earlier slot used', () => {
    const S = dailyState();
    assert.deepStrictEqual(A.dailyCandidates(S, 2, ['hunts', 'success']).map(e => e.id), ['dlv_l', 'tries_l']);
    assert.deepStrictEqual(A.dailyCandidates(S, 2, ['autoRuns', 'success']).map(e => e.id), ['dlv_l', 'hunt_l', 'tries_l']);
  });
  test('AC14: same state and rng sequence → identical sets', () => {
    const vals = [0.1, 0.7, 0.2, 0.6, 0.3, 0.9, 0.5, 0.05, 0.8];
    assert.strictEqual(json(generate(dailyState(), countedSeq(...vals))), json(generate(dailyState(), countedSeq(...vals))));
  });
  test('AC15: goals follow the band of best 5/10/15/20; gold_m goal = mult × huntReward(best)', () => {
    assert.deepStrictEqual([5, 10, 15, 20].map(b => generate(dailyState(b), countedSeq(0))[0].goal), [10, 15, 20, 25]);
    assert.deepStrictEqual([5, 10, 15, 20].map(b => generate(dailyState(b), countedSeq(0, 0, 0, 0.3, 0, 0, 0))[1]),
      [5, 10, 15, 20].map((b, i) => task('gold_m', [20, 25, 30, 30][i] * R.huntReward(b), 0, 'shard')));
    assert.deepStrictEqual([4, 5, 9, 10, 14, 15, 19, 20].map(A.bandOf), [-1, 0, 0, 1, 1, 2, 2, 3]);
  });
  test('AC16: base is the metric at generation, progress starts at 0 and counts only the increase', () => {
    const S = dailyState();
    S.stats.hunts = 7;
    generate(S, countedSeq(0));
    assert.deepStrictEqual([S.daily.tasks[0].base, A.dailyProgress(S, 0), A.dailyDone(S, 0)], [7, 0, false]);
    S.stats.hunts += 4;
    assert.strictEqual(A.dailyProgress(S, 0), 4);
    S.stats.hunts += 100;
    assert.deepStrictEqual([A.dailyProgress(S, 0), A.dailyDone(S, 0)], [10, true]);
  });
  test('AC17: large lifetime counters (hunts 500) are not double counted', () => {
    const S = dailyState();
    S.stats.hunts = 500;
    generate(S, countedSeq(0));
    assert.deepStrictEqual([S.daily.tasks[0].base, A.dailyProgress(S, 0)], [500, 0]);
  });
  test('AC18a: 6 anvils → slot 1 candidates succ_m/gold_m/sell_m and sell_m is picked; 5 anvils → craft_m included; 9 calls each', () => {
    const S = dailyState();
    for (let i = 0; i < C.ANVIL_OWN_MAX; i++) R.addAnvil(S, 1);
    assert.deepStrictEqual(A.dailyCandidates(S, 1, ['tries']).map(e => e.id), ['succ_m', 'gold_m', 'sell_m']);
    let rng = countedSeq(0.99);
    assert.strictEqual(generate(S, rng)[1].e, 'sell_m');
    assert.strictEqual(rng.calls, 9);
    S.anvils.pop();
    rng = countedSeq(0.99);
    assert.strictEqual(generate(S, rng)[1].e, 'craft_m');
    assert.strictEqual(rng.calls, 9);
  });
  test('AC18b: best 5/10/15/20 × anvils 0/5/6 × rng all 0 / all 0.99 (24 cases) → 3 defined tasks, dlv_l always a slot-2 candidate, 9 calls', () => {
    let cases = 0;
    [5, 10, 15, 20].forEach(best => [0, 5, 6].forEach(anvils => [0, 0.99].forEach(v => {
      const S = dailyState(best);
      for (let i = 0; i < anvils; i++) R.addAnvil(S, 1);
      const rng = countedSeq(v);
      const tasks = generate(S, rng);
      const used = tasks.slice(0, 2).map(t => C.DAILY_POOL_BY_ID[t.e].metric);
      assert.ok(tasks.length === 3 && tasks.every(t => t.e && C.DAILY_POOL_BY_ID[t.e] && t.goal >= 1), `${best}/${anvils}/${v}`);
      [0, 1, 2].forEach(slot => assert.ok(A.dailyCandidates(S, slot, used.slice(0, slot)).length >= 1));
      assert.ok(A.dailyCandidates(S, 2, used).some(e => e.id === 'dlv_l'));
      assert.strictEqual(rng.calls, 9);
      cases++;
    })));
    assert.strictEqual(cases, 24);
  });
  test('AC18: even at best 13 the pool has no destroy or sink tasks', () => {
    assert.ok(C.DAILY_POOL.every(e => !['destroy', 'sinkGold', 'traitRolls'].includes(e.metric)));
    const tasks = generate(dailyState(13), countedSeq(0.5));
    assert.ok(tasks.every(t => C.DAILY_POOL_BY_ID[t.e]));
  });
});

describe('F12 counters and offline (AC 19-22)', () => {
  test('AC19: 3 auto runs add 3 to autoRuns; settleOffline leaves autoRuns/hunts/huntGold alone', () => {
    const S = dailyState(8);
    S.idle.autoOn = true;
    const r = I.runAutoCatchup(S, NOW + 2 * I.autoInterval(S), NOW, () => 0.5);
    assert.deepStrictEqual([r.runs, S.stats.autoRuns], [3, 3]);
    S.idle.lastSeen = NOW;
    const before = json([S.stats.autoRuns, S.stats.hunts, S.stats.huntGold]);
    assert.ok(I.settleOffline(S, NOW + 3 * HOUR).gold > 0);
    assert.strictEqual(json([S.stats.autoRuns, S.stats.hunts, S.stats.huntGold]), before);
  });
  test('AC20: selling a +5 sword adds 1 to sells, +0~+4 does not', () => {
    const S = stateWith({ swords: [sword(1, 5), sword(2, 4), sword(3, 1)] });
    R.sellSword(S, 2); R.sellSword(S, 3);
    assert.strictEqual(S.stats.sells, 0);
    R.sellSword(S, 1);
    assert.strictEqual(S.stats.sells, 1);
  });
  test('AC21/53: a manual hunt adds 1 to hunts; its gold and ore are unchanged', () => {
    const S = dailyState(9);
    const want = I.manualHuntGold(S, NOW);
    const r = I.manualHunt(S, NOW, () => 0.3);
    assert.deepStrictEqual([r.gold, r.ore, S.stats.hunts], [want, F.rollOre(dailyState(9), () => 0.3), 1]);
  });
  test('AC22: 8 hours offline does not move daily progress', () => {
    const S = dailyState(8);
    generate(S, countedSeq(0.5));
    S.idle.autoOn = true; S.idle.lastSeen = NOW;
    const before = [0, 1, 2].map(i => A.dailyProgress(S, i));
    I.settleOffline(S, NOW + 8 * HOUR);
    assert.deepStrictEqual([0, 1, 2].map(i => A.dailyProgress(S, i)), before);
  });
});

describe('F12 daily claims (AC 23-28)', () => {
  test('AC23: slot 1 done at best 13 → +8,030G, claimed, rewardGold and dailyDone +1; shard item 39, ore item 20 silver', () => {
    const S = withSet(dailyState(13), { done: true });
    const gold = S.gold;
    const r = A.claimDaily(S, 1, ACTIVE);
    assert.deepStrictEqual(r, { ok: true, gold: 8030, shards: 0, ore: {} });
    assert.deepStrictEqual([S.gold - gold, S.daily.tasks[1].claimed, S.stats.rewardGold, S.stats.dailyDone], [8030, 1, 8030, 1]);
    const sh = withSet(dailyState(13), { done: true, item: 'shard' });
    assert.strictEqual(A.claimDaily(sh, 1, ACTIVE).shards, 39);
    assert.strictEqual(sh.shards, 39);
    const ore = withSet(dailyState(13), { done: true, item: 'ore' });
    assert.deepStrictEqual(A.claimDaily(ore, 1, ACTIVE).ore, { silver: 20 });
    const iron = withSet(dailyState(6), { done: true, item: 'ore' });
    assert.deepStrictEqual(A.claimDaily(iron, 1, ACTIVE).ore, { iron: 20 });
  });
  test('AC24: the same claim again → claimed, gold/shards/ore unchanged', () => {
    const S = withSet(dailyState(13), { done: true, item: 'shard' });
    A.claimDaily(S, 1, ACTIVE);
    const before = json(S);
    assert.deepStrictEqual(A.claimDaily(S, 1, ACTIVE), { ok: false, reason: 'claimed' });
    assert.strictEqual(json(S), before);
  });
  test('AC25: progress below the goal → notDone', () => {
    const S = withSet(dailyState(13));
    S.stats.success = 3;
    assert.deepStrictEqual(A.claimDaily(S, 1, ACTIVE), { ok: false, reason: 'notDone' });
  });
  test('AC26: which 3 / -1 / "x" / undefined / "1" → invalid; empty tasks with a valid which → noDaily', () => {
    const S = withSet(dailyState(13), { done: true });
    [3, -1, 'x', undefined, '1', 1.5].forEach(w => assert.deepStrictEqual(A.claimDaily(S, w, ACTIVE), { ok: false, reason: 'invalid' }, String(w)));
    const E = dailyState(13);
    assert.deepStrictEqual(A.claimDaily(E, 0, ACTIVE), { ok: false, reason: 'noDaily' });
    assert.deepStrictEqual(A.claimDaily(E, 'bonus', ACTIVE), { ok: false, reason: 'noDaily' });
  });
  test('AC27: bonus with all 3 done → +16,060G, shards 2×39, bonus 1, dailyAll +1; not all done → notDone; again → claimed', () => {
    const N = withSet(dailyState(13));
    Object.assign(N.stats, { hunts: 10, success: 4 });
    assert.deepStrictEqual(A.claimDaily(N, 'bonus', ACTIVE), { ok: false, reason: 'notDone' });
    const S = withSet(dailyState(13), { done: true });
    assert.deepStrictEqual(A.claimDaily(S, 'bonus', ACTIVE), { ok: true, gold: 16060, shards: 78, ore: {} });
    assert.deepStrictEqual([S.daily.bonus, S.stats.dailyAll, S.stats.dailyDone], [1, 1, 0]);
    assert.deepStrictEqual(A.claimDaily(S, 'bonus', ACTIVE), { ok: false, reason: 'claimed' });
  });
  test('AC27a: the bonus needs the tasks done, not claimed', () => {
    const S = withSet(dailyState(13), { done: true });
    assert.ok(S.daily.tasks.every(t => t.claimed === 0));
    assert.ok(A.claimDaily(S, 'bonus', ACTIVE).ok);
  });
  test('AC28: reason order inactiveTab → invalid → noDaily → claimed → notDone (daily) and → notReached (achievements)', () => {
    const S = withSet(dailyState(13));
    S.daily.tasks[0].claimed = 1;
    assert.strictEqual(A.claimDaily(S, 9, { active: false }).reason, 'inactiveTab');
    assert.strictEqual(A.claimDaily(S, 9, undefined).reason, 'inactiveTab');
    assert.strictEqual(A.claimDaily(S, 9, ACTIVE).reason, 'invalid');
    assert.strictEqual(A.claimDaily(dailyState(13), 0, ACTIVE).reason, 'noDaily');
    assert.strictEqual(A.claimDaily(S, 0, ACTIVE).reason, 'claimed');
    assert.strictEqual(A.claimDaily(S, 1, ACTIVE).reason, 'notDone');
    const T = fresh();
    T.achievements.tries_1 = C.ACH_CLAIMED;
    assert.strictEqual(A.claimAchievement(T, 'bogus', { active: false }).reason, 'inactiveTab');
    assert.strictEqual(A.claimAchievement(T, 'bogus', ACTIVE).reason, 'invalid');
    assert.strictEqual(A.claimAchievement(T, 'constructor', ACTIVE).reason, 'invalid');
    assert.strictEqual(A.claimAchievement(T, 'tries_1', ACTIVE).reason, 'claimed');
    assert.strictEqual(A.claimAchievement(T, 'tries_2', ACTIVE).reason, 'notReached');
  });
});

describe('F12 two tabs and idempotent claims (AC 29-30d)', () => {
  /** 탭 하나: 같은 메모리 저장소를 읽는 storedClaimed 주입(main.js와 같은 방식) */
  const tabCtx = st => ({ active: true, storedClaimed: (kind, key, day) => A.storedClaimedIn(SV.peek(st, NOW).state, kind, key, day) });
  function twoTabs() {
    const S0 = withSet(dailyState(13), { done: true });
    S0.stats.tries = 100;
    A.syncAchievements(S0);
    const st = memStorage();
    SV.save(st, S0, NOW);
    return { st, tabA: SV.load(st, NOW).state, tabB: SV.load(st, NOW).state };
  }
  test('AC29: active false → inactiveTab from every claim function; nothing changes', () => {
    const S = withSet(dailyState(13), { done: true });
    S.stats.tries = 100; A.syncAchievements(S);
    const before = json(S);
    const off = { active: false, storedClaimed: () => { throw new Error('must not read storage'); } };
    assert.deepStrictEqual([A.claimAchievement(S, 'tries_1', off), A.claimDaily(S, 0, off), A.claimAll(S, off)].map(r => r.reason),
      ['inactiveTab', 'inactiveTab', 'inactiveTab']);
    assert.strictEqual(json(S), before);
  });
  test('AC30: tab A claims and saves; stale tab B (still active) gets claimed with no reward and its memory marked claimed', () => {
    const { st, tabA, tabB } = twoTabs();
    assert.ok(A.claimAchievement(tabA, 'tries_1', tabCtx(st)).ok);
    assert.ok(A.claimDaily(tabA, 0, tabCtx(st)).ok);
    SV.save(st, tabA, NOW);
    const gold = tabB.gold;
    assert.deepStrictEqual(A.claimAchievement(tabB, 'tries_1', tabCtx(st)), { ok: false, reason: 'claimed' });
    assert.deepStrictEqual(A.claimDaily(tabB, 0, tabCtx(st)), { ok: false, reason: 'claimed' });
    assert.deepStrictEqual([tabB.gold, tabB.stats.rewardGold, tabB.achievements.tries_1, tabB.daily.tasks[0].claimed], [gold, 0, 2, 1]);
  });
  test('AC30d: stored daily is a newer day → stale; nothing in tab B or storage changes. Same day + claimed → claimed; same day unclaimed → ok', () => {
    const { st, tabA, tabB } = twoTabs();
    A.refreshDaily(tabA, dayStartMs(D0 + 1), countedSeq(0.5), tzEnv(KST));
    SV.save(st, tabA, NOW);
    const raw = st.dump[C.SAVE_KEY];
    const before = json(tabB);
    assert.deepStrictEqual(A.claimDaily(tabB, 1, tabCtx(st)), { ok: false, reason: 'stale' });
    assert.deepStrictEqual([json(tabB), st.dump[C.SAVE_KEY]], [before, raw]);
    assert.ok(A.claimAchievement(tabB, 'tries_1', tabCtx(st)).ok, 'achievements never compare maxDay');

    const same = twoTabs();
    same.tabA.daily.tasks[1].claimed = 1;
    SV.save(same.st, same.tabA, NOW);
    assert.strictEqual(A.claimDaily(same.tabB, 1, tabCtx(same.st)).reason, 'claimed');
    const fresh2 = twoTabs();
    assert.ok(A.claimDaily(fresh2.tabB, 1, tabCtx(fresh2.st)).ok);
  });
  test('AC30d: storedClaimedIn returns stale / true / false and false when there is no stored save', () => {
    const S = withSet(dailyState(13));
    S.daily.tasks[2].claimed = 1;
    S.achievements.succ_1 = C.ACH_CLAIMED;
    assert.deepStrictEqual([A.storedClaimedIn(S, 'daily', 2, D0 + 1), A.storedClaimedIn(S, 'daily', 2, D0), A.storedClaimedIn(S, 'daily', 1, D0),
      A.storedClaimedIn(S, 'daily', 'bonus', D0), A.storedClaimedIn(S, 'ach', 'succ_1'), A.storedClaimedIn(S, 'ach', 'tries_1'),
      A.storedClaimedIn(null, 'daily', 0, D0)], ['stale', true, false, false, true, false, false]);
  });
  test('claimAll with a stale stored daily set → stale: true; daily items skipped, tab B daily and storage unchanged', () => {
    const { st, tabA, tabB } = twoTabs();
    A.refreshDaily(tabA, dayStartMs(D0 + 1), countedSeq(0.5), tzEnv(KST));
    SV.save(st, tabA, NOW);
    const raw = st.dump[C.SAVE_KEY];
    const daily = json(tabB.daily);
    const r = A.claimAll(tabB, tabCtx(st));
    assert.deepStrictEqual([r.ok, r.stale], [true, true]);
    assert.ok(r.claimed.length > 0 && r.claimed.every(c => c.kind === 'ach'), 'achievements are still claimed: ' + json(r.claimed));
    assert.deepStrictEqual([json(tabB.daily), st.dump[C.SAVE_KEY]], [daily, raw]);
    const same = twoTabs();
    assert.ok(!('stale' in A.claimAll(same.tabB, tabCtx(same.st))), 'no stale flag when the stored day matches');
  });
  test('AC30a: after A saves, B takes over the stored save → same flags, claiming again → claimed', () => {
    const { st, tabA } = twoTabs();
    A.claimAchievement(tabA, 'tries_1', tabCtx(st));
    A.claimDaily(tabA, 2, tabCtx(st));
    SV.save(st, tabA, NOW);
    const tabB = SV.load(st, NOW).state;
    assert.deepStrictEqual([tabB.achievements, tabB.daily], [tabA.achievements, tabA.daily]);
    assert.strictEqual(A.claimAchievement(tabB, 'tries_1', tabCtx(st)).reason, 'claimed');
    assert.strictEqual(A.claimDaily(tabB, 2, tabCtx(st)).reason, 'claimed');
  });
  test('AC30b: the saved JSON after a claim has both the reward and the flag; reload + claim → claimed', () => {
    const { st, tabA } = twoTabs();
    const gold = tabA.gold;
    const r = A.claimDaily(tabA, 1, tabCtx(st));
    SV.save(st, tabA, NOW);
    const d = JSON.parse(st.dump[C.SAVE_KEY]);
    assert.deepStrictEqual([d.gold, d.daily.tasks[1].claimed, d.stats.rewardGold], [gold + r.gold, 1, r.gold]);
    assert.strictEqual(A.claimDaily(SV.load(st, NOW).state, 1, ACTIVE).reason, 'claimed');
  });
});

describe('F12 achievements (AC 31-43)', () => {
  // §5 표 그대로: [id, 목표, k, 파편 m, 광석, 칭호]
  const TABLE = [
    ['tries_1', 100, 1, 0, null, '견습 대장장이'], ['tries_2', 1000, 3, 1, null, '숙련 대장장이'], ['tries_3', 5000, 6, 2, null, '전설의 대장장이'],
    ['succ_1', 50, 1, 0, null, '행운의 손'], ['succ_2', 500, 3, 1, null, '명장의 손'], ['succ_3', 2500, 6, 2, null, '백전백승'],
    ['best_1', 10, 1, 0, null, '희귀 감정사'], ['best_2', 15, 4, 1, null, '영웅 대장장이'], ['best_3', 20, 8, 2, null, '신화를 벼린 자'],
    ['dest_1', 1, 1, 0, null, '깨진 검의 증인'], ['dest_2', 25, 3, 1, null, '오뚝이'], ['dest_3', 100, 5, 2, null, '폐허의 군주'],
    ['hunt_1', 100, 1, 0, null, '초보 사냥꾼'], ['hunt_2', 1000, 3, 1, { iron: 40 }, '베테랑 사냥꾼'], ['hunt_3', 5000, 6, 2, { silver: 40 }, '사냥왕'],
    ['dlv_1', 5, 1, 0, null, '심부름꾼'], ['dlv_2', 25, 3, 1, { iron: 30 }, '단골 납품업자'], ['dlv_3', 100, 6, 1, { silver: 30 }, '납품왕'],
    ['sink_1', 500000, 3, 0, null, '후원자'], ['sink_2', 10000000, 6, 0, null, '큰손'], ['sink_3', 100000000, 10, 0, null, '재벌'],
    ['trt_1', 1, 1, 0, null, '각인사'], ['trt_2', 5, 3, 1, null, '각인 장인'], ['trt_3', 20, 5, 2, null, '각인의 달인'],
    ['knd_1', 3, 1, 0, null, '재능 수집가'], ['knd_2', 5, 3, 1, null, '다재다능'], ['knd_3', 6, 6, 2, null, '전종 수집가'],
    ['mon_1', 1, 3, 0, null, '기념비 건립자'], ['mon_2', 4, 6, 1, null, '기념비 수호자'], ['mon_3', 8, 10, 2, null, '기념비의 주인'],
    ['day_1', 10, 1, 0, null, '성실한 사람'], ['day_2', 50, 3, 1, null, '꾸준한 사람'], ['day_3', 200, 6, 2, null, '일과의 달인'],
    ['perfect', 1, 2, 1, null, '완벽주의자'],
  ];
  const ach = id => C.ACH_BY_ID[id];
  test('AC31: 34 unique ids matching §5 (need, k, shard, ore, title), unique titles, k sum 131, shard sum 30, ore iron 70 / silver 70', () => {
    assert.deepStrictEqual(C.ACHIEVEMENTS.map(a => [a.id, a.need, a.k, a.shard, a.ore, a.title]), TABLE);
    assert.strictEqual(new Set(C.ACHIEVEMENTS.map(a => a.id)).size, 34);
    assert.strictEqual(new Set(C.ACHIEVEMENTS.map(a => a.title)).size, 34);
    const sum = f => C.ACHIEVEMENTS.reduce((s, a) => s + f(a), 0);
    assert.deepStrictEqual([sum(a => a.k), sum(a => a.shard), sum(a => (a.ore && a.ore.iron) || 0), sum(a => (a.ore && a.ore.silver) || 0)], [131, 30, 70, 70]);
    const tracks = {};
    C.ACHIEVEMENTS.forEach(a => { tracks[a.track] = (tracks[a.track] || 0) + 1; });
    assert.deepStrictEqual(Object.values(tracks).sort(), [1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    assert.ok(C.ACHIEVEMENTS.every(a => Object.prototype.hasOwnProperty.call(C.ACH_METRICS, a.metric)));
  });
  test('AC32: tries 99 → tries_1 stays 0; 100 → reached and returned; a second sync returns []', () => {
    const S = fresh();
    S.stats.tries = 99;
    assert.deepStrictEqual([A.syncAchievements(S), A.achState(S, 'tries_1')], [[], 0]);
    S.stats.tries = 100;
    assert.deepStrictEqual(A.syncAchievements(S), ['tries_1']);
    assert.strictEqual(S.achievements.tries_1, C.ACH_REACHED);
    assert.deepStrictEqual(A.syncAchievements(S), []);
  });
  test('AC33: knd_1 stays reached after selling drops the kind count to 2; claimed never goes down', () => {
    const S = stateWith({ swords: [sword(1, 6, tr('hunt', 1)), sword(2, 6, tr('work', 1)), sword(3, 6, tr('trade', 1))] });
    assert.deepStrictEqual(A.syncAchievements(S), ['knd_1']);
    R.sellSword(S, 3);
    assert.strictEqual(A.traitKindCount(S), 2);
    A.syncAchievements(S);
    assert.strictEqual(S.achievements.knd_1, C.ACH_REACHED);
    assert.ok(A.claimAchievement(S, 'knd_1', ACTIVE).ok);
    A.syncAchievements(S);
    assert.strictEqual(S.achievements.knd_1, C.ACH_CLAIMED);
  });
  test('AC34: monuments [1,0,1,0,0,0,0,0] → count 2, only mon_1; all 8 → mon_3', () => {
    const S = fresh();
    S.monuments = [1, 0, 1, 0, 0, 0, 0, 0];
    assert.strictEqual(A.monumentCount(S), 2);
    assert.deepStrictEqual(A.syncAchievements(S), ['mon_1']);
    S.monuments = Array(8).fill(1);
    assert.deepStrictEqual(A.syncAchievements(S), ['mon_2', 'mon_3']);
  });
  test('AC35: traits hunt2/work1/trade3/null → kind count 3 (knd_1), perfect; two of one kind count once', () => {
    const S = stateWith({ swords: [sword(1, 6, tr('hunt', 2)), sword(2, 6, tr('work', 1)), sword(3, 6, tr('trade', 3)), sword(4, 2)] });
    assert.deepStrictEqual([A.traitKindCount(S), A.hasPerfectTrait(S)], [3, true]);
    assert.deepStrictEqual(A.syncAchievements(S), ['knd_1', 'perfect']);
    const T = stateWith({ swords: [sword(1, 6, tr('hunt', 1)), sword(2, 6, tr('hunt', 2))] });
    assert.deepStrictEqual([A.traitKindCount(T), A.hasPerfectTrait(T)], [1, false]);
  });
  test('AC36: best_1 at best 10 → 210G (50%: floor(423×50/100)=211 → 210); at best 13 → 2,680G', () => {
    const S = stateWith({ sword: { lv: 10 } });
    assert.strictEqual(A.claimAchievement(S, 'best_1', ACTIVE).gold, 210);
    const T = stateWith({ sword: { lv: 13 } });
    assert.strictEqual(A.claimAchievement(T, 'best_1', ACTIVE).gold, 2680);
  });
  test('AC37: claims, refreshDaily and setTitle leave chances/gauge/mastery/BONUS_CAP unchanged and never read them', () => {
    const S = withSet(stateWith({ sword: { lv: 16, pity: 3 }, inv: { bless: 2 }, use: { bless: true } }), { done: true });
    S.gauge = [1, 2, 0, 0, 0]; S.mastery = [1, 1, 0, 0, 0]; S.stats.tries = 1000;
    const snap = () => json([R.currentChances(S), S.gauge, S.mastery, C.BONUS_CAP, S.swords[0].pity]);
    const before = snap();
    A.syncAchievements(S);
    A.claimAll(S, ACTIVE);
    A.setTitle(S, 'tries_2');
    A.refreshDaily(S, dayStartMs(D0 + 1), countedSeq(0.4), tzEnv(KST));
    assert.strictEqual(snap(), before);
    const src = fs.readFileSync(js('achievements.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.ok(!/chances|gauge|mastery|BONUS_CAP|SUCC_CEIL|pity/.test(src), 'achievements.js does not touch chance inputs');
  });
  test('AC38: title not selectable before claiming; after claiming setTitle works; "" (none) always ok', () => {
    const S = fresh();
    S.stats.tries = 100; A.syncAchievements(S);
    assert.deepStrictEqual(A.setTitle(S, 'tries_1'), { ok: false, reason: 'invalid' });
    assert.deepStrictEqual([A.setTitle(S, 'bogus').reason, A.setTitle(S, 'constructor').reason, A.setTitle(S, 3).reason], ['invalid', 'invalid', 'invalid']);
    assert.strictEqual(S.title, '');
    const r = A.claimAchievement(S, 'tries_1', ACTIVE);
    assert.strictEqual(r.title, '견습 대장장이');
    assert.deepStrictEqual([A.setTitle(S, 'tries_1'), S.title], [{ ok: true }, 'tries_1']);
    assert.deepStrictEqual([A.setTitle(S, ''), S.title], [{ ok: true }, '']);
  });
  test('AC39: reward gold goes to gold and stats.rewardGold only (earned/huntGold/offlineGold/shardsGained unchanged)', () => {
    const S = stateWith({ sword: { lv: 13 } });
    S.stats.tries = 1000;
    const keep = () => json([S.stats.earned, S.stats.huntGold, S.stats.offlineGold, S.stats.shardsGained]);
    const before = keep();
    const gold = S.gold;
    const r = A.claimAchievement(S, 'tries_2', ACTIVE);
    assert.deepStrictEqual([S.gold - gold, S.stats.rewardGold, S.shards, keep()], [r.gold, r.gold, r.shards, before]);
  });
  test('AC40: hunt_2 with 9,990 iron → 9,999 (cap) and the claim still succeeds', () => {
    const S = stateWith({ sword: { lv: 13 } });
    S.stats.hunts = 1000; S.ore.iron = 9990;
    const r = A.claimAchievement(S, 'hunt_2', ACTIVE);
    assert.deepStrictEqual([r.ok, r.ore, S.ore.iron, S.achievements.hunt_2], [true, { iron: 9 }, C.ORE_MAX, C.ACH_CLAIMED]);
  });
  test('AC41: best 17 tries_3 → 188,070G + 136 shards; best 20 best_3 → 1,587,700G + 200 shards', () => {
    const S = stateWith({ sword: { lv: 17 } });
    S.stats.tries = 5000;
    assert.deepStrictEqual(A.claimAchievement(S, 'tries_3', ACTIVE), { ok: true, gold: 188070, shards: 136, ore: {}, title: '전설의 대장장이' });
    const T = stateWith({ sword: { lv: 20 } });
    const r = A.claimAchievement(T, 'best_3', ACTIVE);
    assert.deepStrictEqual([r.gold, r.shards], [1587700, 200]);
  });
  test('AC42: roundTo runs once at the end (best 17 k=3 → 94,040, k=5 → 156,730; §7.5 table; early 50% examples)', () => {
    const at = best => Object.assign(fresh(), { best });
    assert.deepStrictEqual([A.rewardGold(at(17), 3), A.rewardGold(at(17), 5)], [94040, 156730]);
    const table = { 1: [2680, 9160, 31350, 198460], 2: [5350, 18320, 62690, 396920], 3: [8030, 27470, 94040, 595390], 5: [13380, 45790, 156730, 992310],
      6: [16060, 54950, 188070, 1190770], 8: [21410, 73260, 250760, 1587700], 10: [26760, 91580, 313450, 1984620] };
    Object.keys(table).forEach(k => assert.deepStrictEqual([13, 15, 17, 20].map(b => A.rewardGold(at(b), +k)), table[k], `k=${k}`));
    assert.deepStrictEqual([13, 15, 17, 20].map(b => [2, 3, 5, 6].reduce((s, k) => s + A.rewardGold(at(b), k), 0)), [42820, 146530, 501530, 3175390]);
    assert.deepStrictEqual([A.rewardGold(at(7), 2), A.rewardGold(at(10), 1), A.rewardGold(at(4), 1)], [70, 210, 10]);
    assert.deepStrictEqual([A.shardReward(at(7), 1), A.shardReward(at(17), 2), A.shardReward(at(2), 1)], [14, 136, R.shardGain(5)]);
  });
  test('AC43: claimAll takes 2 achievements then daily slot order (bonus not ready); inactive → inactiveTab', () => {
    const S = withSet(stateWith({ sword: { lv: 9 } }));
    Object.assign(S.stats, { tries: 100, destroy: 1, hunts: 10 });
    const r = A.claimAll(S, ACTIVE);
    assert.deepStrictEqual(r.claimed, [{ kind: 'ach', key: 'tries_1' }, { kind: 'ach', key: 'dest_1' }, { kind: 'daily', key: 0 }]);
    assert.deepStrictEqual([r.ok, r.gold, r.shards], [true, 2 * A.rewardGold(S, 1) + A.rewardGold(S, 2), 0]);
    assert.deepStrictEqual(A.claimAll(S, ACTIVE), { ok: true, claimed: [], gold: 0, shards: 0, ore: {} });
    assert.strictEqual(A.claimAll(S, { active: false }).reason, 'inactiveTab');
  });
  test('claimableCount / claimableAny follow reached achievements, done daily tasks and the bonus', () => {
    const S = withSet(stateWith({ sword: { lv: 13 } }), { done: true });
    assert.deepStrictEqual([A.claimableCount(S), A.claimableAny(S)], [4, true]);
    S.stats.tries = 100; A.syncAchievements(S);
    assert.strictEqual(A.claimableCount(S), 6, 'tries_1 + best_1 + 3 tasks + bonus');
    A.claimAll(S, ACTIVE);
    assert.deepStrictEqual([A.claimableCount(S), A.claimableAny(S)], [0, false]);
  });
});

describe('F12 save and normalization (AC 44-51)', () => {
  const NEW_STATS = ['hunts', 'sells', 'autoRuns', 'dailyDone', 'dailyAll', 'rewardGold', 'eventsSeen'];
  const norm = d => SV.normalize(Object.assign(fresh(), d), NOW);
  test('AC44: new game → achievements {}, title "", daily {maxDay 0, tasks [], bonus 0}, new stats 0 (incl. eventsSeen hook)', () => {
    const S = fresh();
    assert.deepStrictEqual([S.achievements, S.title, S.daily], [{}, '', { maxDay: 0, tasks: [], bonus: 0 }]);
    assert.deepStrictEqual(NEW_STATS.map(k => S.stats[k]), [0, 0, 0, 0, 0, 0, 0]);
  });
  test('AC45: achievements [] / "x" / mixed object → {}, {}, {tries_1:2, succ_1:1, best_1:2}; __proto__ key ignored', () => {
    assert.deepStrictEqual(norm({ achievements: [] }).achievements, {});
    assert.deepStrictEqual(norm({ achievements: 'x' }).achievements, {});
    assert.deepStrictEqual(norm({ achievements: { tries_1: 2, bogus: 1, constructor: 2, succ_1: '1', best_1: 9, dest_1: 0 } }).achievements,
      { tries_1: 2, succ_1: 1, best_1: 2 });
    assert.deepStrictEqual(SV.normalize(JSON.parse('{"achievements":{"__proto__":{"tries_1":2},"succ_1":2}}'), NOW).achievements, { succ_1: 2 });
  });
  test('AC46: title 5 / unclaimed tries_1 / claimed tries_1 → "", "", "tries_1"', () => {
    assert.strictEqual(norm({ title: 5 }).title, '');
    assert.strictEqual(norm({ title: 'tries_1', achievements: { tries_1: 1 } }).title, '');
    assert.strictEqual(norm({ title: 'tries_1', achievements: { tries_1: 2 } }).title, 'tries_1');
    assert.strictEqual(norm({ title: 'constructor', achievements: {} }).title, '');
  });
  test('AC47: daily missing / null / [] / 2 tasks → default daily (tasks []), maxDay kept when present', () => {
    const empty = { maxDay: 0, tasks: [], bonus: 0 };
    const d = fresh(); delete d.daily;
    assert.deepStrictEqual(SV.normalize(d, NOW).daily, empty);
    assert.deepStrictEqual(norm({ daily: null }).daily, empty);
    assert.deepStrictEqual(norm({ daily: [] }).daily, empty);
    assert.deepStrictEqual(norm({ daily: { maxDay: D0, tasks: [task('hunt_s', 10), task('succ_m', 4)], bonus: 1 } }).daily, { maxDay: D0, tasks: [], bonus: 0 });
  });
  test('AC48: a task outside its slot pool → tasks []; goal "20" → 20, 0 → 1; base above the metric → clamped to it', () => {
    const set = tasks => ({ daily: { maxDay: D0, tasks, bonus: 0 } });
    assert.deepStrictEqual(norm(set([task('succ_m', 4), task('succ_m', 4), task('dlv_l', 1)])).daily.tasks, []);
    assert.deepStrictEqual(norm(set([task('nope', 4), task('succ_m', 4), task('dlv_l', 1)])).daily.tasks, []);
    const S = norm(Object.assign(set([task('hunt_s', '20', 99, 'gem', 'yes'), task('succ_m', 0, 2, 'ore'), task('dlv_l', 1, -3, 'shard')]),
      { stats: { hunts: 40, success: 1 } }));
    assert.deepStrictEqual(S.daily.tasks, [task('hunt_s', 20, 40, null, 1), task('succ_m', 1, 1, 'ore'), task('dlv_l', 1, 0, 'shard')]);
    assert.deepStrictEqual(SV.normalize(JSON.parse(JSON.stringify(S)), NOW).daily, S.daily, 'idempotent');
  });
  test('AC49: maxDay "20777" / -5 / 1e9 → 20777, 0, 1,000,000', () => {
    assert.deepStrictEqual(['20777', -5, 1e9].map(v => norm({ daily: { maxDay: v } }).daily.maxDay), [20777, 0, C.DAILY_MAXDAY_CAP]);
  });
  test('AC50: an old v2 save without the new fields loads with defaults, other fields and v=2 kept, and round-trips', () => {
    const old = JSON.parse(JSON.stringify(fresh()));
    ['achievements', 'title', 'daily'].forEach(k => delete old[k]);
    NEW_STATS.forEach(k => delete old.stats[k]);
    Object.assign(old, { gold: 12345, best: 9 });
    old.stats.tries = 77;
    const st = memStorage({ [C.SAVE_KEY]: JSON.stringify(old) });
    const S = SV.load(st, NOW).state;
    assert.deepStrictEqual([S.v, S.gold, S.best, S.stats.tries, S.achievements, S.title, S.daily.tasks, S.stats.hunts], [2, 12345, 9, 77, {}, '', [], 0]);
    SV.save(st, S, NOW);
    assert.deepStrictEqual(SV.load(st, NOW).state, S);
  });
  test('save round-trip keeps achievements, title, daily and the 7 new stats', () => {
    const S = withSet(dailyState(13), { done: true, item: 'ore' });
    S.stats.tries = 100; A.syncAchievements(S); A.claimAchievement(S, 'tries_1', ACTIVE); A.setTitle(S, 'tries_1');
    A.claimDaily(S, 1, ACTIVE);
    NEW_STATS.forEach((k, i) => { S.stats[k] += i + 1; });
    const st = memStorage();
    SV.save(st, S, NOW);
    const L = SV.load(st, NOW).state;
    assert.deepStrictEqual([L.achievements, L.title, L.daily, NEW_STATS.map(k => L.stats[k])], [S.achievements, S.title, S.daily, NEW_STATS.map(k => S.stats[k])]);
    assert.deepStrictEqual(L, S);
  });
  test('AC51: empty tasks with maxDay D: dayKey D → recovery set (9 calls); dayKey < D → none', () => {
    const S = dailyState();
    S.daily = { maxDay: D0, tasks: [], bonus: 0 };
    let rng = countedSeq(0);
    assert.strictEqual(A.refreshDaily(S, dayStartMs(D0 - 1), rng, tzEnv(KST)).reason, 'rollback');
    assert.strictEqual(rng.calls, 0);
    assert.deepStrictEqual(A.refreshDaily(S, dayStartMs(D0), rng, tzEnv(KST)), { created: true, day: D0 });
    assert.strictEqual(rng.calls, 9);
  });
});

describe('F12 regressions and naming (AC 52-54)', () => {
  const norm = d => SV.normalize(Object.assign(fresh(), d), NOW);
  test('AC52: F4 quests are untouched by F12 calls; deliver still adds 1 to delivered', () => {
    const S = stateWith({ swords: [sword(1, 6), sword(2, 4)], top: { best: 8 } });
    Q.refreshQuests(S, NOW, () => 0.5);
    const quests = json(S.quests);
    A.syncAchievements(S);
    A.refreshDaily(S, dayStartMs(D0), countedSeq(0.5), tzEnv(KST));
    A.claimAll(S, ACTIVE);
    assert.strictEqual(json(S.quests), quests);
    S.quests.list[0] = { id: 9, tier: 'easy', lv: 4, gold: Q.questGold('easy', 4), item: null };
    const r = Q.deliver(S, 0, NOW);
    assert.deepStrictEqual([r.ok, r.gold, S.stats.delivered], [true, Q.questGold('easy', 4), 1]);
  });
  test('AC53: locked daily (best < 5) draws no rng, so the game rng sequence of early runs is unchanged', () => {
    const rng = countedSeq(0.5);
    [0, 2, 4].forEach(best => assert.strictEqual(A.refreshDaily(dailyState(best), dayStartMs(D0), rng, tzEnv(KST)).reason, 'locked'));
    const S = dailyState(9);
    A.refreshDaily(S, dayStartMs(D0), countedSeq(0.5), tzEnv(KST));
    [1, 2, 3].forEach(n => A.refreshDaily(S, dayStartMs(D0) + n * HOUR, rng, tzEnv(KST)));
    A.syncAchievements(S);
    assert.strictEqual(rng.calls, 0, 'same-day / sync paths draw nothing');
  });
  test('AC53: eventsSeen is a stats counter only F13 spawns increment (F12 hunts/claims/daily never do)', () => {
    const S = withSet(stateWith({ sword: { lv: 13 } }), { done: true });
    I.manualHunt(S, NOW, () => 0.5); A.claimAll(S, ACTIVE);
    A.refreshDaily(S, dayStartMs(D0 + 1), countedSeq(0.5), tzEnv(KST));
    assert.strictEqual(S.stats.eventsSeen, 0);
    S.events.sinceMs = S.events.nextAtMs - 1;
    assert.strictEqual(E.advanceEvents(S, 1, countedSeq(0)).started, 'luck');
    assert.strictEqual(S.stats.eventsSeen, 1);
    assert.strictEqual(norm({ stats: { eventsSeen: '4.7' } }).stats.eventsSeen, 4);
  });
  test('AC54: achievement names/titles and daily code never say 의뢰/퀘스트; quests.js has no 과제/일일; separate module SG.ach', () => {
    assert.ok(C.ACHIEVEMENTS.every(a => !/의뢰|퀘스트/.test(a.name + a.title)));
    assert.ok(!/의뢰|퀘스트/.test(fs.readFileSync(js('achievements.js'), 'utf8').replace(/F4 납품 의뢰\(quests\.js\)/, '')));
    assert.ok(!/과제|일일/.test(fs.readFileSync(js('quests.js'), 'utf8')));
    assert.ok(!Object.keys(Q).some(k => /daily|ach/i.test(k)), 'quests.js is not extended');
    assert.ok(typeof A.refreshDaily === 'function' && typeof A.claimDaily === 'function');
  });
});

describe('F12 6-B screen helpers: countdown, reward previews, display state', () => {
  const DAY = C.DAY_MS;
  test('msToNextDay: 04:00 boundary in KST / UTC / EST (AC 1-2 instants)', () => {
    [[1795114800000, KST], [1795147200000, 0], [1795165200000, 300]].forEach(([b, off]) => {
      assert.deepStrictEqual([A.msToNextDay(b - 1, off), A.msToNextDay(b, off), A.msToNextDay(b + HOUR, off)], [1, DAY, DAY - HOUR], String(off));
    });
  });
  test('msToNextDay agrees with dayKey: now + left is the next day, one ms earlier is still today', () => {
    [KST, 0, 300, 345, -720].forEach(off => {
      for (let t = dayStartMs(D0, off) - 3 * HOUR; t < dayStartMs(D0 + 2, off); t += 37 * MIN + 13) {
        const left = A.msToNextDay(t, off);
        assert.ok(left > 0 && left <= DAY, `${off} ${t}: ${left}`);
        assert.deepStrictEqual([A.dayKey(t + left, off), A.dayKey(t + left - 1, off)], [A.dayKey(t, off) + 1, A.dayKey(t, off)], `${off} ${t}`);
      }
    });
  });
  test('msToNextDay is safe for odd clocks (V8): non-finite → 0, far future / before 1970 stay in (0, DAY]', () => {
    [NaN, Infinity, -Infinity, '1795114800000', undefined, null].forEach(t => assert.strictEqual(A.msToNextDay(t, KST), 0, String(t)));
    assert.strictEqual(A.msToNextDay(1795114800000, NaN), 0);
    [Date.UTC(5000, 0, 1), 8.64e15, -1e12, 0, Number.MAX_SAFE_INTEGER].forEach(t => {
      const left = A.msToNextDay(t, KST);
      assert.ok(Number.isFinite(left) && left > 0 && left <= DAY, `${t}: ${left}`);
    });
  });
  test('dailyRewardPreview equals what claimDaily grants (slots with no item / shard / ore, bonus) at best 6, 13, 17, and does not change state', () => {
    [6, 13, 17].forEach(best => [null, 'shard', 'ore'].forEach(item => [0, 1, 2, A.BONUS].forEach(which => {
      const S = withSet(dailyState(best), { done: true });
      S.daily.tasks.forEach(t => { t.item = item; });
      const before = json(S);
      const preview = A.dailyRewardPreview(S, which);
      assert.strictEqual(json(S), before, 'preview is pure');
      const r = A.claimDaily(S, which, ACTIVE);
      assert.deepStrictEqual(preview, { gold: r.gold, shards: r.shards, ore: r.ore }, `${best} ${item} ${which}`);
    })));
  });
  test('dailyRewardPreview: ore at ORE_MAX shows what would really be added; null without a set or for a bad key', () => {
    const S = withSet(dailyState(13), { done: true, item: 'ore' });
    S.ore.silver = C.ORE_MAX - 3;
    assert.deepStrictEqual(A.dailyRewardPreview(S, 1).ore, { silver: 3 });
    assert.deepStrictEqual(A.claimDaily(S, 1, ACTIVE).ore, { silver: 3 });
    assert.strictEqual(A.dailyRewardPreview(dailyState(13), 0), null);
    [3, -1, 'x', undefined, '0'].forEach(k => assert.strictEqual(A.dailyRewardPreview(withSet(dailyState(13)), k), null, String(k)));
  });
  test('achRewardPreview equals what claimAchievement grants for all 34 at best 10 and 20 (incl. ore cap), plus the title', () => {
    [10, 20].forEach(best => C.ACHIEVEMENTS.forEach(a => {
      const S = stateWith({ sword: { lv: best } });
      S.ore.iron = C.ORE_MAX - 9;
      S.achievements[a.id] = C.ACH_REACHED;
      const before = json(S);
      const preview = A.achRewardPreview(S, a.id);
      assert.strictEqual(json(S), before, 'preview is pure');
      const r = A.claimAchievement(S, a.id, ACTIVE);
      assert.deepStrictEqual(preview, { gold: r.gold, shards: r.shards, ore: r.ore, title: r.title }, `${best} ${a.id}`);
    }));
    const S = stateWith({ sword: { lv: 17 } });
    assert.deepStrictEqual(A.achRewardPreview(S, 'tries_3'), { gold: 188070, shards: 136, ore: {}, title: '전설의 대장장이' }, 'AC41 amounts');
  });
  test('dailyStatus comes from flags and progress (V7): progress → ready → claimed, bonus ready once all 3 are done; null without a set', () => {
    const S = withSet(dailyState(13));
    assert.deepStrictEqual([0, 1, 2, A.BONUS].map(w => A.dailyStatus(S, w)), ['progress', 'progress', 'progress', 'progress']);
    S.stats.hunts = 10;
    assert.deepStrictEqual([A.dailyStatus(S, 0), A.dailyStatus(S, A.BONUS)], ['ready', 'progress']);
    A.claimDaily(S, 0, ACTIVE);
    Object.assign(S.stats, { success: 4, delivered: 1 });
    assert.deepStrictEqual([0, 1, 2, A.BONUS].map(w => A.dailyStatus(S, w)), ['claimed', 'ready', 'ready', 'ready']);
    A.claimDaily(S, A.BONUS, ACTIVE);
    assert.strictEqual(A.dailyStatus(S, A.BONUS), 'claimed');
    assert.deepStrictEqual([A.dailyStatus(dailyState(13), 0), A.hasDailySet(dailyState(13)), A.hasDailySet(S)], [null, false, true]);
  });
  test('achProgress = min(metric, need); a latched achievement keeps its state even if the metric fell', () => {
    const S = stateWith({ sword: { lv: 13 } });
    S.stats.tries = 57;
    assert.deepStrictEqual([A.achProgress(S, 'tries_1'), A.achProgress(S, 'best_1'), A.achProgress(S, 'perfect')], [57, 10, 0]);
    S.swords = [sword(1, 6, tr('hunt', 1)), sword(2, 6, tr('work', 1)), sword(3, 6, tr('trade', 1))];
    A.syncAchievements(S);
    S.swords.pop();
    assert.deepStrictEqual([A.achProgress(S, 'knd_1'), A.achState(S, 'knd_1')], [2, C.ACH_REACHED]);
  });
});

/** constants.js 원문을 patch로 바꿔 새 VM 문맥에 올리고, mutate(C) 뒤 나머지 규칙 모듈을 올린다. 던진 오류 메시지(없으면 null) */
function loadError(patch, mutate) {
  const ctx = { console, Math, Date, JSON, Object, Array, Number, String, Set, Map, Error };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  try {
    vm.runInContext(patch(fs.readFileSync(js('constants.js'), 'utf8')), ctx, { filename: 'constants.js' });
    mutate(ctx.SG.C);
    ['events.js', 'rules.js', 'forge.js', 'idle.js', 'quests.js', 'save.js', 'rebirth.js', 'achievements.js']
      .forEach(f => vm.runInContext(fs.readFileSync(js(f), 'utf8'), ctx, { filename: f }));
    return null;
  } catch (e) {
    return e.message;
  }
}

describe('F12 daily table load guards', () => {
  const asIs = src => src;
  const keep = () => {};
  test('the shipped tables load', () => {
    assert.strictEqual(loadError(asIs, keep), null);
  });
  test('a gate name missing from DAILY_GATES throws at achievements.js load', () => {
    assert.strictEqual(loadError(asIs, C2 => C2.DAILY_POOL.push({ id: 'x_m', slot: 1, metric: 'crafted', goals: [1, 1, 1, 1], gate: 'noSuchGate' })),
      'DAILY_POOL gate is not in DAILY_GATES');
  });
  test('a daily metric that is not a stats key throws at save.js load', () => {
    assert.strictEqual(loadError(asIs, C2 => { C2.DAILY_POOL[0].metric = 'bogus'; }), 'DAILY_POOL metric is not a stats key');
  });
  test('slot 2 with only metrics used by earlier slots throws at constants.js load (an ungated entry alone is not enough)', () => {
    const from = "{ id: 'dlv_l',   slot: 2, metric: 'delivered',";
    const patch = src => { assert.ok(src.includes(from)); return src.replace(from, "{ id: 'dlv_l',   slot: 2, metric: 'success',"); };
    assert.strictEqual(loadError(patch, keep), 'ACHIEVEMENTS / DAILY_* tables are inconsistent');
  });
});

// ============================================================ M2-C F13 시간 이벤트 규칙 (m2-events §14 AC, §2.5 하드 규칙)
// rng는 countedSeq(고정 값 + 호출 횟수)와 시드 LCG만 쓴다(V6)
const EV_MS = C.EVENTS.luck.durationSec * 1000;
const NEW_CHANCE_KEYS = ['event', 'succNoEvent', 'eventGain', 'eventLost'];
/** 활성 이벤트 id를 지정한다(테스트 전용 setEvent, 실패하면 단언) */
function withEvent(S, id, remainMs = EV_MS) {
  assert.ok(E.setEvent(S, id, remainMs).ok, id);
  return S;
}
/** 한 단계 검 + 넉넉한 골드. best = lv */
const evState = (lv, trait = null) => stateWith({ swords: [sword(1, lv, trait)], top: { gold: 1e12 } });
const clone = x => JSON.parse(JSON.stringify(x));
/** 등급 g 모루 장착(토글 ON) + 축복 보유(bless면 토글 ON) */
function enhanceState(lv, { g = 0, bless = false, trait = null, dura = 30 } = {}) {
  const S = evState(lv, trait);
  S.inv.bless = 5;
  if (g) { S.anvils = [{ id: 1, g, dura }]; S.anvilEq = 1; S.nextAnvilId = 2; assert.ok(R.setUse(S, 'anvil', true).ok); }
  if (bless) assert.ok(R.setUse(S, 'bless', true).ok);
  return S;
}

describe('F13 spawn and progress (AC 1-6c)', () => {
  const adv = (S, dt, rng) => E.advanceEvents(S, dt, rng);
  test('AC1-2: 449 × adv(2000) → no spawn, sinceMs 898000, 0 rng; the 450th with rng [0] → luck 300000, 1 call, eventsSeen 1', () => {
    const S = evState(5);
    assert.deepStrictEqual(S.events, { active: null, sinceMs: 0, nextAtMs: 900000 });
    const rng = countedSeq(0);
    for (let i = 0; i < 449; i++) assert.deepStrictEqual(adv(S, 2000, rng), {});
    assert.deepStrictEqual([S.events.active, S.events.sinceMs, rng.calls], [null, 898000, 0]);
    assert.deepStrictEqual(adv(S, 2000, rng), { started: 'luck' });
    assert.deepStrictEqual([S.events.active, rng.calls, S.stats.eventsSeen], [{ id: 'luck', remainMs: 300000 }, 1, 1]);
  });
  test('AC3: best 13 + autoOn + anvil → weights 12/36/54/70/86/100', () => {
    const S = evState(13);
    S.idle.autoOn = true; R.addAnvil(S, 1);
    const vals = [0.11, 0.13, 0.35, 0.37, 0.53, 0.55, 0.69, 0.71, 0.85, 0.87, 0.99];
    const rng = countedSeq(...vals);
    assert.deepStrictEqual(vals.map(() => E.pickEvent(S, rng)), ['luck', 'hunt', 'hunt', 'auto', 'auto', 'ore', 'ore', 'anvil', 'anvil', 'quest', 'quest']);
    assert.strictEqual(rng.calls, vals.length, 'one call per pick');
  });
  test('AC4: best 5, autoOff, no anvil → luck/ore/quest only (r = rng × 42)', () => {
    const S = evState(5);
    const rng = countedSeq(0.28, 0.30, 0.66, 0.70);
    assert.deepStrictEqual([0, 1, 2, 3].map(() => E.pickEvent(S, rng)), ['luck', 'ore', 'ore', 'quest']);
    assert.deepStrictEqual(E.eligibleEvents(S), ['luck', 'ore', 'quest']);
    const seen = new Set();
    for (let k = 0; k < 1000; k++) seen.add(E.pickEvent(S, () => k / 1000));
    assert.deepStrictEqual([...seen].sort(), ['luck', 'ore', 'quest']);
  });
  test('AC5: active hunt 1000ms + adv(2000), rng [0.5] → ended, nextAtMs 1350000, 1 call, leftover dt dropped', () => {
    const S = withEvent(evState(13), 'hunt', 1000);
    const rng = countedSeq(0.5);
    assert.deepStrictEqual(adv(S, 2000, rng), { ended: 'hunt' });
    assert.deepStrictEqual([S.events, rng.calls], [{ active: null, sinceMs: 0, nextAtMs: 1350000 }, 1]);
  });
  test('AC6: drawGapMs 0 → 900000, 0.5 → 1350000, 0.9999 → 1800000; always a multiple of 1000 in range', () => {
    assert.deepStrictEqual([0, 0.5, 0.9999].map(v => E.drawGapMs(() => v)), [900000, 1350000, 1800000]);
    for (let k = 0; k < 2000; k++) {
      const g = E.drawGapMs(() => k / 2000);
      assert.ok(g % 1000 === 0 && g >= 900000 && g <= 1800000, String(g));
    }
  });
  test('AC6a: while active, adv(2000) only lowers remainMs; sinceMs stays; 0 rng', () => {
    const S = withEvent(evState(5), 'ore');
    S.events.sinceMs = 0;
    const rng = countedSeq(0);
    assert.deepStrictEqual(adv(S, 2000, rng), {});
    assert.deepStrictEqual([S.events.active.remainMs, S.events.sinceMs, rng.calls], [EV_MS - 2000, 0, 0]);
  });
  test('AC6b: best 4 → nothing changes, 0 rng; dt -5000 / NaN → 0, 3600000 → 2000', () => {
    const L = evState(4);
    L.events.sinceMs = 899999;
    const before = clone(L);
    const rng = countedSeq(0);
    [2000, 3600000].forEach(dt => assert.deepStrictEqual(adv(L, dt, rng), {}));
    assert.deepStrictEqual([clone(L), rng.calls], [before, 0]);
    const S = evState(5);
    [-5000, NaN, 'x', undefined].forEach(dt => adv(S, dt, rng));
    assert.strictEqual(S.events.sinceMs, 0);
    adv(S, 3600000, rng);
    assert.deepStrictEqual([S.events.sinceMs, rng.calls], [2000, 0]);
  });
  test('AC6c: rng always 0, 12000 s of play in 2 s ticks → active share ≤ 25% + one tick, spawn gaps ≥ 900 s, one event at a time', () => {
    const S = evState(5);
    const rng = countedSeq(0);
    const TICKS = 6000;
    let activeMs = 0;
    let lastEnd = 0;
    let lastStart = null;
    for (let i = 1; i <= TICKS; i++) {
      if (S.events.active) activeMs += 2000;
      const r = adv(S, 2000, rng);
      assert.ok(!(r.started && r.ended), 'one transition per call');
      if (r.ended) lastEnd = i;
      if (r.started) {
        assert.ok((i - lastEnd) * 2 >= C.EVENT_GAP_MIN_SEC, `gap ${(i - lastEnd) * 2}s`);
        if (lastStart !== null) assert.ok((i - lastStart) * 2 >= C.EVENT_GAP_MIN_SEC);
        lastStart = i;
      }
      assert.ok(S.events.active === null || typeof S.events.active.id === 'string');
    }
    assert.ok(activeMs / (TICKS * 2000) <= 0.25 + 2 / (TICKS * 2), String(activeMs / (TICKS * 2000)));
    assert.strictEqual(S.stats.eventsSeen, 10);
  });
});

describe('F13 lucky hour: cap, ceiling, invariants (AC 7-16, 53)', () => {
  const sw = (lv, pity = 0) => ({ lv, pity, prot: 2 });
  const pick = (c, keys) => keys.map(k => c[k]);
  test('AC7: +13 bless + iron, event 5 → parts unchanged, raw 17, cap 14, bonus 14, capped, succ 44 / 42, gain 2', () => {
    const c = R.chances(sw(13), { bless: true, anvilGrade: 1, event: 5 });
    assert.deepStrictEqual(c.parts, { bless: 10, anvil: 2, pity: 0 });
    assert.deepStrictEqual(pick(c, ['event', 'raw', 'cap', 'bonus', 'capped', 'succ', 'succNoEvent', 'eventGain', 'eventLost']),
      [5, 17, 14, 14, true, 44, 42, 2, 3]);
  });
  test('AC8: +13 bless + mithril → 44 / 44, gain 0', () => {
    assert.deepStrictEqual(pick(R.chances(sw(13), { bless: true, anvilGrade: 3, event: 5 }), ['succ', 'succNoEvent', 'eventGain', 'eventLost']), [44, 44, 0, 5]);
  });
  test('AC9 / §5.2.1: +7 bless+mithril 74→79; +13 none 30→35; +17 none 10→15; +19 bless+iron 17→19', () => {
    const rows = [[7, { bless: true, anvilGrade: 3 }, 74, 79], [13, {}, 30, 35], [17, {}, 10, 15], [19, { bless: true, anvilGrade: 1 }, 17, 19]];
    rows.forEach(([lv, o, before, after]) => {
      const c = R.chances(sw(lv), Object.assign({ event: 5 }, o));
      assert.deepStrictEqual([c.succNoEvent, c.succ, c.eventGain], [before, after, after - before], `+${lv}`);
      assert.strictEqual(R.chances(sw(lv), o).succ, before, `+${lv} without the event`);
    });
  });
  test('AC9a: +15 bless + steel, mastery 4 (12%p) → 45 → 46, gain 1 (mastery outside the cap)', () => {
    const c = R.chances(sw(15), { bless: true, anvilGrade: 2, mastery: 4, event: 5 });
    assert.deepStrictEqual(pick(c, ['succNoEvent', 'succ', 'eventGain', 'mastery']), [45, 46, 1, 12]);
  });
  test('AC10: 3,328 reachable combos (+5..+19 × bless × anvil 0..3 × pity 0..12 × mastery records) → dest same with event 5/0, succ+dest ≤ 100, fail ≥ 0', () => {
    let n = 0;
    for (let lv = 5; lv <= 19; lv++) {
      const mi = lv - C.MASTERY_FROM;
      const recMax = mi >= 0 ? C.MASTERY_REC_MAX[mi] : 0;
      for (const bless of [false, true]) for (let g = 0; g <= 3; g++) for (let p = 0; p <= 12; p++) for (let m = 0; m <= recMax; m++) {
        const o = { bless, anvilGrade: g, mastery: m };
        const off = R.chances(sw(lv, p), o);
        const on = R.chances(sw(lv, p), Object.assign({ event: 5 }, o));
        const at = `+${lv} ${bless} ${g} ${p} ${m}`;
        assert.strictEqual(on.dest, off.dest, at);
        assert.ok(on.succ + on.dest <= 100 && on.fail >= 0 && on.succ + on.dest + on.fail === 100, at);
        assert.ok(on.succ >= off.succ && on.succNoEvent === off.succ && on.eventGain === on.succ - off.succ, at);
        n++;
      }
    }
    assert.strictEqual(n, 3328);
  });
  test('AC11: injected event 50 at +13 bless+mithril → bonus 14, succ 44', () => {
    assert.deepStrictEqual(pick(R.chances(sw(13), { bless: true, anvilGrade: 3, event: 50 }), ['bonus', 'succ']), [14, 44]);
  });
  test('AC12: event 50 at +5 bless+mithril+pity 6 → succ exactly 90 (SUCC_CEIL), gain 0', () => {
    const c = R.chances(sw(5, 6), { bless: true, anvilGrade: 3, event: 50 });
    assert.deepStrictEqual(pick(c, ['succ', 'eventGain']), [C.SUCC_CEIL, 0]);
  });
  test('AC13: +15 roll in [succNoEvent, succ) → success, eventAssist, +16, pity 0, gauge 0; spec setup (mastery 4 = REC_MAX) keeps mastery 4', () => {
    const S = enhanceState(15, { g: 2, bless: true });
    S.mastery[0] = 4; S.gauge[0] = 2; S.swords[0].pity = 0;
    withEvent(S, 'luck');
    const ch = R.currentChances(S);
    assert.deepStrictEqual([ch.succNoEvent, ch.succ], [45, 46]);
    const rng = countedSeq(0.455);
    const r = R.attemptEnhance(S, rng);
    assert.deepStrictEqual([r.outcome, r.eventAssist, S.swords[0].lv, S.swords[0].pity, S.gauge[0], S.mastery[0], r.mastery, rng.calls],
      ['success', true, 16, 0, 0, 4, null, 1]);
  });
  test('AC13: mastery below REC_MAX — an assisted success does not record; a success below succNoEvent records +1 (eventAssist false)', () => {
    const make = () => {
      const S = enhanceState(15, { g: 2, bless: true });
      S.mastery[0] = 2; S.gauge[0] = 3;
      return withEvent(S, 'luck');
    };
    const A1 = make();
    const ch = R.currentChances(A1);
    assert.deepStrictEqual([ch.succNoEvent, ch.succ], [39, 40]);
    const r1 = R.attemptEnhance(A1, countedSeq(0.395));
    assert.deepStrictEqual([r1.outcome, r1.eventAssist, A1.mastery[0], r1.mastery, A1.gauge[0], A1.swords[0].pity], ['success', true, 2, null, 0, 0]);
    const B = make();
    const r2 = R.attemptEnhance(B, countedSeq(0.385));
    assert.deepStrictEqual([r2.outcome, r2.eventAssist, B.mastery[0], r2.mastery && r2.mastery.count, B.gauge[0]], ['success', false, 3, 3, 0]);
  });
  test('AC14: failing roll with luck on → pity +1, gauge +1, mastery same — identical to no event; enhanceOpts inputs equal except event', () => {
    const make = ev => {
      const S = enhanceState(15, { g: 2, bless: true });
      S.mastery[0] = 2; S.gauge[0] = 1; S.inv.keepdown = 5; R.setUse(S, 'keepdown', true);
      return ev ? withEvent(S, 'luck') : S;
    };
    const on = make(true);
    const off = make(false);
    const oOn = R.enhanceOpts(on);
    const oOff = R.enhanceOpts(off);
    assert.deepStrictEqual([oOn.event, oOff.event], [5, 0]);
    assert.deepStrictEqual(Object.assign({}, oOn, { event: 0 }), oOff);
    const r1 = R.attemptEnhance(on, countedSeq(0.9999));
    const r2 = R.attemptEnhance(off, countedSeq(0.9999));
    assert.deepStrictEqual([r1.outcome, r1.eventAssist, on.swords[0].pity, on.gauge[0], on.mastery[0]], [r2.outcome, false, 1, 2, 2]);
    delete on.events; delete off.events;
    assert.deepStrictEqual(on, off);
  });
  test('AC15: gauge full / sure (≤ +9) / forceSuccess → certain(), parts null, event 0, gain 0, succNoEvent 100 even with luck; +20 → parts null, succNoEvent 0', () => {
    const certainShape = c => [c.succ, c.parts, c.event, c.eventGain, c.eventLost, c.succNoEvent];
    assert.deepStrictEqual(certainShape(R.chances(sw(15), { gaugeFull: true, event: 5 })), [100, null, 0, 0, 0, 100]);
    assert.deepStrictEqual(certainShape(R.chances(sw(8), { sure: true, event: 5 })), [100, null, 0, 0, 0, 100]);
    const T = loadTestModeSG();
    assert.deepStrictEqual(certainShape(T.rules.chances(sw(12), { bless: true, event: 5 })), [100, null, 0, 0, 0, 100]);
    const S = enhanceState(16);
    S.gauge[1] = C.GAUGE_N[1];
    withEvent(S, 'luck');
    const c = R.currentChances(S);
    assert.deepStrictEqual([c.gaugeFull].concat(certainShape(c)), [true, 100, null, 0, 0, 0, 100]);
    const top = R.chances(sw(20), { event: 5, bless: true });
    assert.deepStrictEqual([top.succ, top.parts, top.event, top.eventGain, top.eventLost, top.succNoEvent], [0, null, 0, 0, 0, 0]);
  });
  test('AC15a: luckBonus 0 at +4 and +20, 5 at +5 and +19; enhanceOpts.event 0 for a +4 active sword; no active sword → null', () => {
    const S = withEvent(stateWith({ swords: [sword(1, 4), sword(2, 9)], active: 1 }), 'luck');
    assert.deepStrictEqual([4, 5, 19, 20].map(lv => E.luckBonus(S, lv)), [0, 5, 5, 0]);
    assert.strictEqual(R.enhanceOpts(S).event, 0);
    R.setActive(S, 2);
    assert.strictEqual(R.enhanceOpts(S).event, 5);
    S.active = null;
    assert.strictEqual(R.enhanceOpts(S), null);
  });
  test('AC15b: luck off → every old field unchanged (event 0 / undefined), event 0, gain 0, lost 0, succNoEvent = succ', () => {
    for (let lv = 0; lv <= C.MAX; lv++) for (const bless of [false, true]) for (let g = 0; g <= 3; g++) for (const p of [0, 3, 12]) for (const m of [0, 2]) {
      const o = { bless, anvilGrade: g, mastery: m };
      const plain = R.chances(sw(lv, p), o);
      assert.deepStrictEqual(R.chances(sw(lv, p), Object.assign({ event: 0 }, o)), plain);
      assert.deepStrictEqual([plain.event, plain.eventGain, plain.eventLost, plain.succNoEvent], [0, 0, 0, plain.succ], `+${lv}`);
      assert.ok(plain.parts === null || json(Object.keys(plain.parts)) === json(['bless', 'anvil', 'pity']));
    }
  });
  test('AC15c: luck on, anvil off → exactly 1 rng call; anvil on without smith/guard → still 1', () => {
    const S = withEvent(enhanceState(12, { bless: true }), 'luck');
    const rng = countedSeq(0.5);
    R.attemptEnhance(S, rng);
    assert.strictEqual(rng.calls, 1);
    const T = withEvent(enhanceState(12, { g: 3 }), 'luck');
    const rt = countedSeq(0.5);
    R.attemptEnhance(T, rt);
    assert.strictEqual(rt.calls, 1);
  });
  test('AC16: +13 mithril + pity 3 + bless + luck → bonusWasted(bless) true; luck off → false', () => {
    const make = ev => {
      const S = enhanceState(13, { g: 3, bless: true });
      S.swords[0].pity = 3;
      return ev ? withEvent(S, 'luck') : S;
    };
    assert.strictEqual(R.currentChances(make(true)).raw, 25);
    assert.strictEqual(R.bonusWasted(make(true), 'bless'), true);
    assert.strictEqual(R.bonusWasted(make(false), 'bless'), false);
  });
  test('AC53: +15 luck + full gauge → certain success, eventAssist false, mastery records +1 as before, 1 rng call', () => {
    const S = enhanceState(15, { g: 2, bless: true });
    S.gauge[0] = C.GAUGE_N[0]; S.mastery[0] = 1;
    withEvent(S, 'luck');
    const rng = countedSeq(0.999);
    const r = R.attemptEnhance(S, rng);
    assert.deepStrictEqual([r.chances.gaugeFull, r.outcome, r.eventAssist, S.mastery[0], r.mastery.count, rng.calls], [true, 'success', false, 2, 2, 1]);
  });
});

describe('F13 income, ore, anvil, quest effects (AC 20-31)', () => {
  test('AC20: best 13 hunt event, no trait/booster → 3746; none → 2676', () => {
    const S = evState(13);
    assert.strictEqual(I.manualHuntGold(S, NOW), 2676);
    withEvent(S, 'hunt');
    assert.strictEqual(I.manualHuntGold(S, NOW), 3746);
    assert.strictEqual(I.manualHunt(S, NOW, () => 0.9).gold, 3746);
  });
  test('AC21: hunt + {hunt,3} + booster → 7305; without booster 4870', () => {
    const S = withEvent(evState(13, tr('hunt', 3)), 'hunt');
    assert.strictEqual(I.manualHuntGold(S, NOW), 4870);
    S.idle.boostUntil = NOW + MIN;
    assert.strictEqual(I.manualHuntGold(S, NOW), 7305);
  });
  test('AC22: best 15, harvest lv5, auto event → 3222; + {work,3} 4672; + booster 7008; none 2148', () => {
    const S = evState(15);
    S.idle.up.gold = 5; S.idle.autoOn = true;
    assert.strictEqual(I.autoRunGold(S, NOW), 2148);
    withEvent(S, 'auto');
    assert.strictEqual(I.autoRunGold(S, NOW), 3222);
    S.swords[0].trait = tr('work', 3);
    assert.strictEqual(I.autoRunGold(S, NOW), 4672);
    S.idle.boostUntil = NOW + MIN;
    assert.strictEqual(I.autoRunGold(S, NOW), 7008);
  });
  test('AC22a (rules): runAutoCatchup {noEvent:true} with auto / ore active equals the no-event run; without opts the bonus applies; events untouched', () => {
    const make = id => {
      const S = evState(15);
      S.idle.up.gold = 5; S.idle.autoOn = true;
      return id ? withEvent(S, id) : S;
    };
    const run = (S, opts) => {
      const rng = countedSeq(0.3);
      const out = I.runAutoCatchup(S, NOW, NOW - 30 * 1000, rng, opts);
      return { out, calls: rng.calls, gold: S.gold, ore: clone(S.ore) };
    };
    const base = run(make(null));
    assert.ok(base.out.runs > 0 && base.out.runs <= C.AUTO_CATCHUP_MAX);
    ['auto', 'ore'].forEach(id => {
      const S = make(id);
      const ev = clone(S.events);
      assert.deepStrictEqual(run(S, { noEvent: true }), base, id);
      assert.deepStrictEqual(S.events, ev, `${id}: catch-up does not touch events`);
      assert.notDeepStrictEqual(run(make(id)), base, `${id}: a normal tick gets the bonus`);
    });
    assert.strictEqual(run(make('auto')).out.gold, base.out.runs * 3222);
    assert.deepStrictEqual(run(make(null), { noEvent: true }), base, 'no event: opts change nothing');
  });
  test('AC23 / AC37: settleOffline (8 h, auto on) pays exactly the no-event amount for every event; S.events untouched', () => {
    const make = id => {
      const S = evState(15);
      S.idle.autoOn = true; S.idle.up.gold = 5; S.idle.lastSeen = NOW - 8 * HOUR; S.idle.boostUntil = NOW - 7 * HOUR;
      return id ? withEvent(S, id, 240000) : S;
    };
    const plain = make(null);
    const want = I.settleOffline(plain, NOW);
    assert.ok(want.gold > 0);
    C.EVENT_IDS.forEach(id => {
      const S = make(id);
      const ev = clone(S.events);
      assert.deepStrictEqual(I.settleOffline(S, NOW), want, id);
      assert.deepStrictEqual([S.events, S.gold, S.ore], [ev, plain.gold, plain.ore], id);
    });
  });
  test('AC24: best 20 hunt → 277846; + booster 416770; + {hunt,3} + booster 541801', () => {
    const S = withEvent(evState(20), 'hunt');
    assert.strictEqual(I.manualHuntGold(S, NOW), 277846);
    S.idle.boostUntil = NOW + MIN;
    assert.strictEqual(I.manualHuntGold(S, NOW), 416770);
    S.swords[0].trait = tr('hunt', 3);
    assert.strictEqual(I.manualHuntGold(S, NOW), 541801);
  });
  test('AC25: ore event, no miner — iron always 3; silver .49 → 2, .51 → 1; mithril .74 → 1, .76 → 0; 1 rng call per ore kind', () => {
    const S = withEvent(evState(12), 'ore');
    [0, 0.5, 0.9999].forEach(v => assert.strictEqual(F.rollOre(S, () => v).iron, 3));
    assert.deepStrictEqual([0.49, 0.51].map(v => F.rollOre(S, () => v).silver), [2, 1]);
    assert.deepStrictEqual([0.74, 0.76].map(v => F.rollOre(S, () => v).mithril), [1, 0]);
    const rng = countedSeq(0.5);
    F.rollOre(S, rng);
    assert.strictEqual(rng.calls, 3);
  });
  test('AC26: ore event + {ore,3} → iron 48000 (4.8), silver 24000, mithril 12000; event off = traits AC27 values', () => {
    const S = withEvent(evState(12, tr('ore', 3)), 'ore');
    assert.deepStrictEqual([0.79, 0.81].map(v => F.rollOre(S, () => v).iron), [5, 4]);
    assert.deepStrictEqual([0.39, 0.41].map(v => F.rollOre(S, () => v).silver), [3, 2]);
    assert.deepStrictEqual([0.19, 0.21].map(v => F.rollOre(S, () => v).mithril), [2, 1]);
    S.events.active = null;
    assert.deepStrictEqual([0.19, 0.21].map(v => F.rollOre(S, () => v).iron), [4, 3]);
    assert.deepStrictEqual([0.79, 0.81].map(v => F.rollOre(S, () => v).mithril), [1, 0]);
  });
  test('AC26a: expectedOre (offline) ignores the ore event; locked ores stay locked', () => {
    const S = evState(12, tr('ore', 2));
    const want = F.expectedOre(S, 999, 0.25);
    withEvent(S, 'ore');
    assert.deepStrictEqual(F.expectedOre(S, 999, 0.25), want);
    const low = withEvent(evState(6), 'ore');
    assert.deepStrictEqual(Object.keys(F.rollOre(low, () => 0)), ['iron']);
    assert.deepStrictEqual(Object.keys(F.expectedOre(low, 10, 1)), ['iron']);
  });
  test('AC27: anvil guard, no smith — 2nd rng .39 keeps durability, .41 spends 1; exactly 2 calls', () => {
    [[0.39, C.ANVIL_DURA[3], true], [0.41, C.ANVIL_DURA[3] - 1, undefined]].forEach(([v, dura, kept]) => {
      const S = withEvent(anvilState(12, null), 'anvil');
      const rng = countedSeq(0.9999, v);
      const r = R.attemptEnhance(S, rng);
      assert.deepStrictEqual([S.anvils[0].dura, r.anvilKept, rng.calls], [dura, kept, 2], String(v));
    });
  });
  test('AC28: anvil guard + {anvil,3} → saveP1e4 6700: .66 keeps, .68 spends; 2 calls (one combined roll)', () => {
    [[0.66, C.ANVIL_DURA[3]], [0.68, C.ANVIL_DURA[3] - 1]].forEach(([v, dura]) => {
      const S = withEvent(anvilState(12, tr('anvil', 3)), 'anvil');
      const rng = countedSeq(0.9999, v);
      R.attemptEnhance(S, rng);
      assert.deepStrictEqual([S.anvils[0].dura, rng.calls], [dura, 2], String(v));
    });
  });
  test('AC29: anvil guard but toggle off / no anvil / full gauge → no guard roll (1 call); dura 1 kept → no anvilBroke', () => {
    const off = withEvent(anvilState(12, null), 'anvil');
    R.setUse(off, 'anvil', false);
    const none = withEvent(evState(12), 'anvil');
    const full = withEvent(anvilState(16, null), 'anvil');
    full.gauge[1] = C.GAUGE_N[1];
    [off, none, full].forEach((S, i) => {
      const rng = countedSeq(0.9999, 0);
      R.attemptEnhance(S, rng);
      assert.strictEqual(rng.calls, 1, String(i));
    });
    assert.deepStrictEqual([off.anvils[0].dura, full.anvils[0].dura], [C.ANVIL_DURA[3], C.ANVIL_DURA[3]]);
    const one = withEvent(anvilState(12, null, 1), 'anvil');
    const r = R.attemptEnhance(one, countedSeq(0.9999, 0.1));
    assert.deepStrictEqual([one.anvils[0].dura, r.anvilKept, r.anvilBroke], [1, true, undefined]);
  });
  test('AC29a: quest sale at best 15 → rerollCost 21480 (none 42960), rerollQuest charges it, 21479 gold → noGold; best 5 → 270', () => {
    const S = evState(15);
    S.quests.list[0] = { id: 9, tier: 'easy', lv: 4, gold: Q.questGold('easy', 4), item: null };
    assert.strictEqual(Q.rerollCost(S), 42960);
    withEvent(S, 'quest');
    assert.strictEqual(Q.rerollCost(S), 21480);
    S.gold = 21479;
    assert.strictEqual(Q.rerollBlock(S, 0), 'noGold');
    S.gold = 100000;
    const r = Q.rerollQuest(S, 0, () => 0.5);
    assert.deepStrictEqual([r.ok, r.price, S.gold], [true, 21480, 100000 - 21480]);
    assert.strictEqual(Q.rerollCost(withEvent(evState(5), 'quest')), 270);
  });
  test('AC29b: quest sale leaves quest rewards, levels, cooldowns and generation unchanged', () => {
    const play = ev => {
      const S = stateWith({ swords: [sword(1, 15), sword(2, 6), sword(3, 9)], top: { gold: 1e9 } });
      if (ev) withEvent(S, 'quest');
      const rng = countedSeq(0.1, 0.7, 0.3, 0.9, 0.5);
      const out = [Q.refreshQuests(S, NOW, rng)];
      Q.deliverableSlots(S).forEach(slot => out.push(Q.deliver(S, slot, NOW, { confirmActive: true })));
      out.push(Q.refreshQuests(S, NOW + C.QUEST_COOLDOWN_SEC * 1000, rng));
      const rr = Q.rerollQuest(S, 0, rng);
      out.push(rr.ok && rr.quest);
      return { out, quests: S.quests, calls: rng.calls };
    };
    assert.deepStrictEqual(play(true), play(false));
  });
  test('AC30: with any event active, trait/monument/booster prices and cost/sell/huntReward are unchanged', () => {
    const prices = S => [R.traitRekindCost(S), R.traitTierUpCost(S, 1), R.traitTierUpCost(S, 2), R.monumentCost(10), R.monumentCost(20),
      R.boosterPrice(S.best), R.cost(S.best), R.sell(S.best), R.huntReward(S.best)];
    const want = prices(evState(17));
    C.EVENT_IDS.forEach(id => assert.deepStrictEqual(prices(withEvent(evState(17), id)), want, id));
  });
  test('AC31: payoutPreview / sellSword / deliver are unchanged by any event', () => {
    const run = id => {
      const S = stateWith({ swords: [sword(1, 15), sword(2, 9, tr('trade', 2)), sword(3, 8)], top: { gold: 1000 }, inv: { seal: 2 } });
      if (id) withEvent(S, id);
      R.setSeal(S, true);
      const pre = R.payoutPreview(S, R.sell(9), R.findSword(S, 2));
      const sold = R.sellSword(S, 2);
      S.quests.list[0] = { id: 9, tier: 'easy', lv: 8, gold: Q.questGold('easy', 8), item: null };
      const d = Q.deliver(S, 0, NOW, { confirmActive: true });
      return json([pre, sold, d, S.gold, S.inv, S.stats]);
    };
    const want = run(null);
    C.EVENT_IDS.forEach(id => assert.strictEqual(run(id), want, id));
  });
});

describe('F13 save fields and test hook (AC 43-48, 50, 52)', () => {
  const norm = d => SV.normalize(Object.assign(fresh(), d), NOW);
  const DEF = { active: null, sinceMs: 0, nextAtMs: 900000 };
  test('AC43: new game → events default, eventsSeen 0', () => {
    assert.deepStrictEqual([fresh().events, fresh().stats.eventsSeen], [DEF, 0]);
  });
  test('AC44: events missing / [] / 5 / "x" / null → default', () => {
    const S = fresh();
    delete S.events;
    assert.deepStrictEqual(SV.normalize(S, NOW).events, DEF);
    [[], 5, 'x', null].forEach(v => assert.deepStrictEqual(norm({ events: v }).events, DEF, json(v)));
  });
  test('AC45: active normalization — bad id / prototype ids / ≤ 0 / non-numeric → null; clamp to own duration; numeric strings; floor; extra fields dropped', () => {
    const act = a => norm({ events: { active: a, sinceMs: 0, nextAtMs: 900000 } }).events.active;
    [{ id: 'x' }, { id: 'constructor', remainMs: 1000 }, { id: '__proto__', remainMs: 1000 }, { id: 'toString', remainMs: 1000 },
      { id: 'luck', remainMs: -5 }, { id: 'luck', remainMs: 'abc' }, { id: 'luck', remainMs: 0 }, { id: 'luck' }, { remainMs: 1000 },
      'luck', 7, [], null].forEach(a => assert.strictEqual(act(a), null, json(a)));
    assert.deepStrictEqual(act({ id: 'luck', remainMs: 99999999 }), { id: 'luck', remainMs: 300000 });
    assert.deepStrictEqual(act({ id: 'hunt', remainMs: '120000' }), { id: 'hunt', remainMs: 120000 });
    assert.deepStrictEqual(act({ id: 'luck', remainMs: 1000.9, extra: 1, def: { value: 99 } }), { id: 'luck', remainMs: 1000 });
    assert.strictEqual(act(JSON.parse('{"id":"__proto__","remainMs":1000}')), null);
  });
  test('AC46: sinceMs -1 / 1e12 / "500" → 0 / 1800000 / 500; nextAtMs 100 / 9e9 / missing → 900000 / 1800000 / 900000', () => {
    const ev = e => norm({ events: e }).events;
    assert.deepStrictEqual([-1, 1e12, '500'].map(v => ev({ sinceMs: v }).sinceMs), [0, 1800000, 500]);
    assert.deepStrictEqual([100, 9e9, undefined].map(v => ev({ nextAtMs: v }).nextAtMs), [900000, 1800000, 900000]);
    assert.deepStrictEqual(Object.keys(ev({ sinceMs: 5, junk: 1 })), ['active', 'sinceMs', 'nextAtMs']);
  });
  test('AC47: eventsSeen missing / negative / text / fraction → integer ≥ 0', () => {
    const S = fresh();
    delete S.stats.eventsSeen;
    assert.strictEqual(SV.normalize(S, NOW).stats.eventsSeen, 0);
    assert.deepStrictEqual([-3, 'abc', 2.9, '7'].map(v => norm({ stats: { eventsSeen: v } }).stats.eventsSeen), [0, 0, 2, 7]);
  });
  test('AC48: save → load keeps events and eventsSeen; stored v stays 2', () => {
    const S = withEvent(evState(13), 'auto', 123456);
    S.events.sinceMs = 0; S.events.nextAtMs = 1350000; S.stats.eventsSeen = 7;
    const st = memStorage();
    assert.ok(SV.save(st, S, NOW));
    const raw = JSON.parse(st.dump[C.SAVE_KEY]);
    assert.strictEqual(raw.v, 2);
    const L = SV.load(st, NOW).state;
    assert.deepStrictEqual([L.events, L.stats.eventsSeen], [{ active: { id: 'auto', remainMs: 123456 }, sinceMs: 0, nextAtMs: 1350000 }, 7]);
    const T = evState(5);
    T.events.sinceMs = 4321;
    SV.save(st, T, NOW);
    assert.deepStrictEqual(SV.load(st, NOW).state.events, { active: null, sinceMs: 4321, nextAtMs: 900000 });
  });
  test('AC50: setEvent(luck, 120000) sets active; bad id / time → badEvent / badTime with state unchanged', () => {
    const S = evState(5);
    assert.deepStrictEqual(E.setEvent(S, 'luck', 120000), { ok: true });
    assert.deepStrictEqual(S.events.active, { id: 'luck', remainMs: 120000 });
    const before = clone(S);
    [['x', 1000, 'badEvent'], ['constructor', 1000, 'badEvent'], ['__proto__', 1000, 'badEvent'], ['luck', 0, 'badTime'], ['luck', 300001, 'badTime'], ['luck', 1.5, 'badTime']]
      .forEach(([id, ms, reason]) => assert.deepStrictEqual(E.setEvent(S, id, ms), { ok: false, reason }, `${id} ${ms}`));
    assert.deepStrictEqual(clone(S), before);
    const noHook = src => !/\bsetEvent\b/.test(src);
    ['main.js', 'view.js'].forEach(f => assert.ok(noHook(fs.readFileSync(js(f), 'utf8')), `no setEvent entry point in ${f}`));
    assert.ok(noHook(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')), 'none in index.html');
    assert.ok(!noHook('E.setEvent(S)') && noHook('resetEventMono()'), 'the pattern itself');
  });
  test('AC52: best 4 with a tampered active event → every effect is 0', () => {
    C.EVENT_IDS.forEach(id => {
      const S = stateWith({ swords: [sword(1, 4)], top: { gold: 1e9 } });
      S.idle.autoOn = true; S.quests.list[0] = { id: 9, tier: 'easy', lv: 1, gold: 100, item: null };
      const plain = clone(S);
      S.events.active = { id, remainMs: 100000 };
      assert.strictEqual(E.activeEvent(S), null, id);
      assert.deepStrictEqual([E.eventValue(S, id), E.luckBonus(S, 10)], [0, 0], id);
      const outs = T => json([I.manualHuntGold(T, NOW), I.autoRunGold(T, NOW), F.rollOre(T, () => 0.3), Q.rerollCost(T), R.currentChances(T)]);
      assert.strictEqual(outs(S), outs(plain), id);
    });
  });
});

describe('F13 hard rule §2.5: no active event = pre-F13 values and rng call sequence', () => {
  function lcgCounted(seed) {
    let s = seed >>> 0;
    const f = () => { f.calls++; s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    f.calls = 0;
    return f;
  }
  // 시드 고정 900회 강화(축복·모루·보호·하락 방지·확정권·특성 교체) + 사냥 + 자동 catch-up + 판매·납품·새로고침 + 오프라인.
  // 기대값은 F13 도입 전 코드(커밋 dda600f의 js/)를 별도 VM에 올려 같은 시나리오로 한 번 계산해 박아 둔 것이다.
  // 새 결과 필드(eventAssist, chances의 event·succNoEvent·eventGain·eventLost)와 S.events만 빼고 비교한다
  const PRE_EVENT_SHA = '0d0f092c185c812c8952ec6e4dcb4833ef90b91dd4d0bda1199d538791ab3119';
  const PRE_EVENT_MARKS_SHA = 'cb896f43abcf13b95d9f91490017fc65e0dbfa85d4d33e093655945e4c5c9fa7';
  function eventIdentityScenario(seed) {
    const rng = lcgCounted(seed);
    const S = SV.defaultState(NOW);
    let t = NOW;
    S.gold = 8e7; S.slots = 5;
    Object.assign(S.inv, { bless: 90, protect: 99, keepdown: 40, sure: 12, seal: 6, booster: 2 });
    R.addAnvil(S, 3); R.addAnvil(S, 1);
    let nextAuto = t;
    const results = [];
    const flow = [];
    const marks = [];
    let assists = 0;
    for (let i = 0; i < 900; i++) {
      if (!R.activeSword(S)) R.setActive(S, R.bestSword(S).id);
      if (i % 60 === 0) S.swords.forEach((s, j) => { s.trait = { k: C.TRAIT_KINDS[(i / 60 + j) % C.TRAIT_KINDS.length], t: 1 + ((i + j) % 3) }; });
      R.setUse(S, 'bless', i % 3 !== 1);
      R.setUse(S, 'anvil', i % 5 !== 4);
      R.setUse(S, 'protect', i % 2 === 0);
      R.setUse(S, 'keepdown', i % 4 !== 0);
      R.setUse(S, 'sure', i % 13 === 0);
      if (i % 17 === 0) F.equipAnvil(S, S.anvils[(i / 17) % S.anvils.length].id);
      const r = R.attemptEnhance(S, rng);
      const p = Object.assign({}, r);
      if (p.eventAssist) assists++;
      delete p.eventAssist;
      if (p.chances) { p.chances = Object.assign({}, p.chances); NEW_CHANCE_KEYS.forEach(k => delete p.chances[k]); }
      results.push(p);
      S.anvils.forEach(a => { if (a.dura <= 0) { C.ORES.forEach(k => { S.ore[k] = Math.max(S.ore[k], 300); }); F.repairAnvil(S, a.id); } });
      if (i % 50 === 25) R.setActive(S, S.swords.reduce((lo, s) => (s.lv < lo.lv ? s : lo), S.swords[0]).id);
      if (i % 50 === 45) R.setActive(S, R.bestSword(S).id);
      if (i === 40 || i === 500) R.useBoosterFromInv(S, t);
      if (i % 4 === 0) flow.push(['h', I.manualHunt(S, t, rng)]);
      if (i % 6 === 0) {
        if (!S.idle.autoOn) I.setAutoOn(S, true);
        const a = I.runAutoCatchup(S, t, nextAuto, rng);
        nextAuto = a.nextAutoAt;
        flow.push(['a', a]);
      }
      if (S.swords.length < S.slots && R.activeSword(S) && R.activeSword(S).lv >= 11) R.buySword(S);
      const spare = S.swords.find(s => s.id !== S.active && s.lv >= 6 && s.lv <= 9);
      if (spare && i % 11 === 0) { R.setSeal(S, i % 22 === 0); flow.push(['s', R.sellSword(S, spare.id)]); }
      Q.refreshQuests(S, t, rng);
      if (i % 37 === 0) flow.push(['q', Q.rerollCost(S), Q.rerollBlock(S, 0), Q.rerollQuest(S, 0, rng)]);
      Q.deliverableSlots(S).forEach(slot => { R.setSeal(S, slot === 1); flow.push(['d', Q.deliver(S, slot, t, { confirmActive: true })]); });
      marks.push(rng.calls);
      t += 2500;
    }
    S.idle.boostUntil = t + 30 * 60 * 1000;
    S.idle.lastSeen = t;
    const off = I.settleOffline(S, t + 5 * 3600 * 1000);
    const state = JSON.parse(JSON.stringify(S));
    delete state.events;
    // 8-A 신규 필드(기본값 그대로)는 F13 이전 다이제스트에 없다
    delete state.rebirth;
    return { digest: { calls: rng.calls, marks, results, flow, off, state }, assists, events: S.events, eventsSeen: S.stats.eventsSeen };
  }
  const sha = x => require('crypto').createHash('sha256').update(JSON.stringify(x)).digest('hex');
  let cached = null;
  const scenario = () => cached || (cached = eventIdentityScenario(20261123));
  test('seeded 900-attempt scenario (events unlocked, active null) matches the pre-F13 digest', () => {
    const d = scenario().digest;
    assert.deepStrictEqual([d.calls, d.state.best, d.state.gold, d.state.stats.tries, d.state.mastery], [2955, 16, 81162031, 900, [2, 0, 0, 0, 0]]);
    assert.strictEqual(sha(d), PRE_EVENT_SHA);
  });
  test('rng call sequence: total 2955 calls and the per-iteration call counts match pre-F13', () => {
    const { marks } = scenario().digest;
    assert.strictEqual(marks.length, 900);
    assert.strictEqual(sha(marks), PRE_EVENT_MARKS_SHA);
  });
  test('no event ever started or assisted: events stay default, eventsSeen 0, eventAssist always false', () => {
    const run = scenario();
    assert.deepStrictEqual([run.assists, run.events, run.eventsSeen], [0, { active: null, sinceMs: 0, nextAtMs: 900000 }, 0]);
  });
});

// ============================================================ 7-2 F13 이벤트 화면 문자열 (m2-events §9, AC 32·33·34·50)
// view.js는 불러올 때 DOM을 읽지 않으므로(fx.js도 마찬가지) 이 프로세스의 SG 위에 올려 순수 문자열 함수만 부른다
require(js('fx.js'));
require(js('view.js'));
const V = globalThis.SG.view;
const plainText = html => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const BREAKDOWN_TERM = /^(축복|모루|보정|이벤트) (\d+)$/;
/** 확률 내역 줄을 글자로 풀어 { base, terms: [[이름, 값]], shownRaw(없으면 null), text } */
function parseBreakdown(c) {
  const text = plainText(V.breakdownHTML(c));
  const head = text.split(' = ')[0];
  const [baseTerm, ...rest] = head.split(' + ').filter(t => !t.startsWith('숙련'));
  const terms = rest.map(t => {
    const m = t.match(BREAKDOWN_TERM);
    assert.ok(m, `unexpected term "${t}" in "${text}"`);
    return [m[1], Number(m[2])];
  });
  const after = text.slice(head.length).match(/^ = \+(\d+)/);
  return { base: Number(baseTerm.match(/^기본 (\d+)%$/)[1]), terms, shownRaw: after ? Number(after[1]) : null, text };
}

describe('7-2 event chip text and label (AC 32)', () => {
  const chipOf = (id, remainMs) => {
    const a = E.activeEvent(withEvent(evState(13), id, remainMs));
    return { html: V.eventChipHTML(a), label: V.eventChipLabel(a) };
  };
  test('chip = icon + name + m:ss (ceil); the last moment shows 0:01', () => {
    assert.strictEqual(chipOf('luck', 252000).html,
      '<span class="ev-icon" aria-hidden="true">🍀</span><span class="ev-name">행운의 시간</span> <span class="ev-clock">4:12</span>');
    assert.deepStrictEqual([300000, 251001, 251000, 60000, 59001, 1001, 1000, 1].map(ms => plainText(chipOf('hunt', ms).html)),
      ['🏹사냥 대목 5:00', '🏹사냥 대목 4:12', '🏹사냥 대목 4:11', '🏹사냥 대목 1:00', '🏹사냥 대목 1:00', '🏹사냥 대목 0:02', '🏹사냥 대목 0:01', '🏹사냥 대목 0:01']);
  });
  test('label (title) = name m:ss 남음 · effect sentence, for every event', () => {
    assert.strictEqual(chipOf('luck', 251500).label, '행운의 시간 4:12 남음 · 강화 성공 확률 +5%p');
    C.EVENT_IDS.forEach(id => {
      const S = withEvent(evState(13), id, 1);
      S.idle.autoOn = true;
      const a = E.activeEvent(S);
      assert.strictEqual(V.eventChipLabel(a), `${C.EVENTS[id].name} 0:01 남음 · ${C.EVENTS[id].desc}`, id);
      assert.ok(V.eventChipHTML(a).includes(`>${C.EVENTS[id].icon}<`) && V.eventChipHTML(a).includes(`>${C.EVENTS[id].name}<`), id);
    });
  });
});

describe('7-2 breakdown line with the lucky hour term (AC 33, §9)', () => {
  const LEVELS = Array.from({ length: C.EVENT_LUCK_MAX_LV - C.EVENT_LUCK_MIN_LV + 1 }, (_, i) => C.EVENT_LUCK_MIN_LV + i);
  const GRADES = [0, 1, 2, 3];
  const PITIES = [0, 2, 10];
  const MASTERIES = [0, 1, 4];
  /** 원인 판정 기대값(§9): 이벤트를 빼도 상한 이상이면 상한, 아니면 천장 */
  const expectedNote = c => {
    if (c.eventGain >= c.event) return '';
    if (c.eventGain > 0) return ` · 이벤트 실효 +${c.eventGain}%p`;
    return ` · 이벤트 효과 없음(${c.raw - c.event >= c.cap ? '상한' : '천장'})`;
  };
  const grid = [];
  LEVELS.forEach(lv => [false, true].forEach(bless => GRADES.forEach(anvilGrade => PITIES.forEach(pity => MASTERIES.forEach(mastery =>
    [5, 0].forEach(event => grid.push({ lv, opts: { bless, anvilGrade, mastery, event }, c: R.chances(sword(1, lv, null, { pity }), { bless, anvilGrade, mastery, event }) })))))));
  test(`grid lv ${LEVELS[0]}..${LEVELS[LEVELS.length - 1]} × bless × anvil × pity × mastery × event 5/0 (${grid.length} cases): shown terms sum to raw`, () => {
    grid.forEach(({ lv, opts, c }) => {
      const p = parseBreakdown(c);
      const where = `+${lv} ${json(opts)}: ${p.text}`;
      assert.strictEqual(p.base, c.base, where);
      assert.strictEqual(p.terms.reduce((s, [, v]) => s + v, 0), c.raw, where);
      assert.strictEqual(p.shownRaw, c.raw > 0 ? c.raw : null, where);
      const eventTerms = p.terms.filter(([n]) => n === '이벤트');
      if (opts.event) {
        assert.deepStrictEqual(eventTerms, [['이벤트', 5]], where);
        assert.strictEqual(p.terms[p.terms.length - 1][0], '이벤트', 'the event term comes after 보정: ' + where);
      } else {
        assert.ok(!p.text.includes('이벤트'), where);
      }
    });
  });
  test('grid: the event note is at the very end and says 실효 / 효과 없음(상한|천장) / nothing exactly by eventGain', () => {
    const seen = { full: 0, partial: 0, cap: 0, ceil: 0, none: 0 };
    grid.forEach(({ lv, opts, c }) => {
      const html = V.breakdownHTML(c);
      const want = expectedNote(c);
      const where = `+${lv} ${json(opts)}: ${html}`;
      assert.strictEqual(V.eventBreakdownNote(c), want, where);
      assert.ok(want === '' ? !/이벤트 (실효|효과 없음)/.test(html) : html.endsWith(want), where);
      if (!opts.event) { seen.none++; return; }
      if (want === '') seen.full++;
      else if (c.eventGain > 0) seen.partial++;
      else if (V.eventCapCause(c) === 'cap') seen.cap++;
      else seen.ceil++;
      // 원인 판정이 실제 확률과 맞는지: 상한이면 이벤트 없이도 보너스가 상한, 천장이면 이벤트 없는 성공률이 이미 천장
      if (c.eventGain === 0 && V.eventCapCause(c) === 'cap') assert.strictEqual(Math.min(c.raw - c.event, c.cap), c.cap, where);
      if (c.eventGain === 0 && V.eventCapCause(c) === 'ceil') assert.strictEqual(c.succNoEvent, Math.max(c.base, C.SUCC_CEIL), where);
    });
    assert.ok(seen.full > 0 && seen.partial > 0 && seen.cap > 0 && seen.none > 0, 'the grid reaches every reachable note kind: ' + json(seen));
  });
  test('§9 examples render exactly: +13 bless+iron (실효 +2%p), bless+mithril (효과 없음(상한)), +15 bless+steel mastery 4 (실효 +1%p)', () => {
    const cap = '<span class="badge warn">상한 14</span>';
    assert.strictEqual(V.breakdownHTML(R.chances(sword(1, 13), { bless: true, anvilGrade: 1, event: 5 })),
      `기본 30% + 축복 10 + 모루 2 + 이벤트 5 = +17 → <s>+17</s> +14 ${cap} · 이벤트 실효 +2%p`);
    assert.strictEqual(V.breakdownHTML(R.chances(sword(1, 13), { bless: true, anvilGrade: 3, event: 5 })),
      `기본 30% + 축복 10 + 모루 4 + 이벤트 5 = +19 → <s>+19</s> +14 ${cap} · 이벤트 효과 없음(상한)`);
    assert.strictEqual(V.breakdownHTML(R.chances(sword(1, 15), { bless: true, anvilGrade: 2, mastery: 4, event: 5 })),
      `기본 20% + 축복 10 + 모루 3 + 이벤트 5 = +18 → <s>+18</s> +14 ${cap} + <span class="mastery-term">숙련 +12</span> = 46% · 이벤트 실효 +1%p`);
    assert.strictEqual(V.breakdownHTML(R.chances(sword(1, 13), { event: 5 })), '기본 30% + 이벤트 5 = +5');
  });
  test('the 천장 cause (raw − event < cap, eventGain 0) is chosen from the chances fields alone', () => {
    // 출시 상수(+5~+19)로는 도달하지 않는 조합이라 chances() 반환 형태의 객체로 원인 판정만 확인한다
    const c = { base: 80, parts: { bless: 10, anvil: 0, pity: 0 }, raw: 15, bonus: 15, cap: 20, mastery: 0, succ: 90, event: 5, succNoEvent: 90, eventGain: 0 };
    assert.strictEqual(V.eventCapCause(c), 'ceil');
    assert.strictEqual(V.eventBreakdownNote(c), ' · 이벤트 효과 없음(천장)');
    assert.strictEqual(V.breakdownHTML(c), `기본 80% + 축복 10 + 이벤트 5 = +15 <span class="badge warn">천장 90%</span> · 이벤트 효과 없음(천장)`);
    assert.strictEqual(V.eventCapCause(Object.assign({}, c, { raw: 25 })), 'cap', 'raw − event = cap → 상한');
  });
  test('certain attempts (gaugeFull / sure / forced) have no event term and no note even with opts.event 5', () => {
    const TM = loadTestModeSG();
    const cases = {
      gaugeFull: R.chances(sword(1, 15), { gaugeFull: true, event: 5 }),
      sure: R.chances(sword(1, 7), { sure: true, event: 5 }),
      forced: TM.rules.chances({ id: 1, lv: 13, prot: 3, pity: 0, trait: null }, { bless: true, event: 5 }),
    };
    Object.entries(cases).forEach(([flag, c]) => {
      assert.ok(c[flag] && c.event === 0 && c.parts === null, flag);
      const html = V.breakdownHTML(c);
      assert.ok(html.includes('100%') && !html.includes('이벤트') && V.eventBreakdownNote(c) === '', `${flag}: ${html}`);
    });
  });
});

describe('7-2 lucky hour popover reason and income helpers (§9)', () => {
  const luck = S => withEvent(S, 'luck');
  test('luckIdleText: no event / other event / effective / partial → empty', () => {
    assert.strictEqual(V.luckIdleText(evState(13)), '');
    assert.strictEqual(V.luckIdleText(withEvent(evState(13), 'hunt')), '');
    assert.strictEqual(V.luckIdleText(luck(evState(13))), '');
    assert.strictEqual(V.luckIdleText(luck(enhanceState(13, { g: 1, bless: true }))), '', 'eventGain 2 > 0');
  });
  test('luckIdleText reasons: no active sword / out of range (+4, +20) / certain (sure, gauge) / cap', () => {
    const none = luck(evState(13));
    none.active = 999;
    assert.strictEqual(V.luckIdleText(none), '활성 검이 없어 지금은 효과가 없습니다');
    [4, 20].forEach(lv => {
      const S = luck(stateWith({ swords: [sword(1, lv)], top: { best: 13 } }));
      assert.strictEqual(V.luckIdleText(S), `현재 검(+${lv})은 적용 범위(+5~+19) 밖이라 지금은 효과가 없습니다`, lv);
    });
    const sure = enhanceState(7);
    sure.inv.sure = 1;
    assert.ok(R.setUse(sure, 'sure', true).ok);
    const gauge = evState(15);
    gauge.gauge[0] = C.GAUGE_N[0];
    [sure, gauge].forEach(S => assert.strictEqual(V.luckIdleText(luck(S)), '이번 강화는 확정 성공이라 지금은 효과가 없습니다'));
    assert.strictEqual(V.luckIdleText(luck(enhanceState(13, { g: 3, bless: true }))), '보너스 상한(+14%p)에 이미 도달해 지금은 효과가 없습니다');
  });
  test('eventPopHTML: empty without an event; title, effect, clock, offline note; the idle reason only when it applies', () => {
    assert.strictEqual(V.eventPopHTML(evState(13)), '');
    const tampered = stateWith({ swords: [sword(1, 4)] });
    tampered.events.active = { id: 'luck', remainMs: 1000 };
    assert.strictEqual(V.eventPopHTML(tampered), '', 'best 4 tampered event shows nothing');
    const on = V.eventPopHTML(withEvent(evState(13), 'hunt', 251500));
    assert.strictEqual(on, '<b class="ev-pop-title">🏹 사냥 대목</b><span>수동 사냥 골드 +40%</span><span>남은 시간 <b class="ev-clock">4:12</b></span>' +
      '<small class="muted">접속 중에만 흐르고 오프라인에서는 적용되지 않습니다</small>');
    const capped = V.eventPopHTML(luck(enhanceState(13, { g: 3, bless: true })));
    assert.ok(capped.endsWith('<small class="ev-idle">보너스 상한(+14%p)에 이미 도달해 지금은 효과가 없습니다</small>'), capped);
    assert.ok(!V.eventPopHTML(luck(evState(13))).includes('ev-idle'));
  });
  test('incomeEventText / eventPctText follow eventValue (hunt +40%, auto +50%, ore +50%), empty otherwise', () => {
    const on = id => { const S = withEvent(evState(13), id); S.idle.autoOn = true; return S; };
    assert.strictEqual(V.incomeEventText(on('hunt')), ' · 이벤트 사냥 +40%');
    assert.strictEqual(V.incomeEventText(on('auto')), ' · 이벤트 자동 +50%');
    ['luck', 'ore', 'anvil', 'quest'].forEach(id => assert.strictEqual(V.incomeEventText(on(id)), '', id));
    assert.strictEqual(V.incomeEventText(evState(13)), '');
    assert.strictEqual(V.eventPctText(on('ore'), 'ore'), '+50%');
    assert.strictEqual(V.eventPctText(on('anvil'), 'anvil'), '+40%');
    assert.deepStrictEqual(['hunt', 'luck'].map(id => V.eventPctText(on(id), 'ore')), ['', '']);
    const tampered = stateWith({ swords: [sword(1, 4)] });
    tampered.events.active = { id: 'hunt', remainMs: 1000 };
    assert.deepStrictEqual([V.incomeEventText(tampered), V.eventPctText(tampered, 'hunt')], ['', ''], 'best 4: no event text');
  });
});

describe('7-2 toast and log texts (§9, AC 34)', () => {
  test('start / end toast texts for every event', () => {
    assert.strictEqual(V.eventStartText('luck'), '🍀 이벤트 시작: 행운의 시간 — 5분간 강화 성공 확률 +5%p');
    assert.strictEqual(V.eventEndText('luck'), '이벤트 종료: 행운의 시간');
    C.EVENT_IDS.forEach(id => {
      const d = C.EVENTS[id];
      assert.strictEqual(V.eventStartText(id), `${d.icon} 이벤트 시작: ${d.name} — ${d.durationSec / 60}분간 ${d.desc}`, id);
      assert.strictEqual(V.eventEndText(id), `이벤트 종료: ${d.name}`, id);
      assert.ok(!/undefined|NaN/.test(V.eventStartText(id) + V.eventEndText(id)), id);
    });
  });
  test('eventAssistText: +5~+14 plain, mastery levels (+15~+19) add the no-record note', () => {
    [5, 13, 14].forEach(from => assert.strictEqual(V.eventAssistText({ from }), '🍀 이벤트 덕에 성공', from));
    [15, 17, 19].forEach(from => assert.strictEqual(V.eventAssistText({ from }), '🍀 이벤트 덕에 성공 — 숙련 기록에는 세지 않습니다', from));
  });
  test('a real assisted success carries eventAssist and the matching log text', () => {
    const S = withEvent(evState(15), 'luck');
    const r = R.attemptEnhance(S, countedSeq(0.22));   // +15: 무이벤트 20%, 이벤트 25% → 22는 이벤트 덕
    assert.deepStrictEqual([r.outcome, r.eventAssist, V.eventAssistText(r)], ['success', true, '🍀 이벤트 덕에 성공 — 숙련 기록에는 세지 않습니다']);
  });
});

describe('REQ-047 event text cleanup (m2-events §8·§9·§11)', () => {
  test('eventDurationText: whole minutes "N분", otherwise "N분 S초" / "S초" (never a decimal minute)', () => {
    assert.deepStrictEqual([300, 60, 270, 45, 61, 3600].map(V.eventDurationText), ['5분', '1분', '4분 30초', '45초', '1분 1초', '60분']);
  });
  test('a non-whole-minute duration reads "4분 30초간" in the start toast, not "4.5분간"', () => {
    const def = C.EVENTS.luck;
    const shipped = def.durationSec;
    try {
      def.durationSec = 270;
      assert.strictEqual(V.eventStartText('luck'), '🍀 이벤트 시작: 행운의 시간 — 4분 30초간 강화 성공 확률 +5%p');
    } finally {
      def.durationSec = shipped;
    }
    assert.strictEqual(V.eventStartText('luck'), '🍀 이벤트 시작: 행운의 시간 — 5분간 강화 성공 확률 +5%p');
  });
  test('income events come from data: incomeLabel on hunt / auto only, every entry has the field', () => {
    assert.ok(C.EVENT_IDS.every(id => Object.prototype.hasOwnProperty.call(C.EVENTS[id], 'incomeLabel')));
    assert.deepStrictEqual(C.EVENT_IDS.filter(id => C.EVENTS[id].incomeLabel).map(id => [id, C.EVENTS[id].incomeLabel]), [['hunt', '사냥'], ['auto', '자동']]);
    const huntRush = withEvent(evState(13), 'hunt');
    assert.strictEqual(V.incomeEventText(huntRush),` · 이벤트 ${C.EVENTS.hunt.incomeLabel} +${C.EVENTS.hunt.value}%`);
  });
  test('the unused eventDescription API is gone (effect text is EVENTS[id].desc); no script refers to it', () => {
    assert.ok(!('eventDescription' in E));
    fs.readdirSync(path.join(__dirname, '..', 'js')).filter(f => f.endsWith('.js'))
      .forEach(f => assert.ok(!fs.readFileSync(js(f), 'utf8').includes('eventDescription'), f));
  });
});

// REQ-042 (4): 업적 조건·트랙 이름·일일 과제 문장 표가 상수 표를 빠짐없이 덮는다(빠지면 기록 탭 렌더가 TypeError)
describe('REQ-042 records text tables cover every achievement and daily pool entry', () => {
  const keys = o => Object.keys(o).sort();
  test('ACH_COND has a sentence for every achievement metric and no extra metric', () => {
    assert.deepStrictEqual(keys(V.ACH_COND), [...new Set(C.ACHIEVEMENTS.map(a => a.metric))].sort());
    C.ACHIEVEMENTS.forEach(a => {
      const text = V.ACH_COND[a.metric](a.need);
      assert.ok(typeof text === 'string' && text.length > 0 && !/undefined|NaN/.test(text), `${a.id}: ${text}`);
    });
  });
  test('ACH_TRACK_NAME names every achievement track and no extra track', () => {
    assert.deepStrictEqual(keys(V.ACH_TRACK_NAME), [...new Set(C.ACHIEVEMENTS.map(a => a.track))].sort());
    Object.values(V.ACH_TRACK_NAME).forEach(name => assert.ok(typeof name === 'string' && name.length > 0, name));
  });
  test('DAILY_TEXT has a sentence for every DAILY_POOL entry (all goal bands) and no extra entry', () => {
    assert.deepStrictEqual(keys(V.DAILY_TEXT), C.DAILY_POOL.map(e => e.id).sort());
    C.DAILY_POOL.forEach(e => (e.goals || [1]).forEach(goal => {
      const text = V.DAILY_TEXT[e.id](goal);
      assert.ok(typeof text === 'string' && text.length > 0 && !/undefined|NaN/.test(text), `${e.id}: ${text}`);
    }));
  });
});

describe('7-2 spawn tick keeps sinceMs within the save clamp (V8)', () => {
  const GAP_MAX = C.EVENT_GAP_MAX_SEC * 1000;
  test('sinceMs near the cap + dt 2000 → spawns with sinceMs ≤ 1800000, and the saved value survives load unchanged', () => {
    [GAP_MAX - 1, GAP_MAX - 500, GAP_MAX - 1999, GAP_MAX].forEach(since => {
      const S = evState(5);
      S.events.sinceMs = since; S.events.nextAtMs = GAP_MAX;
      assert.deepStrictEqual(E.advanceEvents(S, 2000, countedSeq(0)), { started: 'luck' }, String(since));
      assert.ok(S.events.sinceMs <= GAP_MAX, `${since} → ${S.events.sinceMs}`);
      assert.strictEqual(S.events.sinceMs, GAP_MAX);
      assert.strictEqual(SV.normalize(clone(S), NOW).events.sinceMs, S.events.sinceMs, 'normalize does not clip it');
    });
  });
  test('every tick from 0 to the spawn stays ≤ 1800000 and the spawn tick is unchanged (900th with nextAtMs = max)', () => {
    const S = evState(5);
    S.events.nextAtMs = GAP_MAX;
    let spawnedAt = null;
    for (let i = 1; i <= 1000 && spawnedAt === null; i++) {
      if (E.advanceEvents(S, 2000, countedSeq(0)).started) spawnedAt = i;
      assert.ok(S.events.sinceMs <= GAP_MAX, `tick ${i}: ${S.events.sinceMs}`);
    }
    assert.strictEqual(spawnedAt, GAP_MAX / 2000);
  });
  test('a tick that does not reach nextAtMs is not clipped', () => {
    const S = evState(5);
    S.events.sinceMs = 900000; S.events.nextAtMs = 1500000;
    assert.deepStrictEqual(E.advanceEvents(S, 2000, countedSeq(0)), {});
    assert.strictEqual(S.events.sinceMs, 902000);
  });
});

describe('7-2 EVENT_IDS / EVENTS load check is set equality (constants.js)', () => {
  const IDS_SRC = "const EVENT_IDS = ['luck', 'hunt', 'auto', 'ore', 'anvil', 'quest'];";
  const MSG = 'EVENT_IDS must equal the EVENTS keys as a set (no duplicates)';
  const withIds = list => src => {
    assert.ok(src.includes(IDS_SRC), 'the EVENT_IDS line is where the test expects it');
    return src.replace(IDS_SRC, `const EVENT_IDS = ${JSON.stringify(list)};`);
  };
  const keep = () => {};
  test('the shipped table loads; a reordered EVENT_IDS still loads', () => {
    assert.strictEqual(loadError(src => src, keep), null);
    assert.strictEqual(loadError(withIds(['quest', 'anvil', 'ore', 'auto', 'hunt', 'luck']), keep), null);
  });
  test('a duplicate id of the same length (the old length+includes check passed it) throws', () => {
    assert.strictEqual(loadError(withIds(['luck', 'hunt', 'auto', 'ore', 'anvil', 'luck']), keep), MSG);
    assert.strictEqual(loadError(withIds(['luck', 'hunt', 'auto', 'ore', 'anvil', 'anvil']), keep), MSG);
  });
  test('a missing id, an unknown id, or an extra EVENTS key throws', () => {
    assert.strictEqual(loadError(withIds(['luck', 'hunt', 'auto', 'ore', 'anvil']), keep), MSG);
    assert.strictEqual(loadError(withIds(['luck', 'hunt', 'auto', 'ore', 'anvil', 'bogus']), keep), MSG);
    const EXTRA_FROM = "    quest: eventEntry(";
    const extraKey = src => {
      assert.ok(src.includes(EXTRA_FROM));
      return src.replace(EXTRA_FROM, "    bonus: eventEntry('x', 'x', 0, 5, 300, 1, v => `${v}`),\n" + EXTRA_FROM);
    };
    assert.strictEqual(loadError(extraKey, keep), MSG);
  });
});

// ============================================================ 8-A F11 환생 규칙·명성 상점·저장 (m2-rebirth §10 AC 1~40, REQ-037)
const REBIRTH_FEE = 19846200;
const T_RB = NOW + 5 * MIN;
const deepCopy = x => JSON.parse(JSON.stringify(x));
const sw20 = (id, extra) => Object.assign({ id, lv: C.MAX, prot: C.PROTECT_USES, pity: 0, trait: null }, extra || {});
/** 환생 가능한 최소 상태: 첫 칸 +20 검, 골드 = 수수료 */
function rebirthReady(fields) {
  const S = fresh();
  S.swords = [sw20(1)];
  S.best = C.MAX;
  S.gold = REBIRTH_FEE;
  return Object.assign(S, fields || {});
}
/** 성공해야 하는 환생(실패하면 단언) */
function rebirthOk(S, now = T_RB) {
  const r = RB.rebirth(S, now);
  assert.ok(r.ok, JSON.stringify(r));
  return r;
}
/** 모든 최상위 필드를 기본값이 아닌 값으로 채운 정규화 상태(AC 10·11) */
function fullRebirthState() {
  const S = fresh(NOW - HOUR);
  Object.assign(S, { gold: 30000000, shards: 77, best: C.MAX, nextSwordId: 57, active: 9, slots: 7 });
  S.found = S.found.map(() => true);
  S.swords = [sw20(3, { trait: { k: 'hunt', t: 2 }, pity: 4 }), sw20(9, { prot: 1 }), { id: 12, lv: 5, prot: 2, pity: 1, trait: { k: 'work', t: 1 } }];
  S.gauge = [1, 2, 3, 4, 5];
  S.mastery = [4, 3, 0, 2, 1];
  S.monuments = S.monuments.map((_, i) => (i < 3 ? 1 : 0));
  C.CONSUMABLES.forEach(k => { S.inv[k] = 5; });
  Object.assign(S.use, { bless: true, seal: true });
  R.addAnvil(S, 2);
  R.addAnvil(S, 3);
  S.nextAnvilId = 9;
  S.anvilEq = S.anvils[0].id;
  C.ORES.forEach(k => { S.ore[k] = 50; });
  Q.refreshQuests(S, NOW - HOUR, () => 0.3);
  S.quests.readyAt = [5, 6, 7];
  S.quests.nextId = 12;
  S.idle = { autoOn: true, up: { speed: 2, gold: 3, offline: 1 }, lastSeen: NOW - 1000, boostUntil: NOW + 1000 };
  S.settings = { muted: true, skipFx: true };
  Object.keys(S.stats).forEach((k, i) => { S.stats[k] = 100 + i; });
  S.achievements = { tries_1: C.ACH_CLAIMED, best_3: C.ACH_REACHED };
  S.title = 'tries_1';
  A.refreshDaily(S, NOW - HOUR, () => 0.2, { tzOffsetMin: () => 0 });
  S.daily.tasks[0].claimed = 1;
  S.events = { active: { id: 'luck', remainMs: 1000 }, sinceMs: 1000, nextAtMs: 1000000 };
  S.rebirth = { count: 2, fame: 5, up: { startGold: 1, income: 2, slots: 1, autoStart: 1 } };
  return SV.normalize(S, NOW);
}
// §8 표(최종)를 그대로 옮긴 분류. defaultState에 새 최상위 키가 생기면 AC 12가 실패한다(결정 없이 넘어가지 않게)
const KEEP = 'keep';
const RESET = 'reset';
const RB_FIELD_TABLE = {
  v: KEEP,
  gold: (b, a) => assert.strictEqual(a.gold, C.START_GOLD + RB.startGoldBonus(b)),
  shards: RESET,
  best: RESET,
  found: KEEP,
  swords: (b, a) => assert.deepStrictEqual(a.swords, [{ id: b.nextSwordId, lv: 0, prot: C.PROTECT_USES, pity: 0, trait: null }]),
  nextSwordId: (b, a) => assert.strictEqual(a.nextSwordId, b.nextSwordId + 1),
  active: (b, a) => assert.strictEqual(a.active, b.nextSwordId),
  slots: (b, a) => assert.strictEqual(a.slots, C.SLOT_START + RB.fameValue(b, 'slots')),
  gauge: RESET,
  mastery: (b, a) => assert.deepStrictEqual(a.mastery, b.mastery.map(n => Math.min(n, C.MASTERY_KEEP_REC))),
  monuments: KEEP,
  inv: RESET,
  use: RESET,
  anvils: RESET,
  nextAnvilId: KEEP,
  anvilEq: RESET,
  ore: RESET,
  quests: (b, a, d) => assert.deepStrictEqual(a.quests, Object.assign({}, d.quests, { nextId: b.quests.nextId })),
  idle: RESET,   // defaultState(now): autoOn false, up 0, lastSeen = 환생 시각, boostUntil 0
  settings: KEEP,
  stats: KEEP,
  achievements: KEEP,
  title: KEEP,
  daily: KEEP,
  events: RESET,
  rebirth: (b, a) => assert.deepStrictEqual(a.rebirth,
    { count: b.rebirth.count + 1, fame: b.rebirth.fame + C.FAME_PER_REBIRTH, up: b.rebirth.up }),
};
function checkRebirthTable(before, after, now) {
  const def = SV.defaultState(now);
  Object.keys(RB_FIELD_TABLE).forEach(k => {
    const rule = RB_FIELD_TABLE[k];
    if (rule === KEEP) assert.deepStrictEqual(after[k], before[k], k);
    else if (rule === RESET) assert.deepStrictEqual(after[k], def[k], k);
    else rule(before, after, def);
  });
}

describe('F11 rebirth: conditions, fee, consumption (AC 1~9)', () => {
  test('AC 1: non-object state, non-array swords or non-object rebirth → invalid from canRebirth and rebirth, input unchanged', () => {
    const noRebirth = rebirthReady();
    delete noRebirth.rebirth;
    const bad = [null, undefined, 5, 'x', [], { swords: {}, rebirth: {} }, { swords: [sw20(1)], rebirth: null },
      { swords: [sw20(1)], rebirth: [] }, noRebirth];
    bad.forEach(S => {
      const before = JSON.stringify(S);
      assert.deepStrictEqual(RB.canRebirth(S), { ok: false, reason: 'invalid' }, before);
      assert.deepStrictEqual(RB.rebirth(S, T_RB), { ok: false, reason: 'invalid' }, before);
      assert.strictEqual(JSON.stringify(S), before);
    });
  });
  test('AC 2/4/3/7: best 20 with a +19 top sword → notReached; no +20 and 0 gold → notReached (order); fee − 1 → noGold; S unchanged on every failure', () => {
    const cases = [
      [rebirthReady({ swords: [{ id: 1, lv: 19, prot: 2, pity: 0, trait: null }], gold: 1e9 }), 'notReached'],
      [rebirthReady({ swords: [{ id: 1, lv: 3, prot: 2, pity: 0, trait: null }], gold: 0 }), 'notReached'],
      [rebirthReady({ gold: REBIRTH_FEE - 1 }), 'noGold'],
    ];
    cases.forEach(([S, reason]) => {
      const before = deepCopy(S);
      assert.deepStrictEqual(RB.canRebirth(S), { ok: false, reason });
      assert.deepStrictEqual(RB.rebirth(S, T_RB), { ok: false, reason });
      assert.deepStrictEqual(S, before, reason);
    });
    assert.deepStrictEqual(RB.canRebirth(rebirthReady()), { ok: true });
  });
  test('AC 5: fee is 19,846,200 = roundTo(100 × huntReward(20), 100) and does not depend on the state', () => {
    assert.strictEqual(R.huntReward(C.MAX), 198462);
    assert.strictEqual(RB.REBIRTH_FEE, REBIRTH_FEE);
    assert.strictEqual(RB.rebirthFee(), R.roundTo(C.REBIRTH_FEE_MULT * R.huntReward(C.MAX), C.REBIRTH_FEE_ROUND));
    const rich = rebirthReady({ gold: 1e12, rebirth: { count: 9, fame: 99, up: { startGold: 4, income: 4, slots: 2, autoStart: 1 } } });
    assert.strictEqual(RB.rebirthPreview(rich).fee, REBIRTH_FEE);
    assert.strictEqual(RB.rebirthPreview(rebirthReady()).fee, REBIRTH_FEE);
  });
  test('AC 6: two +20 and one +5 → exactly one +0 sword, no old id survives, consumedSwordId = the first +20', () => {
    const S = rebirthReady({ swords: [{ id: 4, lv: 5, prot: 2, pity: 0, trait: null }, sw20(7), sw20(8)], nextSwordId: 9 });
    const r = rebirthOk(S);
    assert.strictEqual(r.consumedSwordId, 7);
    assert.deepStrictEqual(S.swords.map(s => [s.id, s.lv]), [[9, 0]]);
  });
  test('AC 8: 30,000,000 gold → goldLost 10,153,800, gold after = 300 + start bonus, sinkGold/earned unchanged', () => {
    const S = rebirthReady({ gold: 30000000 });
    Object.assign(S.stats, { sinkGold: 1234, earned: 5678 });
    const r = rebirthOk(S);
    assert.deepStrictEqual([r.fee, r.goldLost, S.gold], [REBIRTH_FEE, 10153800, C.START_GOLD]);
    assert.deepStrictEqual([S.stats.sinkGold, S.stats.earned], [1234, 5678]);
  });
  test('AC 9: count 0 / fame 0 → 1 / 3, again → 2 / 6', () => {
    const S = rebirthReady();
    const r1 = rebirthOk(S);
    assert.deepStrictEqual([r1.count, r1.fame, r1.fameGain, S.rebirth.count, S.rebirth.fame], [1, 3, 3, 1, 3]);
    Object.assign(S, { swords: [sw20(S.nextSwordId)], best: C.MAX, gold: REBIRTH_FEE, nextSwordId: S.nextSwordId + 1 });
    const r2 = rebirthOk(S);
    assert.deepStrictEqual([r2.count, r2.fame, S.rebirth.count, S.rebirth.fame], [2, 6, 2, 6]);
  });
  test('count and fame stop at the save caps (runtime = load cap, V8)', () => {
    const S = rebirthReady({ rebirth: { count: C.REBIRTH_COUNT_MAX, fame: C.FAME_MAX - 1, up: { startGold: 0, income: 0, slots: 0, autoStart: 0 } } });
    rebirthOk(S);
    assert.deepStrictEqual([S.rebirth.count, S.rebirth.fame], [C.REBIRTH_COUNT_MAX, C.FAME_MAX]);
    assert.deepStrictEqual(SV.normalize(deepCopy(S), T_RB), S);
  });
  test('rebirthPreview: read-only values for the confirm dialog; failure keeps the reason and has no offering', () => {
    const S = fullRebirthState();
    const before = deepCopy(S);
    assert.deepStrictEqual(RB.rebirthPreview(S), {
      ok: true, fee: REBIRTH_FEE, gold: 30000000, goldLost: 10153800, fameGain: 3, consumedSwordId: 3,
      startGold: 2300, slots: 4, incomePct: 10, autoStart: true, keptMastery: [1, 1, 0, 1, 1],
    });
    assert.deepStrictEqual(S, before);
    const poor = rebirthReady({ swords: [{ id: 1, lv: 0, prot: 2, pity: 0, trait: null }], gold: 100 });
    const p = RB.rebirthPreview(poor);
    assert.deepStrictEqual([p.ok, p.reason, p.consumedSwordId, p.goldLost, p.startGold, p.autoStart], [false, 'notReached', null, 0, 300, false]);
    assert.deepStrictEqual(RB.rebirthPreview(null), { ok: false, reason: 'invalid' });
  });
});

describe('F11 rebirth: every save field reset/kept per the §8 table (AC 10~13, 36, 40)', () => {
  test('AC 12: every top-level defaultState key has a decision in the §8 table (a new field fails here)', () => {
    assert.deepStrictEqual(Object.keys(fresh()).sort(), Object.keys(RB_FIELD_TABLE).sort());
  });
  test('the table-driven state really differs from the defaults in every field (so keep/reset is observable)', () => {
    const S = fullRebirthState();
    const def = fresh(NOW);
    const same = Object.keys(RB_FIELD_TABLE).filter(k => k !== 'v' && JSON.stringify(S[k]) === JSON.stringify(def[k]));
    assert.deepStrictEqual(same, []);
  });
  test('AC 10/11: reset rows take their table value, kept rows are deep-equal, exceptions follow §8', () => {
    const S = fullRebirthState();
    const before = deepCopy(S);
    const r = rebirthOk(S);
    checkRebirthTable(before, S, T_RB);
    assert.deepStrictEqual([r.goldLost, r.consumedSwordId, r.count, r.fame], [10153800, 3, 3, 8]);
    assert.deepStrictEqual([S.gold, S.slots, S.idle.lastSeen, S.idle.autoOn], [2300, 4, T_RB, false]);
  });
  test('AC 13: counters are monotonic: new sword id 57, nextSwordId 58, nextAnvilId 9, quests.nextId 12; next rebirth uses a bigger id', () => {
    const S = fullRebirthState();
    rebirthOk(S);
    assert.deepStrictEqual([S.swords[0].id, S.active, S.nextSwordId, S.nextAnvilId, S.quests.nextId], [57, 57, 58, 9, 12]);
    Object.assign(S, { swords: [sw20(58)], nextSwordId: 59, best: C.MAX, gold: REBIRTH_FEE });
    rebirthOk(S);
    assert.deepStrictEqual([S.swords[0].id, S.nextSwordId], [59, 60]);
  });
  test('AC 36 / §8.1: normalize(reborn) deep-equals it, save → load round trip is identical, v = 2', () => {
    const S = fullRebirthState();
    rebirthOk(S);
    assert.deepStrictEqual(SV.normalize(deepCopy(S), T_RB), S);
    const st = memStorage();
    assert.ok(SV.save(st, S, T_RB));
    const loaded = SV.load(st, T_RB);
    assert.deepStrictEqual([loaded.source, loaded.state.v], ['v2', 2]);
    assert.deepStrictEqual(loaded.state, S);
    assert.deepStrictEqual([S.swords.length, S.best, S.slots >= S.swords.length], [1, 0, true]);
  });
  test('AC 40: a second rebirth after rebuilding a +20 follows the same table and stays normalized', () => {
    const S = fullRebirthState();
    rebirthOk(S);
    S.swords[0].lv = C.MAX;
    S.best = C.MAX;
    S.gold = REBIRTH_FEE * 2;
    const before = deepCopy(S);
    const r = rebirthOk(S, T_RB + HOUR);
    assert.deepStrictEqual([r.count, r.fame], [4, 11]);
    checkRebirthTable(before, S, T_RB + HOUR);
    assert.deepStrictEqual(SV.normalize(deepCopy(S), T_RB + HOUR), S);
  });
});

/** test.html 순서로 constants.js 원문을 patch해 새 VM 문맥에 규칙 모듈과 rebirth.js를 올린다 */
function loadPatchedRebirthSG(patch) {
  const ctx = { console, Math, Date, JSON, Object, Array, Number, String, Set, Map, Error };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(patch(fs.readFileSync(js('constants.js'), 'utf8')), ctx, { filename: 'constants.js' });
  ['events.js', 'rules.js', 'forge.js', 'idle.js', 'quests.js', 'save.js', 'rebirth.js']
    .forEach(f => vm.runInContext(fs.readFileSync(js(f), 'utf8'), ctx, { filename: f }));
  return ctx.SG;
}

describe('F11 rebirth: mastery and gauge (AC 14, 15)', () => {
  test('AC 14: mastery [4,3,0,2,1] → [1,1,0,1,1]; all-zero stays; gauge always [0,0,0,0,0]', () => {
    const S = rebirthReady({ mastery: [4, 3, 0, 2, 1], gauge: [4, 5, 6, 8, 10] });
    rebirthOk(S);
    assert.deepStrictEqual([S.mastery, S.gauge], [[1, 1, 0, 1, 1], [0, 0, 0, 0, 0]]);
    const Z = rebirthReady();
    rebirthOk(Z);
    assert.deepStrictEqual([Z.mastery, Z.gauge], [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]);
  });
  test('AC 14: MASTERY_KEEP_REC = 0 (constant only) → mastery always 0', () => {
    const LINE = 'const MASTERY_KEEP_REC = 1;';
    const T = loadPatchedRebirthSG(src => { assert.ok(src.includes(LINE)); return src.replace(LINE, 'const MASTERY_KEEP_REC = 0;'); });
    const S = T.save.defaultState(NOW);
    Object.assign(S, { swords: [sw20(1)], best: C.MAX, gold: REBIRTH_FEE, mastery: [4, 4, 4, 3, 2] });
    assert.ok(T.rebirth.rebirth(S, T_RB).ok);
    assert.deepStrictEqual(Array.from(S.mastery), [0, 0, 0, 0, 0]);
  });
  test('AC 15: mastery [4,4,4,3,2] → +15 chances mastery term 3 after rebirth (12 before)', () => {
    const S = rebirthReady({ mastery: [4, 4, 4, 3, 2] });
    assert.strictEqual(R.chances({ lv: 15, pity: 0 }, { mastery: S.mastery[0] }).mastery, 12);
    rebirthOk(S);
    assert.strictEqual(R.chances({ lv: 15, pity: 0 }, { mastery: S.mastery[0] }).mastery, 3 * 1);
    assert.strictEqual(C.MASTERY_STEP[0], 3);
  });
});

describe('F11 rebirth: events, achievements, codex, offline (AC 16~20)', () => {
  test('AC 16: active luck event and eventsSeen 7 → events back to defaults, eventsSeen 7', () => {
    const S = rebirthReady();
    assert.ok(E.setEvent(S, 'luck', 1000).ok);
    S.stats.eventsSeen = 7;
    rebirthOk(S);
    assert.deepStrictEqual([S.events, S.stats.eventsSeen], [{ active: null, sinceMs: 0, nextAtMs: 900000 }, 7]);
  });
  test('AC 17: right after rebirth (best 0) no event spawns; at best 5 the normal gap applies', () => {
    const S = rebirthReady();
    rebirthOk(S);
    for (let i = 0; i < 2000; i++) assert.deepStrictEqual(E.advanceEvents(S, 2000, () => 0), {});
    assert.deepStrictEqual(S.events, { active: null, sinceMs: 0, nextAtMs: 900000 });
    S.best = 5;
    for (let i = 0; i < 449; i++) assert.deepStrictEqual(E.advanceEvents(S, 2000, () => 0), {});
    assert.ok(E.advanceEvents(S, 2000, () => 0).started);
  });
  test('AC 18: achievements, title, daily and monuments survive; latched best_* stays; claimed (2) cannot be claimed again', () => {
    const S = fullRebirthState();
    A.syncAchievements(S);
    const before = deepCopy(S);
    rebirthOk(S);
    assert.deepStrictEqual(A.syncAchievements(S), []);
    assert.strictEqual(A.refreshDaily(S, T_RB, () => 0, { tzOffsetMin: () => 0 }).created, false);
    ['achievements', 'title', 'daily', 'monuments'].forEach(k => assert.deepStrictEqual(S[k], before[k], k));
    assert.ok(S.achievements.best_3 >= C.ACH_REACHED);
    assert.deepStrictEqual(A.claimAchievement(S, 'tries_1', { active: true }), { ok: false, reason: 'claimed' });
  });
  test('AC 19: found survives; reaching +15 again is not a first find', () => {
    const S = rebirthReady();
    S.found[15] = true;
    const found = S.found.slice();
    rebirthOk(S);
    assert.deepStrictEqual(S.found, found);
    Object.assign(S.swords[0], { lv: 14 });
    Object.assign(S, { best: 14, gold: 1e9 });
    const r = R.attemptEnhance(S, ROLL_SUCCESS);
    assert.deepStrictEqual([r.outcome, r.to, r.firstFound], ['success', 15, false]);
  });
  test('AC 20: no offline gold at the rebirth instant; a later settle counts only the time since rebirth', () => {
    const S = fullRebirthState();   // 자동 사냥 면허 보유(autoStart 1)
    rebirthOk(S);
    assert.ok(I.setAutoOn(S, true).ok);
    assert.strictEqual(I.settleOffline(S, T_RB), null);
    const off = I.settleOffline(S, T_RB + 8 * HOUR);
    assert.deepStrictEqual([off.gapMs, off.runs], [8 * HOUR, 8 * HOUR / C.AUTO_CD_MS]);
  });
});

describe('F11 fame shop: table, purchases, start effects, license (AC 21~27)', () => {
  test('AC 21: FAME_SHOP values/costs, total cost 25, fixed track order', () => {
    const pick = k => [C.FAME_SHOP[k].values, C.FAME_SHOP[k].costs];
    assert.deepStrictEqual(C.FAME_TRACKS, ['startGold', 'income', 'slots', 'autoStart']);
    assert.deepStrictEqual(C.FAME_TRACKS.map(pick), [
      [[2000, 5000, 10000, 20000], [1, 1, 2, 3]], [[5, 10, 15, 20], [1, 2, 3, 4]], [[1, 2], [2, 3]], [[1], [3]]]);
    assert.strictEqual(C.FAME_TRACKS.reduce((s, k) => s + C.FAME_SHOP[k].costs.reduce((a, b) => a + b, 0), 0), 25);
  });
  test('AC 22: fame 3 → startGold costs 1 (level 1, fame 2); further costs 1, 2, 3 then maxed; gold and chances unchanged', () => {
    const S = stateWith({ sword: { lv: 12 } });
    S.rebirth.fame = 3;
    const gold = S.gold;
    const ch = JSON.stringify(R.currentChances(S));
    assert.deepStrictEqual(RB.buyFame(S, 'startGold'), { ok: true, cost: 1, level: 1 });
    assert.strictEqual(S.rebirth.fame, 2);
    S.rebirth.fame = 10;
    assert.deepStrictEqual([2, 3, 4].map(() => RB.buyFame(S, 'startGold')), [
      { ok: true, cost: 1, level: 2 }, { ok: true, cost: 2, level: 3 }, { ok: true, cost: 3, level: 4 }]);
    assert.deepStrictEqual(RB.buyFame(S, 'startGold'), { ok: false, reason: 'maxed' });
    assert.deepStrictEqual([S.rebirth.fame, S.gold, JSON.stringify(R.currentChances(S))], [4, gold, ch]);
  });
  test('AC 23: non-own / non-string tracks → invalid, state unchanged', () => {
    const S = fresh();
    S.rebirth.fame = 99;
    const before = deepCopy(S);
    ['constructor', '__proto__', 'toString', 'bogus', 7, null, undefined, {}].forEach(t =>
      assert.deepStrictEqual(RB.buyFame(S, t), { ok: false, reason: 'invalid' }, String(t)));
    assert.deepStrictEqual(S, before);
    const noRebirth = fresh();
    noRebirth.rebirth = null;
    assert.deepStrictEqual(RB.buyFame(noRebirth, 'income'), { ok: false, reason: 'invalid' });
    assert.deepStrictEqual(RB.buyFame(null, 'income'), { ok: false, reason: 'invalid' });
  });
  test('AC 24: order invalid → maxed → noFame', () => {
    const S = fresh();
    Object.assign(S.rebirth.up, { slots: 2, income: 4 });
    S.rebirth.fame = 99;
    assert.deepStrictEqual(RB.buyFame(S, 'slots'), { ok: false, reason: 'maxed' });
    S.rebirth.fame = 0;
    assert.deepStrictEqual(RB.buyFame(S, 'income'), { ok: false, reason: 'maxed' });
    S.rebirth.up.slots = 0;
    S.rebirth.fame = 1;
    const before = deepCopy(S);
    assert.deepStrictEqual(RB.buyFame(S, 'slots'), { ok: false, reason: 'noFame' });
    assert.deepStrictEqual(S, before);
  });
  test('AC 25: startGold level 0..4 → start gold 300 / 2,300 / 5,300 / 10,300 / 20,300', () => {
    assert.deepStrictEqual([0, 1, 2, 3, 4].map(lv => {
      const S = rebirthReady();
      S.rebirth.up.startGold = lv;
      rebirthOk(S);
      return S.gold;
    }), [300, 2300, 5300, 10300, 20300]);
  });
  test('AC 26: slots level 0/1/2 → 3/4/5 slots and one sword; expandCost at 5 slots = 30,000; SLOT_MAX stays 8', () => {
    assert.deepStrictEqual([0, 1, 2].map(lv => {
      const S = rebirthReady();
      S.rebirth.up.slots = lv;
      rebirthOk(S);
      return [S.slots, S.swords.length, R.expandCost(S)];
    }), [[3, 1, 3000], [4, 1, 10000], [5, 1, 30000]]);
    assert.strictEqual(C.SLOT_MAX, 8);
  });
  test('AC 27: autoStart 1 at best 0 unlocks idle (setAutoOn ok); 0 → locked; quests/forge stay best-gated', () => {
    const S = fresh();
    S.rebirth.up.autoStart = 1;
    assert.deepStrictEqual([R.isUnlocked(S, 'idle'), R.isUnlocked(S, 'quests'), R.isUnlocked(S, 'forge')], [true, false, false]);
    assert.ok(I.setAutoOn(S, true).ok);
    assert.strictEqual(I.upgradeBlock(S, 'speed'), 'noGold');
    const L = fresh();
    assert.deepStrictEqual(I.setAutoOn(L, true), { ok: false, reason: 'locked' });
  });
  test('purchases apply now: income and license immediately, start gold and slots only at the next rebirth', () => {
    const S = stateWith({ sword: { lv: 10 } });
    S.rebirth.fame = 25;
    const [gold, slots, hunt] = [S.gold, S.slots, I.manualHuntGold(S, NOW)];
    C.FAME_TRACKS.forEach(k => { while (RB.buyFame(S, k).ok); });
    assert.deepStrictEqual([S.rebirth.fame, S.rebirth.up], [0, { startGold: 4, income: 4, slots: 2, autoStart: 1 }]);
    assert.deepStrictEqual([S.gold, S.slots, I.manualHuntGold(S, NOW), hunt], [gold, slots, 507, 423]);
  });
});

/** 초반 수입 상태: 보관함 최고 검 lv, best 20(자동 해금), income 레벨 */
function incomeState(lv, income) {
  const S = fresh();
  S.swords[0].lv = lv;
  S.best = C.MAX;
  S.rebirth.up.income = income;
  return S;
}

describe('F11 early income: single integer formula, topLv ≤ 12 only, never in prices (AC 28~32)', () => {
  test('AC 28: manual hunt 507 / boosted 761 / +raider 20 → 609; topLv 12 income 1 → 1,518; topLv 13 income 4 → 2,676', () => {
    const S = incomeState(10, 4);
    assert.strictEqual(I.manualHuntGold(S, NOW), 507);
    S.idle.boostUntil = NOW + MIN;
    assert.strictEqual(I.manualHuntGold(S, NOW), 761);
    S.idle.boostUntil = 0;
    S.swords[0].trait = { k: 'hunt', t: 2 };
    assert.strictEqual(I.manualHuntGold(S, NOW), 609);
    assert.strictEqual(I.manualHuntGold(incomeState(12, 1), NOW), 1518);
    assert.strictEqual(I.manualHuntGold(incomeState(13, 4), NOW), 2676);
  });
  test('AC 29: auto run (harvest lv5) 288 with income 4, 240 with 0; topLv 13 ignores income', () => {
    const at = (lv, income) => { const S = incomeState(lv, income); S.idle.up.gold = 5; return I.autoRunGold(S, NOW); };
    assert.deepStrictEqual([at(10, 4), at(10, 0)], [288, 240]);
    assert.strictEqual(at(13, 4), at(13, 0));
  });
  test('AC 30: offline 8 h (harvest lv5, auto on) 414,720 with income 4, 345,600 with 0', () => {
    const off = income => {
      const S = incomeState(10, income);
      Object.assign(S.idle, { autoOn: true, lastSeen: NOW - 8 * HOUR });
      S.idle.up.gold = 5;
      return I.settleOffline(S, NOW);
    };
    assert.deepStrictEqual([off(4).runs, off(4).gold, off(0).gold], [5760, 414720, 345600]);
  });
  test('AC 31: income 0 (default rebirth) is bit-identical to a state without rebirth for topLv 0..20, and to the base formulas', () => {
    for (let lv = 0; lv <= C.MAX; lv++) {
      const S = incomeState(lv, 0);
      Object.assign(S.idle, { autoOn: true, lastSeen: NOW - 3 * HOUR });
      const bare = deepCopy(S);
      delete bare.rebirth;
      const out = X => [I.manualHuntGold(X, NOW), I.autoRunGold(X, NOW), I.settleOffline(deepCopy(X), NOW)];
      assert.deepStrictEqual(out(S), out(bare), `+${lv}`);
      assert.deepStrictEqual(out(S).slice(0, 2), [R.huntReward(lv), R.autoReward(lv)], `+${lv}`);
      if (lv > C.EARLY_INCOME_MAX_LV) assert.deepStrictEqual(out(incomeState(lv, 4)).slice(0, 2), out(S).slice(0, 2), `+${lv} cutoff`);
    }
  });
  test('AC 32: income 4 changes no price (shop, booster, trait, monument, fee, sell, quest, payout, reroll, expand)', () => {
    const prices = income => {
      const S = incomeState(15, income);
      S.best = 15;
      S.swords[0].trait = { k: 'trade', t: 1 };
      return [C.SHOP_ITEMS.map(e => R.shopPrice(S, e.id)), R.boosterPrice(S.best), R.traitRekindCost(S), R.traitTierUpCost(S, 1),
        R.monumentCost(15), RB.rebirthFee(), R.sell(15), C.QUEST_TIERS.map(t => Q.questGold(t, 10)),
        R.payoutPreview(S, 1000, S.swords[0]), Q.rerollCost(S), R.expandCost(S)];
    };
    assert.deepStrictEqual(prices(4), prices(0));
  });
});

describe('F11 save: rebirth normalization, old saves, regressions (AC 33~35, 38, 39)', () => {
  const DEF = { count: 0, fame: 0, up: { startGold: 0, income: 0, slots: 0, autoStart: 0 } };
  const norm = rebirth => SV.normalize(Object.assign(fresh(), { rebirth }), NOW).rebirth;
  test('AC 33: missing / null / [] / 5 / "x" → defaults; bad fields clamp, unknown keys dropped, count capped', () => {
    [undefined, null, [], 5, 'x'].forEach(v => assert.deepStrictEqual(norm(v), DEF, String(v)));
    assert.deepStrictEqual(norm({ count: '3.7', fame: -5, up: { startGold: 9, income: '2', slots: 3, autoStart: 5, junk: 1 }, extra: 1 }),
      { count: 3, fame: 0, up: { startGold: 4, income: 2, slots: 2, autoStart: 1 } });
    assert.strictEqual(norm({ count: 1e12 }).count, 1000000);
    assert.strictEqual(norm({ fame: 1e15 }).fame, 1e9);
    assert.deepStrictEqual(norm({ count: 2, up: 'x' }).up, DEF.up);
    assert.deepStrictEqual(fresh().rebirth, DEF);
  });
  test('AC 34: spending above earnings (fame 0, every track maxed) loads as-is', () => {
    const maxed = { count: 0, fame: 0, up: { startGold: 4, income: 4, slots: 2, autoStart: 1 } };
    assert.deepStrictEqual(norm(maxed), maxed);
  });
  test('AC 35: an old v2 save without rebirth gets the default and nothing else changes; save → load is stable, v 2', () => {
    const old = fullRebirthState();
    delete old.rebirth;
    const st = memStorage({ [C.SAVE_KEY]: JSON.stringify(old) });
    const loaded = SV.load(st, NOW).state;
    assert.deepStrictEqual(loaded, Object.assign(deepCopy(old), { rebirth: DEF }));
    assert.strictEqual(loaded.v, 2);
    SV.save(st, loaded, NOW);
    assert.deepStrictEqual(SV.load(st, NOW).state, loaded);
  });
  test('AC 38: default rebirth = no rebirth field: incomes, prices, unlocks, options, chances, achievement and event outputs', () => {
    [0, 4, 7, 13, 20].forEach(lv => {
      const S = stateWith({ sword: { lv, trait: lv >= 5 ? { k: 'work', t: 2 } : null } });
      Object.assign(S.idle, { autoOn: true, lastSeen: NOW - HOUR, boostUntil: NOW + MIN });
      S.inv.bless = 3;
      S.use.bless = true;
      const bare = deepCopy(S);
      delete bare.rebirth;
      const out = X => [I.manualHuntGold(X, NOW), I.autoRunGold(X, NOW), I.settleOffline(deepCopy(X), NOW),
        ['quests', 'forge', 'idle'].map(k => R.isUnlocked(X, k)), C.SHOP_ITEMS.map(e => R.shopPrice(X, e.id)),
        R.enhanceOpts(X), R.currentChances(X), C.ACHIEVEMENTS.map(a => A.achProgress(X, a.id)), E.eligibleEvents(X)];
      assert.deepStrictEqual(out(S), out(bare), `+${lv}`);
    });
  });
  test('AC 39: chances / enhanceOpts / attemptEnhance never read S.rebirth, and a maxed rebirth changes no output', () => {
    const make = () => {
      const S = stateWith({ sword: { lv: 15, pity: 3 }, inv: { bless: 5, protect: 5 }, use: { bless: true, protect: true } });
      Object.assign(S, { gold: 1e9, mastery: [2, 0, 0, 0, 0] });
      return S;
    };
    const maxed = make();
    maxed.rebirth = { count: 99, fame: 999, up: { startGold: 4, income: 4, slots: 2, autoStart: 1 } };
    const plain = make();
    const rb = maxed.rebirth;
    let reads = 0;
    Object.defineProperty(maxed, 'rebirth', { get() { reads++; return rb; }, enumerable: true, configurable: true });
    assert.deepStrictEqual(R.enhanceOpts(maxed), R.enhanceOpts(plain));
    assert.deepStrictEqual(R.currentChances(maxed), R.currentChances(plain));
    assert.deepStrictEqual(R.chances(maxed.swords[0], R.enhanceOpts(maxed)), R.chances(plain.swords[0], R.enhanceOpts(plain)));
    for (const roll of [0, 0.3, 0.6, 0.9999]) assert.deepStrictEqual(R.attemptEnhance(maxed, () => roll), R.attemptEnhance(plain, () => roll), String(roll));
    assert.strictEqual(reads, 0);
  });
});

/** 미러 원문: rebirth + mark(기준값, undefined면 8-A 형식) */
const mirrorOf = (rebirth, mark) => JSON.stringify(Object.assign({}, rebirth, { mark }));

describe('REQ-037: rebirth mirror key protects against old clients dropping the field', () => {
  const MIRROR = SV.REBIRTH_MIRROR_KEY;
  const RB3 = { count: 3, fame: 1, up: { startGold: 2, income: 0, slots: 0, autoStart: 1 } };
  const withRebirth = rebirth => Object.assign(fresh(), { rebirth: deepCopy(rebirth) });
  /** 옛 클라이언트가 쓴 저장: rebirth 필드가 없다 */
  const oldClientSave = () => { const d = fresh(); delete d.rebirth; return JSON.stringify(d); };
  test('key names: derived from the save key, so the test page has its own mirror', () => {
    assert.strictEqual(MIRROR, 'sword-enhance-v2-rebirth');
    assert.strictEqual(loadTestModeSG().save.REBIRTH_MIRROR_KEY, 'sword-enhance-test-rebirth');
  });
  test('save writes the mirror (rebirth + mark = nextSwordId) right after the main key, only when it differs (absent = default)', () => {
    const st = countingStorage();
    SV.save(st, fresh(), NOW);
    assert.deepStrictEqual(st.writes, [C.SAVE_KEY]);
    const S = withRebirth(RB3);
    SV.save(st, S, NOW);
    assert.deepStrictEqual(st.writes, [C.SAVE_KEY, C.SAVE_KEY, MIRROR]);
    assert.strictEqual(st.dump[MIRROR], JSON.stringify(Object.assign({}, RB3, { mark: S.nextSwordId })));
    SV.save(st, S, NOW);
    assert.deepStrictEqual(st.writes.slice(3), [C.SAVE_KEY]);
    S.rebirth.fame = 0;
    SV.save(st, S, NOW);
    assert.deepStrictEqual(st.writes.slice(4), [C.SAVE_KEY, MIRROR]);
  });
  test('8-A compatibility: an old client rewrote the main save without rebirth and the mirror has no mark → load, peek and the keeper take it (count only)', () => {
    const init = { [C.SAVE_KEY]: oldClientSave(), [MIRROR]: JSON.stringify(RB3) };
    assert.deepStrictEqual(SV.load(memStorage(init), NOW).state.rebirth, RB3);
    assert.deepStrictEqual(SV.peek(memStorage(init), NOW).state.rebirth, RB3);
    assert.deepStrictEqual(SV.createSaveKeeper(memStorage(init)).checkStored(NOW).state.rebirth, RB3);
    const st = memStorage(init);
    const S = SV.createSaveKeeper(st).load(NOW).state;
    SV.save(st, S, NOW);
    assert.deepStrictEqual(JSON.parse(st.dump[C.SAVE_KEY]).rebirth, RB3);
  });
  test('ignore: equal or lower count in the mirror keeps the main rebirth (a purchase that lowered fame is not undone)', () => {
    const main = { count: 3, fame: 0, up: { startGold: 2, income: 1, slots: 0, autoStart: 1 } };
    [RB3, { count: 2, fame: 9, up: RB3.up }, { count: 0, fame: 0, up: RB3.up }].forEach(mirror => {
      const st = memStorage({ [C.SAVE_KEY]: JSON.stringify(withRebirth(main)), [MIRROR]: JSON.stringify(mirror) });
      assert.deepStrictEqual(SV.load(st, NOW).state.rebirth, main, JSON.stringify(mirror));
    });
  });
  test('tamper: the mirror is normalized like the main field; corrupt or non-object mirrors are ignored', () => {
    const tampered = { count: '5.9', fame: -1, up: { startGold: 99, junk: 1 }, extra: 1 };
    const st = memStorage({ [C.SAVE_KEY]: oldClientSave(), [MIRROR]: JSON.stringify(tampered) });
    assert.deepStrictEqual(SV.load(st, NOW).state.rebirth, { count: 5, fame: 0, up: { startGold: 4, income: 0, slots: 0, autoStart: 0 } });
    ['{bad', '[3]', '7', '"x"', '', 'null'].forEach(raw => {
      const s2 = memStorage({ [C.SAVE_KEY]: oldClientSave(), [MIRROR]: raw });
      assert.deepStrictEqual(SV.load(s2, NOW).state.rebirth.count, 0, raw);
    });
  });
  test('storage errors: a throwing mirror read or write never breaks loading or the save result', () => {
    const main = JSON.stringify(withRebirth(RB3));
    const readThrows = memStorage({ [C.SAVE_KEY]: main });
    const getItem = readThrows.getItem;
    readThrows.getItem = k => { if (k === MIRROR) throw new Error('SecurityError'); return getItem(k); };
    const r = SV.load(readThrows, NOW);
    assert.deepStrictEqual([r.source, r.state.rebirth], ['v2', RB3]);
    assert.strictEqual(SV.save(readThrows, r.state, NOW), true);
    const writeThrows = quotaStorage({}, new Set([MIRROR]));
    const keeper = SV.createSaveKeeper(writeThrows);
    keeper.load(NOW);
    assert.strictEqual(keeper.save(withRebirth(RB3), NOW), 'saved');
    assert.strictEqual(keeper.lastSaveFailed(), false);
    assert.deepStrictEqual(JSON.parse(writeThrows.dump[C.SAVE_KEY]).rebirth, RB3);
  });
  test('a failed main write writes no mirror; protected mode writes neither', () => {
    const st = quotaStorage({}, new Set([C.SAVE_KEY]));
    assert.strictEqual(SV.save(st, withRebirth(RB3), NOW), false);
    assert.deepStrictEqual(st.writes, []);
    const guarded = quotaStorage({ [C.SAVE_KEY]: BROKEN }, new Set([BACKUP]));
    const keeper = SV.createSaveKeeper(guarded);
    keeper.load(NOW);
    guarded.writes.length = 0;
    assert.strictEqual(keeper.save(withRebirth(RB3), NOW), 'blocked');
    assert.deepStrictEqual(guarded.writes, []);
  });
  test('a new game (newGame option) overwrites an older mirror with the default, so it is not adopted back on reload', () => {
    const st = memStorage({ [C.SAVE_KEY]: JSON.stringify(withRebirth(RB3)), [MIRROR]: JSON.stringify(RB3) });
    SV.save(st, fresh(), NOW, { newGame: true });
    assert.strictEqual(st.dump[MIRROR], JSON.stringify(fresh().rebirth));
    assert.strictEqual(SV.load(st, NOW).state.rebirth.count, 0);
    const kst = memStorage({ [C.SAVE_KEY]: JSON.stringify(withRebirth(RB3)), [MIRROR]: mirrorOf(RB3, 9) });
    const keeper = SV.createSaveKeeper(kst);
    keeper.load(NOW);
    assert.strictEqual(keeper.save(fresh(), NOW, { newGame: true }), 'saved');
    assert.strictEqual(kst.dump[MIRROR], JSON.stringify(fresh().rebirth));
  });
});

describe('REQ-037 residual windows: mirror watermark (mark = post-rebirth nextSwordId) and no lowering (m2-rebirth §8.2)', () => {
  const MIRROR = SV.REBIRTH_MIRROR_KEY;
  const RB1 = { count: 1, fame: 3, up: { startGold: 0, income: 0, slots: 0, autoStart: 0 } };
  /** main 저장 원문: nextSwordId와 rebirth(없으면 옛 클라이언트가 버린 저장) */
  const mainSave = (nextSwordId, rebirth) => {
    const d = fresh();
    d.swords = [{ id: nextSwordId - 1, lv: 0, prot: C.PROTECT_USES, pity: 0, trait: null }];
    Object.assign(d, { nextSwordId, active: nextSwordId - 1 });
    if (rebirth) d.rebirth = deepCopy(rebirth);
    else delete d.rebirth;
    return JSON.stringify(d);
  };
  const loadRebirth = init => SV.load(memStorage(init), NOW).state.rebirth;
  const DEF = () => fresh().rebirth;

  test('old-client rewrite of a post-rebirth save (nextSwordId ≥ mark, also after it grew) is still recovered', () => {
    [10, 11, 40].forEach(next =>
      assert.deepStrictEqual(loadRebirth({ [C.SAVE_KEY]: mainSave(next, null), [MIRROR]: mirrorOf(RB1, 10) }), RB1, String(next)));
  });
  test('a pre-rebirth main state (nextSwordId < mark) is not combined with the newer fame; peek and checkStored agree', () => {
    const init = { [C.SAVE_KEY]: mainSave(9, null), [MIRROR]: mirrorOf(RB1, 10) };
    assert.deepStrictEqual(loadRebirth(init), DEF());
    assert.deepStrictEqual(SV.peek(memStorage(init), NOW).state.rebirth, DEF());
    assert.deepStrictEqual(SV.createSaveKeeper(memStorage(init)).checkStored(NOW).state.rebirth, DEF());
    const preWithRebirth = { [C.SAVE_KEY]: mainSave(9, RB1), [MIRROR]: mirrorOf({ count: 2, fame: 6, up: RB1.up }, 10) };
    assert.deepStrictEqual(loadRebirth(preWithRebirth), RB1);
  });
  test('8-A-format mirror (no mark) keeps the 8-A rule: adopted on count alone, even on a lower nextSwordId', () => {
    assert.deepStrictEqual(loadRebirth({ [C.SAVE_KEY]: mainSave(3, null), [MIRROR]: mirrorOf(RB1) }), RB1);
  });
  test('tampered mark: non-numeric → treated as 8-A (count only); numeric string and fractions are floored like other ints; mark < 1 clamps to 1', () => {
    assert.deepStrictEqual(loadRebirth({ [C.SAVE_KEY]: mainSave(3, null), [MIRROR]: mirrorOf(RB1, 'x') }), RB1);
    assert.deepStrictEqual(loadRebirth({ [C.SAVE_KEY]: mainSave(3, null), [MIRROR]: mirrorOf(RB1, '12.9') }), DEF());
    assert.deepStrictEqual(loadRebirth({ [C.SAVE_KEY]: mainSave(12, null), [MIRROR]: mirrorOf(RB1, '12.9') }), RB1);
    assert.deepStrictEqual(loadRebirth({ [C.SAVE_KEY]: mainSave(2, null), [MIRROR]: mirrorOf(RB1, -5) }), RB1);
  });
  test('a raised count sets mark = nextSwordId; equal-count writes (fame purchases) keep the mark fixed while nextSwordId grows', () => {
    const st = countingStorage();
    const S = withRebirthState(RB1, 10);
    SV.save(st, S, NOW);
    assert.strictEqual(st.dump[MIRROR], mirrorOf(RB1, 10));
    S.nextSwordId = 25;
    assert.ok(RB.buyFame(S, 'startGold').ok);
    SV.save(st, S, NOW);
    assert.strictEqual(st.dump[MIRROR], mirrorOf(S.rebirth, 10));
    S.rebirth.count = 2;
    SV.save(st, S, NOW);
    assert.strictEqual(st.dump[MIRROR], mirrorOf(S.rebirth, 25));
  });
  test('an 8-A mirror stays mark-free on equal-count writes; a raised count upgrades it to a marked mirror', () => {
    const st = memStorage({ [MIRROR]: mirrorOf(RB1) });
    const S = withRebirthState(RB1, 30);
    S.rebirth.fame = 1;
    SV.save(st, S, NOW);
    assert.strictEqual(st.dump[MIRROR], mirrorOf(S.rebirth));
    S.rebirth.count = 2;
    SV.save(st, S, NOW);
    assert.strictEqual(st.dump[MIRROR], mirrorOf(S.rebirth, 30));
  });
  test('no lowering: a stale state with a lower count (or the default) never overwrites a higher mirror; newGame is the only exception', () => {
    const higher = mirrorOf({ count: 3, fame: 9, up: RB1.up }, 40);
    const st = countingStorage({ [MIRROR]: higher });
    SV.save(st, withRebirthState(RB1, 50), NOW);
    SV.save(st, fresh(), NOW);
    const keeper = SV.createSaveKeeper(st);
    keeper.load(NOW);
    keeper.save(withRebirthState(RB1, 60), NOW);
    assert.strictEqual(st.dump[MIRROR], higher);
    assert.ok(!st.writes.includes(MIRROR));
    SV.save(st, withRebirthState(RB1, 50), NOW, { newGame: true });
    assert.strictEqual(st.dump[MIRROR], mirrorOf(RB1, 50));
  });
  test('full flow: rebirth → save; an old client rewrites it (recovered); restoring a pre-rebirth snapshot is not', () => {
    const st = memStorage();
    const S = rebirthReady({ nextSwordId: 20 });
    const preRebirth = JSON.stringify(S);
    rebirthOk(S);
    SV.save(st, S, T_RB);
    assert.strictEqual(JSON.parse(st.dump[MIRROR]).mark, 21);
    const rewritten = JSON.parse(st.dump[C.SAVE_KEY]);
    delete rewritten.rebirth;
    rewritten.nextSwordId += 2;
    st.setItem(C.SAVE_KEY, JSON.stringify(rewritten));
    assert.deepStrictEqual(SV.load(st, T_RB).state.rebirth, S.rebirth);
    st.setItem(C.SAVE_KEY, preRebirth);
    const restored = SV.load(st, T_RB).state;
    assert.deepStrictEqual([restored.rebirth.count, RB.canRebirth(restored).ok], [0, true]);
  });
});

/** rebirth와 nextSwordId를 지정한 정규화 상태 */
function withRebirthState(rebirth, nextSwordId) {
  const S = fresh();
  S.swords[0].id = nextSwordId - 1;
  Object.assign(S, { nextSwordId, active: nextSwordId - 1, rebirth: deepCopy(rebirth) });
  return S;
}

describe('8-B rebirth helpers: visibility, shop blocks and costs, normalized-input guards (m2-rebirth §3.1·§4.1·§7)', () => {
  test('rebirthUnlocked: best ≥ MAX or count ≥ 1 (the shop stays after a rebirth resets best to 0)', () => {
    const at = (best, count) => { const S = fresh(); S.best = best; S.rebirth.count = count; return RB.rebirthUnlocked(S); };
    assert.deepStrictEqual([at(0, 0), at(19, 0), at(20, 0), at(0, 1), at(5, 3)], [false, false, true, true, true]);
    const S = rebirthReady();
    rebirthOk(S);
    assert.deepStrictEqual([S.best, RB.rebirthUnlocked(S)], [0, true]);
  });
  test('fameBlock matches buyFame for every track and level (invalid → maxed → noFame); nextFameCost / fameMaxLevel / fameValueAt follow FAME_SHOP', () => {
    C.FAME_TRACKS.forEach(track => {
      const def = C.FAME_SHOP[track];
      assert.strictEqual(RB.fameMaxLevel(track), def.costs.length);
      for (let lv = 0; lv <= def.costs.length; lv++) {
        [0, 1, 2, 3, 4, 99].forEach(fame => {
          const S = fresh();
          S.rebirth.up[track] = lv;
          S.rebirth.fame = fame;
          const block = RB.fameBlock(S, track);
          const cost = RB.nextFameCost(S, track);
          assert.strictEqual(cost, lv < def.costs.length ? def.costs[lv] : null);
          const r = RB.buyFame(S, track);
          assert.deepStrictEqual(r.ok ? null : r.reason, block, `${track} lv${lv} fame${fame}`);
        });
        assert.strictEqual(R.fameValueAt(track, lv), lv > 0 ? def.values[lv - 1] : 0);
      }
    });
    assert.strictEqual(RB.fameBlock(fresh(), 'constructor'), 'invalid');
    assert.strictEqual(R.fameValueAt('startGold', 9), 0);
  });
  test('fameBlock / buyFame on a negative integer level → invalid, no NaN written (S3)', () => {
    C.FAME_TRACKS.forEach(track => [-1, -4].forEach(lv => {
      const S = fresh();
      S.rebirth.fame = 99;
      S.rebirth.up[track] = lv;
      const before = JSON.stringify(S);
      assert.strictEqual(RB.fameBlock(S, track), 'invalid', `${track} lv${lv}`);
      assert.deepStrictEqual(RB.buyFame(S, track), { ok: false, reason: 'invalid' }, `${track} lv${lv}`);
      assert.strictEqual(JSON.stringify(S), before, `${track} lv${lv}`);
    }));
  });
  test('buyFame on unnormalized input (NaN / string fame, missing / fractional level) → invalid, no NaN written', () => {
    const cases = [
      S => { S.rebirth.fame = NaN; }, S => { S.rebirth.fame = '9'; }, S => { S.rebirth.fame = Infinity; },
      S => { delete S.rebirth.up.income; }, S => { S.rebirth.up.income = 1.5; }, S => { S.rebirth.up.income = '1'; },
    ];
    cases.forEach((mutate, i) => {
      const S = fresh();
      S.rebirth.fame = 10;
      mutate(S);
      const before = JSON.stringify(S);
      assert.deepStrictEqual(RB.buyFame(S, 'income'), { ok: false, reason: 'invalid' }, String(i));
      assert.strictEqual(JSON.stringify(S), before, String(i));
    });
  });
  test('canRebirth / rebirth / rebirthPreview on unnormalized numbers (gold, count, fame not finite) → invalid, state unchanged', () => {
    [S => { S.gold = NaN; }, S => { S.gold = '30000000'; }, S => { delete S.gold; }, S => { S.rebirth.count = NaN; },
      S => { delete S.rebirth.fame; }].forEach((mutate, i) => {
      const S = rebirthReady({ gold: 3e7 });
      mutate(S);
      const before = JSON.stringify(S);
      assert.deepStrictEqual(RB.canRebirth(S), { ok: false, reason: 'invalid' }, String(i));
      assert.deepStrictEqual(RB.rebirth(S, T_RB), { ok: false, reason: 'invalid' }, String(i));
      assert.deepStrictEqual(RB.rebirthPreview(S), { ok: false, reason: 'invalid' }, String(i));
      assert.strictEqual(JSON.stringify(S), before, String(i));
    });
  });
});

describe('F11 constants load guards (m2-rebirth §2)', () => {
  const MSG = 'REBIRTH / FAME_SHOP constants are inconsistent';
  const swap = (from, to) => src => { assert.ok(src.includes(from), from); return src.replace(from, to); };
  const keep = () => {};
  test('values/costs length mismatch or an empty track throws', () => {
    assert.strictEqual(loadError(swap('values: [1], costs: [3] }', 'values: [1], costs: [3, 4] }'), keep), MSG);
    assert.strictEqual(loadError(swap('values: [1], costs: [3] }', 'values: [], costs: [] }'), keep), MSG);
  });
  test('MASTERY_KEEP_REC < 0, FAME_PER_REBIRTH < 1, or start slots above SLOT_MAX throws', () => {
    assert.strictEqual(loadError(swap('const MASTERY_KEEP_REC = 1;', 'const MASTERY_KEEP_REC = -1;'), keep), MSG);
    assert.strictEqual(loadError(swap('const FAME_PER_REBIRTH = 3;', 'const FAME_PER_REBIRTH = 0;'), keep), MSG);
    assert.strictEqual(loadError(swap('values: [1, 2], costs: [2, 3] }', 'values: [1, 6], costs: [2, 3] }'), keep), MSG);
  });
});

// ============================================================ 10단계 출시 정리 (REQ-050, REQ-040, REQ-049)
describe('REQ-050 game version', () => {
  test('C.VERSION equals the VERSION file at the repo root', () => {
    const fileVersion = fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim();
    assert.strictEqual(C.VERSION, fileVersion, `C.VERSION ${C.VERSION} vs VERSION file ${fileVersion}`);
  });
  test('C.VERSION is a semver string', () => {
    assert.ok(/^\d+\.\d+\.\d+$/.test(C.VERSION), C.VERSION);
  });
});

/** constants.js를 바꿔(patch) 불러온 뒤 C를 고치고(mutate) 화면까지 불러온 새 SG. 오류는 그대로 던진다 */
function loadWithView(patch, mutate) {
  const ctx = { console, Math, Date, JSON, Object, Array, Number, String, Set, Map, Error };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(patch(fs.readFileSync(js('constants.js'), 'utf8')), ctx, { filename: 'constants.js' });
  mutate(ctx.SG.C);
  ['events.js', 'rules.js', 'forge.js', 'idle.js', 'quests.js', 'save.js', 'rebirth.js', 'achievements.js', 'fx.js', 'view.js']
    .forEach(f => vm.runInContext(fs.readFileSync(js(f), 'utf8'), ctx, { filename: f }));
  return ctx.SG;
}

describe('REQ-040 trait income classification lives in C.TRAITS', () => {
  test('hunt / work / ore are income traits, trade / shard / anvil are not (m2-traits §4)', () => {
    assert.deepStrictEqual(C.TRAIT_KINDS.filter(k => C.TRAITS[k].income), ['hunt', 'work', 'ore']);
    assert.ok(C.TRAIT_KINDS.every(k => typeof C.TRAITS[k].income === 'boolean'));
  });
  test('view.js no longer decides which kinds are income traits', () => {
    const src = fs.readFileSync(js('view.js'), 'utf8');
    assert.ok(!/income:\s*true/.test(src), 'no income flag in view.js');
    assert.ok(src.includes('C.TRAITS[k].income') && src.includes('C.TRAITS[tr.k].income'), 'view reads the data flag');
  });
  test('a TRAITS entry without a boolean income flag fails the constants load check', () => {
    const drop = src => { const from = "values: [10, 20, 30], income: false },"; assert.ok(src.includes(from)); return src.replace(from, 'values: [10, 20, 30] },'); };
    assert.strictEqual(loadError(drop, () => {}), 'TRAIT_* tables are inconsistent');
  });
  test('every shipped trait kind has its own effect text (not the fallback)', () => {
    C.TRAIT_KINDS.forEach(k => {
      const v = C.TRAITS[k].values[0];
      const text = V.traitEffect({ k, t: 1 });
      assert.ok(text.includes(String(v)) && text !== `${C.TRAITS[k].name} 특성 +${v}%`, `${k}: ${text}`);
    });
  });
  test('a new kind added without effect text loads view.js and renders a fallback line (no crash)', () => {
    const SG2 = loadWithView(src => src, C2 => {
      C2.TRAIT_KINDS.push('luck');
      C2.TRAITS.luck = { name: '행운아', short: '행', values: [5, 10, 15], income: true };
      C2.TRAIT_KIND_WEIGHT.luck = 10;
    });
    assert.strictEqual(SG2.view.traitEffect({ k: 'luck', t: 2 }), '행운아 특성 +10%');
    assert.strictEqual(SG2.view.traitEffect({ k: 'hunt', t: 3 }), '수동 사냥 골드 +30%');
  });
});

describe('REQ-049 icon cleanup', () => {
  test('view.js has no hardcoded 🏆 (noteText uses C.ICONS.achievement)', () => {
    assert.ok(!fs.readFileSync(js('view.js'), 'utf8').includes('🏆'));
  });
  test('assets/m2-icons.js header key count matches Object.keys(M2_ICONS).length', () => {
    const file = path.join(__dirname, '..', 'assets', 'm2-icons.js');
    const ctx = { window: {} };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
    const n = Object.keys(ctx.window.M2_ICONS).length;
    const m = fs.readFileSync(file, 'utf8').match(/Keys \((\d+)\)/);
    assert.ok(m, 'header has "Keys (N)"');
    assert.strictEqual(Number(m[1]), n, `header ${m[1]} vs actual ${n}`);
  });
});

// ------------------------------------------------------------ 결과
console.log(`\n${results.pass} passed, ${results.fail} failed`);
process.exit(results.fail ? 1 : 0);
