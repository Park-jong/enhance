/* M1 round-2 regression tests: bonusWasted, V.itemText, crafted quest ids, save clamps, corrupt backup, two-tab logic.
 * Run: node tests/run-m1-round2-tests.js (no external dependencies).
 */
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const js = f => path.join(__dirname, '..', 'js', f);
const C = require(js('constants.js'));
const R = require(js('rules.js'));
const I = require(js('idle.js'));
const Q = require(js('quests.js'));
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

const NOW = 1_800_000_000_000;
const HOUR = 3600 * 1000;
const MIN = 60 * 1000;
const HUGE = 1e15;
const RICH_GOLD = 1e12;
const MAX_PITY_SAMPLE = 12;
const BONUS_TOGGLES = ['bless', 'anvil'];
const NON_BONUS_TOGGLES = ['protect', 'keepdown', 'sure', 'seal'];
const CRAFTED_IDS = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', 'notInPool', '', null, 7];
const fresh = () => SV.defaultState(NOW);
const memStorage = init => {
  const m = Object.assign({}, init);
  return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, dump: m };
};
const snapshot = S => JSON.stringify(S);

/** state with one active sword, rich, all consumables stocked, optional equipped anvil */
function togglesState(lv, pity, anvilGrade) {
  const S = fresh();
  S.swords = [{ id: 1, lv, prot: C.PROTECT_USES, pity }];
  S.active = 1; S.best = Math.max(lv, C.FORGE_UNLOCK_BEST, C.BOOSTER_SEAL_UNLOCK_BEST);
  S.gold = RICH_GOLD;
  C.CONSUMABLES.forEach(id => { S.inv[id] = 5; });
  if (anvilGrade) { S.anvils = [{ id: 1, g: anvilGrade, dura: C.ANVIL_DURA[anvilGrade] }]; S.anvilEq = 1; S.nextAnvilId = 2; }
  return S;
}
const withUse = (S, ids) => { ids.forEach(id => { S.use[id] = true; }); return S; };

// ============================================================ (1) bonusWasted
describe('R.bonusWasted', () => {
  test('non-bonus toggles are never wasted, at any level/pity, even when switched on', () => {
    for (let lv = 0; lv < C.MAX; lv++) for (let p = 0; p <= MAX_PITY_SAMPLE; p++) for (const id of NON_BONUS_TOGGLES) {
      const S = withUse(togglesState(lv, p, 3), [id]);
      assert.strictEqual(R.bonusWasted(S, id), false, `${id} lv${lv} p${p}`);
    }
  });
  test('unknown / prototype ids are not wasted and do not throw', () => {
    const S = withUse(togglesState(10, 12, 3), ['bless']);
    for (const id of ['constructor', '__proto__', 'toString', 'nope', undefined]) assert.strictEqual(R.bonusWasted(S, id), false);
  });
  test('toggle off is never wasted', () => {
    for (let lv = 0; lv < C.MAX; lv++) {
      const S = togglesState(lv, MAX_PITY_SAMPLE, 3);
      for (const id of BONUS_TOGGLES) assert.strictEqual(R.bonusWasted(S, id), false, `${id} lv${lv}`);
    }
  });
  test('bless wasted exactly when removing it leaves success unchanged', () => {
    let wasted = 0, useful = 0;
    for (let lv = 0; lv < C.MAX; lv++) for (let p = 0; p <= MAX_PITY_SAMPLE; p++) for (const g of [0, 3]) {
      const S = withUse(togglesState(lv, p, g), g ? ['bless', 'anvil'] : ['bless']);
      const use = R.effectiveUse(S);
      if (!use.bless) continue;
      const sw = R.activeSword(S);
      const g2 = use.anvil ? R.equippedAnvil(S).g : 0;
      const expected = R.chances(sw, { bless: true, anvilGrade: g2 }).succ === R.chances(sw, { bless: false, anvilGrade: g2 }).succ;
      assert.strictEqual(R.bonusWasted(S, 'bless'), expected, `lv${lv} p${p} g${g}`);
      if (expected) wasted++; else useful++;
    }
    assert.ok(wasted > 0 && useful > 0, `need both outcomes sampled (wasted ${wasted}, useful ${useful})`);
  });
  test('anvil wasted exactly when removing it leaves success unchanged', () => {
    let wasted = 0, useful = 0;
    for (let lv = 0; lv < C.MAX; lv++) for (let p = 0; p <= MAX_PITY_SAMPLE; p++) for (const bless of [false, true]) {
      const S = withUse(togglesState(lv, p, 3), bless ? ['bless', 'anvil'] : ['anvil']);
      const use = R.effectiveUse(S);
      if (!use.anvil) continue;
      const sw = R.activeSword(S);
      const expected = R.chances(sw, { bless: use.bless, anvilGrade: 3 }).succ === R.chances(sw, { bless: use.bless, anvilGrade: 0 }).succ;
      assert.strictEqual(R.bonusWasted(S, 'anvil'), expected, `lv${lv} p${p} bless${bless}`);
      if (expected) wasted++; else useful++;
    }
    assert.ok(wasted > 0 && useful > 0, `need both outcomes sampled (wasted ${wasted}, useful ${useful})`);
  });
  test('fresh +5 sword with no pity: bless is not wasted (below cap)', () => {
    const S = withUse(togglesState(5, 0, 0), ['bless']);
    assert.strictEqual(R.bonusWasted(S, 'bless'), false);
  });
  test('bonusWasted does not mutate state', () => {
    const S = withUse(togglesState(12, 10, 3), ['bless', 'anvil']);
    const before = snapshot(S);
    BONUS_TOGGLES.concat(NON_BONUS_TOGGLES).forEach(id => R.bonusWasted(S, id));
    assert.strictEqual(snapshot(S), before);
  });
});

