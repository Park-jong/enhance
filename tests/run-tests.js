/* 순수 규칙 모듈 테스트. 실행: node tests/run-tests.js (외부 의존성 없음) */
'use strict';
const assert = require('assert');
const path = require('path');

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
  test('destroy +10 unprotected: shards +30, stats, slot emptied, free +0', () => {
    const S = stateWith({ sword: { lv: 10, pity: 4 }, top: { gold: 1e6 } });
    const r = R.attemptEnhance(S, rollDestroy(R.chances(S.swords[0], {})));
    assert.strictEqual(r.outcome, 'destroy');
    assert.deepStrictEqual([S.shards, S.stats.shardsGained, S.stats.destroy], [30, 30, 1]);
    assert.strictEqual(S.swords.length, 1);
    assert.strictEqual(S.swords[0].lv, 0);
    assert.strictEqual(S.swords[0].pity, 0);
    assert.ok(r.freeSword && S.active === r.freeSword.id);
  });
  test('destroy active with others: best remaining becomes active, no free sword', () => {
    const S = stateWith({ swords: [{ id: 1, lv: 10, prot: 2, pity: 4 }, { id: 2, lv: 3, prot: 2, pity: 3 }, { id: 3, lv: 6, prot: 2, pity: 0 }], active: 1, top: { gold: 1e6 } });
    const r = R.attemptEnhance(S, rollDestroy(R.chances(S.swords[0], {})));
    assert.strictEqual(r.freeSword, null);
    assert.strictEqual(S.active, 3);
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
    R.setUse(S, 'seal', true);
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
    R.setUse(S, 'seal', true);
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
    assert.deepStrictEqual(S.swords, [{ id: 1, lv: 7, prot: 2, pity: 0 }]);
    assert.deepStrictEqual([S.active, S.gold, S.best, S.settings.muted], [1, 5000, 12, true]);
    assert.deepStrictEqual([S.inv.bless, S.inv.protect, S.use.bless, S.use.protect], [3, 2, true, false]);
    assert.strictEqual(S.found.length, 21);
    assert.strictEqual(S.found[12], true);
    assert.strictEqual(S.found[9], false);   // not back-filled up to best
    assert.deepStrictEqual(S.stats, { tries: 40, success: 20, fail: 15, destroy: 5, earned: 9000, shardsGained: 0, protectSaved: 0, delivered: 0, crafted: 0, huntGold: 0, offlineGold: 0 });
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
    assert.deepStrictEqual(S.swords, [{ id: 1, lv: 0, prot: 2, pity: 0 }]);
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
    assert.deepStrictEqual(S.swords[0], { id: 3, lv: 20, prot: 2, pity: 0 });
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
    assert.deepStrictEqual(S.swords, [{ id: 9, lv: 0, prot: 2, pity: 0 }]);
    assert.strictEqual(S.active, 9);
  });
});

// ------------------------------------------------------------ 결과
console.log(`\n${results.pass} passed, ${results.fail} failed`);
process.exit(results.fail ? 1 : 0);
