/* 납품 의뢰 규칙 (F4). 순수 로직. 요구 조건은 "정확히 그 단계" (사용자 결정). */
(function (root, factory) {
  'use strict';
  const SG = root.SG = root.SG || {};
  if (!SG.rules && typeof require === 'function') require('./rules.js');
  SG.quests = factory(SG.C, SG.rules);
  if (typeof module !== 'undefined' && module.exports) module.exports = SG.quests;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, R) {
  'use strict';

  const COOLDOWN_MS = C.QUEST_COOLDOWN_SEC * 1000;
  const fail = reason => ({ ok: false, reason });

  const unlocked = S => R.isUnlocked(S, 'quests');

  // 난이도별 기본 요구 단계 (m1-quest §2)
  const BASE_LV = {
    easy: best => Math.floor(best / C.QUEST_LV_EASY_DIV),
    normal: best => best - C.QUEST_LV_NORMAL_OFFSET,
    hard: best => best - C.QUEST_LV_HARD_OFFSET,
  };
  // 보상 풀의 문자열 수량식
  const QUEST_QTY = {
    shardGain: lv => R.shardGain(Math.max(C.QUEST_SHARD_MIN_LV, lv)),
  };

  const questBaseLv = (tier, best) => Math.min(C.MAX, Math.max(C.QUEST_LV_MIN[tier], BASE_LV[tier](best)));

  /** 다른 슬롯과 같은 단계면 +1씩 올려 겹치지 않게 한다(최대 MAX) */
  function pickLv(tier, best, takenLvs) {
    let lv = questBaseLv(tier, best);
    while (takenLvs.includes(lv) && lv < C.MAX) lv++;
    return lv;
  }

  const questGold = (tier, lv) => Math.round(R.sell(lv) * C.QUEST_GOLD_MULT[tier] / C.GOLD_ROUND) * C.GOLD_ROUND;

  const poolEntryReward = (entry, lv) => ({ id: entry.id, n: typeof entry.n === 'number' ? entry.n : QUEST_QTY[entry.n](lv) });

  function rollItem(tier, lv, rng) {
    if (rng() >= C.QUEST_ITEM_CHANCE[tier]) return null;
    const pool = C.QUEST_ITEM_POOL[tier];
    return poolEntryReward(pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))], lv);
  }

  /** 이 난이도 보상 풀에 있는 품목이면 단계에 맞는 보상 { id, n }, 아니면 null (저장 데이터 검증용) */
  function poolReward(tier, id, lv) {
    if (!R.hasOwn(C.QUEST_ITEM_POOL, tier)) return null;
    const entry = C.QUEST_ITEM_POOL[tier].find(e => e.id === id);
    return entry ? poolEntryReward(entry, lv) : null;
  }

  const takenLvs = (S, exceptSlot) =>
    S.quests.list.filter((q, i) => q && i !== exceptSlot).map(q => q.lv);

  function makeQuest(S, slot, rng) {
    const tier = C.QUEST_TIERS[slot];
    const lv = pickLv(tier, S.best, takenLvs(S, slot));
    return { id: S.quests.nextId++, tier, lv, gold: questGold(tier, lv), item: rollItem(tier, lv, rng) };
  }

  /** 시계 역행 보정 후, 빈 슬롯 중 대기 시간이 끝난 곳에 의뢰 생성. 생성된 슬롯 목록 반환 */
  function refreshQuests(S, now, rng) {
    if (!unlocked(S)) return [];
    const created = [];
    for (let i = 0; i < C.QUEST_SLOTS; i++) {
      if (S.quests.readyAt[i] - now > COOLDOWN_MS) S.quests.readyAt[i] = now + COOLDOWN_MS;
      if (S.quests.list[i] || now < S.quests.readyAt[i]) continue;
      S.quests.list[i] = makeQuest(S, i, rng);
      created.push(i);
    }
    return created;
  }

  const rerollCost = S => Math.max(C.QUEST_REROLL_MIN, C.QUEST_REROLL_COST_MULT * R.cost(S.best));

  function rerollBlock(S, slot) {
    if (!unlocked(S)) return 'locked';
    if (!S.quests.list[slot]) return 'waiting';
    return S.gold < rerollCost(S) ? 'noGold' : null;
  }

  function rerollQuest(S, slot, rng) {
    const block = rerollBlock(S, slot);
    if (block) return fail(block);
    const price = rerollCost(S);
    S.gold -= price;
    S.quests.list[slot] = makeQuest(S, slot, rng);
    return { ok: true, price, quest: S.quests.list[slot] };
  }

  /** 납품에 쓸 검: 비활성 우선, 그다음 id 작은 순 */
  function candidate(S, quest) {
    const matches = S.swords.filter(s => s.lv === quest.lv)
      .sort((a, b) => (a.id === S.active) - (b.id === S.active) || a.id - b.id);
    return matches[0] || null;
  }

  const deliverableSlots = S =>
    unlocked(S) ? S.quests.list.map((q, i) => (q && candidate(S, q) ? i : -1)).filter(i => i >= 0) : [];

  /** 이 검으로 납품 가능한 첫 슬롯 (없으면 -1) */
  const slotForSword = (S, sword) =>
    unlocked(S) ? S.quests.list.findIndex(q => q && q.lv === sword.lv) : -1;

  /** 보상 품목 지급. 상한을 넘는 몫은 SHARD_COST 기준 파편으로 대체 */
  function grantReward(S, item) {
    if (!item) return null;
    const granted = R.grantItem(S, item.id, item.n);
    const rest = item.n - granted;
    const costKey = R.hasOwn(C.QUEST_FALLBACK_SHARD_ITEM, item.id) ? C.QUEST_FALLBACK_SHARD_ITEM[item.id] : item.id;
    const unitShards = R.hasOwn(C.SHARD_COST, costKey) ? C.SHARD_COST[costKey] : 0;
    const fallbackShards = rest > 0 ? rest * unitShards : 0;
    S.shards += fallbackShards;
    return { id: item.id, granted, fallbackShards };
  }

  /**
   * 납품. opts.swordId로 특정 검 지정 가능(정확히 같은 단계여야 함).
   * 고른 검이 활성 검이면 opts.confirmActive가 있어야 진행(아니면 needConfirm).
   */
  function deliver(S, slot, now, opts) {
    const o = opts || {};
    if (!unlocked(S)) return fail('locked');
    const quest = S.quests.list[slot];
    if (!quest) return fail('noQuest');
    const sword = o.swordId != null ? R.findSword(S, o.swordId) : candidate(S, quest);
    if (!sword || sword.lv !== quest.lv) return fail('noSword');
    if (sword.id === S.active && !o.confirmActive) return fail('needConfirm');

    const pay = R.payWithSeal(S, quest.gold);
    S.gold += pay.gold;
    const reward = grantReward(S, quest.item);
    S.stats.delivered++;
    const removed = R.removeSword(S, sword.id);
    S.quests.list[slot] = null;
    S.quests.readyAt[slot] = now + COOLDOWN_MS;
    return { ok: true, quest, swordId: sword.id, gold: pay.gold, sealed: pay.sealed, reward, freeSword: removed.freeSword };
  }

  return {
    unlocked, questBaseLv, pickLv, questGold, poolReward, makeQuest, refreshQuests, rerollCost, rerollBlock, rerollQuest,
    candidate, deliverableSlots, slotForSword, grantReward, deliver, COOLDOWN_MS,
  };
});
