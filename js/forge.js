/* 대장간 규칙: 광석 생산(F8), 모루 장착·제작·수리(F3/F8). 순수 로직. */
(function (root, factory) {
  'use strict';
  const SG = root.SG = root.SG || {};
  if (!SG.rules && typeof require === 'function') require('./rules.js');
  if (!SG.events && typeof require === 'function') require('./events.js');
  SG.forge = factory(SG.C, SG.rules, SG.events);
  if (typeof module !== 'undefined' && module.exports) module.exports = SG.forge;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, R, E) {
  'use strict';

  const fail = reason => ({ ok: false, reason });

  // ============================================================ 광석
  const oreUnlocked = (S, k) => S.best >= C.ORE_UNLOCK_LV[k];
  const unlockedOres = S => C.ORES.filter(k => oreUnlocked(S, k));

  /** 상한을 지키며 광석을 더하고 실제 증가량을 돌려준다 */
  function addOre(S, gains) {
    const added = {};
    Object.keys(gains).forEach(k => {
      const before = S.ore[k];
      S.ore[k] = Math.min(C.ORE_MAX, before + gains[k]);
      added[k] = S.ore[k] - before;
    });
    return added;
  }

  /** 특성 없는 사냥 1회분: 정수부 + 소수부 확률 지급 (m1-anvil-ore §4) */
  function rollPlainOre(rate, rng) {
    const whole = Math.floor(rate);
    return whole + (rng() < rate - whole ? 1 : 0);
  }
  /** 광부 특성(v>0): 정수 백분율 rate100 = rate × (100+v)로 정수부 + 소수부 확률 (m2-traits §3.1-4). rng 횟수는 같다 */
  function rollMinerOre(rate, v, rng) {
    const rate100 = rate * (C.PERCENT + v);
    const whole = Math.floor(rate100 / C.PERCENT);
    return whole + (Math.floor(rng() * C.PERCENT) < rate100 % C.PERCENT ? 1 : 0);
  }

  /**
   * 광맥 발견 이벤트(ev>0): 1/10000 단위 정수 rate1e4 = rate × (100+v) × (100+ev)로 정수부 + 소수부 확률 (m2-events §5.3-3).
   * ORE_PER_HUNT는 0.5 단위라 EVENT_ORE_SCALE을 곱해 정수로 만든 뒤 나눈다. rng 횟수는 같다
   */
  function rollEventOre(rate, v, ev, rng) {
    const rate1e4 = (rate * C.EVENT_ORE_SCALE) * (C.PERCENT + v) * (C.PERCENT + ev) / C.EVENT_ORE_SCALE;
    const whole = Math.floor(rate1e4 / C.PERCENT_SQ);
    return whole + (Math.floor(rng() * C.PERCENT_SQ) < rate1e4 % C.PERCENT_SQ ? 1 : 0);
  }

  /**
   * 사냥 1회분 광석(해금된 광석마다 rng 1회). 광부 특성은 수입 검 중 최댓값.
   * 광맥 발견이 꺼져 있거나 opts.noEvent(벽시계 따라잡기 실행)면 기존 경로 그대로
   */
  function rollOre(S, rng, opts) {
    const gains = {};
    const v = R.incomeTraitValue(S, 'ore');
    const ev = E.eventValue(S, 'ore', opts);
    unlockedOres(S).forEach(k => {
      const rate = C.ORE_PER_HUNT[k];
      if (ev > 0) gains[k] = rollEventOre(rate, v, ev, rng);
      else gains[k] = v > 0 ? rollMinerOre(rate, v, rng) : rollPlainOre(rate, rng);
    });
    return gains;
  }

  /** 사냥 1회 기대 광석(표시용) = rollOre 평균: 광부 특성이면 rate100 / 100, 아니면 ORE_PER_HUNT 그대로 */
  const orePerHunt = (S, k) => R.traitScaled(C.ORE_PER_HUNT[k], R.incomeTraitValue(S, 'ore'));

  /** n회분 기대값 광석(확률 굴림 없음) × 효율 × 광부 특성, 내림 — 오프라인 정산용 */
  function expectedOre(S, runs, eff) {
    const gains = {};
    const v = R.incomeTraitValue(S, 'ore');
    unlockedOres(S).forEach(k => { gains[k] = Math.floor(R.traitScaled(runs * C.ORE_PER_HUNT[k] * eff, v)); });
    return gains;
  }

  // ============================================================ 비용
  /** 비용 { ore:{k:n}, gold } 중 모자란 항목 { ore:{k:부족량}, gold:부족량 } (없으면 null) */
  function shortfall(S, price) {
    const ore = {};
    let lacking = false;
    Object.keys(price.ore).forEach(k => {
      const miss = price.ore[k] - S.ore[k];
      if (miss > 0) { ore[k] = miss; lacking = true; }
    });
    const gold = Math.max(0, (price.gold || 0) - S.gold);
    if (gold > 0) lacking = true;
    return lacking ? { ore, gold } : null;
  }

  function pay(S, price) {
    Object.keys(price.ore).forEach(k => { S.ore[k] -= price.ore[k]; });
    S.gold -= price.gold || 0;
  }

  // ============================================================ 모루
  function equipAnvil(S, id) {
    if (!R.isUnlocked(S, 'forge')) return fail('locked');
    if (!R.findAnvil(S, id)) return fail('notFound');
    S.anvilEq = id;
    return { ok: true };
  }

  const GRADES = Object.keys(C.ANVIL_CRAFT).map(Number);
  const craftCost = g => C.ANVIL_CRAFT[g];

  function craftBlock(S, g) {
    if (!craftCost(g)) return 'notFound';
    if (!R.isUnlocked(S, 'forge')) return 'locked';
    if (S.anvils.length >= C.ANVIL_OWN_MAX) return 'full';
    return shortfall(S, craftCost(g)) ? 'noResource' : null;
  }

  function craftAnvil(S, g) {
    const block = craftBlock(S, g);
    if (block) return fail(block);
    pay(S, craftCost(g));
    S.stats.crafted++;
    return { ok: true, anvil: R.addAnvil(S, g) };
  }

  /** 복구할 내구도에 비례한 광석 비용(광석별 올림, 최소 1). 손상 없으면 null */
  function repairCost(anvil) {
    const missing = C.ANVIL_DURA[anvil.g] - anvil.dura;
    if (missing <= 0) return null;
    const full = C.ANVIL_REPAIR[anvil.g];
    const ore = {};
    Object.keys(full).forEach(k => {
      ore[k] = Math.max(1, Math.ceil(full[k] * missing / C.ANVIL_DURA[anvil.g]));
    });
    return { ore, gold: 0 };
  }

  function repairBlock(S, id) {
    const anvil = R.findAnvil(S, id);
    if (!anvil) return 'notFound';
    if (!R.isUnlocked(S, 'forge')) return 'locked';
    const price = repairCost(anvil);
    if (!price) return 'intact';
    return shortfall(S, price) ? 'noResource' : null;
  }

  function repairAnvil(S, id) {
    const block = repairBlock(S, id);
    if (block) return fail(block);
    const anvil = R.findAnvil(S, id);
    const price = repairCost(anvil);
    pay(S, price);
    anvil.dura = C.ANVIL_DURA[anvil.g];
    return { ok: true, cost: price };
  }

  /** 대장간 탭 알림 점: 제작 또는 수리 가능한 것이 있는가 */
  const forgeActionable = S =>
    GRADES.some(g => craftBlock(S, g) === null) || S.anvils.some(a => repairBlock(S, a.id) === null);

  return {
    oreUnlocked, unlockedOres, addOre, rollOre, orePerHunt, expectedOre, shortfall,
    equipAnvil, GRADES, craftCost, craftBlock, craftAnvil, repairCost, repairBlock, repairAnvil, forgeActionable,
  };
});
