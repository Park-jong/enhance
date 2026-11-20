/* 방치 규칙: 수동 사냥, 자동 사냥 catch-up(F10), 오프라인 정산·업그레이드(F1). 순수 로직.
 * 수입 기준 단계는 보관함 최고 단계 검(R.topLv, 사용자 결정).
 */
(function (root, factory) {
  'use strict';
  const SG = root.SG = root.SG || {};
  if (!SG.forge && typeof require === 'function') require('./forge.js');
  SG.idle = factory(SG.C, SG.rules, SG.forge);
  if (typeof module !== 'undefined' && module.exports) module.exports = SG.idle;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, R, F) {
  'use strict';

  const HOUR_MS = 3600 * 1000;
  const fail = reason => ({ ok: false, reason });

  const autoUnlocked = S => R.isUnlocked(S, 'idle');
  // 업그레이드 레벨 n의 효과 값: speed=자동 사냥 간격(ms), gold=골드 배율, offline=오프라인 상한(시간)
  const UP_VALUE = {
    speed: n => C.AUTO_CD_MS - n * C.UP_SPEED_STEP,
    gold: n => 1 + C.UP_GOLD_STEP * n,
    offline: n => C.OFFLINE_CAP_H + n * C.UP_OFFLINE_STEP_H,
  };
  const upgradeValue = (id, n) => UP_VALUE[id](n);
  const autoInterval = S => UP_VALUE.speed(S.idle.up.speed);
  const offlineCapH = S => UP_VALUE.offline(S.idle.up.offline);
  const offlineCapMs = S => offlineCapH(S) * HOUR_MS;
  const goldUpFactor = S => UP_VALUE.gold(S.idle.up.gold);
  const boostFactorAt = (S, t) => (R.boostActiveAt(S, t) ? C.BOOSTER_MULT : 1);

  // ============================================================ 수동 사냥
  /** 수동 사냥 1회 골드: 부스터 중 ×1.5, 약탈자 특성 ×(100+v)/100 (내림). 수확 보너스는 적용하지 않음 */
  const manualHuntGold = (S, now) =>
    Math.floor(R.traitScaled(R.huntReward(R.topLv(S)) * boostFactorAt(S, now), R.incomeTraitValue(S, 'hunt')));

  function manualHunt(S, now, rng) {
    const gold = manualHuntGold(S, now);
    S.gold += gold;
    S.stats.huntGold += gold;
    const ore = F.addOre(S, F.rollOre(S, rng));
    return { ok: true, gold, ore };
  }

  // ============================================================ 자동 사냥
  /** 자동 1회 골드 = round(autoReward(lv) × 수확 보너스 × 부스터 × 일꾼 특성) */
  const autoRunGold = (S, t) =>
    Math.round(R.traitScaled(R.autoReward(R.topLv(S)) * goldUpFactor(S) * boostFactorAt(S, t), R.incomeTraitValue(S, 'work')));

  function setAutoOn(S, on) {
    if (on && !autoUnlocked(S)) return fail('locked');
    S.idle.autoOn = !!on;
    return { ok: true };
  }

  /** 절대시각 기반 catch-up: nextAutoAt이 지난 만큼(최대 AUTO_CATCHUP_MAX회) 지급. 남은 몫은 버린다 */
  function runAutoCatchup(S, now, nextAutoAt, rng) {
    const interval = autoInterval(S);
    const out = { runs: 0, gold: 0, ore: {}, nextAutoAt };
    if (!S.idle.autoOn || !autoUnlocked(S)) return out;
    let next = nextAutoAt;
    while (now >= next && out.runs < C.AUTO_CATCHUP_MAX) {
      const gold = autoRunGold(S, next);
      S.gold += gold;
      S.stats.huntGold += gold;
      out.gold += gold;
      const ore = F.addOre(S, F.rollOre(S, rng));
      Object.keys(ore).forEach(k => { out.ore[k] = (out.ore[k] || 0) + ore[k]; });
      next += interval;
      out.runs++;
    }
    if (now >= next) next = now + interval;
    out.nextAutoAt = next;
    return out;
  }

  // ============================================================ 오프라인 정산
  /**
   * 복귀 정산 (m1-idle §2). gap < OFFLINE_MIN_SEC면 null(catch-up에 맡김, lastSeen 유지).
   * 그 외에는 lastSeen=now로 갱신하고, 자동 사냥이 해금·ON일 때만 보상을 지급한다.
   */
  function settleOffline(S, now) {
    const gap = Math.max(0, now - S.idle.lastSeen);
    if (gap < C.OFFLINE_MIN_SEC * 1000) return null;
    const start = S.idle.lastSeen;
    S.idle.lastSeen = now;
    if (!S.idle.autoOn || !autoUnlocked(S)) return null;

    const capMs = offlineCapMs(S);
    const effGap = Math.min(gap, capMs);
    const runs = Math.floor(effGap / autoInterval(S));
    const overlap = Math.max(0, Math.min(S.idle.boostUntil - start, effGap));
    const boostFactor = effGap > 0 ? 1 + (C.BOOSTER_MULT - 1) * overlap / effGap : 1;
    // 정산 시점의 수입 검 구성으로 일꾼 특성을 적용한다(m2-traits §4)
    const gold = Math.floor(R.traitScaled(runs * R.autoReward(R.topLv(S)) * goldUpFactor(S) * C.OFFLINE_EFF * boostFactor,
      R.incomeTraitValue(S, 'work')));
    const ore = F.addOre(S, F.expectedOre(S, runs, C.OFFLINE_EFF));
    S.gold += gold;
    S.stats.offlineGold += gold;
    return { gapMs: gap, effGapMs: effGap, capped: gap > capMs, capH: offlineCapH(S), runs, gold, ore, boostFactor };
  }

  // ============================================================ 업그레이드
  const upgradeCost = (id, lvl) => Math.round(C.UP_COST_BASE[id] * Math.pow(C.UP_COST_GROWTH, lvl) / C.GOLD_ROUND) * C.GOLD_ROUND;
  const nextUpgradeCost = (S, id) => (S.idle.up[id] >= C.UP_MAX ? null : upgradeCost(id, S.idle.up[id]));

  function upgradeBlock(S, id) {
    if (!R.hasOwn(C.UP_COST_BASE, id)) return 'notFound';
    if (!autoUnlocked(S)) return 'locked';
    const price = nextUpgradeCost(S, id);
    if (price === null) return 'max';
    return S.gold < price ? 'noGold' : null;
  }

  function buyUpgrade(S, id) {
    const block = upgradeBlock(S, id);
    if (block) return fail(block);
    const price = nextUpgradeCost(S, id);
    S.gold -= price;
    S.idle.up[id]++;
    return { ok: true, price, level: S.idle.up[id] };
  }

  const idleActionable = S => C.UPGRADES.some(u => upgradeBlock(S, u.id) === null);

  return {
    autoUnlocked, upgradeValue, autoInterval, offlineCapH, offlineCapMs, goldUpFactor,
    manualHuntGold, manualHunt, autoRunGold, setAutoOn, runAutoCatchup, settleOffline,
    upgradeCost, nextUpgradeCost, upgradeBlock, buyUpgrade, idleActionable,
  };
});
