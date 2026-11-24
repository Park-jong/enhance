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

  /** §3.1: invalid → notReached → noGold 순서로 검사 */
  function canRebirth(S) {
    if (!isObj(S) || !Array.isArray(S.swords) || !isObj(S.rebirth)) return fail('invalid');
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

  /** 명성 상점 구매(§4.1): invalid → maxed → noFame. 실패면 상태 불변, 환불 없음 */
  function buyFame(S, track) {
    if (typeof track !== 'string' || !R.hasOwn(C.FAME_SHOP, track) || !isObj(S) || !isObj(S.rebirth) || !isObj(S.rebirth.up)) {
      return fail('invalid');
    }
    const costs = C.FAME_SHOP[track].costs;
    const level = S.rebirth.up[track];
    if (level >= costs.length) return fail('maxed');
    const cost = costs[level];
    if (S.rebirth.fame < cost) return fail('noFame');
    S.rebirth.fame -= cost;
    S.rebirth.up[track] = level + 1;
    return { ok: true, cost, level: level + 1 };
  }

  return {
    REBIRTH_FEE, KEPT_FIELDS,
    rebirthFee, canRebirth, rebirthPreview, rebirth, buyFame,
    fameValue: R.fameValue, famePct, startGoldBonus, startSlots,
  };
});
