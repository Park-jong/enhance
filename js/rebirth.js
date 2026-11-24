/* 환생·명성 상점 규칙 (F11, docs/design/m2-rebirth.md §3·§4). 순수 로직: 시간은 now(ms)로 받고 난수는 쓰지 않는다.
 * 새 상태는 defaultState(now)에서 만들므로 save.js 다음에 로드한다. 명성 효과 조회(fameValue·earlyIncomePct)는
 * rules.js에 있다(isUnlocked·idle.js 수입 식이 이 모듈보다 먼저 로드되므로). 확률 함수는 S.rebirth를 읽지 않는다(§9).
 */
(function (root, factory) {
  'use strict';
  const SG = root.SG = root.SG || {};
  if (!SG.save && typeof require === 'function') require('./save.js');
  SG.rebirth = factory(SG.C, SG.rules, SG.save);
  if (typeof module !== 'undefined' && module.exports) module.exports = SG.rebirth;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, R, SV) {
  'use strict';

  const fail = reason => ({ ok: false, reason });
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clone = v => JSON.parse(JSON.stringify(v));

  const REBIRTH_FEE = R.roundTo(C.REBIRTH_FEE_MULT * R.huntReward(C.MAX), C.REBIRTH_FEE_ROUND);
  // §8 표의 "유지" 필드(깊은 복사). 여기와 아래 carry에 없는 최상위 필드는 defaultState 값으로 초기화된다
  const KEPT_FIELDS = ['found', 'settings', 'stats', 'monuments', 'achievements', 'title', 'daily'];

  const rebirthFee = () => REBIRTH_FEE;
  const famePct = (S, track) => R.fameValue(S, track);
  const startGoldBonus = S => R.fameValue(S, 'startGold');
  const startSlots = S => C.SLOT_START + R.fameValue(S, 'slots');
  /** 제물: 보관함 앞쪽부터 첫 +MAX 검, 없으면 null */
  const offeringSword = S => S.swords.find(s => s.lv === C.MAX) || null;

  /** 기록 탭 환생 섹션 표시 조건(§7): 최고 +MAX 도달 또는 한 번이라도 환생(환생 직후 best=0이어도 상점이 남게) */
  const rebirthUnlocked = S => S.best >= C.MAX || S.rebirth.count >= 1;

  /**
   * §3.1: invalid → notReached → noGold 순서로 검사. 입력은 정규화된 상태여야 한다(main.js는 정규화 복사본에 부른다).
   * 숫자 필드가 유한수가 아닌 비정규화 입력은 NaN 상태를 만들지 않도록 invalid로 거른다
   */
  function canRebirth(S) {
    if (!isObj(S) || !Array.isArray(S.swords) || !isObj(S.rebirth)) return fail('invalid');
    if (![S.gold, S.rebirth.count, S.rebirth.fame].every(Number.isFinite)) return fail('invalid');
    if (!offeringSword(S)) return fail('notReached');
    if (S.gold < REBIRTH_FEE) return fail('noGold');
    return { ok: true };
  }

  const keptMastery = S => S.mastery.map(n => Math.min(n, C.MASTERY_KEEP_REC));

  /** 확인 창용 읽기 전용 미리보기(§3.2). 상태를 바꾸지 않는다 */
  function rebirthPreview(S) {
    const check = canRebirth(S);
    if (check.reason === 'invalid') return check;
    const offering = offeringSword(S);
    return Object.assign({}, check, {
      fee: REBIRTH_FEE,
      gold: S.gold,
      goldLost: Math.max(0, S.gold - REBIRTH_FEE),
      fameGain: C.FAME_PER_REBIRTH,
      consumedSwordId: offering ? offering.id : null,
      startGold: C.START_GOLD + startGoldBonus(S),
      slots: startSlots(S),
      incomePct: famePct(S, 'income'),
      autoStart: R.fameValue(S, 'autoStart') > 0,
      keptMastery: keptMastery(S),
    });
  }

  /** §3.3·§8 표에 따른 환생 직후 상태. S는 읽기만 한다 */
  function rebornState(S, now) {
    const next = SV.defaultState(now);
    KEPT_FIELDS.forEach(k => { next[k] = clone(S[k]); });
    next.gold = C.START_GOLD + startGoldBonus(S);
    next.slots = startSlots(S);
    next.mastery = keptMastery(S);
    // id 카운터는 단조(재사용 없음): 새 검은 이어지는 id를 받는다
    next.swords = [];
    next.nextSwordId = S.nextSwordId;
    next.active = R.createSword(next).id;
    next.nextAnvilId = S.nextAnvilId;
    next.quests.nextId = S.quests.nextId;
    next.rebirth = clone(S.rebirth);
    next.rebirth.count = Math.min(next.rebirth.count + 1, C.REBIRTH_COUNT_MAX);
    next.rebirth.fame = Math.min(next.rebirth.fame + C.FAME_PER_REBIRTH, C.FAME_MAX);
    return next;
  }

  /**
   * 환생 1회(한 번의 전이). 실패면 S 불변. 성공이면 S를 환생 직후 상태로 통째로 바꾼다.
   * 호출 쪽은 정규화된 복사본(draft)에 부르고 성공했을 때만 상태를 교체·저장한다(§3.2). 수수료는 stats에 넣지 않는다(§3.1)
   */
  function rebirth(S, now) {
    const check = canRebirth(S);
    if (!check.ok) return check;
    const consumedSwordId = offeringSword(S).id;
    const goldLost = S.gold - REBIRTH_FEE;
    const next = rebornState(S, now);
    Object.keys(S).forEach(k => { delete S[k]; });
    Object.assign(S, next);
    return {
      ok: true, fee: REBIRTH_FEE, goldLost, fameGain: C.FAME_PER_REBIRTH, consumedSwordId,
      fame: S.rebirth.fame, count: S.rebirth.count,
    };
  }

  /** 트랙의 최대 레벨(= 비용 표 길이) */
  const fameMaxLevel = track => C.FAME_SHOP[track].costs.length;
  /** 다음 레벨 구매 비용(명성). 최대 레벨이면 null. 상태와 트랙은 fameBlock이 'invalid'가 아니어야 한다 */
  function nextFameCost(S, track) {
    const level = S.rebirth.up[track];
    return level < fameMaxLevel(track) ? C.FAME_SHOP[track].costs[level] : null;
  }
  /**
   * 구매를 막는 사유(§4.1): invalid → maxed → noFame, 살 수 있으면 null. 상점 버튼과 buyFame이 같이 쓴다.
   * 입력은 정규화된 상태여야 하며, 명성이 유한수가 아니거나 레벨이 0 이상 정수가 아닌 비정규화 입력은 NaN 상태를 만들지 않도록 invalid로 거른다
   */
  function fameBlock(S, track) {
    if (typeof track !== 'string' || !R.hasOwn(C.FAME_SHOP, track) || !isObj(S) || !isObj(S.rebirth) || !isObj(S.rebirth.up)) {
      return 'invalid';
    }
    const level = S.rebirth.up[track];
    if (!Number.isFinite(S.rebirth.fame) || !Number.isInteger(level) || level < 0) return 'invalid';
    const cost = nextFameCost(S, track);
    if (cost === null) return 'maxed';
    return S.rebirth.fame < cost ? 'noFame' : null;
  }

  /** 명성 상점 구매(§4.1). 실패면 상태 불변, 환불 없음 */
  function buyFame(S, track) {
    const block = fameBlock(S, track);
    if (block) return fail(block);
    const cost = nextFameCost(S, track);
    const level = S.rebirth.up[track] + 1;
    S.rebirth.fame -= cost;
    S.rebirth.up[track] = level;
    return { ok: true, cost, level };
  }

  return {
    REBIRTH_FEE, KEPT_FIELDS,
    rebirthFee, rebirthUnlocked, canRebirth, rebirthPreview, rebirth, fameMaxLevel, nextFameCost, fameBlock, buyFame,
    fameValue: R.fameValue, famePct, startGoldBonus, startSlots,
  };
});