// ============================================================ (2) V.itemText
describe('V.itemText is plain text', () => {
  const ids = [].concat(C.CONSUMABLES, Object.keys(C.ITEMS), Object.keys(C.ORE_NAMES), C.ORES);
  test('no markup for any item id and quantity', () => {
    for (const id of new Set(ids)) for (const n of [1, 2, 1234567]) {
      const t = V.itemText(id, n);
      assert.ok(!/[<>]/.test(t), `${id}: ${t}`);
      assert.ok(!/undefined|NaN|null/.test(t), `${id}: ${t}`);
    }
  });
  test('contains the item name and a quantity suffix only when n > 1', () => {
    assert.ok(V.itemText('bless', 1).includes(C.ITEMS.bless.name));
    assert.ok(!V.itemText('bless', 1).includes('×'));
    assert.ok(V.itemText('bless', 2).includes('×'));
  });
});

// ============================================================ (4) crafted quests / save clamps
describe('crafted quest data', () => {
  const tierOf = slot => C.QUEST_TIERS[slot];
  const craftedSave = (slot, item, extra) => {
    const S = fresh();
    S.best = C.MAX;
    S.swords = [{ id: 1, lv: 3, prot: C.PROTECT_USES, pity: 0 }, { id: 2, lv: 6, prot: C.PROTECT_USES, pity: 0 }];
    const raw = JSON.parse(JSON.stringify(S));
    raw.quests.list[slot] = Object.assign({ id: 5, tier: tierOf(slot), lv: 6, gold: HUGE, item }, extra);
    return raw;
  };
  test('poolReward rejects prototype keys, off-tier ids and bad tiers', () => {
    for (const id of CRAFTED_IDS) assert.strictEqual(Q.poolReward('easy', id, 6), null, String(id));
    for (const tier of ['constructor', '__proto__', 'toString', 'zzz', undefined, null]) assert.strictEqual(Q.poolReward(tier, 'bless', 6), null, String(tier));
    assert.strictEqual(Q.poolReward('easy', 'anvil_2', 6), null, 'hard-only id on easy');
  });
  test('poolReward returns pool quantity and ignores stored n', () => {
    assert.deepStrictEqual(Q.poolReward('easy', 'bless', 6), { id: 'bless', n: 2 });
    assert.strictEqual(Q.poolReward('easy', 'shard', 19).n, R.shardGain(19));
  });
  test('normalize recomputes gold from tier/level and drops crafted items (every slot)', () => {
    for (let slot = 0; slot < C.QUEST_SLOTS; slot++) for (const id of CRAFTED_IDS) {
      const S = SV.normalize(craftedSave(slot, { id, n: HUGE }), NOW);
      const q = S.quests.list[slot];
      assert.strictEqual(q.item, null, `slot${slot} id ${String(id)}`);
      assert.strictEqual(q.gold, Q.questGold(tierOf(slot), q.lv));
      assert.ok(q.gold < HUGE);
    }
  });
  test('normalize keeps a legitimate pool item with the pool quantity, not the stored one', () => {
    const S = SV.normalize(craftedSave(0, { id: 'bless', n: HUGE }), NOW);
    assert.deepStrictEqual(S.quests.list[0].item, { id: 'bless', n: 2 });
  });
  test('normalize with item given as non-object / array does not throw', () => {
    for (const item of ['bless', 5, [], [{ id: 'bless' }], true, undefined]) {
      const S = SV.normalize(craftedSave(0, item), NOW);
      assert.strictEqual(S.quests.list[0].item, null);
    }
  });
  test('normalize: wrong tier / non-object quests are dropped; nextId > max quest id', () => {
    const raw = craftedSave(0, null, { tier: 'hard' });
    raw.quests.list[1] = 'x'; raw.quests.list[2] = null;
    const S = SV.normalize(raw, NOW);
    assert.deepStrictEqual(S.quests.list, [null, null, null]);
    const raw2 = craftedSave(1, null, { id: 77 });
    assert.ok(SV.normalize(raw2, NOW).quests.nextId > 77);
  });
  test('deliver on a normalized crafted quest succeeds with sane numbers', () => {
    for (const id of CRAFTED_IDS) {
      const S = SV.normalize(craftedSave(0, { id, n: HUGE }), NOW);
      const gold0 = S.gold;
      const r = Q.deliver(S, 0, NOW, { swordId: 2, confirmActive: true });
      assert.strictEqual(r.ok, true, String(id));
      assert.strictEqual(r.reward, null);
      assert.ok(S.gold - gold0 < HUGE && Number.isSafeInteger(S.gold));
      assert.strictEqual(S.quests.list[0], null);
      assert.strictEqual(S.swords.some(s => s.id === 2), false);
    }
  });
  test('deliver does not change state when it fails (noSword / noQuest)', () => {
    const S = SV.normalize(craftedSave(0, { id: 'bless', n: 1 }, { lv: 12 }), NOW);
    const before = snapshot(S);
    assert.strictEqual(Q.deliver(S, 0, NOW, { swordId: 2 }).ok, false);
    assert.strictEqual(Q.deliver(S, 1, NOW).ok, false);
    assert.strictEqual(Q.deliver(S, 99, NOW).ok, false);
    assert.strictEqual(snapshot(S), before);
  });
  test('deliver with a crafted in-memory item (unknown id, huge n) does not throw', () => {
    for (const id of ['constructor', '__proto__', 'toString', 'zzz']) {
      const S = SV.normalize(craftedSave(0, null), NOW);
      S.quests.list[0].item = { id, n: HUGE };
      assert.doesNotThrow(() => Q.deliver(S, 0, NOW, { swordId: 2, confirmActive: true }), id);
      assert.ok(Number.isSafeInteger(S.shards) && Number.isSafeInteger(S.gold), id);
    }
  });
});

