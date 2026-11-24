/* 핵심 게임 규칙 (DOM·저장소·시계 비의존 순수 로직).
 * 상태 S는 m1-storage §3의 v2 구조. 시간은 now(ms), 난수는 rng() ∈ [0,1)로 주입받는다.
 * 실패는 { ok:false, reason } 로 돌려주고 상태를 바꾸지 않는다.
 */
(function (root, factory) {
  'use strict';
  const SG = root.SG = root.SG || {};
  if (!SG.C && typeof require === 'function') require('./constants.js');
  if (!SG.events && typeof require === 'function') require('./events.js');
  SG.rules = factory(SG.C, SG.config, SG.events);
  if (typeof module !== 'undefined' && module.exports) module.exports = SG.rules;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, config, E) {
  'use strict';

  const MIN_MS = 60 * 1000;
  const fail = reason => ({ ok: false, reason });
  // 저장 데이터·data-id에서 온 키가 프로토타입 속성(constructor, __proto__ 등)과 맞아떨어지지 않게 한다
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const itemDef = id => (hasOwn(C.ITEMS, id) ? C.ITEMS[id] : null);

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
  // 명성 상점 면허로 best 관문을 건너뛰는 해금(m2-rebirth §4): 해금 키 → 트랙
  const FAME_UNLOCK = { idle: 'autoStart' };
  const isUnlocked = (S, key) => S.best >= C.UNLOCK[key] || (hasOwn(FAME_UNLOCK, key) && fameValue(S, FAME_UNLOCK[key]) > 0);

  // ============================================================ 천장 게이지 / 성공 숙련 (M1.1, m1.1-late-correction)
  /** 단계 l의 계정 공통 배열 인덱스(from..to 밖이면 -1) */
  const levelIndex = (l, from, to) => (l >= from && l <= to ? l - from : -1);
  const gaugeIndex = l => levelIndex(l, C.GAUGE_FROM, C.GAUGE_TO);
  const masteryIndex = l => levelIndex(l, C.MASTERY_FROM, C.MASTERY_TO);
  /** 성공 기록 count회의 숙련 보너스 %p (대상 단계 밖이면 0) */
  const masteryBonus = (l, count) => {
    const i = masteryIndex(l);
    return i < 0 ? 0 : Math.min(C.MASTERY_MAX[i], count * C.MASTERY_STEP[i]);
  };
  const masteryCount = (S, l) => { const i = masteryIndex(l); return i < 0 ? 0 : S.mastery[i]; };
  /** 단계 l의 천장 게이지 표시용 { value, n, full } (대상 단계 밖이면 null) */
  function gaugeInfo(S, l) {
    const i = gaugeIndex(l);
    if (i < 0) return null;
    return { value: S.gauge[i], n: C.GAUGE_N[i], full: S.gauge[i] >= C.GAUGE_N[i] };
  }
  const isGaugeFull = (S, l) => { const g = gaugeInfo(S, l); return !!g && g.full; };

  // 상한·천장·보정을 모두 건너뛰는 확정 결과(테스트 강제 / 확정 강화권 / 천장 게이지). flag: forced|sure|gaugeFull
  // 이벤트 항(m2-events §5.2)은 확정·최대 단계에서 0이고 parts는 null 그대로다
  const certain = (l, flag) => ({
    succ: 100, dest: 0, fail: 0, base: C.RATE[l], parts: null, raw: 0, bonus: 0, cap: 0, capped: false, mastery: 0, [flag]: true,
    event: 0, succNoEvent: 100, eventGain: 0, eventLost: 0,
  });

  /**
   * 성공/파괴/실패 확률(정수 %). opts: { bless, anvilGrade(0..3), sure, gaugeFull, mastery(성공 기록 횟수), event(행운의 시간 %p) }
   * — m1-pity-cap §3, m1.1-late-correction §3.3. 규칙 모듈은 S를 모르므로 gaugeFull·mastery는 호출자가 주입한다.
   * config.forceSuccess(테스트 페이지 설정)가 켜져 있으면 모든 단계·옵션에서 성공 100%. 강화 굴림은 모두 이 값을 따른다
   * 주의: forceSuccess는 테스트 페이지(test.html, js/test-mode.js) 전용이다. 실제 페이지(index.html)에서는 절대 켜지 않는다
   */
  function chances(sword, opts) {
    const l = sword.lv;
    const o = opts || {};
    if (l >= C.MAX) {
      return { succ: 0, dest: 0, fail: 0, base: 0, parts: null, raw: 0, bonus: 0, cap: 0, capped: false, mastery: 0,
        event: 0, succNoEvent: 0, eventGain: 0, eventLost: 0 };
    }
    if (config.forceSuccess) return certain(l, 'forced');
    if (o.sure && l < C.SURE_MAX_TARGET) return certain(l, 'sure');
    if (o.gaugeFull && gaugeIndex(l) >= 0) return certain(l, 'gaugeFull');
    const base = C.RATE[l];
    const band = pityBand(l);
    const parts = {
      bless: o.bless ? C.BLESS_BONUS : 0,
      anvil: C.ANVIL_BONUS[o.anvilGrade || 0] || 0,
      pity: pityBonus(l, sword.pity || 0),
    };
    // 행운의 시간은 parts가 아닌 같은 보너스 합(raw)에 더해 BONUS_CAP이 한계다(m2-events §5.2)
    const event = o.event || 0;
    const rawNoEvent = parts.bless + parts.anvil + parts.pity;
    const raw = rawNoEvent + event;
    const cap = C.BONUS_CAP[band];
    const bonus = Math.min(raw, cap);
    // 숙련은 BONUS_CAP 밖에서 더하지만 SUCC_CEIL은 적용된다
    const mastery = masteryBonus(l, o.mastery || 0);
    const succOf = b => Math.min(base + b + mastery, Math.max(base, C.SUCC_CEIL));
    const succ = succOf(bonus);
    const dest = Math.max(0, Math.min(C.DESTROY[l], 100 - succ));
    const succNoEvent = event > 0 ? succOf(Math.min(rawNoEvent, cap)) : succ;
    const eventGain = succ - succNoEvent;
    return {
      succ, dest, fail: 100 - succ - dest, base, parts, raw, bonus, cap, capped: raw > cap || succ < base + bonus + mastery, mastery,
      event, succNoEvent, eventGain, eventLost: event - eventGain,
    };
  }

  // ============================================================ 검 / 보관함 (F5)
  const findSword = (S, id) => S.swords.find(s => s.id === id) || null;
  /** 활성 검, 없으면 null(파괴 직후 '활성 없음' 상태 — 플레이어가 보관함에서 직접 고른다) */
  const activeSword = S => findSword(S, S.active);
  const bestSword = S => S.swords.reduce((b, s) => (s.lv > b.lv ? s : b), S.swords[0]);
  /** 사냥·자동·오프라인 수입 기준 단계: 보관함 최고 단계 검(사용자 결정) */
  const topLv = S => bestSword(S).lv;

  // ============================================================ 명성 상점 효과 조회 (F11, m2-rebirth §4) — chances()·가격식은 이 함수들을 쓰지 않는다
  /** 그 트랙의 현재 레벨 값(0레벨·알 수 없는 트랙이면 0). rebirth가 없는 상태(직접 조립한 옛 테스트·도구 상태)는 0레벨로 본다 */
  function fameValue(S, track) {
    if (!hasOwn(C.FAME_SHOP, track) || !S.rebirth || !S.rebirth.up) return 0;
    const lv = S.rebirth.up[track];
    // 정규화를 거치지 않은 범위 밖 레벨이 NaN 골드로 번지지 않게 0으로 본다
    return lv > 0 ? C.FAME_SHOP[track].values[lv - 1] || 0 : 0;
  }
  /** 초반 수입 %(§4.2 pFame): topLv ≤ EARLY_INCOME_MAX_LV일 때만 income 트랙 값, 아니면 0(0이면 수입 식은 기존 경로) */
  const earlyIncomePct = S => (topLv(S) <= C.EARLY_INCOME_MAX_LV ? fameValue(S, 'income') : 0);

  // ============================================================ 검 특성 조회 (F14, m2-traits §3·§4) — chances()는 이 함수들을 쓰지 않는다
  const traitDef = kind => (typeof kind === 'string' && hasOwn(C.TRAITS, kind) ? C.TRAITS[kind] : null);
  /** 검에 kind 특성이 있으면 그 등급의 값(%p), 없으면 0 */
  const traitValue = (sw, kind) => {
    const def = traitDef(kind);
    // 정규화를 거치지 않은 상태의 범위 밖 등급이 NaN 골드로 번지지 않게 0으로 본다
    return def && sw && sw.trait && sw.trait.k === kind ? def.values[sw.trait.t - 1] || 0 : 0;
  };
  /** 수입 검: 최고 단계(topLv)인 모든 검(동률 포함, 활성 무관) */
  const incomeSwords = S => { const top = topLv(S); return S.swords.filter(s => s.lv === top); };
  /** 수입형 특성 값(%p): 수입 검들 중 그 종류의 최댓값(합산 없음) */
  const incomeTraitValue = (S, kind) => incomeSwords(S).reduce((m, s) => Math.max(m, traitValue(s, kind)), 0);
  /** 표시용 배율 (100+v)/100. 지급 계산은 부동소수 오차를 피하려고 traitScaled(정수 %p)를 쓴다 */
  const incomeTrait = (S, kind) => (C.PERCENT + incomeTraitValue(S, kind)) / C.PERCENT;
  /**
   * x × (100+v) / 100 — 정수 %p를 곱하고 마지막에 한 번 나눈다(호출자가 그 뒤 기존 floor/round를 한다).
   * v가 0이면 x를 그대로 돌려줘 특성 없는 값이 이전과 비트 단위로 같다(m2-traits §3.1)
   */
  const traitScaled = (x, v) => percentScaled(x, [v]);
  /**
   * x × Π(100+v) / 100^k — 0보다 큰 %p 값들(특성·이벤트, 곱연산 독립 인자)을 먼저 곱하고 마지막에 한 번 나눈다(m2-events §5.1).
   * 0인 값은 곱하지 않으므로 이벤트 항이 0이면 특성만의 식(x × (100+v) / 100)과 같은 연산, 모두 0이면 x 그대로다
   */
  function percentScaled(x, values) {
    const used = values.filter(v => v > 0);
    return used.length ? used.reduce((p, v) => p * (C.PERCENT + v), x) / Math.pow(C.PERCENT, used.length) : x;
  }
  /** 거래형(상인): 이 검의 판매·납품 기본 지급액 */
  const tradeGold = (sw, base) => Math.floor(traitScaled(base, traitValue(sw, 'trade')));

  function createSword(S) {
    const sw = { id: S.nextSwordId++, lv: 0, prot: C.PROTECT_USES, pity: 0, trait: null };
    S.swords.push(sw);
    return sw;
  }

  /**
   * 검을 칸에서 뺀다. 0자루면 무료 +0 지급. 뺀 검이 활성이었다면 opts.pickNext(기본 true: 판매·납품)일 때
   * 최고 단계 검을 활성으로, false(파괴)면 '활성 없음' — 연타한 강화가 다른 검에 이어지지 않게 한다
   */
  function removeSword(S, id, opts) {
    const wasActive = S.active === id;
    const pickNext = !opts || opts.pickNext !== false;
    S.swords = S.swords.filter(s => s.id !== id);
    const freeSword = S.swords.length === 0 ? createSword(S) : null;
    if (wasActive) S.active = pickNext ? bestSword(S).id : C.NO_ACTIVE_SWORD;
    return { freeSword, activeId: S.active };
  }

  /** 칸 순서 이동: id 검을 빼서 나머지 검 사이 toIndex 자리에 넣는다(범위 밖이면 양 끝). 배열 순서가 곧 저장되는 칸 순서 */
  function moveSword(S, id, toIndex) {
    const from = S.swords.findIndex(s => s.id === id);
    if (from < 0) return fail('notFound');
    if (!Number.isFinite(toIndex)) return fail('badIndex');
    const to = Math.max(0, Math.min(S.swords.length - 1, Math.floor(toIndex)));
    const [sw] = S.swords.splice(from, 1);
    S.swords.splice(to, 0, sw);
    return { ok: true, from, to, moved: from !== to };
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
  const sealedGold = amount => Math.floor(amount * C.SEAL_MULT);
  /**
   * 지금 판매·납품하면 받을 골드(소모 없음). 순서: 기본 → 검의 상인 특성(sword가 있을 때) → 감정 인장(m2-traits §3.1).
   * 실제 지급(payWithSeal)도 이 함수로 계산하므로 미리보기와 지급이 항상 같다
   */
  function payoutPreview(S, amount, sword) {
    const traded = sword ? tradeGold(sword, amount) : amount;
    return sealActive(S) ? sealedGold(traded) : traded;
  }

  /** payoutPreview 금액을 지급액으로 확정하고, 인장이 켜져 있었으면 1장 소모 (판매·납품 공통) */
  function payWithSeal(S, amount, sword) {
    const sealed = sealActive(S);
    const gold = payoutPreview(S, amount, sword);
    if (sealed) {
      S.inv.seal--;
      S.use.seal = false;
    }
    return { gold, sealed };
  }

  /** 감정 인장 켜기/끄기(트레이 토글과 달리 판매·납품에 쓰인다) */
  function setSeal(S, on) {
    if (on && S.inv.seal <= 0) return fail('noStock');
    S.use.seal = !!on;
    return { ok: true };
  }

  function sellSword(S, id) {
    const sw = findSword(S, id);
    if (!sw) return fail('notFound');
    if (sw.lv === 0) return fail('zeroLv');
    const pay = payWithSeal(S, sell(sw.lv), sw);
    S.gold += pay.gold;
    S.stats.earned += pay.gold;
    if (sw.lv >= C.SELL_COUNT_MIN_LV) S.stats.sells++;
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
    anvil: (S, id, n) => { for (let i = 0; i < n; i++) addAnvil(S, itemDef(id).g); },
    shard: (S, id, n) => { S.shards += n; },
  };

  /** 알 수 없는 품목은 보관 공간 0 (지급되지 않음) */
  const capacityFor = (S, id) => {
    const def = itemDef(id);
    return def ? Math.max(0, CAPACITY[def.kind](S, id)) : 0;
  };

  /** 들어갈 만큼만 지급하고 지급한 수를 돌려준다 */
  function grantItem(S, id, n) {
    const granted = Math.min(n, capacityFor(S, id));
    if (granted > 0) GRANT[itemDef(id).kind](S, id, granted);
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

  /** 모든 토글을 함께 막는 사유: 활성 검 없음, 최대 단계, 또는 천장 확정 시도(소모품이 필요 없어 소모하지 않음) */
  function trayLock(S, sw) {
    if (!sw) return 'noActive';
    if (sw.lv >= C.MAX) return 'maxLv';
    return isGaugeFull(S, sw.lv) ? 'gaugeFull' : null;
  }

  /** 트레이 각 행의 상태: { on(이번 시도에 실제 적용), block(사유 코드|null) } */
  function trayState(S) {
    const sw = activeSword(S);
    const out = {};
    const lock = trayLock(S, sw);
    const sureOn = !lock && !!S.use.sure && TOGGLE_BLOCK.sure(S, sw) === null;
    C.TRAY_TOGGLES.forEach(id => {
      let block = lock || TOGGLE_BLOCK[id](S, sw);
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

  /** 트레이 토글 변경(감정 인장은 setSeal). 확정 강화권을 켜면 나머지 토글은 강제 해제 */
  function setUse(S, id, on) {
    if (!C.TRAY_TOGGLES.includes(id)) return fail('notFound');
    if (!on) { S.use[id] = false; return { ok: true }; }
    const block = trayState(S)[id].block;
    if (block) return fail(block);
    S.use[id] = true;
    if (id === 'sure') C.TRAY_TOGGLES.forEach(k => { if (k !== 'sure') S.use[k] = false; });
    return { ok: true };
  }

  /**
   * 보유량이 0이거나 장착 모루가 쓸 수 없으면 토글 해제 (단계 조건은 표시에서만 무효 처리).
   * 반환: 보유량이 0이 되어 이번에 켜짐 → 꺼짐으로 바뀐 소모품 id 목록
   */
  function cleanupUse(S) {
    const empty = C.CONSUMABLES.filter(id => hasOwn(S.use, id) && S.inv[id] <= 0);
    const ranOut = empty.filter(id => S.use[id]);
    empty.forEach(id => { S.use[id] = false; });
    const a = equippedAnvil(S);
    if (!a || a.dura <= 0) S.use.anvil = false;
    return ranOut;
  }

  // 성공률 보너스를 주는 토글 → 그 보너스를 뺀 확률 옵션
  const WITHOUT_BONUS = {
    bless: opts => Object.assign({}, opts, { bless: false }),
    anvil: opts => Object.assign({}, opts, { anvilGrade: 0 }),
  };

  /** 활성 검의 이번 시도 확률 옵션: 실제 적용되는 토글 + 계정 공통 천장 게이지·숙련 기록(m1.1 §3.3). 활성 검 없으면 null */
  function enhanceOpts(S) {
    const sw = activeSword(S);
    if (!sw) return null;
    const lv = sw.lv;
    const use = effectiveUse(S);
    const anvil = use.anvil ? equippedAnvil(S) : null;
    return {
      bless: use.bless, anvilGrade: anvil ? anvil.g : 0, sure: use.sure,
      gaugeFull: isGaugeFull(S, lv), mastery: masteryCount(S, lv), event: E.luckBonus(S, lv),
    };
  }
  /** 지금 강화하면 적용될 확률(화면 표시와 실제 굴림이 같은 값을 쓰도록 한 곳에서 계산). 활성 검 없으면 null */
  function currentChances(S) {
    const sw = activeSword(S);
    return sw ? chances(sw, enhanceOpts(S)) : null;
  }
  const succWithout = (S, opts, ids) => chances(activeSword(S), ids.reduce((o, id) => WITHOUT_BONUS[id](o), opts)).succ;

  /** 켜진 보너스 토글(축복·모루)을 빼도 성공률이 같으면 true(상한 도달로 효과 없음). 보너스가 아닌 토글은 항상 false */
  function bonusWasted(S, id) {
    if (!hasOwn(WITHOUT_BONUS, id)) return false;
    if (!effectiveUse(S)[id]) return false;
    const opts = enhanceOpts(S);
    return succWithout(S, opts, []) === succWithout(S, opts, [id]);
  }

  /**
   * 트레이 표시용 상한 메모: null | 'wasted'(빼도 성공률 불변) | 'partial'.
   * 축복·모루가 각각은 낭비로 보여도 둘 다 빼면 성공률이 내려가면 'partial'(둘 중 하나만 필요)
   */
  function bonusCapNote(S, id) {
    if (!bonusWasted(S, id)) return null;
    const wasted = Object.keys(WITHOUT_BONUS).filter(k => bonusWasted(S, k));
    if (wasted.length < 2) return 'wasted';
    const opts = enhanceOpts(S);
    return succWithout(S, opts, []) === succWithout(S, opts, wasted) ? 'wasted' : 'partial';
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
      r.shards = Math.floor(traitScaled(shardGain(sw.lv), traitValue(sw, 'shard')));
      S.shards += r.shards;
      S.stats.shardsGained += r.shards;
      S.stats.destroy++;
      const removed = removeSword(S, sw.id, { pickNext: false });
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

  /**
   * 계정 공통 천장 게이지·숙련 기록 갱신(시도 시작 단계 l 기준, m1.1 §2·§3.1).
   * 성공이 아니면(실패·하락·파괴·보호로 막은 파괴) 게이지 +1, 성공이면 0. 성공은 숙련 기록 +1(REC_MAX까지).
   * assisted(행운의 시간 덕에 난 성공, m2-events §5.2)면 숙련 기록만 건너뛴다(게이지는 일반 성공과 같다).
   * 새 숙련 기록을 얻으면 { lv, gained(%p), bonus(%p), count, max }를 돌려준다
   */
  function recordLateProgress(S, l, outcome, assisted) {
    const success = outcome === 'success';
    const gi = gaugeIndex(l);
    if (gi >= 0) S.gauge[gi] = success ? 0 : Math.min(C.GAUGE_N[gi], S.gauge[gi] + 1);
    const mi = masteryIndex(l);
    if (!success || assisted || mi < 0 || S.mastery[mi] >= C.MASTERY_REC_MAX[mi]) return null;
    const before = masteryBonus(l, S.mastery[mi]);
    S.mastery[mi]++;
    const bonus = masteryBonus(l, S.mastery[mi]);
    return { lv: l, gained: bonus - before, bonus, count: S.mastery[mi], max: C.MASTERY_REC_MAX[mi] };
  }

  /**
   * 모루가 적용된 시도의 내구도 미소모 판정. 모루 가호 중이면 대장장이 특성과 합성한 확률 1 − (1−a)(1−b)로 rng 1회(1/10000 단위,
   * m2-events §5.3-4). 아니면 대장장이 특성 검일 때만 rng 1회, 특성이 없으면 rng를 쓰지 않는다(기존 호출 열 유지)
   */
  function rollAnvilKeep(S, sw, rng) {
    const v = traitValue(sw, 'anvil');
    const ev = E.eventValue(S, 'anvil');
    if (ev > 0) return Math.floor(rng() * C.PERCENT_SQ) < C.PERCENT_SQ - (C.PERCENT - v) * (C.PERCENT - ev);
    return v > 0 && Math.floor(rng() * C.PERCENT) < v;
  }

  /** 강화 1회: 검증 → 시작 시점 소모 → 굴림 → 결과 적용(모두 동기). 연출은 호출 측 몫 */
  function attemptEnhance(S, rng) {
    const sw = activeSword(S);
    if (!sw) return fail('noActive');
    const l = sw.lv;
    if (l >= C.MAX) return fail('maxLv');
    const price = cost(l);
    if (S.gold < price) return fail('noGold');

    // 천장 확정 시도면 트레이가 잠겨 use가 모두 false → 소모품·모루 내구도·보호권을 쓰지 않는다
    const use = effectiveUse(S);
    const anvil = use.anvil ? equippedAnvil(S) : null;
    const ch = chances(sw, enhanceOpts(S));

    S.gold -= price;
    if (use.bless) S.inv.bless--;
    // 테스트 강제 성공은 확정권 없이도 100%이므로 확정권을 소모하지 않는다(보유량이 그대로라 토글도 켜진 채 남음)
    if (use.sure && !ch.forced) S.inv.sure--;
    if (anvil) anvil.dura--;
    S.stats.tries++;

    const r = { ok: true, swordId: sw.id, from: l, price, chances: ch, used: use, gaugeBefore: gaugeInfo(S, l) };
    const roll = rng() * 100;
    const kind = roll < ch.succ ? 'success' : roll < ch.succ + ch.dest ? 'destroy' : 'fail';
    r.outcome = OUTCOME[kind](S, sw, r, use);
    // 행운의 시간이 없었으면 성공이 아니었던 롤(같은 결과 롤로 판정, m2-events §5.2)
    r.eventAssist = r.outcome === 'success' && ch.event > 0 && roll >= ch.succNoEvent;
    // 대장장이·모루 가호: 결과 롤 다음, 파손 판정 전. 파괴로 칸에서 빠져도 sw 객체의 특성을 읽는다(m2-traits §3.1-6)
    if (anvil && rollAnvilKeep(S, sw, rng)) {
      anvil.dura++;
      r.anvilKept = true;
    }
    r.to = r.outcome === 'destroy' ? null : sw.lv;
    r.pity = sw.pity;
    // 테스트 페이지의 강제 성공은 진행 기록이 아니다(m1.1 §3.1)
    r.mastery = ch.forced ? null : recordLateProgress(S, l, r.outcome, r.eventAssist);
    if (anvil && anvil.dura <= 0) r.anvilBroke = true;
    // 이번 시도로 다 써서 자동으로 꺼진 트레이 소모품(화면 알림용)
    r.ranOut = cleanupUse(S).filter(id => C.TRAY_TOGGLES.includes(id));
    return r;
  }

  // ============================================================ 검 특성 각인·관리 (F14, m2-traits §5·§8·§9)
  const sum = list => list.reduce((a, b) => a + b, 0);
  const TIERS = C.TRAIT_TIER_WEIGHT.map((_, i) => i + 1);
  const kindWeight = k => C.TRAIT_KIND_WEIGHT[k];
  const tierWeight = t => C.TRAIT_TIER_WEIGHT[t - 1];

  /** u ∈ [0,1)을 가중치 합에 펼쳐 누적 구간(r < 누적, 배열 순서)으로 고른다. 부동소수 끝값은 마지막 항목 */
  function pickWeighted(items, weightOf, u) {
    const r = u * sum(items.map(weightOf));
    let acc = 0;
    for (const item of items) {
      acc += weightOf(item);
      if (r < acc) return item;
    }
    return items[items.length - 1];
  }

  /**
   * +5 이상인데 특성이 없는 모든 검에 배열 순서대로 무료 각인한다. 검마다 rng 정확히 2회(종류, 등급).
   * 호출자(main)가 강화와 같은 rng를 넘긴다. 반환: 새로 각인된 [{ id, k, t }] (없으면 빈 배열, rng 0회)
   */
  function engravePending(S, rng) {
    const engraved = [];
    S.swords.forEach(sw => {
      if (sw.lv < C.TRAIT_ROLL_LV || sw.trait) return;
      const k = pickWeighted(C.TRAIT_KINDS, kindWeight, rng());
      const t = pickWeighted(TIERS, tierWeight, rng());
      sw.trait = { k, t };
      S.stats.traitRolls++;
      engraved.push({ id: sw.id, k, t });
    });
    return engraved;
  }

  /** 테스트 전용(test.html): 검의 특성을 직접 지정한다. index.html UI에서 부르지 않는다 */
  function setTrait(S, id, k, t) {
    const sw = findSword(S, id);
    if (!sw) return fail('notFound');
    if (!traitDef(k) || !Number.isInteger(t) || t < 1 || t > C.TRAIT_TIER_MAX) return fail('badTrait');
    sw.trait = { k, t };
    return { ok: true };
  }

  /** 사용처 가격의 기준 수입 H = huntReward(S.best) (m2-overview §C) */
  const sinkPrice = (mult, l) => roundTo(mult * huntReward(l), C.TRAIT_PRICE_ROUND);
  const traitRekindCost = S => sinkPrice(C.TRAIT_REKIND_MULT, S.best);
  /** 현재 등급 t(1·2)에서 한 등급 올리는 가격. 그 외 t는 null */
  const traitTierUpCost = (S, t) =>
    (Number.isInteger(t) && t >= 1 && t <= C.TRAIT_TIER_UP_MULT.length ? sinkPrice(C.TRAIT_TIER_UP_MULT[t - 1], S.best) : null);

  function paySink(S, price) {
    S.gold -= price;
    S.stats.sinkGold += price;
  }

  /** 특성 관리 공통 거절 사유(우선순위: notFound → locked → noTrait) */
  function traitMgmtBlock(S, sw) {
    if (!sw) return 'notFound';
    if (S.best < C.TRAIT_MGMT_UNLOCK_BEST) return 'locked';
    return sw.trait ? null : 'noTrait';
  }

  function rerollKindBlock(S, id) {
    const sw = findSword(S, id);
    const block = traitMgmtBlock(S, sw);
    if (block) return block;
    return S.gold < traitRekindCost(S) ? 'noGold' : null;
  }

  /** 종류 변경: 등급 유지, 현재 종류를 뺀 종류에서 가중치를 다시 맞춰 rng 1회로 고른다. 실패하면 상태·rng 불변 */
  function rerollKind(S, id, rng) {
    const block = rerollKindBlock(S, id);
    if (block) return fail(block);
    const sw = findSword(S, id);
    const price = traitRekindCost(S);
    const from = sw.trait.k;
    const k = pickWeighted(C.TRAIT_KINDS.filter(x => x !== from), kindWeight, rng());
    sw.trait = { k, t: sw.trait.t };
    paySink(S, price);
    S.stats.traitRolls++;
    return { ok: true, price, from, k, t: sw.trait.t };
  }

  function upgradeTierBlock(S, id) {
    const sw = findSword(S, id);
    const block = traitMgmtBlock(S, sw);
    if (block) return block;
    if (sw.trait.t >= C.TRAIT_TIER_MAX) return 'maxTier';
    return S.gold < traitTierUpCost(S, sw.trait.t) ? 'noGold' : null;
  }

  /** 등급 올리기: 결정적 t → t+1 (rng 없음) */
  function upgradeTier(S, id) {
    const block = upgradeTierBlock(S, id);
    if (block) return fail(block);
    const sw = findSword(S, id);
    const price = traitTierUpCost(S, sw.trait.t);
    sw.trait = { k: sw.trait.k, t: sw.trait.t + 1 };
    paySink(S, price);
    return { ok: true, price, k: sw.trait.k, t: sw.trait.t };
  }

  // ============================================================ 단계 기념비 (장식, m2-overview §C.3)
  /** 기념비 L(정수 MONUMENT_FROM..MAX)의 S.monuments 인덱스, 아니면 -1 */
  const monumentIndex = L =>
    (Number.isInteger(L) && L >= C.MONUMENT_FROM && L < C.MONUMENT_FROM + C.MONUMENT_COUNT ? L - C.MONUMENT_FROM : -1);
  const monumentCost = L => sinkPrice(C.MONUMENT_MULT, L);

  /** 거절 사유(검사 순서: invalid → owned → notReached → noGold) */
  function monumentBlock(S, L) {
    const i = monumentIndex(L);
    if (i < 0) return 'invalid';
    if (S.monuments[i]) return 'owned';
    if (S.best < L) return 'notReached';
    return S.gold < monumentCost(L) ? 'noGold' : null;
  }

  function buyMonument(S, L) {
    const block = monumentBlock(S, L);
    if (block) return fail(block);
    const price = monumentCost(L);
    paySink(S, price);
    S.monuments[monumentIndex(L)] = 1;
    return { ok: true, price };
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
    if (!hasOwn(C.SHARD_COST, id)) return 'notFound';
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
    roundTo, cost, sell, protectNeed, huntReward, autoReward, shardGain, boosterPrice, pityBand, pityBonus, rarity,
    isUnlocked, chances, hasOwn, itemDef,
    // 명성 상점 효과 (F11)
    fameValue, earlyIncomePct,
    // 천장 게이지 / 성공 숙련 (M1.1)
    gaugeIndex, masteryIndex, masteryBonus, masteryCount, gaugeInfo, isGaugeFull, enhanceOpts, currentChances,
    // 보관함
    findSword, activeSword, bestSword, topLv, createSword, removeSword, moveSword, buySword, setActive, sellSword,
    expandCost, expandSlots, sealActive, payoutPreview, payWithSeal, setSeal,
    // 검 특성 (F14) / 골드 사용처 / 기념비
    traitDef, traitValue, incomeSwords, incomeTraitValue, incomeTrait, traitScaled, percentScaled, tradeGold,
    engravePending, setTrait, traitRekindCost, traitTierUpCost, rerollKindBlock, rerollKind, upgradeTierBlock, upgradeTier,
    monumentIndex, monumentCost, monumentBlock, buyMonument,
    // 아이템
    findAnvil, equippedAnvil, addAnvil, capacityFor, grantItem,
    // 강화
    trayState, effectiveUse, setUse, cleanupUse, bonusWasted, bonusCapNote, attemptEnhance, sureValidLv, keepdownValidLv,
    // 부스터 / 상점 / 파편
    boostActiveAt, boostRemainingMs, canExtendBoost, extendBoost, useBoosterFromInv,
    shopPrice, shopBlock, shopUnlocked, buyShopItem, exchangeBlock, exchangeShards,
  };
});
