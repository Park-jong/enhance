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
    assert.deepStrictEqual(S.stats, { tries: 40, success: 20, fail: 15, destroy: 5, earned: 9000, shardsGained: 0, protectSaved: 0, delivered: 0, crafted: 0, huntGold: 0, offlineGold: 0, sinkGold: 0, traitRolls: 0 });
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
  ['test-mode.js', 'constants.js', 'rules.js', 'forge.js', 'idle.js', 'quests.js', 'save.js']
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

// ------------------------------------------------------------ 결과
console.log(`\n${results.pass} passed, ${results.fail} failed`);
process.exit(results.fail ? 1 : 0);