describe('save clamps and own-property checks', () => {
  test('huge, negative and string numbers are clamped (via normalize)', () => {
    const S = SV.normalize({ gold: 1e300, shards: -5, best: 999, slots: 1e9, nextSwordId: 'x', stats: { tries: -1, success: '12.9' } }, NOW);
    assert.ok(Number.isSafeInteger(S.gold) && S.gold >= 0);
    assert.strictEqual(S.shards, 0);
    assert.strictEqual(S.best, C.MAX);
    assert.ok(S.slots <= C.SLOT_MAX);
    assert.strictEqual(S.stats.tries, 0);
    assert.strictEqual(S.stats.success, 12);
  });
  test('Infinity / empty string / objects fall back to defaults', () => {
    const S = SV.normalize({ gold: Infinity, shards: '', idle: { lastSeen: {}, boostUntil: [] } }, NOW);
    assert.strictEqual(S.gold, C.START_GOLD);
    assert.strictEqual(S.shards, 0);
    assert.strictEqual(S.idle.lastSeen, NOW);
    assert.strictEqual(S.idle.boostUntil, 0);
  });
  test('boostUntil is clamped to now + BOOSTER_MAX_MIN and never negative', () => {
    const max = NOW + C.BOOSTER_MAX_MIN * MIN;
    assert.strictEqual(SV.normalize({ idle: { boostUntil: 1e18 } }, NOW).idle.boostUntil, max);
    assert.strictEqual(SV.normalize({ idle: { boostUntil: -5 } }, NOW).idle.boostUntil, 0);
  });
  test('inv/ore/up counts respect their maximums; prototype-named keys are ignored', () => {
    const S = SV.normalize({
      inv: { bless: 1e9, constructor: 5 }, ore: { [C.ORES[0]]: 1e9 },
      idle: { up: { [C.UPGRADES[0].id]: 1e9 } },
    }, NOW);
    assert.ok(S.inv.bless <= C.STACK_MAX);
    assert.ok(S.ore[C.ORES[0]] <= C.ORE_MAX);
    assert.ok(S.idle.up[C.UPGRADES[0].id] <= C.UP_MAX);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(S.inv, 'constructor'), false);
  });
  test('active points to an existing sword; dangling active falls back', () => {
    for (const active of [999, -1, 'constructor', null, 1e20]) {
      const S = SV.normalize({ swords: [{ id: 3, lv: 2, prot: 2, pity: 0 }], active }, NOW);
      assert.ok(R.findSword(S, S.active), String(active));
    }
  });
  test('anvilEq must reference an owned anvil, and dura is clamped to the grade maximum', () => {
    const S = SV.normalize({ anvils: [{ id: 1, g: 2, dura: 1e9 }, { id: 2, g: 99, dura: 5 }, { id: 1, g: 1, dura: 3 }], anvilEq: 2 }, NOW);
    assert.deepStrictEqual(S.anvils.map(a => a.id), [1]);
    assert.strictEqual(S.anvils[0].dura, C.ANVIL_DURA[2]);
    assert.strictEqual(S.anvilEq, null);
    for (const eq of ['constructor', -1, 1e20, '1']) assert.doesNotThrow(() => SV.normalize({ anvils: [{ id: 1, g: 1, dura: 1 }], anvilEq: eq }, NOW));
  });
  test('use.anvil is cleared when the equipped anvil is broken', () => {
    const S = SV.normalize({ use: { anvil: true }, anvils: [{ id: 1, g: 1, dura: 0 }], anvilEq: 1 }, NOW);
    assert.strictEqual(S.use.anvil, false);
  });
  test('corrupt payloads (arrays, primitives, nested garbage) normalize without throwing', () => {
    for (const d of [[], 5, 'x', null, { swords: 5, quests: [], idle: 'x', inv: [], found: {}, stats: 3, settings: [] }]) {
      const S = SV.normalize(d, NOW);
      assert.ok(R.activeSword(S), JSON.stringify(d));
    }
  });
  test('normalize is idempotent', () => {
    const raw = { gold: 5e3, swords: [{ id: 2, lv: 7, prot: 1, pity: 3 }], quests: { list: [{ id: 3, tier: 'easy', lv: 4, item: { id: 'bless' } }] }, idle: { lastSeen: NOW - 1000 } };
    const once = SV.normalize(raw, NOW);
    assert.deepStrictEqual(SV.normalize(JSON.parse(JSON.stringify(once)), NOW), once);
  });
});

