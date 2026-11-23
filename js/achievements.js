/* 업적·칭호·일일 과제 규칙 (F12, docs/design/m2-achievements.md). 순수 로직.
 * 시계(now)·시간대(env.tzOffsetMin)·rng·저장소 재확인(ctx.storedClaimed)은 호출자가 주입한다.
 * F4 납품 의뢰(quests.js)와 이름·코드를 나눈다(§2). 확률·게이지·숙련은 읽지도 쓰지도 않는다(§1.1).
 * 브라우저: window.SG.ach / node: module.exports
 */
(function (root, factory) {
  'use strict';
  const SG = root.SG = root.SG || {};
  if (!SG.forge && typeof require === 'function') require('./forge.js');
  SG.ach = factory(SG.C, SG.rules, SG.forge);
  if (typeof module !== 'undefined' && module.exports) module.exports = SG.ach;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, R, F) {
  'use strict';

  const MIN_MS = 60 * 1000;
  const HOUR_MS = 60 * MIN_MS;
  const KIND_ACH = 'ach';
  const KIND_DAILY = 'daily';
  const BONUS = 'bonus';
  const STALE = 'stale';
  // 일일 수령 키: 과제 슬롯 0..DAILY_TASKS-1, 그다음 보너스 (claimAll 순서)
  const DAILY_KEYS = Array.from({ length: C.DAILY_TASKS }, (_, i) => i).concat(BONUS);

  const fail = reason => ({ ok: false, reason });
  const noSet = reason => ({ created: false, reason });
  const isActive = ctx => !!ctx && ctx.active === true;

  // ============================================================ 지표 (§4)
  const monumentCount = S => S.monuments.filter(Boolean).length;
  /** 현재 보관함 검들의 서로 다른 특성 종류 수 */
  const traitKindCount = S => new Set(S.swords.filter(s => s.trait).map(s => s.trait.k)).size;
  const hasPerfectTrait = S => S.swords.some(s => s.trait && s.trait.t === C.TRAIT_TIER_MAX);

  const DERIVED = { monumentCount, traitKindCount, hasPerfectTrait: S => (hasPerfectTrait(S) ? 1 : 0) };
  const METRIC_SOURCE = {
    stat: (S, metric) => S.stats[metric],
    best: S => S.best,
    derived: (S, metric) => DERIVED[metric](S),
  };
  const achMetric = (S, metric) => METRIC_SOURCE[C.ACH_METRICS[metric]](S, metric);

  // ============================================================ 보상 (§7)
  const goldPct = S => (S.best < C.ACH_EARLY_BEST ? C.ACH_EARLY_PCT : C.PERCENT);
  // 순서 고정: 정수 k·H·pct를 모두 곱한 뒤 /100 내림, 마지막에 한 번만 반올림(중간 소수 없음)
  const rewardGold = (S, k) => R.roundTo(Math.floor(k * R.huntReward(S.best) * goldPct(S) / C.PERCENT), C.ACH_ROUND);
  const shardReward = (S, m) => m * R.shardGain(Math.max(C.QUEST_SHARD_MIN_LV, S.best));
  const dailyOreKind = S => (S.best >= C.ORE_UNLOCK_LV.silver ? 'silver' : 'iron');

  /** 지급할 보상 { gold, shards, ore }(지금 best 기준, 상태 불변). 광석은 ORE_MAX에 막힌 실제 지급량(addOre를 복사본에 적용) */
  function rewardOf(S, k, m, ore) {
    return { gold: rewardGold(S, k), shards: shardReward(S, m), ore: ore ? F.addOre({ ore: Object.assign({}, S.ore) }, ore) : {} };
  }

  /** 골드·파편·광석 지급. 골드는 stats.rewardGold에만 기록(earned·huntGold·shardsGained 불변, §3) */
  function grantReward(S, k, m, ore) {
    const reward = rewardOf(S, k, m, null);
    S.gold += reward.gold;
    S.stats.rewardGold += reward.gold;
    S.shards += reward.shards;
    return Object.assign(reward, { ore: ore ? F.addOre(S, ore) : {} });
  }

  /** 검사 5(§10.1): 다른 탭이 이미 저장한 수령인지 저장소를 다시 본다. 주입이 없으면 확인을 생략한다 */
  const storedCheck = (ctx, kind, key, day) =>
    (typeof ctx.storedClaimed === 'function' ? ctx.storedClaimed(kind, key, day) : false);

  // ============================================================ 업적 (§5·§6)
  const achState = (S, id) => (R.hasOwn(S.achievements, id) ? S.achievements[id] : 0);
  const achReached = (S, a) => achMetric(S, a.metric) >= a.need;

  /** 미달성 업적이 조건을 만족하면 달성으로 올린다(래치: 이후 조건이 거짓이 돼도 유지). 새로 올렸으면 true */
  function latch(S, a) {
    if (achState(S, a.id) !== 0 || !achReached(S, a)) return false;
    S.achievements[a.id] = C.ACH_REACHED;
    return true;
  }

  /** 미달성 업적을 모두 판정해 새로 달성한 id 목록(표 순서)을 돌려준다. rng·골드 불변 */
  function syncAchievements(S) {
    const fresh = [];
    C.ACHIEVEMENTS.forEach(a => { if (latch(S, a)) fresh.push(a.id); });
    return fresh;
  }

  /** 실패 사유 순서: inactiveTab → invalid → claimed(메모리) → claimed(저장) → notReached */
  function claimAchievement(S, id, ctx) {
    if (!isActive(ctx)) return fail('inactiveTab');
    if (typeof id !== 'string' || !R.hasOwn(C.ACH_BY_ID, id)) return fail('invalid');
    if (achState(S, id) === C.ACH_CLAIMED) return fail('claimed');
    if (storedCheck(ctx, KIND_ACH, id) === true) {
      S.achievements[id] = C.ACH_CLAIMED;
      return fail('claimed');
    }
    const a = C.ACH_BY_ID[id];
    latch(S, a);
    if (achState(S, id) === 0) return fail('notReached');
    S.achievements[id] = C.ACH_CLAIMED;   // 수령 상태 2가 곧 칭호 해금
    return Object.assign({ ok: true }, grantReward(S, a.k, a.shard, a.ore), { title: a.title });
  }

  /** 업적 진행 = min(지표, 목표). 래치된 업적은 지표가 줄었을 수 있으므로 화면은 상태(achState)로 먼저 나눈다 */
  const achProgress = (S, id) => Math.min(C.ACH_BY_ID[id].need, achMetric(S, C.ACH_BY_ID[id].metric));
  /** 수령하면 받을 보상(지금 best 기준, claimAchievement와 같은 계산) + 칭호 */
  function achRewardPreview(S, id) {
    const a = C.ACH_BY_ID[id];
    return Object.assign(rewardOf(S, a.k, a.shard, a.ore), { title: a.title });
  }

  /** 칭호 선택: 없음('') 또는 수령 완료한 업적 id. 장식이라 탭 잠금 검사는 하지 않는다(§10.2) */
  function setTitle(S, id) {
    const valid = id === C.TITLE_NONE || (typeof id === 'string' && R.hasOwn(C.ACH_BY_ID, id) && achState(S, id) === C.ACH_CLAIMED);
    if (!valid) return fail('invalid');
    S.title = id;
    return { ok: true };
  }

  // ============================================================ 일일 과제: 진행 (§8.1)
  const hasDailySet = S => S.daily.tasks.length === C.DAILY_TASKS;
  const taskGain = (S, task) => S.stats[C.DAILY_POOL_BY_ID[task.e].metric] - task.base;

  /** 슬롯 진행도 = clamp(지표 − base, 0, goal). 세트가 없으면 0 */
  function dailyProgress(S, slot) {
    const task = S.daily.tasks[slot];
    return task ? Math.min(task.goal, Math.max(0, taskGain(S, task))) : 0;
  }
  /** 슬롯 과제 달성 여부(수령 여부와 무관). stats.dailyDone(수령 횟수)과 다른 것 */
  function dailyDone(S, slot) {
    const task = S.daily.tasks[slot];
    return !!task && taskGain(S, task) >= task.goal;
  }
  const dailyAllDone = S => hasDailySet(S) && S.daily.tasks.every((_, slot) => dailyDone(S, slot));

  // ============================================================ 일일 과제: 날짜·생성 (§8.4·§9)
  /** 지역 DAILY_RESET_HOUR 기준 날 번호. offsetMin은 Date.getTimezoneOffset 규약(UTC 서쪽이 양수, KST = -540) */
  const dayKey = (nowMs, offsetMin) =>
    Math.floor((nowMs - offsetMin * MIN_MS - C.DAILY_RESET_HOUR * HOUR_MS) / C.DAY_MS);
  /** 다음 날 경계(지역 DAILY_RESET_HOUR)까지 남은 ms, 범위 (0, DAY_MS]. 시계·오프셋이 유한하지 않으면 0 */
  function msToNextDay(nowMs, offsetMin) {
    if (!Number.isFinite(nowMs) || !Number.isFinite(offsetMin)) return 0;
    const sinceStart = (nowMs - offsetMin * MIN_MS - C.DAILY_RESET_HOUR * HOUR_MS) % C.DAY_MS;
    return C.DAY_MS - (sinceStart < 0 ? sinceStart + C.DAY_MS : sinceStart);
  }
  /** 목표 밴드: DAILY_BANDS 중 best 이하인 개수 − 1 (미해금이면 -1) */
  const bandOf = best => C.DAILY_BANDS.filter(b => b <= best).length - 1;

  const DAILY_GATES = { anvilRoom: S => S.anvils.length < C.ANVIL_OWN_MAX };
  // 이름이 틀린 게이트는 생성 때 TypeError가 되므로 로드 시점에 막는다(풀 표 자체 검사는 constants.js)
  if (C.DAILY_POOL.some(e => e.gate !== undefined && !R.hasOwn(DAILY_GATES, e.gate))) {
    throw new Error('DAILY_POOL gate is not in DAILY_GATES');
  }
  const gateOpen = (S, entry) => !entry.gate || DAILY_GATES[entry.gate](S);
  /** 슬롯 후보: 풀 정의 순서 유지, 게이트 통과, 앞 슬롯이 쓴 지표 제외 */
  const dailyCandidates = (S, slot, usedMetrics) =>
    C.DAILY_POOL.filter(e => e.slot === slot && gateOpen(S, e) && !usedMetrics.includes(e.metric));
  const pickIndex = (r, n) => Math.min(n - 1, Math.floor(r * n));
  const taskGoal = (S, entry, band) => (entry.goals ? entry.goals[band] : entry.mult[band] * R.huntReward(S.best));

  /** 새 세트로 S.daily를 통째로 교체한다. rng는 슬롯마다 (항목, 아이템 유무, 아이템 종류) 순으로 정확히 3회씩 */
  function generateDaily(S, day, rng) {
    const band = bandOf(S.best);
    const usedMetrics = [];
    const tasks = [];
    for (let slot = 0; slot < C.DAILY_TASKS; slot++) {
      const cands = dailyCandidates(S, slot, usedMetrics);
      const entry = cands[pickIndex(rng(), cands.length)];
      const hasItem = Math.floor(rng() * C.PERCENT) < C.DAILY_ITEM_CHANCE_PCT;
      const kind = C.DAILY_ITEM_KINDS[pickIndex(rng(), C.DAILY_ITEM_KINDS.length)];   // 쓰이지 않아도 항상 소비
      tasks.push({ e: entry.id, goal: taskGoal(S, entry, band), base: S.stats[entry.metric], item: hasItem ? kind : null, claimed: 0 });
      usedMetrics.push(entry.metric);
    }
    S.daily = { maxDay: day, tasks, bonus: 0 };
    return S.daily;
  }

  /**
   * 하루 세트 갱신(§9.2). maxDay는 단조: 시계 역행은 아무것도 바꾸지 않고, 앞으로 얼마나 뛰어도 세트는 1개.
   * env.tzOffsetMin(nowMs): 그 시각의 시간대 오프셋(분). 새 세트를 만들 때만 rng를 쓴다.
   * 날 번호가 로드 상한(DAILY_MAXDAY_CAP)을 넘으면 badClock: 저장하면 상한으로 잘려 다시 로드할 때마다 새 세트가 생기기 때문(V8)
   */
  function refreshDaily(S, now, rng, env) {
    if (S.best < C.DAILY_UNLOCK_BEST) return noSet('locked');
    if (!Number.isFinite(now)) return noSet('badClock');
    const offset = env.tzOffsetMin(now);
    if (!Number.isFinite(offset)) return noSet('badClock');
    const day = dayKey(now, offset);
    if (day > C.DAILY_MAXDAY_CAP) return noSet('badClock');
    if (day < S.daily.maxDay) return noSet('rollback');
    if (day === S.daily.maxDay && hasDailySet(S)) return noSet('same');
    generateDaily(S, day, rng);
    return { created: true, day };
  }

  // ============================================================ 일일 과제: 수령 (§8.5·§10)
  const validDailyKey = which => which === BONUS || (Number.isInteger(which) && which >= 0 && which < C.DAILY_TASKS);
  const dailyClaimedFlag = (S, which) => (which === BONUS ? S.daily.bonus : S.daily.tasks[which].claimed) === 1;
  function markDailyClaimed(S, which) {
    if (which === BONUS) S.daily.bonus = 1;
    else S.daily.tasks[which].claimed = 1;
  }
  const dailyReady = (S, which) => (which === BONUS ? dailyAllDone(S) : dailyDone(S, which));

  /** 보상 정의 { k, m, ore }: 과제는 슬롯 배수 + 생성 때 정한 아이템, 보너스는 고정. 광석 종류는 수령 시점 best */
  function dailyRewardSpec(S, which) {
    if (which === BONUS) return { k: C.DAILY_ALL_K, m: C.DAILY_ALL_SHARD_MULT, ore: null };
    const item = S.daily.tasks[which].item;
    return {
      k: C.DAILY_TASK_K[which],
      m: item === 'shard' ? C.DAILY_ITEM_SHARD_MULT : 0,
      ore: item === 'ore' ? { [dailyOreKind(S)]: C.DAILY_ORE_N } : null,
    };
  }

  /** 수령하면 받을 보상(지금 best 기준, claimDaily와 같은 계산). 세트가 없거나 잘못된 키면 null */
  function dailyRewardPreview(S, which) {
    if (!hasDailySet(S) || !validDailyKey(which)) return null;
    const spec = dailyRewardSpec(S, which);
    return rewardOf(S, spec.k, spec.m, spec.ore);
  }
  /** 화면 상태 'claimed' | 'ready'(달성·미수령) | 'progress'. 수령 실패 사유가 아니라 플래그·진행으로 판단한다(V7). 세트가 없으면 null */
  function dailyStatus(S, which) {
    if (!hasDailySet(S) || !validDailyKey(which)) return null;
    if (dailyClaimedFlag(S, which)) return 'claimed';
    return dailyReady(S, which) ? 'ready' : 'progress';
  }

  /** which ∈ 0..2 | 'bonus'. 실패 사유 순서: inactiveTab → invalid → noDaily → claimed → stale → claimed(저장) → notDone */
  function claimDaily(S, which, ctx) {
    if (!isActive(ctx)) return fail('inactiveTab');
    if (!validDailyKey(which)) return fail('invalid');
    if (!hasDailySet(S)) return fail('noDaily');
    if (dailyClaimedFlag(S, which)) return fail('claimed');
    // 저장된 세트가 다른 날이면(다른 탭이 새 날로 교체) 슬롯이 다른 과제를 가리킬 수 있으므로 메모리도 건드리지 않는다
    const stored = storedCheck(ctx, KIND_DAILY, which, S.daily.maxDay);
    if (stored === STALE) return fail(STALE);
    if (stored === true) {
      markDailyClaimed(S, which);
      return fail('claimed');
    }
    if (!dailyReady(S, which)) return fail('notDone');
    const spec = dailyRewardSpec(S, which);
    markDailyClaimed(S, which);
    const reward = grantReward(S, spec.k, spec.m, spec.ore);
    S.stats[which === BONUS ? 'dailyAll' : 'dailyDone']++;
    return Object.assign({ ok: true }, reward);
  }

  // ============================================================ 모아 받기·알림 (§10.2·§12)
  const dailyClaimable = (S, which) => hasDailySet(S) && !dailyClaimedFlag(S, which) && dailyReady(S, which);
  const reachedUnclaimed = S => C.ACHIEVEMENTS.filter(a => achState(S, a.id) === C.ACH_REACHED);

  /**
   * 수령 가능한 것을 업적 표 순서 → 일일 슬롯 → 보너스 순으로 각각 받는다. claimed: [{kind, key}].
   * 일일 항목이 하나라도 stale이면 stale: true를 더한다(호출자는 단일 stale 수령처럼 처리하고 이 세트를 저장하지 않는다)
   */
  function claimAll(S, ctx) {
    if (!isActive(ctx)) return fail('inactiveTab');
    const out = { ok: true, claimed: [], gold: 0, shards: 0, ore: {} };
    const collect = (kind, key, r) => {
      if (r.reason === STALE) out.stale = true;
      if (!r.ok) return;
      out.claimed.push({ kind, key });
      out.gold += r.gold;
      out.shards += r.shards;
      Object.keys(r.ore).forEach(k => { out.ore[k] = (out.ore[k] || 0) + r.ore[k]; });
    };
    syncAchievements(S);
    reachedUnclaimed(S).forEach(a => collect(KIND_ACH, a.id, claimAchievement(S, a.id, ctx)));
    DAILY_KEYS.filter(which => dailyClaimable(S, which)).forEach(which => collect(KIND_DAILY, which, claimDaily(S, which, ctx)));
    return out;
  }

  const claimableCount = S => reachedUnclaimed(S).length + DAILY_KEYS.filter(which => dailyClaimable(S, which)).length;
  const claimableAny = S => claimableCount(S) > 0;

  /**
   * ctx.storedClaimed의 순수 판정: stored = 저장소의 정규화된 저장(없으면 null → false).
   * 업적은 true/false, 일일은 저장된 maxDay가 day와 다르면 'stale', 같으면 그 항목의 수령 플래그
   */
  function storedClaimedIn(stored, kind, key, day) {
    if (!stored) return false;
    if (kind === KIND_ACH) return achState(stored, key) === C.ACH_CLAIMED;
    if (stored.daily.maxDay !== day) return STALE;
    if (key === BONUS) return stored.daily.bonus === 1;
    const task = stored.daily.tasks[key];
    return !!task && task.claimed === 1;
  }

  return {
    KIND_ACH, KIND_DAILY, BONUS, DAILY_KEYS,
    monumentCount, traitKindCount, hasPerfectTrait, achMetric, rewardGold, shardReward,
    achState, achProgress, achRewardPreview, syncAchievements, claimAchievement, setTitle,
    dayKey, msToNextDay, bandOf, dailyCandidates, generateDaily, refreshDaily,
    hasDailySet, dailyProgress, dailyDone, dailyAllDone, dailyStatus, dailyRewardPreview,
    claimDaily, claimAll, claimableCount, claimableAny, storedClaimedIn,
  };
});
