/* 대장간 규칙: 광석 생산(F8), 모루 장착·제작·수리(F3/F8). 순수 로직. */
(function (root, factory) {
  'use strict';
  const SG = root.SG = root.SG || {};
  if (!SG.rules && typeof require === 'function') require('./rules.js');
  SG.forge = factory(SG.C, SG.rules);
  if (typeof module !== 'undefined' && module.exports) module.exports = SG.forge;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, R) {
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

  /** 사냥 1회분 광석: 정수부 + 소수부 확률 지급 (m1-anvil-ore §4) */
  function rollOre(S, rng) {
    const gains = {};
    unlockedOres(S).forEach(k => {
      const rate = C.ORE_PER_HUNT[k];
      const whole = Math.floor(rate);
      gains[k] = whole + (rng() < rate - whole ? 1 : 0);
    });
    return gains;
  }

  /** n회분 기대값 광석(확률 굴림 없음) × 효율, 내림 — 오프라인 정산용 */
  function expectedOre(S, runs, eff) {
    const gains = {};
    unlockedOres(S).forEach(k => { gains[k] = Math.floor(runs * C.ORE_PER_HUNT[k] * eff); });
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
    oreUnlocked, unlockedOres, addOre, rollOre, expectedOre, shortfall,
    equipAnvil, GRADES, craftCost, craftBlock, craftAnvil, repairCost, repairBlock, repairAnvil, forgeActionable,
  };
});
