/* 시간 이벤트 규칙 (F13, docs/design/m2-events.md). 순수 로직: 시간은 dtMs(활성 플레이), 난수는 rng() ∈ [0,1)로 주입받는다.
 * 기기 시계(now)를 읽지 않는다. 상수만 쓰므로 rules.js보다 먼저 로드한다(rules·forge·idle·quests가 이 모듈을 읽는다).
 */
(function (root, factory) {
  'use strict';
  const SG = root.SG = root.SG || {};
  if (!SG.C && typeof require === 'function') require('./constants.js');
  SG.events = factory(SG.C);
  if (typeof module !== 'undefined' && module.exports) module.exports = SG.events;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';

  const SEC_MS = 1000;
  const MIN_SEC = 60;
  const GAP_MAX_MS = C.EVENT_GAP_MAX_SEC * SEC_MS;
  const fail = reason => ({ ok: false, reason });
  // 저장 데이터에서 온 id가 프로토타입 속성(constructor, __proto__ 등)과 맞아떨어지지 않게 한다
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  // 스폰 추가 조건(EVENTS[id].need 이름 → 검사)
  const EVENT_NEEDS = {
    autoOn: S => !!S.idle.autoOn,
    hasAnvil: S => S.anvils.length > 0,
  };
  if (C.EVENT_IDS.some(id => C.EVENTS[id].need !== null && !hasOwn(EVENT_NEEDS, C.EVENTS[id].need))) {
    throw new Error('EVENTS need is not in EVENT_NEEDS');
  }

  const eventDef = id => (typeof id === 'string' && hasOwn(C.EVENTS, id) ? C.EVENTS[id] : null);
  const durationMs = def => def.durationSec * SEC_MS;
  const eventsUnlocked = S => S.best >= C.EVENT_UNLOCK_BEST;

  /** 해금됐고 활성 이벤트 id가 유효하면 { id, remainMs, def }, 아니면 null(best<5로 변조된 활성 이벤트도 효과 없음, §10) */
  function activeEvent(S) {
    const active = S.events && S.events.active;
    const def = active ? eventDef(active.id) : null;
    if (!def || !eventsUnlocked(S)) return null;
    return { id: active.id, remainMs: active.remainMs, def };
  }

  /**
   * 그 이벤트가 활성이면 값 v(%·%p), 아니면 0. opts.noEvent(벽시계 따라잡기 실행, §6.2)면 항상 0.
   * 효과 코드는 0이면 기존 식·rng 열을 그대로 쓴다(§2.5)
   */
  function eventValue(S, id, opts) {
    if (opts && opts.noEvent) return 0;
    const a = activeEvent(S);
    return a && a.id === id ? a.def.value : 0;
  }

  /** 행운의 시간 보너스(%p): 활성이고 활성 검 단계 lv가 적용 범위면 값, 아니면 0 */
  const luckBonus = (S, lv) =>
    (lv >= C.EVENT_LUCK_MIN_LV && lv <= C.EVENT_LUCK_MAX_LV ? eventValue(S, 'luck') : 0);

  /** 스폰 후보: EVENT_IDS 순서, minBest·추가 조건 통과분. best ≥ 5면 luck·ore·quest가 항상 있어 비지 않는다 */
  const eligibleEvents = S => C.EVENT_IDS.filter(id => {
    const def = C.EVENTS[id];
    return S.best >= def.minBest && (def.need === null || EVENT_NEEDS[def.need](S));
  });

  /** 후보 가중치 선택(rng 1회): r = rng × 합, 누적을 순서대로 훑어 첫 r < 누적. 부동소수 끝값은 마지막 후보 */
  function pickEvent(S, rng) {
    const list = eligibleEvents(S);
    const r = rng() * list.reduce((s, id) => s + C.EVENTS[id].weight, 0);
    let acc = 0;
    for (const id of list) {
      acc += C.EVENTS[id].weight;
      if (r < acc) return id;
    }
    return list[list.length - 1];
  }

  /** 다음 스폰 간격(ms, rng 1회): [GAP_MIN, GAP_MAX]초 균등 정수 × 1000 */
  const drawGapMs = rng =>
    (C.EVENT_GAP_MIN_SEC + Math.floor(rng() * (C.EVENT_GAP_MAX_SEC - C.EVENT_GAP_MIN_SEC + 1))) * SEC_MS;

  /** 틱 dt를 정수 ms [0, EVENT_DT_MAX_MS]로 자른다. 음수·NaN·비수치는 0 */
  function clampDt(dtMs) {
    const dt = Math.floor(Number(dtMs));
    return Number.isNaN(dt) ? 0 : Math.max(0, Math.min(C.EVENT_DT_MAX_MS, dt));
  }

  /**
   * 틱마다 호출(§6.2). 반환 {} | { started: id } | { ended: id }.
   * rng는 스폰 때 1회(종류), 종료 때 1회(다음 간격)만 쓴다. 잠김(best < 5)이면 아무것도 바꾸지 않는다
   */
  function advanceEvents(S, dtMs, rng) {
    if (!eventsUnlocked(S)) return {};
    const dt = clampDt(dtMs);
    const ev = S.events;
    if (ev.active) {
      ev.active.remainMs -= dt;
      if (ev.active.remainMs > 0) return {};
      // 종료 틱의 남은 dt는 버린다
      const ended = ev.active.id;
      ev.active = null;
      ev.sinceMs = 0;
      ev.nextAtMs = drawGapMs(rng);
      return { ended };
    }
    // 저장 정규화와 같은 상한(GAP_MAX)으로 자른다: nextAtMs ≤ GAP_MAX라 스폰 시점은 같고, 저장값이 로드에서 잘리지 않는다(V8)
    ev.sinceMs = Math.min(ev.sinceMs + dt, GAP_MAX_MS);
    if (ev.sinceMs < ev.nextAtMs) return {};
    const started = pickEvent(S, rng);
    ev.active = { id: started, remainMs: durationMs(C.EVENTS[started]) };
    S.stats.eventsSeen++;
    return { started };
  }

  /** 남은 시간 m:ss (초 올림이라 마지막 순간에도 0:01) */
  function fmtEventClock(ms) {
    const sec = Math.ceil(Math.max(0, ms) / SEC_MS);
    return `${Math.floor(sec / MIN_SEC)}:${String(sec % MIN_SEC).padStart(2, '0')}`;
  }

  /** 테스트 전용(test.html): 활성 이벤트를 직접 지정한다. index.html UI에서 부르지 않는다. 실패하면 상태 불변 */
  function setEvent(S, id, remainMs) {
    const def = eventDef(id);
    if (!def) return fail('badEvent');
    if (!Number.isInteger(remainMs) || remainMs < 1 || remainMs > durationMs(def)) return fail('badTime');
    S.events.active = { id, remainMs };
    return { ok: true };
  }

  return {
    eventDef, eventsUnlocked, activeEvent, eventValue, luckBonus, eligibleEvents, pickEvent, drawGapMs, advanceEvents,
    fmtEventClock, setEvent,
  };
});