describe('corrupt v2 backup', () => {
  const GARBAGE = '{not json';
  test('corrupt v2 is copied to sword-enhance-v2-corrupt and a new game is returned', () => {
    const st = memStorage({ [C.SAVE_KEY]: GARBAGE });
    const r = SV.load(st, NOW);
    assert.strictEqual(r.source, 'corrupt');
    assert.strictEqual(r.backedUp, true);
    assert.strictEqual(st.dump[SV.CORRUPT_BACKUP_KEY], GARBAGE);
    assert.strictEqual(SV.CORRUPT_BACKUP_KEY, 'sword-enhance-v2-corrupt');
  });
  test('after the first save the backup key is not rewritten by later loads', () => {
    const st = memStorage({ [C.SAVE_KEY]: GARBAGE });
    const first = SV.load(st, NOW).state;
    SV.save(st, first, NOW);
    st.dump[SV.CORRUPT_BACKUP_KEY] = 'marker';
    for (let i = 0; i < 3; i++) assert.strictEqual(SV.load(st, NOW + i).source, 'v2');
    assert.strictEqual(st.dump[SV.CORRUPT_BACKUP_KEY], 'marker');
  });
  test('valid v2 never touches the backup key; JSON array/primitive v2 counts as corrupt', () => {
    const ok = memStorage(); SV.save(ok, fresh(), NOW); SV.load(ok, NOW);
    assert.strictEqual(SV.CORRUPT_BACKUP_KEY in ok.dump, false);
    for (const raw of ['[]', '5', 'null', '"x"']) assert.strictEqual(SV.load(memStorage({ [C.SAVE_KEY]: raw }), NOW).source, 'corrupt', raw);
  });
  test('backup failure (setItem throws) is reported, not thrown', () => {
    const st = { getItem: k => (k === C.SAVE_KEY ? GARBAGE : null), setItem: () => { throw new Error('quota'); } };
    const r = SV.load(st, NOW);
    assert.strictEqual(r.backedUp, false);
    assert.strictEqual(r.source, 'corrupt');
  });
  test('reloading an unchanged corrupt v2 rewrites the backup with the same bytes (idempotent)', () => {
    const st = memStorage({ [C.SAVE_KEY]: GARBAGE });
    SV.load(st, NOW); SV.load(st, NOW + 1);
    assert.strictEqual(st.dump[SV.CORRUPT_BACKUP_KEY], GARBAGE);
  });
  test('a second, different corrupt save leaves the first backup in place (write-once, AC 18)', () => {
    const st = memStorage({ [C.SAVE_KEY]: 'AAA' });
    SV.load(st, NOW);
    st.dump[C.SAVE_KEY] = 'BBB';
    const r = SV.load(st, NOW);
    assert.strictEqual(st.dump[SV.CORRUPT_BACKUP_KEY], 'AAA');
    assert.strictEqual(r.keptAt, null);
    assert.strictEqual(r.earlierBackupAt, SV.CORRUPT_BACKUP_KEY);
  });
});

