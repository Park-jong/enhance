/* 핵심 게임 규칙 (DOM·저장소·시계 비의존 순수 로직).
 * 상태 S는 m1-storage §3의 v2 구조. 시간은 now(ms), 난수는 rng() ∈ [0,1)로 주입받는다.
 * 실패는 { ok:false, reason } 로 돌려주고 상태를 바꾸지 않는다.
 */
(function (root, factory) {
  'use strict';
  const SG = root.SG = root.SG || {};
  if (!SG.C && typeof require === 'function') require('./constants.js');
  SG.rules = factory(SG.C);
  if (typeof module !== 'undefined' && module.exports) module.exports = SG.rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  const MIN_MS = 60 * 1000;
  const fail = reason => ({ ok: false, reason });

  // ============================================================ 공식
  const roundTo = (x, unit) => Math.round(x / unit) * unit;
  const cost = l => Math.max(C.COST_MIN, roundTo(C.COST_BASE * Math.pow(C.COST_GROWTH, l), C.GOLD_ROUND));
  const sell = l => (l === 0 ? 0 : roundTo(C.SELL_BASE * Math.pow(C.SELL_GROWTH, l), C.GOLD_ROUND));
  const protectNeed = l => 1 + Math.floor(l / C.PROTECT_NEED_DIV);
  const huntReward = l => Math.max(C.HUNT_MIN, Math.round(sell(l) * C.HUNT_SELL_RATIO));
  const autoReward = l => Math.max(C.AUTO_MIN, Math.round(C.AUTO_COST_RATIO * cost(l)));
  const shardGain = l => C.SHARD_BASE_PER_LV * l * (1 + Math.floor(l / C.SHARD_BAND));
  const boosterPrice = best =>
    Math.max(C.BOOSTER_PRICE_MIN, roundTo(C.BOOSTER_PRICE_HUNT_MULT * huntReward(best), C.BOOSTER_PRICE_ROUND));
  const pityBand = l => Math.min(C.PITY_STEP.length - 1, Math.floor(l / C.PITY_BAND_WIDTH));
  const pityBonus = (lv, pity) => Math.min(C.PITY_MAX[pityBand(lv)], pity * C.PITY_STEP[pityBand(lv)]);
  const rarity = l => C.RARITY.find(r => l >= r.min);
  const isUnlocked = (S, key) => S.best >= C.UNLOCK[key];

  /** 성공/파괴/실패 확률(정수 %). opts: { bless, anvilGrade(0..3), sure } — m1-pity-cap §3 */
  function chances(sword, opts) {
    const l = sword.lv;
    const o = opts || {};
    if (l >= C.MAX) return { succ: 0, dest: 0, fail: 0, base: 0, parts: null, raw: 0, bonus: 0, cap: 0, capped: false };
    if (o.sure && l < C.SURE_MAX_TARGET) {
      return { succ: 100, dest: 0, fail: 0, base: C.RATE[l], parts: null, raw: 0, bonus: 0, cap: 0, capped: false, sure: true };
    }
    const base = C.RATE[l];
    const band = pityBand(l);
    const parts = {
      bless: o.bless ? C.BLESS_BONUS : 0,
      anvil: C.ANVIL_BONUS[o.anvilGrade || 0] || 0,
      pity: pityBonus(l, sword.pity || 0),
    };
    const raw = parts.bless + parts.anvil + parts.pity;
    const cap = C.BONUS_CAP[band];
    const bonus = Math.min(raw, cap);
    const succ = Math.min(base + bonus, Math.max(base, C.SUCC_CEIL));
    const dest = Math.max(0, Math.min(C.DESTROY[l], 100 - succ));
    return { succ, dest, fail: 100 - succ - dest, base, parts, raw, bonus, cap, capped: raw > cap || succ < base + bonus };
  }

  // ============================================================ 검 / 보관함 (F5)
  const findSword = (S, id) => S.swords.find(s => s.id === id) || null;
  const activeSword = S => findSword(S, S.active) || S.swords[0];
  const bestSword = S => S.swords.reduce((b, s) => (s.lv > b.lv ? s : b), S.swords[0]);
  /** 사냥·자동·오프라인 수입 기준 단계: 보관함 최고 단계 검(사용자 결정) */
  const topLv = S => bestSword(S).lv;

  function createSword(S) {
    const sw = { id: S.nextSwordId++, lv: 0, prot: C.PROTECT_USES, pity: 0 };
    S.swords.push(sw);
    return sw;
  }

  /** 검을 칸에서 뺀다. 활성이었다면 최고 단계 검을 활성으로, 0자루면 무료 +0 지급 */
  function removeSword(S, id) {
    S.swords = S.swords.filter(s => s.id !== id);
    let freeSword = null;
    if (S.swords.length === 0) freeSword = createSword(S);
    if (!findSword(S, S.active)) S.active = bestSword(S).id;
    return { freeSword, activeId: S.active };
  }

  function buySword(S) {
    if (S.swords.length >= S.slots) return fail('slotsFull');
    if (S.gold < C.NEW_SWORD_PRICE) return fail('noGold');
    S.gold -= C.NEW_SWORD_PRICE;
    return { ok: true, sword: createSword(S), price: C.NEW_SWORD_PRICE };
  }

  function setActive(S, id) {
    if (!findSword(S, id)) return fail('notFound');
    S.active = id;
    return { ok: true };
  }

  const sealActive = S => !!S.use.seal && S.inv.seal > 0;

  /** 인장이 켜져 있으면 골드에 배율을 걸고 1장 소모 (판매·납품 공통) */
  function payWithSeal(S, amount) {
    if (!sealActive(S)) return { gold: amount, sealed: false };
    S.inv.seal--;
    S.use.seal = false;
    return { gold: Math.floor(amount * C.SEAL_MULT), sealed: true };
  }

  function sellSword(S, id) {
    const sw = findSword(S, id);
    if (!sw) return fail('notFound');
    if (sw.lv === 0) return fail('zeroLv');
    const pay = payWithSeal(S, sell(sw.lv));
    S.gold += pay.gold;
    S.stats.earned += pay.gold;
    const removed = removeSword(S, id);
    return { ok: true, lv: sw.lv, gold: pay.gold, sealed: pay.sealed, freeSword: removed.freeSword };
  }

  const expandCost = S => (S.slots >= C.SLOT_MAX ? null : C.SLOT_EXPAND_COST[S.slots - C.SLOT_START]);

  function expandSlots(S) {
    const price = expandCost(S);
    if (price === null) return fail('slotsMax');
    if (S.gold < price) return fail('noGold');
    S.gold -= price;
    S.slots++;
    return { ok: true, price, slots: S.slots };
  }

  // ============================================================ 모루 보조
  const findAnvil = (S, id) => S.anvils.find(a => a.id === id) || null;
  const equippedAnvil = S => (S.anvilEq === null ? null : findAnvil(S, S.anvilEq));

  function addAnvil(S, g) {
    const anvil = { id: S.nextAnvilId++, g, dura: C.ANVIL_DURA[g] };
    S.anvils.push(anvil);
    if (!equippedAnvil(S)) S.anvilEq = anvil.id;   // 첫 모루는 자동 장착
    return anvil;
  }

  // ============================================================ 아이템 지급 (데이터 주도)
  const CAPACITY = {
    consumable: (S, id) => C.STACK_MAX - S.inv[id],
    anvil: S => C.ANVIL_OWN_MAX - S.anvils.length,
    shard: () => Infinity,
  };
  const GRANT = {
    consumable: (S, id, n) => { S.inv[id] += n; },
    anvil: (S, id, n) => { for (let i = 0; i < n; i++) addAnvil(S, C.ITEMS[id].g); },
    shard: (S, id, n) => { S.shards += n; },
  };

  const capacityFor = (S, id) => Math.max(0, CAPACITY[C.ITEMS[id].kind](S, id));

  /** 들어갈 만큼만 지급하고 지급한 수를 돌려준다 */
  function grantItem(S, id, n) {
    const granted = Math.min(n, capacityFor(S, id));
    if (granted > 0) GRANT[C.ITEMS[id].kind](S, id, granted);
    return granted;
  }

  // ============================================================ 소모품 토글 (트레이)
  const sureValidLv = l => l < C.SURE_MAX_TARGET;
  const keepdownValidLv = l => l >= C.DROP_FROM && l < C.KEEPDOWN_MAX_LV;

  // 각 토글이 지금 쓸 수 없는 이유(null이면 사용 가능)
  const TOGGLE_BLOCK = {
    bless: (S) => (S.inv.bless > 0 ? null : 'noStock'),
    anvil: (S, sw) => {
      const a = equippedAnvil(S);
      if (!a) return 'noAnvil';
      if (a.dura <= 0) return 'broken';
      return sw.lv < C.ANVIL_TOGGLE_MIN_LV ? 'lowLv' : null;
    },
    protect: (S, sw) => {
      if (C.DESTROY[sw.lv] <= 0) return 'noDestroy';
      if (sw.prot <= 0) return 'protExhausted';
      return S.inv.protect < protectNeed(sw.lv) ? 'needMore' : null;
    },
    keepdown: (S, sw) => {
      if (!keepdownValidLv(sw.lv)) return 'lvRange';
      return S.inv.keepdown > 0 ? null : 'noStock';
    },
    sure: (S, sw) => {
      if (!sureValidLv(sw.lv)) return 'lvTooHigh';
      return S.inv.sure > 0 ? null : 'noStock';
    },
  };

  /** 트레이 각 행의 상태: { on(이번 시도에 실제 적용), block(사유 코드|null) } */
  function trayState(S) {
    const sw = activeSword(S);
    const out = {};
    const atMax = sw.lv >= C.MAX;
    const sureOn = !atMax && !!S.use.sure && TOGGLE_BLOCK.sure(S, sw) === null;
    C.TRAY_TOGGLES.forEach(id => {
      let block = atMax ? 'maxLv' : TOGGLE_BLOCK[id](S, sw);
      if (!block && sureOn && id !== 'sure') block = 'sureExclusive';
      out[id] = { on: !block && !!S.use[id], block };
    });
    return out;
  }

  const effectiveUse = S => {
    const t = trayState(S);
    const use = {};
    C.TRAY_TOGGLES.forEach(id => { use[id] = t[id].on; });
    return use;
  };

  /** 토글 변경. 확정 강화권을 켜면 나머지 토글은 강제 해제 */
  function setUse(S, id, on) {
    if (!on) { S.use[id] = false; return { ok: true }; }
    if (id === 'seal') {
      if (S.inv.seal <= 0) return fail('noStock');
      S.use.seal = true;
      return { ok: true };
    }
    const block = trayState(S)[id].block;
    if (block) return fail(block);
    S.use[id] = true;
    if (id === 'sure') C.TRAY_TOGGLES.forEach(k => { if (k !== 'sure') S.use[k] = false; });
    return { ok: true };
  }

  /** 보유량이 0이거나 장착 모루가 쓸 수 없으면 토글 해제 (단계 조건은 표시에서만 무효 처리) */
  function cleanupUse(S) {
    C.CONSUMABLES.forEach(id => { if (id in S.use && S.inv[id] <= 0) S.use[id] = false; });
    const a = equippedAnvil(S);
    if (!a || a.dura <= 0) S.use.anvil = false;
  }

  // ============================================================ 강화 시도
  const resetOnLevelChange = sw => { sw.prot = C.PROTECT_USES; };

  const OUTCOME = {
    success(S, sw, r) {
      const nl = sw.lv + 1;
      sw.lv = nl;
      sw.pity = 0;
      resetOnLevelChange(sw);
      S.stats.success++;
      r.firstFound = !S.found[nl];
      S.found[nl] = true;
      r.newBest = nl > S.best;
      if (r.newBest) S.best = nl;
      return 'success';
    },
    destroy(S, sw, r, use) {
      const need = protectNeed(sw.lv);
      if (use.protect && sw.prot > 0 && S.inv.protect >= need) {
        S.inv.protect -= need;
        sw.prot--;
        sw.pity++;
        S.stats.protectSaved++;
        r.protectUsed = need;
        r.protLeft = sw.prot;
        return 'protected';
      }
      r.shards = shardGain(sw.lv);
      S.shards += r.shards;
      S.stats.shardsGained += r.shards;
      S.stats.destroy++;
      const removed = removeSword(S, sw.id);
      r.freeSword = removed.freeSword;
      r.newActiveId = removed.activeId;
      return 'destroy';
    },
    fail(S, sw, r, use) {
      S.stats.fail++;
      sw.pity++;
      if (sw.lv < C.DROP_FROM) return 'fail';
      if (use.keepdown && S.inv.keepdown > 0) {
        S.inv.keepdown--;
        return 'kept';
      }
      sw.lv--;
      resetOnLevelChange(sw);
      return 'drop';
    },
  };

  /** 강화 1회: 검증 → 시작 시점 소모 → 굴림 → 결과 적용(모두 동기). 연출은 호출 측 몫 */
  function attemptEnhance(S, rng) {
    const sw = activeSword(S);
    const l = sw.lv;
    if (l >= C.MAX) return fail('maxLv');
    const price = cost(l);
    if (S.gold < price) return fail('noGold');

    const use = effectiveUse(S);
    const anvil = use.anvil ? equippedAnvil(S) : null;
    const ch = chances(sw, { bless: use.bless, anvilGrade: anvil ? anvil.g : 0, sure: use.sure });

    S.gold -= price;
    if (use.bless) S.inv.bless--;
    if (use.sure) S.inv.sure--;
    if (anvil) anvil.dura--;
    S.stats.tries++;

    const r = { ok: true, swordId: sw.id, from: l, price, chances: ch, used: use };
    const roll = rng() * 100;
    const kind = roll < ch.succ ? 'success' : roll < ch.succ + ch.dest ? 'destroy' : 'fail';
    r.outcome = OUTCOME[kind](S, sw, r, use);
    r.to = r.outcome === 'destroy' ? null : sw.lv;
    r.pity = sw.pity;
    if (anvil && anvil.dura <= 0) r.anvilBroke = true;
    cleanupUse(S);
    return r;
  }

  // ============================================================ 골드 부스터
  const BOOST_MS = C.BOOSTER_DURATION_MIN * MIN_MS;
  const boostActiveAt = (S, t) => t < S.idle.boostUntil;
  const boostRemainingMs = (S, now) => Math.max(0, S.idle.boostUntil - now);
  const canExtendBoost = (S, now) => Math.max(now, S.idle.boostUntil) + BOOST_MS - now <= C.BOOSTER_MAX_MIN * MIN_MS;

  function extendBoost(S, now) {
    if (!canExtendBoost(S, now)) return fail('boostMax');
    S.idle.boostUntil = Math.max(now, S.idle.boostUntil) + BOOST_MS;
    return { ok: true, until: S.idle.boostUntil };
  }

  function useBoosterFromInv(S, now) {
    if (S.inv.booster <= 0) return fail('noStock');
    const r = extendBoost(S, now);
    if (r.ok) S.inv.booster--;
    return r;
  }

  // ============================================================ 상점
  const SHOP_PRICE = {
    booster: S => boosterPrice(S.best),
    anvil_1: () => C.ANVIL_SHOP_PRICE,
  };
  const shopEntry = id => C.SHOP_ITEMS.find(e => e.id === id) || null;
  const shopPrice = (S, id) => (SHOP_PRICE[id] ? SHOP_PRICE[id](S) : C.PRICE[id]);
  const shopUnlocked = (S, entry) => S.best >= (entry.unlockBest || 0);

  const SHOP_CHECK = {
    grant: (S, id) => (capacityFor(S, id) < 1 ? 'full' : null),
    boost: (S, id, now) => (canExtendBoost(S, now) ? null : 'boostMax'),
  };
  const SHOP_APPLY = {
    grant: (S, id) => { grantItem(S, id, 1); },
    boost: (S, id, now) => { extendBoost(S, now); },
  };

  function shopBlock(S, id, now) {
    const entry = shopEntry(id);
    if (!entry) return 'notFound';
    if (!shopUnlocked(S, entry)) return 'locked';
    const block = SHOP_CHECK[entry.action](S, id, now);
    if (block) return block;
    return S.gold < shopPrice(S, id) ? 'noGold' : null;
  }

  function buyShopItem(S, id, now) {
    const block = shopBlock(S, id, now);
    if (block) return fail(block);
    const price = shopPrice(S, id);
    S.gold -= price;
    SHOP_APPLY[shopEntry(id).action](S, id, now);
    return { ok: true, price };
  }

  // ============================================================ 파편 교환 (F6)
  function exchangeBlock(S, id) {
    if (!(id in C.SHARD_COST)) return 'notFound';
    if (!isUnlocked(S, 'forge')) return 'locked';
    if (capacityFor(S, id) < 1) return 'full';
    return S.shards < C.SHARD_COST[id] ? 'noShards' : null;
  }

  function exchangeShards(S, id) {
    const block = exchangeBlock(S, id);
    if (block) return fail(block);
    S.shards -= C.SHARD_COST[id];
    grantItem(S, id, 1);
    return { ok: true, cost: C.SHARD_COST[id] };
  }

  return {
    // 공식
    cost, sell, protectNeed, huntReward, autoReward, shardGain, boosterPrice, pityBand, pityBonus, rarity,
    isUnlocked, chances,
    // 보관함
    findSword, activeSword, bestSword, topLv, createSword, removeSword, buySword, setActive, sellSword,
    expandCost, expandSlots, sealActive, payWithSeal,
    // 아이템
    findAnvil, equippedAnvil, addAnvil, capacityFor, grantItem,
    // 강화
    trayState, effectiveUse, setUse, cleanupUse, attemptEnhance, sureValidLv, keepdownValidLv,
    // 부스터 / 상점 / 파편
    boostActiveAt, boostRemainingMs, canExtendBoost, extendBoost, useBoosterFromInv,
    shopPrice, shopBlock, shopUnlocked, buyShopItem, exchangeBlock, exchangeShards,
  };
});
