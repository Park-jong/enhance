/* 렌더링: 상태(S) + UI 상태(ui) → DOM. 게임 규칙은 SG.rules 등에서 읽기만 한다.
 * 컨테이너별로 마지막 HTML을 기억해 바뀐 곳만 다시 그린다(주기적 렌더에도 클릭이 끊기지 않게).
 */
(function (root) {
  'use strict';
  const SG = root.SG = root.SG || {};
  // RB(환생 규칙)는 함수 안에서만 쓴다: view.js만 불러오는 node 테스트(run-m1*.js)에는 rebirth.js가 없다
  const { C, rules: R, forge: F, idle: I, quests: Q, ach: A, events: E, rebirth: RB, fx: FX } = SG;
  const fmt = FX.fmt;
  /** SVG 아이콘 HTML(M1 → M2 순으로 찾음). 에셋 파일이 없으면 '' — 폴백은 호출하는 쪽이 고른다 */
  const svgIc = id => {
    const key = C.ICON_ASSET_KEYS[id];
    const svg = key && ((root.M1_ICONS && root.M1_ICONS[key]) || (root.M2_ICONS && root.M2_ICONS[key]));
    return svg ? `<span class="ic">${svg}</span>` : '';
  };
  /** 아이콘 HTML: 콘텐츠 팀 SVG가 로드돼 있으면 그것을, 아니면 이모지 */
  const ic = id => svgIc(id) || C.ICONS[id] || '';
  /** 옆 글자가 뜻을 전하는 장식 아이콘: SVG는 이미 aria-hidden이고, 이모지 폴백도 화면 읽기에서 숨긴다 */
  const decoIc = id => svgIc(id) || (C.ICONS[id] ? `<span aria-hidden="true">${C.ICONS[id]}</span>` : '');
  const $ = sel => document.querySelector(sel);

  // ============================================================ 문구
  // 빈 강화 영역 안내(#stageEmpty)·보관함 아래 안내·활성 검 없음 실패 문구의 단일 출처
  const NO_ACTIVE_TEXT = '보관함에서 강화할 검을 선택하세요';
  const REASON = {
    noGold: '골드가 부족합니다. 사냥하거나 검을 판매하세요.',
    slotsFull: '빈 칸이 없습니다. 칸을 확장하거나 검을 정리하세요.',
    slotsMax: '더 이상 확장할 수 없습니다.',
    full: '보유 한도에 도달했습니다.',
    locked: '아직 해금되지 않았습니다.',
    boostMax: `부스터 잔여 시간은 최대 ${C.BOOSTER_MAX_MIN}분까지입니다.`,
    noShards: '파편이 부족합니다.',
    noResource: '재료가 부족합니다.',
    noStock: '보유한 아이템이 없습니다.',
    zeroLv: '+0 검은 판매할 수 없습니다.',
    noSword: '요구 단계와 정확히 같은 검이 없습니다.',
    noQuest: '의뢰가 없습니다.',
    waiting: '새 의뢰를 기다리는 중입니다.',
    max: '이미 최대 레벨입니다.',
    intact: '수리할 필요가 없습니다.',
    notFound: '대상을 찾을 수 없습니다.',
    maxLv: '더 이상 강화할 수 없습니다.',
    gaugeFull: '천장 확정: 소모품이 필요 없음',
    noActive: NO_ACTIVE_TEXT + '.',
    noTrait: '특성이 없는 검입니다.',
    maxTier: '이미 최고 등급입니다.',
    owned: '이미 세운 기념비입니다.',
    notReached: '아직 그 단계에 도달하지 못했습니다.',
    invalid: '대상을 찾을 수 없습니다.',
    // 업적·일일 과제 수령 (m2-achievements §10.3)
    claimed: '이미 받은 보상입니다',
    stale: '일일 과제가 갱신되었습니다',
    notDone: '아직 달성하지 못했습니다',
    noDaily: '오늘의 일일 과제가 아직 없습니다',
    inactiveTab: '다른 탭에서 진행 중입니다',
    // 명성 상점 (m2-rebirth §4.1)
    maxed: '이미 최대 단계입니다',
    noFame: '명성이 부족합니다',
  };
  // 수령 실패 문구: 업적의 notReached는 기념비의 '그 단계에 도달하지 못함'과 뜻이 달라 수령에서만 바꿔 쓴다
  const CLAIM_REASON = Object.assign({}, REASON, { notReached: REASON.notDone });
  // 환생 실패 문구(§7): notReached·noGold는 환생 맥락에서만 이 문구다(기념비 문구와 겹치는 사유 키를 호출 쪽이 맥락으로 고른다, V7).
  // busy: 강화 연출 중에 누른 확인(§7.1). 수수료는 rebirth.js가 만들므로 읽을 때 계산한다(로드 순서와 무관하게)
  const REBIRTH_REASON = Object.defineProperty(
    Object.assign({}, REASON, { notReached: `+${C.MAX} 검이 보관함에 있어야 합니다`, busy: '강화 연출이 끝난 뒤 다시 시도하세요' }),
    'noGold', { enumerable: true, get: () => `필요 ${fmt(RB.REBIRTH_FEE)} G` });
  // 검 특성 효과 문장 (m2-traits §11). 수입형/거래형 구분은 C.TRAITS[k].income 데이터가 정한다
  const TRAIT_TEXT = {
    hunt: v => `수동 사냥 골드 +${v}%`,
    work: v => `자동 사냥·오프라인 골드 +${v}%`,
    trade: v => `이 검을 판매·납품할 때 골드 +${v}%`,
    ore: v => `사냥당 광석 +${v}%`,
    shard: v => `이 검이 파괴될 때 파편 +${v}%`,
    anvil: v => `이 검을 모루로 강화할 때 ${v}% 확률로 내구도 보존`,
  };
  // TRAIT_KINDS에 새 종류를 넣고 문장을 빠뜨려도 로드·렌더가 멈추지 않게 하는 일반 문장(출시 종류의 누락은 run-tests가 잡는다)
  const traitFallbackText = (k, v) => `${C.TRAITS[k].name} 특성 +${v}%`;
  const INCOME_TRAIT_KINDS = C.TRAIT_KINDS.filter(k => C.TRAITS[k].income);
  const TRAIT_NO_ODDS_TEXT = '특성은 강화 확률에 영향을 주지 않습니다';
  // 골드 사용처(특성 관리·기념비): 2회 클릭 확인 문구와 막힌 사유
  const SINK_TEXT = {
    confirm: '한 번 더 누르면 구매',
    locked: `최고 +${C.TRAIT_MGMT_UNLOCK_BEST} 이상에서 열림`,
    maxTier: '최고 등급',
    noGold: '골드가 부족합니다.',
    monumentNote: '장식 전용 — 확률·수입에 영향 없음',
  };
  const monumentTitle = L => `+${L} ${C.SWORDS[L].n} 기념비`;
  const TRAY_REASON = {
    noStock: () => '보유 없음',
    sureExclusive: () => '확정 강화권 사용 중에는 함께 쓸 수 없습니다',
    lvTooHigh: () => `+${C.SURE_MAX_TARGET} 이상에서는 사용할 수 없습니다`,
    lvRange: () => `+${C.DROP_FROM}~+${C.KEEPDOWN_MAX_LV - 1}에서만 유효`,
    noDestroy: () => '현재 단계는 파괴 없음',
    protExhausted: () => `이 단계 보호 ${C.PROTECT_USES}/${C.PROTECT_USES} 사용 — 파괴를 막을 수 없습니다 (성공하거나 하락하면 복구)`,
    needMore: sw => `필요 ${R.protectNeed(sw.lv)}장`,
    noAnvil: () => '대장간에서 모루를 장착하세요',
    broken: () => '파손됨 — 대장간에서 수리하세요',
    lowLv: () => `+${C.ANVIL_TOGGLE_MIN_LV}부터 사용할 수 있습니다`,
    maxLv: () => '최대 강화',
    gaugeFull: () => REASON.gaugeFull,
    noActive: () => '활성 검 없음',
  };
  const BAD_REASONS = ['needMore', 'protExhausted'];
  const CAP_NOTE = { wasted: '상한 도달 — 효과 없음', partial: '상한 도달 — 일부 효과 없음' };
  const TIER_NAME = { easy: '쉬움', normal: '보통', hard: '어려움' };
  const TABS = [
    { id: 'shop', name: '상점' },
    { id: 'forge', name: '대장간', unlock: 'forge', desc: '모루 장착·제작·수리, 광석, 파편 교환' },
    { id: 'quests', name: '의뢰', unlock: 'quests', desc: '정확한 단계의 검을 납품하고 보상을 받습니다' },
    { id: 'idle', name: '방치', unlock: 'idle', desc: '자동 사냥, 방치 업그레이드, 오프라인 보상' },
    { id: 'records', name: '기록' },
  ];
  const TAB_DOT = {
    forge: S => F.forgeActionable(S),
    idle: S => I.idleActionable(S),
    records: S => A.claimableAny(S),
  };
  // 탭 이름 옆 개수 배지(0이면 숨김). 의뢰: 지금 납품할 수 있는 의뢰 수
  const TAB_COUNT = {
    quests: S => Q.deliverableSlots(S).length,
  };
  const UP_EFFECT = {
    speed: n => `간격 ${I.upgradeValue('speed', n) / 1000}초`,
    gold: n => `자동·오프라인 골드 +${Math.round((I.upgradeValue('gold', n) - 1) * 100)}%`,
    offline: n => `오프라인 상한 ${I.upgradeValue('offline', n)}시간`,
  };
  const STATS = [
    ['최고 강화', S => '+' + S.best], ['강화 시도', S => fmt(S.stats.tries)], ['성공', S => fmt(S.stats.success)],
    ['실패', S => fmt(S.stats.fail)], ['파괴', S => fmt(S.stats.destroy)], ['판매 수익', S => fmt(S.stats.earned)],
    ['보호 성공', S => fmt(S.stats.protectSaved)], ['획득 파편', S => fmt(S.stats.shardsGained)], ['납품', S => fmt(S.stats.delivered)],
    ['모루 제작', S => fmt(S.stats.crafted)], ['사냥 골드', S => fmt(S.stats.huntGold)], ['오프라인 골드', S => fmt(S.stats.offlineGold)],
  ];

  const SAVE_FAILED_TEXT = '저장하지 못했습니다. 브라우저 저장 공간을 확인하세요.';
  // 저장 안전: 보호 모드 배너·저장 실패 배지·손상 백업 알림 (m1-storage 저장 안전)
  const SAVE_SAFETY_TEXT = {
    banner: '저장 공간이 부족해 손상된 저장을 보존하려고 저장을 멈췄습니다. 지금 진행은 저장되지 않습니다.',
    copy: '원문 복사',
    retry: '백업 다시 시도',
    abandon: '보존 포기하고 저장',
    abandonConfirm: '손상된 저장 원문이 영구히 사라집니다',
    copied: '손상된 저장 원문을 클립보드에 복사했습니다.',
    copyFailed: '복사하지 못했습니다. 배너 아래 원문을 직접 선택해 복사하세요.',
    retryFailed: '이번에도 백업하지 못했습니다. 저장 공간을 비운 뒤 다시 시도하세요.',
    occupied: '이전 백업이 있어 이번 손상본은 보관하지 못했습니다',
    badge: '저장 안 됨 — 저장 공간 확인',
  };
  const corruptKeptText = key => `손상된 저장을 ${key}에 보관했습니다`;

  // 시간 이벤트 표시 (F13, m2-events §9). 값·효과 문장은 모두 SG.events·C.EVENTS·chances()에서 읽는다
  const SEC_PER_MIN = 60;
  const MS_PER_MIN = SEC_PER_MIN * 1000;
  const LUCK_EVENT = 'luck';
  const EVENT_TEXT = {
    offlineNote: '접속 중에만 흐르고 오프라인에서는 적용되지 않습니다',
    remain: '남은 시간',
    deal: '특가',
    guard: '가호',
  };
  const CAP_CAUSE_TEXT = { cap: '상한', ceil: '천장' };
  // 행운의 시간이 켜져 있지만 지금 시도에는 효과가 없는 사유(팝오버 한 줄)
  const LUCK_IDLE_TEXT = {
    noActive: () => '활성 검이 없어 지금은 효과가 없습니다',
    outOfRange: lv => `현재 검(+${lv})은 적용 범위(+${C.EVENT_LUCK_MIN_LV}~+${C.EVENT_LUCK_MAX_LV}) 밖이라 지금은 효과가 없습니다`,
    certain: () => '이번 강화는 확정 성공이라 지금은 효과가 없습니다',
    cap: c => `보너스 상한(+${c.cap}%p)에 이미 도달해 지금은 효과가 없습니다`,
    ceil: c => `성공 확률 천장(${Math.max(c.base, C.SUCC_CEIL)}%)에 닿아 지금은 효과가 없습니다`,
  };
  // 수입 줄(#incomeNote)에 붙이는 수입 이벤트: C.EVENTS의 incomeLabel(짧은 이름)이 있는 것, EVENT_IDS 순서
  const INCOME_EVENT_IDS = C.EVENT_IDS.filter(id => C.EVENTS[id].incomeLabel);

  const swordName = lv => `+${lv} ${C.SWORDS[lv].n}`;
  const itemName = id => (R.itemDef(id) ? R.itemDef(id).name : C.ORE_NAMES[id]);
  const qtySuffix = n => (n > 1 ? ' ×' + fmt(n) : '');
  /** innerHTML 전용(SVG 아이콘 포함) */
  const itemLabel = (id, n) => `${ic(id)} ${itemName(id)}${qtySuffix(n)}`;
  /** textContent용(로그·토스트): 이모지 + 이름 */
  const itemText = (id, n) => `${C.ICONS[id] || ''} ${itemName(id)}${qtySuffix(n)}`.trim();
  /** 광석 사냥당 기대량 표시(0.5·0.7·3.2): 부동소수 끝자리만 정리한다 */
  const rateText = x => String(+x.toFixed(3));

  // ------------------------------------------------------------ 특성 표시
  /** "완벽한 대장장이" (trait = { k, t }) */
  const traitName = tr => `${C.TRAIT_TIER_NAME[tr.t - 1]} ${C.TRAITS[tr.k].name}`;
  function traitEffect(tr) {
    const v = R.traitValue({ trait: tr }, tr.k);
    return R.hasOwn(TRAIT_TEXT, tr.k) ? TRAIT_TEXT[tr.k](v) : traitFallbackText(tr.k, v);
  }
  /** 수입 줄의 특성 몫 "+20%(약탈자)": 수입 검들 중 그 종류의 최댓값만(없으면 '') */
  function traitShare(S, kind) {
    const v = R.incomeTraitValue(S, kind);
    return v > 0 ? `+${v}%(${C.TRAITS[kind].name})` : '';
  }
  const withShare = (text, share) => (share ? `${text} ${share}` : text);
  const isIncomeSword = (S, sw) => R.incomeSwords(S).includes(sw);
  /** 효과 문장. 수입형은 이 검이 지금 수입 검(최고 단계)인지 덧붙인다(sw가 없으면 생략) */
  function traitLineText(S, sw, tr) {
    const text = traitEffect(tr);
    if (!C.TRAITS[tr.k].income || !sw) return text;
    return isIncomeSword(S, sw) ? `${text} · 수입 검 적용 중` : `${text} · 최고 단계 검(+${R.topLv(S)})일 때만 적용`;
  }
  /** 등급 점: 항상 TRAIT_TIER_MAX개를 그리고 등급 수만큼 채운다(2/3처럼 읽힘) */
  const tierPipsHTML = t =>
    `<span class="pips" aria-hidden="true">${'<i class="on"></i>'.repeat(t)}${'<i></i>'.repeat(C.TRAIT_TIER_MAX - t)}</span>`;
  /** 색만으로 구분하지 않게 종류 아이콘(SVG가 없으면 약자 한 글자) + 등급 점. 등급 이름은 aria-label로 읽힌다 */
  const traitChipHTML = tr =>
    `<span class="trait-chip trait-t${tr.t}" role="img" aria-label="${traitName(tr)}">${svgIc('trait_' + tr.k) || `<b>${C.TRAITS[tr.k].short}</b>`}${tierPipsHTML(tr.t)}</span>`;

  // ------------------------------------------------------------ 시간 이벤트 표시 (순수 문자열, node 테스트에서 호출 가능)
  /** 헤더 칩 안 HTML(a = E.activeEvent 결과): 아이콘 + 이름 + m:ss. ≤520px에서는 CSS가 이름을 화면에서만 감춘다(스크린 리더는 읽음) */
  const eventChipHTML = a =>
    `<span class="ev-icon" aria-hidden="true">${ic('event_' + a.id)}</span><span class="ev-name">${a.def.name}</span> <span class="ev-clock">${E.fmtEventClock(a.remainMs)}</span>`;
  /** 칩 title(데스크톱 호버)에 쓰는 전체 문장 */
  const eventChipLabel = a => `${a.def.name} ${E.fmtEventClock(a.remainMs)} 남음 · ${a.def.desc}`;
  /**
   * 이벤트 효과가 상한·천장에 잘린 원인(m2-events §9): 이벤트를 빼도 이미 상한 이상이면 'cap', 아니면 'ceil'(SUCC_CEIL).
   * 출시 상수(+5~+19)로는 'ceil'에 닿지 않지만 상수 조정에 대비해 둔다(run-tests가 손으로 만든 chances 객체로 검증)
   */
  const eventCapCause = c => (c.raw - c.event >= c.cap ? 'cap' : 'ceil');
  /** 확률 내역 끝의 이벤트 메모: 이벤트 항이 없거나 다 들어가면 '', 일부만이면 실효 %p, 0이면 효과 없음(원인) */
  function eventBreakdownNote(c) {
    if (!(c.event > 0) || c.eventGain >= c.event) return '';
    return c.eventGain > 0 ? ` · 이벤트 실효 +${c.eventGain}%p` : ` · 이벤트 효과 없음(${CAP_CAUSE_TEXT[eventCapCause(c)]})`;
  }
  /** 행운의 시간이 켜져 있지만 지금 강화에 효과가 없으면 그 사유, 아니면 ''. 실제 굴림과 같은 luckBonus·currentChances로 판정 */
  function luckIdleText(S) {
    const a = E.activeEvent(S);
    if (!a || a.id !== LUCK_EVENT) return '';
    const sw = R.activeSword(S);
    if (!sw) return LUCK_IDLE_TEXT.noActive();
    if (E.luckBonus(S, sw.lv) === 0) return LUCK_IDLE_TEXT.outOfRange(sw.lv);
    const c = R.currentChances(S);
    if (c.event === 0) return LUCK_IDLE_TEXT.certain();   // 확정 시도(certain)는 이벤트 항이 0이다
    return c.eventGain > 0 ? '' : LUCK_IDLE_TEXT[eventCapCause(c)](c);
  }
  /** 이벤트 상세 팝오버(#eventPop) 내용. 활성 이벤트가 없으면 '' */
  function eventPopHTML(S) {
    const a = E.activeEvent(S);
    if (!a) return '';
    const idle = luckIdleText(S);
    return `<b class="ev-pop-title">${ic('event_' + a.id)} ${a.def.name}</b><span>${a.def.desc}</span>` +
      `<span>${EVENT_TEXT.remain} <b class="ev-clock">${E.fmtEventClock(a.remainMs)}</b></span>` +
      `<small class="muted">${EVENT_TEXT.offlineNote}</small>${idle ? `<small class="ev-idle">${idle}</small>` : ''}`;
  }
  /** 수입 줄의 이벤트 몫 " · 이벤트 사냥 +40%"(켜진 수입 이벤트만, 효과 계산과 같은 eventValue) */
  const incomeEventText = S => INCOME_EVENT_IDS.map(id => {
    const v = E.eventValue(S, id);
    return v > 0 ? ` · 이벤트 ${C.EVENTS[id].incomeLabel} +${v}%` : '';
  }).join('');
  /** 이벤트 값 v(%)가 켜져 있으면 "+50%", 아니면 '' (광석 칸·방치 탭 광석 줄) */
  const eventPctText = (S, id) => { const v = E.eventValue(S, id); return v > 0 ? `+${v}%` : ''; };
  /** 지속 시간 글자: 300 → "5분", 270 → "4분 30초", 45 → "45초" (소수 분 "4.5분" 없음) */
  function eventDurationText(sec) {
    const min = Math.floor(sec / SEC_PER_MIN);
    const rest = sec % SEC_PER_MIN;
    return [min > 0 ? `${min}분` : '', rest > 0 ? `${rest}초` : ''].filter(Boolean).join(' ');
  }
  /** 토스트 문구: 시작 "🍀 이벤트 시작: 행운의 시간 — 5분간 강화 성공 확률 +5%p"(앞 이모지는 C.ICONS 폴백), 종료 "이벤트 종료: 행운의 시간" */
  const eventStartText = id => {
    const d = C.EVENTS[id];
    return `${d.icon} 이벤트 시작: ${d.name} — ${eventDurationText(d.durationSec)}간 ${d.desc}`;
  };
  const eventEndText = id => `이벤트 종료: ${C.EVENTS[id].name}`;
  /** 행운의 시간 덕에 난 성공(r.eventAssist)의 결과 로그. 숙련 구간(+15~+19)이면 숙련 기록에 세지 않았음을 함께 알린다 */
  const eventAssistText = r =>
    `${C.EVENTS[LUCK_EVENT].icon} 이벤트 덕에 성공${R.masteryIndex(r.from) >= 0 ? ' — 숙련 기록에는 세지 않습니다' : ''}`;

  function fmtDuration(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = v => String(v).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  const until = ts => `<span data-until="${ts}"></span>`;

  // ============================================================ DOM 보조
  function setHTML(el, html) {
    if (el.__html === html) return false;
    el.__html = html;
    el.innerHTML = html;
    return true;
  }
  function updateCountdowns(now) {
    document.querySelectorAll('[data-until]').forEach(el => {
      el.textContent = fmtDuration(+el.dataset.until - now);
    });
  }
  const isArmed = (ui, key, now) => (ui.armed[key] || 0) > now;
  const costHTML = (S, price) => {
    const parts = Object.keys(price.ore).map(k =>
      `<span class="${S.ore[k] < price.ore[k] ? 'lack' : ''}">${ic(k)} ${fmt(price.ore[k])}</span>`);
    if (price.gold) parts.push(`<span class="${S.gold < price.gold ? 'lack' : ''}">${ic('gold')} ${fmt(price.gold)}</span>`);
    return parts.join(' ');
  };
  const lockedBoxHTML = (head, desc) => `<div class="locked-msg"><b>${ic('lock')}</b>${head}<br><small>${desc}</small></div>`;
  const lockedHTML = (best, desc) => lockedBoxHTML(`최고 강화 +${best} 달성 시 해금`, desc);

  // ============================================================ 헤더
  function renderHeader(S) {
    $('#gold').textContent = fmt(S.gold);
    const showShards = S.shards > 0 || S.stats.shardsGained > 0 || S.best >= C.FORGE_UNLOCK_BEST;
    const res = [];
    if (showShards) res.push(`<span class="res" title="파편">${ic('shard')} ${fmt(S.shards)}</span>`);
    F.unlockedOres(S).forEach(k => res.push(`<span class="res" title="${C.ORE_NAMES[k]}">${ic(k)} ${fmt(S.ore[k])}</span>`));
    setHTML($('#resOther'), res.join(''));
    $('#setSound').checked = !S.settings.muted;
    $('#setSkip').checked = S.settings.skipFx;
  }

  /**
   * 헤더 이벤트 칩과 상세 팝오버(매 틱). 활성 이벤트가 없으면 칩·팝오버를 모두 숨긴다:
   * 이벤트가 끝나거나 상태가 교체돼도 열린 팝오버가 남지 않는다(V1). 팝오버 내용은 열려 있을 때만 갱신
   */
  function renderEventChip(S) {
    const a = E.activeEvent(S);
    const chip = $('#eventChip');
    const pop = $('#eventPop');
    $('#eventWrap').hidden = !a;
    chip.hidden = !a;
    if (!a) {
      pop.hidden = true;
      return;
    }
    setHTML(chip, eventChipHTML(a));
    // 열린 호버 툴팁을 틱마다 다시 쓰지 않게 글자가 바뀔 때(초 단위)만 쓴다
    const label = eventChipLabel(a);
    if (chip.title !== label) chip.title = label;
    chip.setAttribute('aria-expanded', String(!pop.hidden));
    if (!pop.hidden) setHTML(pop, eventPopHTML(S));
  }

  // ============================================================ 보관함 스트립 (F5)
  function slotCardHTML(S, sw) {
    const badges = [];
    if (C.DESTROY[sw.lv] > 0) badges.push(`<span class="${sw.prot > 0 ? '' : 'off'}">🛡${sw.prot}</span>`);
    const pb = R.pityBonus(sw.lv, sw.pity);
    if (sw.lv < C.MAX && pb > 0) badges.push(`<span>${ic('pity')}+${pb}%p</span>`);
    if (Q.slotForSword(S, sw) >= 0) badges.push(`<span>${ic('deliver')}</span>`);
    const active = sw.id === S.active;
    const trait = sw.trait ? ` · ${traitName(sw.trait)}` : '';
    // 클릭 한 번이면 활성 검(data-act), data-sword는 칸 드래그 대상 표시
    return `<button class="slot-card ${active ? 'active' : ''}" data-act="activate" data-id="${sw.id}" data-sword="${sw.id}"
      title="${swordName(sw.lv)}${trait} · 클릭: 활성 검으로 · 끌기: 칸 이동">
      ${active ? '<span class="star">★ 활성</span>' : ''}${sw.trait ? traitChipHTML(sw.trait) : ''}${FX.swordSVG(sw.lv, 's' + sw.id)}
      <b>+${sw.lv}</b><span class="badges">${badges.join('')}</span></button>`;
  }

  function stripCardsHTML(S) {
    const cards = S.swords.map(sw => slotCardHTML(S, sw));
    for (let i = S.swords.length; i < S.slots; i++) {
      cards.push(`<button class="slot-card empty ${S.gold < C.NEW_SWORD_PRICE ? 'poor' : ''}" data-act="buySword">
        + 새 검<br>${fmt(C.NEW_SWORD_PRICE)}G</button>`);
    }
    const expand = R.expandCost(S);
    if (expand !== null) {
      cards.push(`<button class="slot-card locked" data-act="expand" ${S.gold < expand ? 'disabled' : ''}>
        ${ic('lock')} 확장<br>${fmt(expand)}G</button>`);
    }
    return cards.join('');
  }

  /** 스트립 아래 동작: 활성 검 판매·납품 + 감정 인장 */
  function stripActionsHTML(S, ui, now) {
    const seal = S.inv.seal > 0
      ? `<label class="seal-opt"><input type="checkbox" data-change="seal" ${S.use.seal ? 'checked' : ''}>
         ${ic('seal')} 감정 인장 (보유 ${S.inv.seal}) · 다음 판매/납품 ×${C.SEAL_MULT}</label>`
      : '';
    const sw = R.activeSword(S);
    if (!sw) return `<div class="sel-name">활성 검 없음 · ${NO_ACTIVE_TEXT}</div>${seal}`;
    const price = R.payoutPreview(S, R.sell(sw.lv), sw);
    const qSlot = Q.slotForSword(S, sw);
    const sellArmed = isArmed(ui, 'sell:' + sw.id, now);
    const delArmed = isArmed(ui, 'deliverSword:' + sw.id, now);
    return `
      <div class="sel-name">활성: ${swordName(sw.lv)} <span class="muted">· 클릭: 활성 검 바꾸기 · 끌기: 칸 이동</span></div>
      <button class="small-btn gold ${sellArmed ? 'armed' : ''}" data-act="sellSel" data-id="${sw.id}" ${sw.lv === 0 || ui.busy ? 'disabled' : ''}>
        ${sellArmed ? '정말 판매?' : `판매 ${fmt(price)}G`}</button>
      <button class="small-btn ${delArmed ? 'armed' : ''}" data-act="deliverSel" data-id="${sw.id}" ${qSlot < 0 || ui.busy ? 'disabled' : ''}>
        ${delArmed ? '정말 납품? (활성 검)' : `${ic('deliver')} 납품`}</button>
      ${seal}`;
  }

  function renderStrip(S, ui, now) {
    // 끄는 중에는 칸 DOM을 다시 그리지 않는다(잡고 있는 카드가 사라짐). 놓은 뒤 렌더에서 새 순서로 그린다
    if (!ui.dragId) setHTML($('#strip'), stripCardsHTML(S));
    $('#slotCount').textContent = `(${S.swords.length} / ${S.slots})`;
    setHTML($('#stripActions'), stripActionsHTML(S, ui, now));
  }

  // ============================================================ 검 카드 / 확률
  const NO_SWORD = -1;
  const DEFAULT_TIER = '#3a4060';
  let renderedLevel = NO_SWORD;

  function breakdownHTML(c) {
    if (c.sure) return `${ic('sure')} 확정 강화권: 성공 100% · 파괴 0%`;
    if (c.gaugeFull) return '천장 확정: 성공 100% · 파괴 0%';
    if (c.forced) return 'TEST MODE: 성공 100% · 파괴 0%';
    if (!c.parts) return '';
    const terms = [`기본 ${c.base}%`];
    if (c.parts.bless) terms.push(`축복 ${c.parts.bless}`);
    if (c.parts.anvil) terms.push(`모루 ${c.parts.anvil}`);
    if (c.parts.pity) terms.push(`보정 ${c.parts.pity}`);
    // 행운의 시간은 같은 보너스 합(raw)에 들어가므로 항들의 합이 raw와 같다(m2-events §9)
    if (c.event > 0) terms.push(`이벤트 ${c.event}`);
    let s = terms.join(' + ');
    if (c.raw > 0) {
      s += ` = +${c.raw}`;
      if (c.raw > c.bonus) s += ` → <s>+${c.raw}</s> +${c.bonus} <span class="badge warn">상한 ${c.cap}</span>`;
    }
    // 숙련은 상한 밖 항목이라 상한 표시(취소선·뱃지) 뒤에 따로 더한다
    if (c.mastery) s += ` + <span class="mastery-term">숙련 +${c.mastery}</span> = ${c.succ}%`;
    if (c.succ < c.base + c.bonus + c.mastery) s += ` <span class="badge warn">천장 ${Math.max(c.base, C.SUCC_CEIL)}%</span>`;
    return s + eventBreakdownNote(c);
  }

  // 결과 분해 줄(m2-rebirth §15.3 UI): 숫자는 모두 굴림과 같은 chances() 필드(AC 46)
  const ODDS_TEXT = { succ: '성공', dest: '파괴', drop: '하락', stay: '유지 실패', fail: '실패', relief: '(명성)' };
  const oddsPart = text => `<span class="odds-part">${text}</span>`;
  /**
   * "성공 · 파괴 · 하락 · 유지 실패"(+DROP_FROM 미만은 하락이 없어 "실패" 하나) + 명성 저항 보조 줄.
   * 확정 시도·최대 단계(parts 없음)는 확률 내역 줄이 이미 "성공 100% · 파괴 0%"를 말하므로 ''
   */
  function oddsSplitHTML(lv, c) {
    if (!c || !c.parts) return '';
    const rows = [['succ', c.succ], ['dest', c.dest]]
      .concat(lv >= C.DROP_FROM ? [['drop', c.drop], ['stay', c.stay]] : [['fail', c.fail]]);
    const split = rows.map(([k, v]) => oddsPart(`${ODDS_TEXT[k]} ${v}%`)).join(' · ');
    const relief = [['dest', c.destSaved], ['drop', c.dropRelief]].filter(([, n]) => n > 0)
      .map(([k, n]) => oddsPart(`${ODDS_TEXT[k]} −${n}%p ${ODDS_TEXT.relief}`)).join(' · ');
    return split + (relief ? `<span class="odds-relief">${relief}</span>` : '');
  }

  /** 성공 확률 아래 천장 게이지 줄(+15~+19에서만) */
  function gaugeHTML(g) {
    return `천장 ${g.value}/${g.n}${g.full ? ` <span class="badge good">${ic('sure_badge')} 확정!</span>` : ''}`;
  }

  function noteText(lv, c, use) {
    if (lv >= C.MAX) return `${C.ICONS.achievement} 더 이상 강화할 수 없습니다. 무한의 검을 완성했습니다!`;
    if (c.sure) return '확정 강화권으로 반드시 성공합니다.';
    if (c.gaugeFull) return '천장 게이지가 가득 찼습니다. 이번 강화는 소모품 없이 반드시 성공합니다.';
    if (lv >= C.DROP_FROM && c.stay > 0) {
      // 하락 저항·파괴 저항이 만든 유지 실패는 단계가 그대로이고 하락 방지 주문서도 쓰지 않는다(§15.4)
      return use.keepdown
        ? `하락 (${c.drop}%) 시 하락 방지 주문서가 단계를 지켜 줍니다. 유지 실패 (${c.stay}%)에는 쓰지 않습니다.`
        : `하락 (${c.drop}%) 시 +${lv - 1}로 내려갑니다. 유지 실패 (${c.stay}%)는 단계가 그대로입니다.`;
    }
    if (lv >= C.DROP_FROM) {
      return use.keepdown
        ? `실패 시 (${c.fail}%) 하락 방지 주문서가 단계를 지켜 줍니다.`
        : `실패 시 (${c.fail}%) +${lv - 1}로 하락합니다.`;
    }
    if (c.dest > 0) return `실패 시 (${c.fail}%) 단계가 유지됩니다. 파괴되면 검이 사라지고 파편을 얻습니다.`;
    return `실패해도 단계가 유지됩니다. (+${C.DESTROY.findIndex(d => d > 0)}부터 파괴 위험)`;
  }

  function renderIncomeNote(S) {
    const shares = INCOME_TRAIT_KINDS.map(k => traitShare(S, k)).filter(Boolean);
    $('#incomeNote').textContent = `사냥·자동 수입 기준: 보관함 최고 검 +${R.topLv(S)}${shares.length ? ` · 특성 ${shares.join(' · ')}` : ''}${incomeEventText(S)}`;
  }

  /** 활성 검 이름 줄 "완벽한 약탈자 · +12 …"과 그 아래 효과 문장. 특성이 없으면 기존 표기 */
  function renderSwordTitle(S, sw, lv, trait) {
    $('#swordName').textContent = trait ? `${traitName(trait)} · ${swordName(lv)}` : swordName(lv);
    $('#traitLine').hidden = !trait;
    $('#traitLine').textContent = trait ? traitLineText(S, sw, trait) : '';
  }

  /** 활성 검 없음(파괴 직후): 검 대신 선택 안내, 수치는 모두 '-' */
  function renderNoSwordCard(S) {
    $('#rarity').hidden = true;
    renderSwordTitle(S, null, 0, null);
    $('#swordName').textContent = '활성 검 없음';
    $('#swordName').style.color = '';
    document.documentElement.style.setProperty('--tier', DEFAULT_TIER);
    if (renderedLevel !== NO_SWORD) {
      $('#sword').innerHTML = '';
      $('#sword').classList.remove('mythic');
      renderedLevel = NO_SWORD;
    }
    ['#vSucc', '#vDest', '#vCost', '#vSell'].forEach(sel => { $(sel).textContent = '-'; });
    $('#gaugeLine').hidden = true;
    setHTML($('#gaugeLine'), '');
    $('#destWarn').hidden = true;
    setHTML($('#breakdown'), '');
    setHTML($('#oddsSplit'), '');
    setHTML($('#pityLine'), '');
    $('#note').textContent = '보관함의 검을 한 번 클릭하면 바로 활성 검이 됩니다.';
    renderIncomeNote(S);
  }

  function renderSwordCard(S, ui) {
    const sw = R.activeSword(S);
    const noSword = !ui.view && !sw;
    $('#stageEmpty').hidden = !noSword;
    if (noSword) return renderNoSwordCard(S);
    // 강화 연출 중(ui.view)에는 시도 직전 확률·게이지·특성을 보여 준다(결과·새 각인이 미리 드러나지 않게). 파괴 연출 중엔 sw가 null이다
    const view = ui.view || { lv: sw.lv, chances: R.currentChances(S), gauge: R.gaugeInfo(S, sw.lv), trait: sw.trait };
    const l = view.lv;
    const c = view.chances;
    const rar = R.rarity(l);
    const isMax = l >= C.MAX;

    $('#rarity').hidden = false;
    $('#rarity').textContent = rar.name;
    $('#rarity').style.color = rar.color;
    renderSwordTitle(S, sw, l, view.trait || null);
    $('#swordName').style.color = l >= C.DROP_FROM ? rar.color : '';
    document.documentElement.style.setProperty('--tier', C.SWORDS[l].g || DEFAULT_TIER);
    if (renderedLevel !== l) {
      $('#sword').innerHTML = FX.swordSVG(l, 'main');
      $('#sword').classList.toggle('mythic', isMax);
      renderedLevel = l;
    }

    $('#vSucc').textContent = isMax ? '-' : c.succ + '%';
    const gaugeLine = $('#gaugeLine');
    gaugeLine.hidden = !view.gauge;
    setHTML(gaugeLine, view.gauge ? gaugeHTML(view.gauge) : '');
    $('#vDest').textContent = isMax ? '-' : c.dest + '%';
    $('#vCost').textContent = isMax ? '-' : fmt(R.cost(l));
    // 판매 지급 미리보기(상인 특성·인장 포함, 실제 지급과 같은 함수). 단계와 특성을 같은 view에서 읽어
    // 연출 중에도 시도 직전 단계의 가격에 새 각인이 섞이지 않는다(파괴 연출 중 sw가 없어도 같은 값)
    $('#vSell').textContent = fmt(R.payoutPreview(S, R.sell(l), { trait: view.trait || null }));
    const protWarn = !ui.view && !isMax && C.DESTROY[l] > 0 && sw.prot <= 0;
    $('#destWarn').hidden = !protWarn;

    setHTML($('#breakdown'), isMax ? '' : breakdownHTML(c));
    setHTML($('#oddsSplit'), isMax ? '' : oddsSplitHTML(l, c));
    const pity = c.parts ? c.parts.pity : 0;
    const pityMax = C.PITY_MAX[R.pityBand(Math.min(l, C.MAX - 1))];
    setHTML($('#pityLine'), pity > 0
      ? `<span>보정 +${pity}%p (최대 ${pityMax})</span><span class="bar"><i style="width:${Math.round(pity / pityMax * 100)}%"></i></span>`
      : '');
    $('#note').textContent = noteText(l, c, R.effectiveUse(S));
    renderIncomeNote(S);
  }

  // ============================================================ 소모품 트레이
  const TRAY_ROW = {
    bless: S => ({
      title: `${ic('bless')} ${C.ITEMS.bless.name} <span class="muted">보유 ${S.inv.bless}</span><span class="tag">+${C.BLESS_BONUS}%p</span>`,
      sub: '이번 강화 성공 확률 증가 · 사용 시 소모',
    }),
    anvil: S => {
      const a = R.equippedAnvil(S);
      if (!a) return { title: `${ic('anvil')} 모루 <span class="muted">장착 없음</span>`, sub: '성공 확률 증가 · 시도마다 내구도 -1' };
      const guard = E.eventValue(S, 'anvil');
      return {
        title: `${ic('anvil_' + a.g)} ${C.ITEMS['anvil_' + a.g].name} <span class="muted">내구 ${a.dura}/${C.ANVIL_DURA[a.g]}</span><span class="tag">+${C.ANVIL_BONUS[a.g]}%p</span>` +
          (guard > 0 ? `<span class="tag">${EVENT_TEXT.guard} ${guard}%</span>` : ''),
        sub: '성공 확률 증가 · 시도마다 내구도 -1',
      };
    },
    protect: (S, sw) => {
      const dots = '●'.repeat(sw.prot) + '○'.repeat(C.PROTECT_USES - sw.prot);
      return {
        title: `${ic('protect')} ${C.ITEMS.protect.name} <span class="muted">보유 ${S.inv.protect}장</span>`,
        sub: `이번 단계 보호 남은 횟수 <span class="dots">${dots}</span> · ${R.protectNeed(sw.lv)}장 필요 · 발동 시 소모`,
      };
    },
    keepdown: S => ({
      title: `${ic('keepdown')} ${C.ITEMS.keepdown.name} <span class="muted">보유 ${S.inv.keepdown}</span>`,
      sub: '실패해도 하락하지 않음 · 발동 시 소모',
    }),
    sure: S => ({
      title: `${ic('sure')} ${C.ITEMS.sure.name} <span class="muted">보유 ${S.inv.sure}</span>`,
      sub: '성공 100% · 파괴 0% · 사용 시 소모',
    }),
  };
  // 행을 아예 숨기는 조건(그 외 무효 행은 회색 + 사유)
  const TRAY_HIDE = {
    protect: (S, sw) => !sw || C.DESTROY[sw.lv] <= 0 || sw.lv >= C.MAX,
    anvil: S => !R.isUnlocked(S, 'forge'),
  };

  function renderTray(S, ui) {
    const sw = R.activeSword(S);
    const tray = R.trayState(S);
    const rows = C.TRAY_TOGGLES.filter(id => !(TRAY_HIDE[id] && TRAY_HIDE[id](S, sw))).map(id => {
      const t = tray[id];
      const row = TRAY_ROW[id](S, sw);
      const reason = t.block ? TRAY_REASON[t.block](sw) : (CAP_NOTE[R.bonusCapNote(S, id)] || '');
      const bad = BAD_REASONS.includes(t.block);
      return `<label class="opt ${t.block ? 'off' : ''}">
        <input type="checkbox" data-change="tray" data-id="${id}" ${t.on ? 'checked' : ''} ${t.block || ui.busy ? 'disabled' : ''}>
        <div>${row.title}<small>${row.sub}</small>${reason ? `<small class="reason ${bad ? 'bad' : ''}">${reason}</small>` : ''}</div>
      </label>`;
    });
    setHTML($('#tray'), rows.join(''));
  }

  // ============================================================ 액션 버튼 / 자동 토글
  /** 강화·판매 버튼: 활성 검이 없으면 둘 다 막는다(단축키는 규칙·컨트롤러에서 무시) */
  function renderEnhanceSell(S, ui, now) {
    const sw = R.activeSword(S);
    const enh = $('#btnEnhance');
    const sellBtn = $('#btnSell');
    if (!sw) {
      enh.disabled = true;
      enh.firstChild.textContent = '강화할 검을 선택하세요';
      $('#enhanceSub').textContent = 'Space';
      sellBtn.disabled = true;
      sellBtn.firstChild.textContent = '판매';
      return;
    }
    const l = sw.lv;
    const isMax = l >= C.MAX;
    enh.disabled = ui.busy || isMax || now < ui.nextEnhanceAt;
    enh.firstChild.textContent = isMax ? '최대 강화' : `강화하기 (${fmt(R.cost(l))})`;
    const noProtect = !isMax && C.DESTROY[l] > 0 && sw.prot <= 0;
    $('#enhanceSub').textContent = noProtect ? 'Space · 보호 없음' : 'Space';
    sellBtn.disabled = ui.busy || l === 0;
    sellBtn.firstChild.textContent = isArmed(ui, 'sell:' + sw.id, now) ? '정말 판매?' : '판매';
  }

  function renderActions(S, ui, now) {
    renderEnhanceSell(S, ui, now);

    const huntBtn = $('#btnHunt');
    huntBtn.disabled = now < ui.huntUntil;
    huntBtn.firstChild.textContent = `사냥 +${fmt(I.manualHuntGold(S, now))}`;
    const huntShare = traitShare(S, 'hunt');
    $('#huntSub').textContent = huntShare ? `H · ${huntShare}` : 'H';

    if (!I.autoUnlocked(S)) {
      setHTML($('#autoRow'), `<span>${ic('lock')} ${ic('auto')} 자동 사냥 — 최고 강화 +${C.AUTO_UNLOCK_BEST} 달성 시 해금</span>`);
      return;
    }
    const status = S.idle.autoOn
      ? withShare(`다음 ${until(ui.nextAutoAt)} · 1회 +${fmt(I.autoRunGold(S, now))}G`, traitShare(S, 'work'))
      : '꺼짐';
    setHTML($('#autoRow'), `<label class="switch"><input type="checkbox" data-change="auto" ${S.idle.autoOn ? 'checked' : ''}> ${ic('auto')} 자동</label><span>${status}</span>`);
  }

  // ============================================================ 탭 패널
  function shopRowHTML(S, entry, now) {
    const item = C.ITEMS[entry.id];
    const unlocked = R.shopUnlocked(S, entry);
    const block = R.shopBlock(S, entry.id, now);
    const own = item.kind === 'anvil' ? `(${S.anvils.length}/${C.ANVIL_OWN_MAX})` : `(${S.inv[entry.id]})`;
    let desc = item.kind === 'anvil'
      ? `성공 확률 +${C.ANVIL_BONUS[item.g]}%p · 내구 ${C.ANVIL_DURA[item.g]} · 대장간에서 장착`
      : item.desc;
    if (entry.action === 'boost') {
      desc += ' · 구매 즉시 적용';
      if (R.boostRemainingMs(S, now) > 0) desc += ` · 남은 시간 ${until(S.idle.boostUntil)}`;
    }
    const label = unlocked ? `${fmt(R.shopPrice(S, entry.id))}G` : `${ic('lock')} +${entry.unlockBest}`;
    return `<div class="shop-item">
      <div class="shop-icon">${ic(entry.id)}</div>
      <div class="shop-text">${item.name} <span class="muted">${entry.action === 'boost' ? '' : own}</span><small>${desc}</small></div>
      <button class="buy" data-act="buy" data-id="${entry.id}" ${block ? 'disabled' : ''}>${label}</button></div>`;
  }

  function renderShop(S, now) {
    const rows = C.SHOP_ITEMS.map(e => shopRowHTML(S, e, now));
    const full = S.swords.length >= S.slots;
    rows.push(`<div class="shop-item"><div class="shop-icon">${ic('sword')}</div>
      <div class="shop-text">새 검 (+0) <span class="muted">(${S.swords.length}/${S.slots})</span><small>빈 칸에 +0 검을 추가합니다</small></div>
      <button class="buy ${full || S.gold < C.NEW_SWORD_PRICE ? 'poor' : ''}" data-act="buySword">${fmt(C.NEW_SWORD_PRICE)}G</button></div>`);
    const expand = R.expandCost(S);
    if (expand !== null) {
      rows.push(`<div class="shop-item"><div class="shop-icon">${ic('lock')}</div>
        <div class="shop-text">보관함 칸 확장 <span class="muted">(${S.slots}/${C.SLOT_MAX})</span><small>검을 한 자루 더 보관할 수 있습니다</small></div>
        <button class="buy" data-act="expand" ${S.gold < expand ? 'disabled' : ''}>${fmt(expand)}G</button></div>`);
    }
    return rows.join('');
  }

  function anvilRowHTML(S, a) {
    const name = C.ITEMS['anvil_' + a.g].name;
    const max = C.ANVIL_DURA[a.g];
    const equipped = a.id === S.anvilEq;
    const repair = F.repairCost(a);
    const repairBtn = repair
      ? `<button class="small-btn" data-act="repair" data-id="${a.id}" ${F.repairBlock(S, a.id) ? 'disabled' : ''}>수리 ${costHTML(S, repair)}</button>`
      : '';
    return `<div class="row"><div class="shop-icon">${ic('anvil_' + a.g)}</div>
      <div class="shop-text">${name} ${equipped ? '<span class="badge info">장착 중</span>' : ''} ${a.dura <= 0 ? '<span class="badge bad">파손</span>' : ''}
        <small>내구 ${a.dura}/${max} · 성공 +${C.ANVIL_BONUS[a.g]}%p</small>
        <div class="dura-bar ${a.dura <= 0 ? 'broken' : ''}"><i style="width:${Math.round(a.dura / max * 100)}%"></i></div></div>
      <div class="btn-col"><button class="small-btn" data-act="equip" data-id="${a.id}" ${equipped ? 'disabled' : ''}>${equipped ? '장착됨' : '장착'}</button>${repairBtn}</div></div>`;
  }

  /**
   * 2회 클릭으로 사는 골드 사용처 버튼(특성 관리·기념비). 확인 키는 main.js와 같은 `${act}:${id}`.
   * 막혔거나(block 사유) 강화 연출 중이면 비활성
   */
  function sinkButtonHTML(ui, now, o) {
    const armed = isArmed(ui, `${o.act}:${o.id}`, now);
    const price = `<span class="${o.block === 'noGold' ? 'lack' : ''}">${fmt(o.price)}G</span>`;
    return `<button class="small-btn gold ${armed ? 'armed' : ''}" data-act="${o.act}" data-id="${o.id}" ${o.block || ui.busy ? 'disabled' : ''}>
      ${armed ? `${SINK_TEXT.confirm} · ${price}` : `${o.label} ${price}`}</button>`;
  }
  /** 사용처 버튼 아래 한 줄 사유(잠김 > 골드 부족한 버튼 이름). 최고 등급은 버튼 글자로 보인다. buttons: [{ label, block }] */
  function sinkReasonHTML(buttons) {
    if (buttons.some(b => b.block === 'locked')) return `<p class="panel-note sink-reason">${ic('lock')} ${SINK_TEXT.locked}</p>`;
    const poor = buttons.filter(b => b.block === 'noGold').map(b => b.label);
    return poor.length ? `<p class="panel-note sink-reason">${poor.join('·')}: ${SINK_TEXT.noGold}</p>` : '';
  }

  /** 대장간 탭 "각인" 섹션: 활성 검의 특성·효과와 종류 변경·등급 올리기(best ≥ 13, m2-traits §8·§11) */
  function traitPanelHTML(S, ui, now) {
    const head = '<h3 class="sub-title">각인 · 활성 검</h3>';
    const foot = `<p class="panel-note">${TRAIT_NO_ODDS_TEXT}.</p>`;
    const sw = R.activeSword(S);
    if (!sw) return `${head}<p class="panel-note">${NO_ACTIVE_TEXT}.</p>${foot}`;
    if (!sw.trait) return `${head}<p class="panel-note">${swordName(sw.lv)} · 특성 없음 — +${C.TRAIT_ROLL_LV} 이상이 되면 무료로 각인됩니다.</p>${foot}`;
    const incomeBadge = isIncomeSword(S, sw) ? ' <span class="badge good">수입 검</span>' : '';
    const info = `<div class="row"><div class="shop-icon">${traitChipHTML(sw.trait)}</div>
      <div class="shop-text">${traitName(sw.trait)}${incomeBadge}<small>${swordName(sw.lv)} · ${traitLineText(S, sw, sw.trait)}</small></div></div>`;
    const rekind = { act: 'traitRekind', id: sw.id, label: '종류 변경', price: R.traitRekindCost(S), block: R.rerollKindBlock(S, sw.id) };
    // 최고 등급을 잠금보다 먼저 본다: 잠긴 동안 upgradeTierBlock은 'locked'이고 3등급 가격은 null이다(V7)
    const atMaxTier = sw.trait.t >= C.TRAIT_TIER_MAX;
    const tierUp = atMaxTier ? null
      : { act: 'traitTierUp', id: sw.id, label: '등급 올리기', price: R.traitTierUpCost(S, sw.trait.t), block: R.upgradeTierBlock(S, sw.id) };
    const tierUpButton = atMaxTier
      ? `<button class="small-btn" disabled>${SINK_TEXT.maxTier}</button>`
      : sinkButtonHTML(ui, now, tierUp);
    const incomeCount = R.incomeSwords(S).length;
    const incomeNote = `<p class="panel-note">수입 검: 보관함 최고 +${R.topLv(S)} ${incomeCount}자루 — 약탈자·일꾼·광부는 이 검들 중 가장 높은 값만 적용</p>`;
    return `${head}${info}<div class="sink-btns">${sinkButtonHTML(ui, now, rekind)}${tierUpButton}</div>` +
      `${sinkReasonHTML(tierUp ? [rekind, tierUp] : [rekind])}${incomeNote}${foot}`;
  }

  function renderForge(S, ui, now) {
    const anvils = S.anvils.length
      ? S.anvils.map(a => anvilRowHTML(S, a)).join('')
      : '<p class="panel-note">보유한 모루가 없습니다. 상점에서 구매하거나 제작하세요.</p>';
    const craft = F.GRADES.map(g => {
      const block = F.craftBlock(S, g);
      return `<div class="row"><div class="shop-icon">${ic('anvil_' + g)}</div>
        <div class="shop-text">${C.ITEMS['anvil_' + g].name}<small>성공 +${C.ANVIL_BONUS[g]}%p · 내구 ${C.ANVIL_DURA[g]}</small><small>${costHTML(S, F.craftCost(g))}</small></div>
        <button class="small-btn" data-act="craft" data-id="${g}" ${block ? 'disabled' : ''}>${block === 'full' ? '보유 한도' : '제작'}</button></div>`;
    }).join('');
    const oreEvent = eventPctText(S, 'ore');
    const oreEventTag = oreEvent ? ` <span class="ev-up" title="${C.EVENTS.ore.name}">${oreEvent}</span>` : '';
    const ores = C.ORES.map(k => F.oreUnlocked(S, k)
      ? `<div>${ic(k)} ${C.ORE_NAMES[k]}<b>${fmt(S.ore[k])}</b><small>사냥당 +${rateText(F.orePerHunt(S, k))}${oreEventTag}</small></div>`
      : `<div class="muted">${ic('lock')} ${C.ORE_NAMES[k]}<b>-</b><small>최고 +${C.ORE_UNLOCK_LV[k]} 달성 시</small></div>`).join('');
    const oreShare = traitShare(S, 'ore');
    const minerNote = oreShare ? `<p class="panel-note">사냥당 광석 ${oreShare} 적용 중</p>` : '';
    const shardNote = S.shards > 0 ? '' : '<p class="panel-note">검이 파괴되면 파편을 얻습니다.</p>';
    const exchange = `<h3 class="sub-title">파편 교환 · 보유 ${ic('shard')} ${fmt(S.shards)}</h3>${shardNote}` +
      Object.keys(C.SHARD_COST).map(id => {
        const item = C.ITEMS[id];
        const own = item.kind === 'anvil' ? `(${S.anvils.length}/${C.ANVIL_OWN_MAX})` : `(${S.inv[id]})`;
        return `<div class="row"><div class="shop-icon">${ic(id)}</div><div class="shop-text">${item.name} <span class="muted">${own}</span></div>
          <button class="buy" data-act="exchange" data-id="${id}" ${R.exchangeBlock(S, id) ? 'disabled' : ''}>${ic('shard')} ${C.SHARD_COST[id]}</button></div>`;
      }).join('');
    return `${traitPanelHTML(S, ui, now)}
      <h3 class="sub-title">모루 (${S.anvils.length}/${C.ANVIL_OWN_MAX})</h3>${anvils}
      <h3 class="sub-title">제작</h3>${craft}
      <h3 class="sub-title">광석</h3><div class="ore-grid">${ores}</div>${minerNote}${exchange}`;
  }

  function questCardHTML(S, ui, q, i, now) {
    const tier = C.QUEST_TIERS[i];
    const badge = `<span class="badge tier-${tier}">${TIER_NAME[tier]}</span>`;
    if (!q) return `<div class="quest"><div class="q-head">${badge} 새 의뢰 준비 중</div><div class="q-sub">다음 의뢰까지 ${until(S.quests.readyAt[i])}</div></div>`;
    const cand = Q.candidate(S, q);
    const sealOn = R.sealActive(S);
    // 지급 미리보기: 후보 검의 상인 특성 → 인장 순서(실제 지급과 같은 함수, AC 52)
    const gold = R.payoutPreview(S, q.gold, cand);
    const merchant = R.traitValue(cand, 'trade');
    const bonus = `${merchant > 0 ? ` (${C.TRAITS.trade.name} +${merchant}%)` : ''}${sealOn ? ` (인장 ×${C.SEAL_MULT})` : ''}`;
    const reward = `${ic('gold')} ${fmt(gold)}G${bonus}${q.item ? ' + ' + itemLabel(q.item.id, q.item.n) : ''}`;
    const have = S.swords.map(s => '+' + s.lv).join(', ');
    let sub;
    if (!cand) sub = `<span class="lack">보유 검 없음 · +${q.lv} 필요</span> · 가진 검: ${have}`;
    else if (cand.id === S.active) sub = '활성 검만 해당됩니다 — 한 번 더 눌러 확인';
    else sub = `보관함의 +${q.lv} 검을 납품합니다 (판매가 ${fmt(R.payoutPreview(S, R.sell(q.lv), cand))}G)`;
    const armed = isArmed(ui, 'deliver:' + i, now);
    const rerollCost = Q.rerollCost(S);
    // 의뢰소 특가 중에는 rerollCost가 이미 할인 가격이다(차감도 같은 함수)
    const deal = E.eventValue(S, 'quest') > 0 ? ` <span class="badge good">${EVENT_TEXT.deal}</span>` : '';
    return `<div class="quest"><div class="q-head">${badge} 요구: ${swordName(q.lv)}</div>
      <div class="q-reward">${reward}</div><div class="q-sub">${sub}</div>
      <div class="q-btns">
        <button class="small-btn ${armed ? 'armed' : ''}" data-act="deliver" data-id="${i}" ${!cand || ui.busy ? 'disabled' : ''}>${armed ? '정말 납품?' : `${ic('deliver')} 납품`}</button>
        <button class="small-btn gold" data-act="reroll" data-id="${i}" ${Q.rerollBlock(S, i) ? 'disabled' : ''}>새로고침 ${fmt(rerollCost)}G${deal}</button>
      </div></div>`;
  }

  function renderQuests(S, ui, now) {
    return S.quests.list.map((q, i) => questCardHTML(S, ui, q, i, now)).join('') +
      `<p class="panel-note">요구 단계와 정확히 같은 검만 납품할 수 있습니다. 납품한 칸은 ${C.QUEST_COOLDOWN_SEC / 60}분 뒤 새 의뢰가 옵니다.</p>`;
  }

  function renderIdle(S, ui, now) {
    const lv = R.topLv(S);
    const oreEvent = eventPctText(S, 'ore');
    const ores = withShare(withShare(F.unlockedOres(S).map(k => `${ic(k)}+${rateText(F.orePerHunt(S, k))}`).join(' '), traitShare(S, 'ore')),
      oreEvent ? `${oreEvent}(${C.EVENTS.ore.name})` : '');
    const gold = withShare(`+${fmt(I.autoRunGold(S, now))}G`, traitShare(S, 'work'));
    const status = `<div class="row"><div class="shop-icon">${ic('auto')}</div>
      <div class="shop-text">자동 사냥 ${S.idle.autoOn ? '<span class="badge good">ON</span>' : '<span class="badge">OFF</span>'}
        <small>${I.autoInterval(S) / 1000}초마다 ${gold} ${ores} · 기준: 보관함 최고 +${lv}</small></div>
      <button class="small-btn" data-act="toggleAuto">${S.idle.autoOn ? '끄기' : '켜기'}</button></div>`;
    const ups = C.UPGRADES.map(u => {
      const n = S.idle.up[u.id];
      const price = I.nextUpgradeCost(S, u.id);
      const effect = price === null ? UP_EFFECT[u.id](n) : `${UP_EFFECT[u.id](n)} → ${UP_EFFECT[u.id](n + 1)}`;
      return `<div class="row"><div class="shop-text">${u.name} <span class="muted">Lv ${n}/${C.UP_MAX}</span><small>${effect}</small></div>
        <button class="buy" data-act="upgrade" data-id="${u.id}" ${I.upgradeBlock(S, u.id) ? 'disabled' : ''}>${price === null ? 'MAX' : fmt(price) + 'G'}</button></div>`;
    }).join('');
    const boostLeft = R.boostRemainingMs(S, now);
    const booster = `<div class="row"><div class="shop-icon">${ic('booster')}</div>
      <div class="shop-text">${C.ITEMS.booster.name} <span class="muted">보유 ${S.inv.booster}</span>
        <small>${boostLeft > 0 ? `적용 중 · 남은 시간 ${until(S.idle.boostUntil)}` : `사용 시 ${C.BOOSTER_DURATION_MIN}분간 골드 ×${C.BOOSTER_MULT}`} (최대 ${C.BOOSTER_MAX_MIN}분)</small></div>
      <button class="small-btn" data-act="useBooster" ${S.inv.booster <= 0 || !R.canExtendBoost(S, now) ? 'disabled' : ''}>사용</button></div>`;
    return `<h3 class="sub-title">자동 사냥</h3>${status}<h3 class="sub-title">업그레이드</h3>${ups}
      <h3 class="sub-title">부스터</h3>${booster}
      <p class="panel-note">자동 사냥을 켠 채 떠나 있으면 최대 ${I.offlineCapH(S)}시간까지 ${Math.round(C.OFFLINE_EFF * 100)}% 효율로 적립됩니다 (${C.OFFLINE_MIN_SEC}초 이상 비웠을 때).</p>`;
  }

  const PANEL = {
    shop: (S, ui, now) => renderShop(S, now),
    forge: (S, ui, now) => renderForge(S, ui, now),
    quests: (S, ui, now) => renderQuests(S, ui, now),
    idle: (S, ui, now) => renderIdle(S, ui, now),
  };

  function tabUnlocked(S, tab) { return !tab.unlock || R.isUnlocked(S, tab.unlock); }

  /** 탭 알림 표시: 개수 배지(있고 1 이상) 또는 점 */
  function tabMarkHTML(S, id) {
    const count = TAB_COUNT[id] ? TAB_COUNT[id](S) : 0;
    if (count > 0) return `<span class="tab-count">${count}</span>`;
    return TAB_DOT[id] && TAB_DOT[id](S) ? '<span class="dot"></span>' : '';
  }

  function renderTabs(S, ui, now, env) {
    setHTML($('#tabbar'), TABS.map(t => {
      const locked = !tabUnlocked(S, t);
      return `<button class="tab-btn ${ui.tab === t.id ? 'on' : ''}" data-act="tab" data-id="${t.id}">
        <span class="ti">${locked ? ic('lock') : ic(t.id)}</span>${t.name}${locked ? '' : tabMarkHTML(S, t.id)}</button>`;
    }).join(''));
    TABS.forEach(t => {
      const panel = document.querySelector(`[data-panel="${t.id}"]`);
      panel.hidden = ui.tab !== t.id;
      if (!PANEL[t.id]) return;
      // 숨겨진 탭도 매번 갱신해 상태가 항상 최신이도록 한다
      const body = panel.querySelector('.panel-body');
      setHTML(body, tabUnlocked(S, t) ? PANEL[t.id](S, ui, now) : lockedHTML(C.UNLOCK[t.unlock], t.desc));
    });
    setHTML($('#statsGrid'), STATS.map(([k, f]) => `<div><span>${k}</span><b>${f(S)}</b></div>`).join(''));
    setHTML($('#masteryList'), masteryRowsHTML(S));
    renderMonuments(S, ui, now);
    renderRecords(S, ui, now, env);
  }

  // ============================================================ 단계 기념비 (장식, m2-overview §C.3)
  const MONUMENT_LEVELS = C.SWORDS.map((_, L) => L).filter(L => R.monumentIndex(L) >= 0);
  const monumentOwned = (S, L) => !!S.monuments[R.monumentIndex(L)];
  /** 보유한 가장 높은 단계(없으면 null) — 머리글 배지·대표 기념비 */
  const topMonument = S => MONUMENT_LEVELS.filter(L => monumentOwned(S, L)).pop() || null;

  function monumentCellHTML(S, ui, now, L) {
    const name = C.SWORDS[L].n;
    const price = R.monumentCost(L);
    const block = R.monumentBlock(S, L);
    if (block === 'owned') {
      return `<div class="mon owned"><b>${ic('monument')} +${L}</b><small>${name}</small><span class="badge good">보유</span></div>`;
    }
    if (block === 'notReached') {
      return `<div class="mon locked"><b>${ic('lock')} +${L}</b><small>최고 +${L} 달성 시</small><small>${fmt(price)}G</small></div>`;
    }
    return `<div class="mon"><b>${ic('monument')} +${L}</b><small>${name}</small>
      ${sinkButtonHTML(ui, now, { act: 'buyMonument', id: L, label: '세우기', price, block })}</div>`;
  }

  /** 기록 탭 기념비 8칸(잠김/구매 가능/보유) + 대표 기념비 줄, 머리글 배지 */
  function renderMonuments(S, ui, now) {
    const top = topMonument(S);
    const owned = MONUMENT_LEVELS.filter(L => monumentOwned(S, L)).length;
    $('#monumentCount').textContent = `(${owned} / ${MONUMENT_LEVELS.length})`;
    const lead = `<p class="panel-note mon-lead">${top ? `대표 기념비: ${ic('monument')} ${monumentTitle(top)} · ` : ''}${SINK_TEXT.monumentNote}</p>`;
    const reason = sinkReasonHTML(MONUMENT_LEVELS.map(L => ({ label: `+${L}`, block: R.monumentBlock(S, L) })));
    setHTML($('#monumentList'), `${lead}<div class="mon-grid">${MONUMENT_LEVELS.map(L => monumentCellHTML(S, ui, now, L)).join('')}</div>${reason}`);
    const badge = $('#monumentBadge');
    badge.hidden = !top;
    setHTML(badge, top ? `${ic('monument')} +${top}` : '');
    badge.title = top ? `대표 기념비: ${monumentTitle(top)}` : '';
  }

  /** 기록 탭: 단계별 성공 숙련 `+16 숙련 +6%p (2/4)`. 이름·횟수 조각은 CSS가 줄바꿈하지 않는다(좁은 2열에서 조각 사이만 줄바꿈) */
  function masteryRowsHTML(S) {
    return C.MASTERY_REC_MAX.map((max, i) => {
      const lv = C.MASTERY_FROM + i;
      const count = S.mastery[i];
      return `<li><span class="m-label">${decoIc('mastery')} +${lv} 숙련</span> <b>+${R.masteryBonus(lv, count)}%p</b> <span class="muted m-count">(${count}/${max})</span></li>`;
    }).join('');
  }

  // ============================================================ 일일 과제·업적·칭호 (F12, m2-achievements §12)
  // 일일 과제 한 줄 설명(§8.2). F4 의뢰와 섞이지 않게 '의뢰'·'퀘스트'라 쓰지 않는다(§2)
  const DAILY_TEXT = {
    hunt_s: n => `수동 사냥 ${fmt(n)}회`,
    auto_s: n => `자동 사냥 ${fmt(n)}회 실행`,
    tries_s: n => `강화 ${fmt(n)}회 시도`,
    succ_m: n => `강화 ${fmt(n)}회 성공`,
    gold_m: n => `사냥 골드 ${fmt(n)}G 벌기`,
    sell_m: n => `검(+${C.SELL_COUNT_MIN_LV} 이상) ${fmt(n)}자루 팔기`,
    craft_m: n => `모루 ${fmt(n)}개 제작`,
    dlv_l: n => `납품하기 ${fmt(n)}회`,
    hunt_l: n => `수동 사냥 ${fmt(n)}회`,
    tries_l: n => `강화 ${fmt(n)}회 시도`,
  };
  const DAILY_TEXT_LOCKED = '매일 새벽 4시에 새 과제 3개가 도착합니다';
  const DAILY_TEXT_WAITING = '오늘의 일일 과제가 아직 없습니다. 다음 갱신 때 도착합니다.';
  // 업적 조건 문장: 지표별(§5)
  const ACH_COND = {
    tries: n => `강화 ${fmt(n)}회 시도`,
    success: n => `강화 ${fmt(n)}회 성공`,
    best: n => `최고 +${n} 달성`,
    destroy: n => `검 파괴 ${fmt(n)}회`,
    hunts: n => `수동 사냥 ${fmt(n)}회`,
    delivered: n => `납품 ${fmt(n)}회`,
    sinkGold: n => `특성 관리·기념비에 ${fmt(n)}G 사용`,
    traitRolls: n => `특성 각인 ${fmt(n)}회 (종류 변경 포함)`,
    traitKindCount: n => `보관함에 서로 다른 특성 ${n}종`,
    monumentCount: n => `기념비 ${n}개 세우기`,
    dailyDone: n => `일일 과제 보상 ${fmt(n)}회 받기`,
    hasPerfectTrait: () => `${C.TRAIT_TIER_NAME[C.TRAIT_TIER_MAX - 1]} 등급 특성 검 보유`,
  };
  const ACH_TRACK_NAME = {
    tries: '강화 시도', succ: '강화 성공', best: '최고 단계', dest: '파괴', hunt: '수동 사냥', dlv: '납품',
    sink: '골드 사용', trt: '각인', knd: '특성 수집', mon: '기념비', day: '일일 과제', perfect: '완벽한 각인',
  };
  const ACH_TRACKS = [...new Set(C.ACHIEVEMENTS.map(a => a.track))];
  const TIER_ROMAN = ['I', 'II', 'III'];
  // 상태를 색만으로 구분하지 않는다(§12.3): 모든 상태에 글자를 함께 둔다
  const CLAIM_STATE_TEXT = { progress: '진행 중', claimed: '✔ 받음' };
  const ACH_STATUS = { 0: 'locked', [C.ACH_REACHED]: 'ready', [C.ACH_CLAIMED]: 'claimed' };
  const ACH_CHIP_TEXT = { locked: '진행 중', ready: '받기 가능', claimed: '받음' };
  const NEW_DAILY_TEXT = '새 일일 과제가 도착했습니다';

  /** 지금 칭호 이름(없으면 '') */
  const titleName = S => (S.title && R.hasOwn(C.ACH_BY_ID, S.title) ? C.ACH_BY_ID[S.title].title : '');
  /** 보상 요약 "+2,680G · 파편 39 · 철광석 40 · 칭호 「…」"(0인 항목 생략). icon(id): 항목 앞에 붙일 글자(토스트는 없음) */
  function rewardSummary(r, icon = () => '') {
    const parts = [];
    if (r.gold > 0) parts.push(`+${fmt(r.gold)}G`);
    if (r.shards > 0) parts.push(`${icon('shard')}파편 ${fmt(r.shards)}`);
    Object.keys(r.ore).filter(k => r.ore[k] > 0).forEach(k => parts.push(`${icon(k)}${C.ORE_NAMES[k]} ${fmt(r.ore[k])}`));
    if (r.title) parts.push(`칭호 「${r.title}」`);
    return parts.join(' · ');
  }
  const iconBefore = id => `${ic(id)} `;
  const rewardHTML = r => `<span class="reward-text">${rewardSummary(r, iconBefore)}</span>`;
  const progBarHTML = (cur, goal) => `<div class="prog-bar"><i style="width:${Math.round(Math.min(1, cur / goal) * 100)}%"></i></div>`;
  const progNumHTML = (cur, goal) => `<span class="prog-num">${fmt(cur)}/${fmt(goal)}</span>`;
  /** 달성·미수령이면 받기 버튼, 아니면 상태 글자 */
  const claimStateHTML = (status, act, id) => (status === 'ready'
    ? `<button class="small-btn gold claim-btn" data-act="${act}" data-id="${id}">받기</button>`
    : `<span class="claim-state">${CLAIM_STATE_TEXT[status]}</span>`);
  const MIN_PER_HOUR = 60;
  /** "HH:MM"(분 내림, 23:59를 넘지 않음) */
  function fmtHourMin(ms) {
    const min = Math.min(C.DAY_MS / MS_PER_MIN - 1, Math.floor(Math.max(0, ms) / MS_PER_MIN));
    const pad = v => String(v).padStart(2, '0');
    return `${pad(Math.floor(min / MIN_PER_HOUR))}:${pad(min % MIN_PER_HOUR)}`;
  }
  const sectionHead = (title, side) => `<div class="sec-head"><h2>${title}</h2>${side}</div>`;

  function dailyCardHTML(S, slot) {
    const task = S.daily.tasks[slot];
    const status = A.dailyStatus(S, slot);
    const cur = A.dailyProgress(S, slot);
    return `<div class="daily-card ${status}" data-slot="${slot}">
      <div class="rec-line"><span class="daily-stars">${'★'.repeat(slot + 1)}</span><b class="daily-desc">${DAILY_TEXT[task.e](task.goal)}</b></div>
      ${progBarHTML(cur, task.goal)}
      <div class="rec-line">${progNumHTML(cur, task.goal)}${rewardHTML(A.dailyRewardPreview(S, slot))}${claimStateHTML(status, 'claimDaily', slot)}</div></div>`;
  }
  function dailyBonusHTML(S) {
    const status = A.dailyStatus(S, A.BONUS);
    const done = S.daily.tasks.filter((_, slot) => A.dailyDone(S, slot)).length;
    const side = status === 'progress'
      ? `<span class="claim-state">${done}/${C.DAILY_TASKS} 달성</span>`
      : claimStateHTML(status, 'claimDaily', A.BONUS);
    return `<div class="daily-bonus ${status}"><span class="reward-text">오늘 ${C.DAILY_TASKS}개 모두 달성: 보너스 ${rewardSummary(A.dailyRewardPreview(S, A.BONUS), iconBefore)}</span>${side}</div>`;
  }
  /**
   * 일일 과제 섹션: 잠김 / 세트 없음 안내 / 카드 3장 + 보너스. 남은 시간 글자는 넣지 않는다:
   * 분마다 바뀌는 글자가 섹션 HTML에 있으면 섹션 전체를 다시 그려 받기 버튼의 포커스·클릭이 끊기므로 renderDailyCountdown이 따로 쓴다
   */
  function dailySectionHTML(S) {
    if (S.best < C.DAILY_UNLOCK_BEST) {
      return sectionHead('일일 과제', '') + lockedBoxHTML(`최고 +${C.DAILY_UNLOCK_BEST} 이상에서 열림`, DAILY_TEXT_LOCKED);
    }
    const head = sectionHead('일일 과제', `<span class="muted daily-reset">다음 갱신까지 <span class="daily-left"></span></span>`);
    if (!A.hasDailySet(S)) return `${head}<p class="panel-note daily-wait">${DAILY_TEXT_WAITING}</p>`;
    return `${head}<div class="daily-list">${S.daily.tasks.map((_, slot) => dailyCardHTML(S, slot)).join('')}</div>${dailyBonusHTML(S)}`;
  }
  /** 다음 갱신까지 HH:MM만 쓴다(바뀔 때만). refreshDaily와 같은 시계·시간대(env). 잠김이면 자리가 없다 */
  function renderDailyCountdown(now, env) {
    const el = $('#dailySection').querySelector('.daily-left');
    if (!el) return;
    const text = fmtHourMin(A.msToNextDay(now, env.tzOffsetMin(now)));
    if (el.textContent !== text) el.textContent = text;
  }

  /** 업적 한 행: 잠김(막대·진행 중) / 달성(강조·받기) / 수령 완료(✔ 받음·칭호) */
  function achRowHTML(S, a, single) {
    const status = ACH_STATUS[A.achState(S, a.id)];
    const tier = single ? '' : `<span class="ach-tier">${TIER_ROMAN[a.tier - 1]}</span>`;
    const head = `<div class="rec-line"><b class="ach-name">${a.name}</b>${tier}<small class="ach-cond">${ACH_COND[a.metric](a.need)}</small></div>`;
    if (status === 'claimed') {
      return `<div class="ach-row claimed" data-ach="${a.id}">${head}
        <div class="rec-line"><span class="reward-text">칭호 「${a.title}」</span>${claimStateHTML('claimed')}</div></div>`;
    }
    // 래치된 업적은 지표가 줄었어도(검 판매로 특성 종류 감소) 가득 찬 막대
    const cur = status === 'ready' ? a.need : A.achProgress(S, a.id);
    return `<div class="ach-row ${status}" data-ach="${a.id}">${head}${progBarHTML(cur, a.need)}
      <div class="rec-line">${progNumHTML(cur, a.need)}${rewardHTML(A.achRewardPreview(S, a.id))}${claimStateHTML(status === 'ready' ? 'ready' : 'progress', 'claimAch', a.id)}</div></div>`;
  }
  function achTrackHTML(S, track) {
    const list = C.ACHIEVEMENTS.filter(a => a.track === track);
    const single = list.length === 1;
    const chips = single ? '<span class="muted">단발</span>' : `<span class="ach-chips">${list.map(a => {
      const status = ACH_STATUS[A.achState(S, a.id)];
      return `<span class="ach-chip ${status}" title="${TIER_ROMAN[a.tier - 1]} · ${ACH_CHIP_TEXT[status]}">${status === 'claimed' ? '✔' : ''}${TIER_ROMAN[a.tier - 1]}</span>`;
    }).join('')}</span>`;
    return `<div class="ach-track" data-track="${track}"><div class="ach-track-head"><b>${ACH_TRACK_NAME[track]}</b>${chips}</div>
      ${list.map(a => achRowHTML(S, a, single)).join('')}</div>`;
  }
  /** 칭호 선택: 없음 + 수령한 업적의 칭호 */
  function titlePickerHTML(S) {
    const claimed = C.ACHIEVEMENTS.filter(a => A.achState(S, a.id) === C.ACH_CLAIMED);
    const option = (id, label) => `<button class="title-opt ${S.title === id ? 'on' : ''}" data-act="setTitle" data-id="${id}" aria-pressed="${S.title === id}">${label}</button>`;
    const hint = claimed.length ? '' : '<small class="muted">업적 보상을 받으면 칭호를 고를 수 있습니다</small>';
    return `<div class="title-pick"><span class="muted">${ic('title')} 칭호</span>${option(C.TITLE_NONE, '없음')}${claimed.map(a => option(a.id, `「${a.title}」`)).join('')}${hint}</div>`;
  }
  function achSectionHTML(S) {
    const claimed = C.ACHIEVEMENTS.filter(a => A.achState(S, a.id) === C.ACH_CLAIMED).length;
    // 모두 받기는 일일 과제 수령 가능 항목도 받는다(claimAll)
    const all = `<button class="small-btn gold claim-all" data-act="claimAll" ${A.claimableAny(S) ? '' : 'disabled'}>모두 받기</button>`;
    return sectionHead(`${decoIc('achievement')} 업적 <span class="muted ach-count">수령 ${claimed}/${C.ACHIEVEMENTS.length}</span>`, all) +
      titlePickerHTML(S) + ACH_TRACKS.map(t => achTrackHTML(S, t)).join('');
  }
  /** 현재 칭호: 상단 바 배지와 기록 탭 제목 옆 */
  function renderTitle(S) {
    const name = titleName(S);
    // name은 업적 상수(C.ACHIEVEMENTS)에서만 오므로 HTML로 넣어도 안전하다
    const html = name ? `${decoIc('title')} 「${name}」` : '';
    [$('#titleBadge'), $('#recordsTitle')].forEach(el => {
      el.hidden = !name;
      setHTML(el, html);
    });
    $('#titleBadge').title = name ? `칭호: ${name}` : '';
  }
  function renderRecords(S, ui, now, env) {
    setHTML($('#rebirthSection'), rebirthSectionHTML(S, ui));
    setHTML($('#dailySection'), dailySectionHTML(S));
    renderDailyCountdown(now, env);
    setHTML($('#achSection'), achSectionHTML(S));
    renderTitle(S);
  }

  // ============================================================ 환생·명성 상점 (F11, m2-rebirth §4·§7)
  const goldText = n => `${fmt(n)} G`;
  const REBIRTH_TEXT = {
    locked: `최고 강화 +${C.MAX} 달성 시 환생이 열립니다`,
    shop: '명성 상점',
    max: '최대',
    ready: `+${C.MAX} 검 1자루를 바치고 명성 +${C.FAME_PER_REBIRTH}`,
    confirmTitle: '환생할까요?',
    confirmLead: '되돌릴 수 없습니다. 처음부터 다시 시작하고 명성을 얻습니다.',
    keep: '업적·칭호·일일 과제·기념비·도감·통계·설정·명성·명성 상점',
    lost: `골드, 파편, 모든 검(특성 포함), 소모품, 모루·광석, 의뢰, 방치 업그레이드·부스터, 이벤트 진행, 숙련 기록(단계별 ${C.MASTERY_KEEP_REC}개만 남김)`,
    unclaimed: '받지 않은 업적·일일 과제 보상이 있습니다. 보상은 지금 최고 단계로 계산되니 환생 전에 받는 편이 좋습니다.',
    cancel: '취소',
    confirm: '환생하기',
  };
  // 상점 행 효과 문구(§4·§7.1). when: 시작 골드·칸은 다음 환생 때, 저항·수입·면허는 산 즉시 적용.
  // zero: 0레벨에서 '지금' 자리 글자(없으면 1레벨 값만), example: 효과 예시 줄(lv → 문구, 없으면 '')
  const resistValue = v => `${v}% 감소`;
  const FAME_TEXT = {
    destroyCut: { label: '파괴 확률', value: resistValue, zero: '없음', when: 'now', example: destroyCutExample },
    dropCut: { label: `+${C.DROP_FROM} 이상 하락 확률`, value: resistValue, zero: '없음', when: 'now' },
    startGold: { label: '환생 시작 골드', value: v => `+${fmt(v)} G`, when: 'next' },
    income: { label: `보관함 최고 +${C.EARLY_INCOME_MAX_LV} 이하일 때 사냥·자동·오프라인 골드`, value: v => `+${v}%`, when: 'now' },
    slots: { label: '환생 시작 보관함', value: v => `+${v}칸`, when: 'next' },
    autoStart: { label: '환생 후 처음부터 자동 사냥 해금', when: 'now' },
  };
  const FAME_WHEN_TEXT = { next: '다음 환생부터', now: '즉시 적용' };

  /** 효과 문구: 0레벨이면 1레벨 값, 최대면 지금 값, 그 사이는 '지금 → 다음'. 값이 없는 트랙(면허)은 이름만 */
  function fameEffectText(track, lv) {
    const t = FAME_TEXT[track];
    if (!t.value) return t.label;
    const at = n => t.value(R.fameValueAt(track, n));
    if (lv <= 0) return t.zero ? `${t.label} ${t.zero} → ${at(1)}` : `${t.label} ${at(1)}`;
    return lv >= RB.fameMaxLevel(track) ? `${t.label} ${at(lv)}` : `${t.label} ${at(lv)} → ${at(lv + 1)}`;
  }
  // 파괴 저항 예시 단계: 파괴 확률이 가장 큰 마지막 강화 단계(+19)
  const FAME_EXAMPLE_LV = C.MAX - 1;
  /**
   * "+19 파괴 35% → 30%": 지금 레벨과 다음 레벨 값을 넣은 chances()의 파괴 확률(굴림과 같은 식). 최대 레벨이면 ''.
   * 테스트 페이지의 강제 성공(parts 없음)에서는 파괴가 늘 0이라 예시가 뜻이 없어 ''
   */
  function destroyCutExample(lv) {
    if (lv >= RB.fameMaxLevel('destroyCut')) return '';
    const at = n => R.chances({ lv: FAME_EXAMPLE_LV, pity: 0 }, { destroyCut: R.fameValueAt('destroyCut', n) });
    const now = at(lv);
    if (!now.parts) return '';
    return `+${FAME_EXAMPLE_LV} ${ODDS_TEXT.dest} ${now.dest}% → ${at(lv + 1).dest}%`;
  }
  /** 확인 창 '환생 후' 결과값: 0이면 '없음', 아니면 상점 효과 문구와 같은 표기("파괴 확률 45% 감소") */
  const fameResultText = (track, v) => (v > 0 ? `${FAME_TEXT[track].label} ${FAME_TEXT[track].value(v)}` : FAME_TEXT[track].zero);
  /** 명성 상점 한 행: 이름·레벨 n/최대·효과·적용 시점, 버튼 = 다음 비용(최대면 '최대'). 최대 여부는 사유가 아니라 비용 데이터로 본다(V7) */
  function fameRowHTML(S, track) {
    const lv = S.rebirth.up[track];
    const cost = RB.nextFameCost(S, track);
    const label = cost === null ? REBIRTH_TEXT.max : `${ic('fame')} ${fmt(cost)}`;
    const example = FAME_TEXT[track].example ? FAME_TEXT[track].example(lv) : '';
    return `<div class="row fame-row" data-track="${track}">
      <div class="shop-text">${C.FAME_SHOP[track].name} <span class="muted">Lv ${lv}/${RB.fameMaxLevel(track)}</span>
        <small>${fameEffectText(track, lv)} · ${FAME_WHEN_TEXT[FAME_TEXT[track].when]}</small>${example ? `<small class="fame-example">${example}</small>` : ''}</div>
      <button class="buy" data-act="buyFame" data-id="${track}" ${RB.fameBlock(S, track) ? 'disabled' : ''}>${label}</button></div>`;
  }
  /** [환생] 버튼과 한 줄 안내: 막히면 비활성 + 사유(§7), 강화 연출 중에도 비활성(확인 창을 열지 않음) */
  function rebirthActionHTML(S, ui) {
    const check = RB.canRebirth(S);
    const note = check.ok
      ? `<span class="rebirth-note">수수료 ${goldText(RB.REBIRTH_FEE)} · ${REBIRTH_TEXT.ready}</span>`
      : `<span class="rebirth-note rebirth-reason">${REBIRTH_REASON[check.reason]}</span>`;
    return `<div class="rebirth-act"><button class="small-btn gold rebirth-btn" data-act="askRebirth" ${!check.ok || ui.busy ? 'disabled' : ''}>${ic('rebirth')} 환생</button>${note}</div>`;
  }
  /** 기록 탭 맨 위 환생 섹션: 열리기 전에는 잠금 한 줄, 열리면 머리(환생 횟수·명성 잔액) + 명성 상점 + [환생] */
  function rebirthSectionHTML(S, ui) {
    if (!RB.rebirthUnlocked(S)) return `<p class="panel-note rebirth-locked">${ic('lock')} ${REBIRTH_TEXT.locked}</p>`;
    const head = sectionHead(`환생 <span class="muted rebirth-count">${fmt(S.rebirth.count)}회</span>`,
      `<span class="fame-balance">${ic('fame')} 명성 <b>${fmt(S.rebirth.fame)}</b></span>`);
    return `${head}<h3 class="sub-title">${REBIRTH_TEXT.shop}</h3>` +
      `<div class="fame-shop">${C.FAME_TRACKS.map(t => fameRowHTML(S, t)).join('')}</div>${rebirthActionHTML(S, ui)}`;
  }

  const rbItem = (term, value, cls = '') => `<div><dt>${term}</dt><dd${cls ? ` class="${cls}"` : ''}>${value}</dd></div>`;
  /** 환생 확인 창(§7): 숫자는 모두 rebirthPreview 값(AC 41). 현재 골드·사라지는 골드는 열린 동안 renderRebirthConfirm이 맞춘다 */
  function rebirthConfirmHTML(S) {
    const p = RB.rebirthPreview(S);
    const sw = R.findSword(S, p.consumedSwordId);
    const offering = sw ? `${swordName(sw.lv)}${sw.trait ? ` (${traitName(sw.trait)})` : ''}` : '-';
    const T = REBIRTH_TEXT;
    return `<div class="sheet rebirth-sheet" role="dialog" aria-modal="true" aria-labelledby="rebirthTitle">
      <h3 id="rebirthTitle">${ic('rebirth')} ${T.confirmTitle}</h3><p>${T.confirmLead}</p>
      <dl class="rb-list">${rbItem('수수료', goldText(p.fee))}${rbItem('현재 골드', goldText(p.gold), 'rb-gold')}
        ${rbItem('수수료 후 사라지는 골드', goldText(p.goldLost), 'rb-lost')}${rbItem('얻는 명성', `${ic('fame')} +${p.fameGain}`)}
        ${rbItem('바치는 검', offering)}</dl>
      <h4>유지</h4><p>${T.keep}</p>
      <h4>사라짐</h4><p>${T.lost}</p>
      <h4>환생 후</h4>
      <dl class="rb-list">${rbItem('시작 골드', goldText(p.startGold))}${rbItem('시작 보관함', `${p.slots}칸`)}
        ${rbItem('초반 수입', `+${p.incomePct}% (보관함 최고 +${C.EARLY_INCOME_MAX_LV} 이하)`)}${rbItem('자동 사냥 면허', p.autoStart ? '있음' : '없음')}
        ${rbItem(C.FAME_SHOP.destroyCut.name, fameResultText('destroyCut', p.destroyCut))}${rbItem(C.FAME_SHOP.dropCut.name, fameResultText('dropCut', p.dropCut))}</dl>
      ${A.claimableAny(S) ? `<p class="rb-warn">${T.unclaimed}</p>` : ''}
      <div class="rb-btns"><button class="small-btn" data-act="cancelRebirth">${T.cancel}</button><button class="small-btn gold" data-act="rebirth">${T.confirm}</button></div></div>`;
  }
  /** 열린 확인 창의 현재 골드·사라지는 골드만 다시 쓴다(버튼을 다시 그리지 않아 포커스가 유지된다) */
  function renderRebirthConfirm(S) {
    const p = RB.rebirthPreview(S);
    const modal = $('#modal');
    [['.rb-gold', p.gold], ['.rb-lost', p.goldLost]].forEach(([sel, n]) => {
      const el = modal.querySelector(sel);
      if (el) el.textContent = goldText(n);
    });
  }

  /** 알림 문구 (§10.3) */
  const achReachedText = ids => (ids.length === 1
    ? `업적 달성: ${C.ACH_BY_ID[ids[0]].name} — 기록 탭에서 보상을 받으세요`
    : `업적 ${ids.length}개 달성`);
  const achClaimText = r => `업적 보상: ${rewardSummary(r)}`;
  const dailyClaimText = r => `일일 과제 보상: ${rewardSummary(r)}`;
  const bonusClaimText = r => `오늘의 과제 완료! 보너스: ${rewardSummary(r)}`;
  /** 모두 받기 합산 한 줄. 받은 것이 없으면 '' */
  function claimAllText(r) {
    if (!r.claimed.length) return '';
    const titles = r.claimed.filter(c => c.kind === A.KIND_ACH).length;
    return `보상 ${r.claimed.length}개를 받았습니다: ${rewardSummary(r)}${titles ? ` · 칭호 ${titles}개` : ''}`;
  }

  /** 새 숙련 기록 토스트 문구(기록 1회당 1번). 토스트는 textContent라 앞 아이콘은 이모지 폴백 */
  const masteryToastText = m => `${C.ICONS.mastery} +${m.lv} 숙련! 이후 +${m.lv} 강화 성공률 +${m.gained}%p`;
  /** 다 써서 자동으로 꺼진 트레이 소모품 토스트(시도 1회당 1번) */
  const ranOutToastText = ids => `${ids.map(id => itemText(id)).join(', ')}을(를) 다 써서 사용을 껐습니다.`;
  /** 첫 각인 토스트 "검에 각인: <등급> <종류>"(여러 자루면 한 문장으로 합침, m2-traits §11) */
  const engraveToastText = list => `검에 각인: ${list.map(traitName).join(', ')}`;
  /** 골드 사용처 구매 알림(토스트·로그) */
  const rekindText = r => `특성 종류 변경: ${traitName({ k: r.from, t: r.t })} → ${traitName(r)} (${fmt(r.price)}G)`;
  const tierUpText = r => `특성 등급 올리기: ${traitName(r)} (${fmt(r.price)}G)`;
  const monumentText = (L, r) => `${C.ICONS.monument} ${monumentTitle(L)}를 세웠습니다 (${fmt(r.price)}G)`;

  // ============================================================ 정적 요소
  /** 설정 팝오버의 버전 줄(REQ-050): 배포 뒤 새로고침으로 최신이 반영됐는지 플레이어가 확인한다 */
  const versionText = () => `v${C.VERSION}`;
  /** HTML에 고정된 버튼 아이콘을 콘텐츠 팀 SVG로 교체(없으면 같은 이모지)하고, 저장 안전 배너·배지 문구를 채운다 */
  function decorateStatic() {
    $('#btnSettings').innerHTML = ic('settings');
    $('#saveGuard').innerHTML = saveGuardHTML();
    $('#saveBadge').textContent = SAVE_SAFETY_TEXT.badge;
    $('#stageEmpty').textContent = NO_ACTIVE_TEXT;
    $('#masteryHeadIcon').innerHTML = ic('mastery');
    $('#appVersion').textContent = versionText();
  }

  // ============================================================ 저장 안전 (배너·배지)
  function saveGuardHTML() {
    const T = SAVE_SAFETY_TEXT;
    return `<p class="save-guard-text">${T.banner}</p>
      <div class="save-guard-actions">
        <button class="small-btn" data-act="copyCorrupt">${T.copy}</button>
        <button class="small-btn gold" data-act="retryBackup">${T.retry}</button>
        <button class="small-btn" data-act="abandonCorrupt">${T.abandon}</button>
      </div>
      <textarea class="save-guard-raw" id="saveGuardRaw" readonly hidden></textarea>`;
  }
  /** status: { guarding: 보호 모드(닫을 수 없는 배너), failed: 마지막 저장 시도 실패(배지) } */
  function renderSaveStatus(status) {
    $('#saveGuard').hidden = !status.guarding;
    $('#saveBadge').hidden = !status.failed;
    document.documentElement.classList.toggle('save-guarded', status.guarding);
    if (!status.guarding) hideCorruptRaw();
  }
  /** 복사가 막혔을 때: 원문을 읽기 전용 칸에 보여 주고 전체 선택해 둔다 */
  function showCorruptRaw(raw) {
    const el = $('#saveGuardRaw');
    el.value = raw;
    el.hidden = false;
    el.focus();
    el.select();
  }
  function hideCorruptRaw() {
    const el = $('#saveGuardRaw');
    el.hidden = true;
    el.value = '';
  }

  // ============================================================ 도감
  function buildCollection() {
    $('#collection').innerHTML = C.SWORDS.map((s, i) => `
      <div class="cell" data-i="${i}">
        ${FX.swordSVG(i, 'c' + i)}
        <b>+${i}</b><span class="nm"></span>
      </div>`).join('');
  }
  function renderCollection(S) {
    const sw = R.activeSword(S);
    document.querySelectorAll('.cell').forEach(cell => {
      const i = +cell.dataset.i;
      const f = S.found[i];
      cell.classList.toggle('found', f);
      cell.classList.toggle('current', !!sw && i === sw.lv);
      cell.querySelector('.nm').textContent = f ? C.SWORDS[i].n : '???';
    });
    $('#foundCount').textContent = `(${S.found.filter(Boolean).length} / ${C.MAX + 1})`;
  }

  /** env.tzOffsetMin: 일일 과제 날짜 경계와 같은 시간대 함수(main.js의 dailyEnv) */
  function render(S, ui, now, env) {
    renderHeader(S);
    renderEventChip(S);
    renderStrip(S, ui, now);
    renderSwordCard(S, ui);
    renderTray(S, ui);
    renderActions(S, ui, now);
    renderTabs(S, ui, now, env);
    renderCollection(S);
    updateCountdowns(now);
  }

  function offlineModalHTML(r) {
    const ore = Object.keys(r.ore).filter(k => r.ore[k] > 0).map(k => `${ic(k)} ${fmt(r.ore[k])}`).join(' · ');
    return `<div class="sheet"><h3>자리 비운 동안</h3>
      <p>경과 ${fmtDuration(r.gapMs)}${r.capped ? ` · 최대 ${r.capH}시간까지 적립` : ''}</p>
      <p>자동 사냥 ${fmt(r.runs)}회분 (효율 ${Math.round(C.OFFLINE_EFF * 100)}%)</p>
      <div class="big-gold">${ic('gold')} +${fmt(r.gold)}G</div>${ore ? `<p>${ore}</p>` : ''}
      <button class="small-btn gold" data-act="closeModal">받기</button></div>`;
  }

  SG.view = {
    REASON, render, buildCollection, decorateStatic, updateCountdowns, offlineModalHTML,
    NO_ACTIVE_TEXT, swordName, itemLabel, itemText, fmtDuration, masteryToastText, ranOutToastText, engraveToastText, SAVE_FAILED_TEXT,
    traitName, traitEffect, rekindText, tierUpText, monumentText,
    REBIRTH_REASON, rebirthConfirmHTML, renderRebirthConfirm,
    CLAIM_REASON, NEW_DAILY_TEXT, achReachedText, achClaimText, dailyClaimText, bonusClaimText, claimAllText,
    DAILY_TEXT, ACH_COND, ACH_TRACK_NAME,
    SAVE_SAFETY_TEXT, corruptKeptText, renderSaveStatus, showCorruptRaw,
    breakdownHTML, oddsSplitHTML, eventChipHTML, eventChipLabel, eventCapCause, eventBreakdownNote, luckIdleText, eventPopHTML,
    incomeEventText, eventPctText, eventDurationText, eventStartText, eventEndText, eventAssistText,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
