/* 렌더링: 상태(S) + UI 상태(ui) → DOM. 게임 규칙은 SG.rules 등에서 읽기만 한다.
 * 컨테이너별로 마지막 HTML을 기억해 바뀐 곳만 다시 그린다(주기적 렌더에도 클릭이 끊기지 않게).
 */
(function (root) {
  'use strict';
  const SG = root.SG = root.SG || {};
  const { C, rules: R, forge: F, idle: I, quests: Q, fx: FX } = SG;
  const fmt = FX.fmt;
  /** 아이콘 HTML: 콘텐츠 팀 SVG가 로드돼 있으면 그것을, 아니면 이모지 */
  const ic = id => {
    const svg = root.M1_ICONS && root.M1_ICONS[C.ICON_ASSET_KEYS[id]];
    return svg ? `<span class="ic">${svg}</span>` : (C.ICONS[id] || '');
  };
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
  };
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

  const swordName = lv => `+${lv} ${C.SWORDS[lv].n}`;
  const itemName = id => (R.itemDef(id) ? R.itemDef(id).name : C.ORE_NAMES[id]);
  const qtySuffix = n => (n > 1 ? ' ×' + fmt(n) : '');
  /** innerHTML 전용(SVG 아이콘 포함) */
  const itemLabel = (id, n) => `${ic(id)} ${itemName(id)}${qtySuffix(n)}`;
  /** textContent용(로그·토스트): 이모지 + 이름 */
  const itemText = (id, n) => `${C.ICONS[id] || ''} ${itemName(id)}${qtySuffix(n)}`.trim();

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
  const lockedHTML = (best, desc) =>
    `<div class="locked-msg"><b>${ic('lock')}</b>최고 강화 +${best} 달성 시 해금<br><small>${desc}</small></div>`;

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

  // ============================================================ 보관함 스트립 (F5)
  function slotCardHTML(S, sw) {
    const badges = [];
    if (C.DESTROY[sw.lv] > 0) badges.push(`<span class="${sw.prot > 0 ? '' : 'off'}">🛡${sw.prot}</span>`);
    const pb = R.pityBonus(sw.lv, sw.pity);
    if (sw.lv < C.MAX && pb > 0) badges.push(`<span>${ic('pity')}+${pb}%p</span>`);
    if (Q.slotForSword(S, sw) >= 0) badges.push(`<span>${ic('deliver')}</span>`);
    const active = sw.id === S.active;
    // 클릭 한 번이면 활성 검(data-act), data-sword는 칸 드래그 대상 표시
    return `<button class="slot-card ${active ? 'active' : ''}" data-act="activate" data-id="${sw.id}" data-sword="${sw.id}"
      title="${swordName(sw.lv)} · 클릭: 활성 검으로 · 끌기: 칸 이동">
      ${active ? '<span class="star">★ 활성</span>' : ''}${FX.swordSVG(sw.lv, 's' + sw.id)}
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
    const price = R.payoutPreview(S, R.sell(sw.lv));
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
    let s = terms.join(' + ');
    if (c.raw > 0) {
      s += ` = +${c.raw}`;
      if (c.raw > c.bonus) s += ` → <s>+${c.raw}</s> +${c.bonus} <span class="badge warn">상한 ${c.cap}</span>`;
    }
    // 숙련은 상한 밖 항목이라 상한 표시(취소선·뱃지) 뒤에 따로 더한다
    if (c.mastery) s += ` + <span class="mastery-term">숙련 +${c.mastery}</span> = ${c.succ}%`;
    if (c.succ < c.base + c.bonus + c.mastery) s += ` <span class="badge warn">천장 ${Math.max(c.base, C.SUCC_CEIL)}%</span>`;
    return s;
  }

  /** 성공 확률 아래 천장 게이지 줄(+15~+19에서만) */
  function gaugeHTML(g) {
    return `천장 ${g.value}/${g.n}${g.full ? ' <span class="badge good">확정!</span>' : ''}`;
  }

  function noteText(lv, c, use) {
    if (lv >= C.MAX) return '🏆 더 이상 강화할 수 없습니다. 무한의 검을 완성했습니다!';
    if (c.sure) return '확정 강화권으로 반드시 성공합니다.';
    if (c.gaugeFull) return '천장 게이지가 가득 찼습니다. 이번 강화는 소모품 없이 반드시 성공합니다.';
    if (lv >= C.DROP_FROM) {
      return use.keepdown
        ? `실패 시 (${c.fail}%) 하락 방지 주문서가 단계를 지켜 줍니다.`
        : `실패 시 (${c.fail}%) +${lv - 1}로 하락합니다.`;
    }
    if (c.dest > 0) return `실패 시 (${c.fail}%) 단계가 유지됩니다. 파괴되면 검이 사라지고 파편을 얻습니다.`;
    return `실패해도 단계가 유지됩니다. (+${C.DESTROY.findIndex(d => d > 0)}부터 파괴 위험)`;
  }

  function renderIncomeNote(S) {
    $('#incomeNote').textContent = `사냥·자동 수입 기준: 보관함 최고 검 +${R.topLv(S)}`;
  }

  /** 활성 검 없음(파괴 직후): 검 대신 선택 안내, 수치는 모두 '-' */
  function renderNoSwordCard(S) {
    $('#rarity').hidden = true;
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
    setHTML($('#pityLine'), '');
    $('#note').textContent = '보관함의 검을 한 번 클릭하면 바로 활성 검이 됩니다.';
    renderIncomeNote(S);
  }

  function renderSwordCard(S, ui) {
    const sw = R.activeSword(S);
    const noSword = !ui.view && !sw;
    $('#stageEmpty').hidden = !noSword;
    if (noSword) return renderNoSwordCard(S);
    // 강화 연출 중(ui.view)에는 시도 직전 확률·게이지를 보여 준다(결과가 미리 드러나지 않게). 파괴 연출 중엔 sw가 null이다
    const view = ui.view || { lv: sw.lv, chances: R.currentChances(S), gauge: R.gaugeInfo(S, sw.lv) };
    const l = view.lv;
    const c = view.chances;
    const rar = R.rarity(l);
    const isMax = l >= C.MAX;

    $('#rarity').hidden = false;
    $('#rarity').textContent = rar.name;
    $('#rarity').style.color = rar.color;
    $('#swordName').textContent = swordName(l);
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
    $('#vSell').textContent = fmt(R.sell(l));
    const protWarn = !ui.view && !isMax && C.DESTROY[l] > 0 && sw.prot <= 0;
    $('#destWarn').hidden = !protWarn;

    setHTML($('#breakdown'), isMax ? '' : breakdownHTML(c));
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
      return {
        title: `${ic('anvil_' + a.g)} ${C.ITEMS['anvil_' + a.g].name} <span class="muted">내구 ${a.dura}/${C.ANVIL_DURA[a.g]}</span><span class="tag">+${C.ANVIL_BONUS[a.g]}%p</span>`,
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

    if (!I.autoUnlocked(S)) {
      setHTML($('#autoRow'), `<span>${ic('lock')} ${ic('auto')} 자동 사냥 — 최고 강화 +${C.AUTO_UNLOCK_BEST} 달성 시 해금</span>`);
      return;
    }
    const status = S.idle.autoOn
      ? `다음 ${until(ui.nextAutoAt)} · 1회 +${fmt(I.autoRunGold(S, now))}G`
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

  function renderForge(S) {
    const anvils = S.anvils.length
      ? S.anvils.map(a => anvilRowHTML(S, a)).join('')
      : '<p class="panel-note">보유한 모루가 없습니다. 상점에서 구매하거나 제작하세요.</p>';
    const craft = F.GRADES.map(g => {
      const block = F.craftBlock(S, g);
      return `<div class="row"><div class="shop-icon">${ic('anvil_' + g)}</div>
        <div class="shop-text">${C.ITEMS['anvil_' + g].name}<small>성공 +${C.ANVIL_BONUS[g]}%p · 내구 ${C.ANVIL_DURA[g]}</small><small>${costHTML(S, F.craftCost(g))}</small></div>
        <button class="small-btn" data-act="craft" data-id="${g}" ${block ? 'disabled' : ''}>${block === 'full' ? '보유 한도' : '제작'}</button></div>`;
    }).join('');
    const ores = C.ORES.map(k => F.oreUnlocked(S, k)
      ? `<div>${ic(k)} ${C.ORE_NAMES[k]}<b>${fmt(S.ore[k])}</b><small>사냥당 +${C.ORE_PER_HUNT[k]}</small></div>`
      : `<div class="muted">${ic('lock')} ${C.ORE_NAMES[k]}<b>-</b><small>최고 +${C.ORE_UNLOCK_LV[k]} 달성 시</small></div>`).join('');
    const shardNote = S.shards > 0 ? '' : '<p class="panel-note">검이 파괴되면 파편을 얻습니다.</p>';
    const exchange = `<h3 class="sub-title">파편 교환 · 보유 ${ic('shard')} ${fmt(S.shards)}</h3>${shardNote}` +
      Object.keys(C.SHARD_COST).map(id => {
        const item = C.ITEMS[id];
        const own = item.kind === 'anvil' ? `(${S.anvils.length}/${C.ANVIL_OWN_MAX})` : `(${S.inv[id]})`;
        return `<div class="row"><div class="shop-icon">${ic(id)}</div><div class="shop-text">${item.name} <span class="muted">${own}</span></div>
          <button class="buy" data-act="exchange" data-id="${id}" ${R.exchangeBlock(S, id) ? 'disabled' : ''}>${ic('shard')} ${C.SHARD_COST[id]}</button></div>`;
      }).join('');
    return `<h3 class="sub-title">모루 (${S.anvils.length}/${C.ANVIL_OWN_MAX})</h3>${anvils}
      <h3 class="sub-title">제작</h3>${craft}
      <h3 class="sub-title">광석</h3><div class="ore-grid">${ores}</div>${exchange}`;
  }

  function questCardHTML(S, ui, q, i, now) {
    const tier = C.QUEST_TIERS[i];
    const badge = `<span class="badge tier-${tier}">${TIER_NAME[tier]}</span>`;
    if (!q) return `<div class="quest"><div class="q-head">${badge} 새 의뢰 준비 중</div><div class="q-sub">다음 의뢰까지 ${until(S.quests.readyAt[i])}</div></div>`;
    const cand = Q.candidate(S, q);
    const sealOn = R.sealActive(S);
    const gold = R.payoutPreview(S, q.gold);
    const reward = `${ic('gold')} ${fmt(gold)}G${sealOn ? ` (인장 ×${C.SEAL_MULT})` : ''}${q.item ? ' + ' + itemLabel(q.item.id, q.item.n) : ''}`;
    const have = S.swords.map(s => '+' + s.lv).join(', ');
    let sub;
    if (!cand) sub = `<span class="lack">보유 검 없음 · +${q.lv} 필요</span> · 가진 검: ${have}`;
    else if (cand.id === S.active) sub = '활성 검만 해당됩니다 — 한 번 더 눌러 확인';
    else sub = `보관함의 +${q.lv} 검을 납품합니다 (판매가 ${fmt(R.sell(q.lv))}G)`;
    const armed = isArmed(ui, 'deliver:' + i, now);
    const rerollCost = Q.rerollCost(S);
    return `<div class="quest"><div class="q-head">${badge} 요구: ${swordName(q.lv)}</div>
      <div class="q-reward">${reward}</div><div class="q-sub">${sub}</div>
      <div class="q-btns">
        <button class="small-btn ${armed ? 'armed' : ''}" data-act="deliver" data-id="${i}" ${!cand || ui.busy ? 'disabled' : ''}>${armed ? '정말 납품?' : `${ic('deliver')} 납품`}</button>
        <button class="small-btn gold" data-act="reroll" data-id="${i}" ${Q.rerollBlock(S, i) ? 'disabled' : ''}>새로고침 ${fmt(rerollCost)}G</button>
      </div></div>`;
  }

  function renderQuests(S, ui, now) {
    return S.quests.list.map((q, i) => questCardHTML(S, ui, q, i, now)).join('') +
      `<p class="panel-note">요구 단계와 정확히 같은 검만 납품할 수 있습니다. 납품한 칸은 ${C.QUEST_COOLDOWN_SEC / 60}분 뒤 새 의뢰가 옵니다.</p>`;
  }

  function renderIdle(S, ui, now) {
    const lv = R.topLv(S);
    const ores = F.unlockedOres(S).map(k => `${ic(k)}+${C.ORE_PER_HUNT[k]}`).join(' ');
    const status = `<div class="row"><div class="shop-icon">${ic('auto')}</div>
      <div class="shop-text">자동 사냥 ${S.idle.autoOn ? '<span class="badge good">ON</span>' : '<span class="badge">OFF</span>'}
        <small>${I.autoInterval(S) / 1000}초마다 +${fmt(I.autoRunGold(S, now))}G ${ores} · 기준: 보관함 최고 +${lv}</small></div>
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
    forge: S => renderForge(S),
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

  function renderTabs(S, ui, now) {
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
  }

  /** 기록 탭: 단계별 성공 숙련 `+16 숙련 +6%p (2/4)` */
  function masteryRowsHTML(S) {
    return C.MASTERY_REC_MAX.map((max, i) => {
      const lv = C.MASTERY_FROM + i;
      const count = S.mastery[i];
      return `<li>+${lv} 숙련 <b>+${R.masteryBonus(lv, count)}%p</b> <span class="muted">(${count}/${max})</span></li>`;
    }).join('');
  }

  /** 새 숙련 기록 토스트 문구(기록 1회당 1번) */
  const masteryToastText = m => `+${m.lv} 숙련! 이후 +${m.lv} 강화 성공률 +${m.gained}%p`;
  /** 다 써서 자동으로 꺼진 트레이 소모품 토스트(시도 1회당 1번) */
  const ranOutToastText = ids => `${ids.map(id => itemText(id)).join(', ')}을(를) 다 써서 사용을 껐습니다.`;

  // ============================================================ 정적 요소
  /** HTML에 고정된 버튼 아이콘을 콘텐츠 팀 SVG로 교체(없으면 같은 이모지)하고, 저장 안전 배너·배지 문구를 채운다 */
  function decorateStatic() {
    $('#btnSettings').innerHTML = ic('settings');
    $('#saveGuard').innerHTML = saveGuardHTML();
    $('#saveBadge').textContent = SAVE_SAFETY_TEXT.badge;
    $('#stageEmpty').textContent = NO_ACTIVE_TEXT;
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

  function render(S, ui, now) {
    renderHeader(S);
    renderStrip(S, ui, now);
    renderSwordCard(S, ui);
    renderTray(S, ui);
    renderActions(S, ui, now);
    renderTabs(S, ui, now);
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
    NO_ACTIVE_TEXT, swordName, itemLabel, itemText, fmtDuration, masteryToastText, ranOutToastText, SAVE_FAILED_TEXT,
    SAVE_SAFETY_TEXT, corruptKeptText, renderSaveStatus, showCorruptRaw,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