// ============================================================ (3) two-tab logic (pure parts)
describe('two-tab: save sharing and offline settlement', () => {
  const idleState = () => {
    const S = fresh(); S.idle.autoOn = true; S.best = 10; S.swords = [{ id: 1, lv: 10, prot: 2, pity: 0 }];
    S.gold = 0; S.idle.lastSeen = NOW; return S;
  };
  test('after the other tab saved later, the adopted save has a later lastSeen and pays no second offline settlement', () => {
    const st = memStorage();
    const stale = idleState(); SV.save(st, stale, NOW);
    const newer = SV.load(st, NOW).state;
    SV.save(st, newer, NOW + 5 * HOUR);
    const latest = SV.load(st, NOW + 5 * HOUR).state;
    assert.ok(latest.idle.lastSeen > stale.idle.lastSeen, 'adoptNewerSave condition');
    assert.strictEqual(I.settleOffline(latest, NOW + 5 * HOUR), null);
  });
  test('main.js wiring: storage listener, key filter, suspended guards, takeover resumes (static source check)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
    assert.ok(/addEventListener\('storage'[^\n]*C\.SAVE_KEY/.test(src), 'storage listener filters SAVE_KEY');
    assert.ok(/function persist\(\) \{\s*if \(suspended\) return;/.test(src), 'persist guarded');
    assert.ok(/if \(suspended \|\| document\.hidden\) return;/.test(src), 'tick guarded');
    assert.ok(/function takeOver\(\)[\s\S]*?resume\(true\);/.test(src), 'takeOver resumes with forced adopt');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(/id="tabLock" hidden/.test(html) && /id="btnTakeover"/.test(html));
  });
  test('AC 17: the lock is released only by takeOver (no automatic unlock path)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'main.js'), 'utf8');
    const unlocks = src.match(/setLocked\(false\)/g) || [];
    assert.strictEqual(unlocks.length, 1);
    assert.ok(/function takeOver\(\) \{[^}]*setLocked\(false\)/.test(src), 'the only unlock is inside takeOver');
  });
});

console.log(`\n${results.pass} passed, ${results.fail} failed`);
process.exit(results.fail ? 1 : 0);
