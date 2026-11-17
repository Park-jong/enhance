/* 컨트롤러: 입력·타이머·저장소를 규칙 모듈과 화면에 연결한다 (브라우저 전용). */
(function (root) {
  'use strict';
  const SG = root.SG;
  const { C, rules: R, forge: F, idle: I, quests: Q, save: SV, fx: FX, view: V } = SG;
  const $ = sel => document.querySelector(sel);
  const fmt = FX.fmt;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const now = () => Date.now();
  const rng = Math.random;

  const TICK_MS = 500;
  const AUTOSAVE_MS = 5000;
  const RENDER_SLACK_MS = 50;
  // 연출 길이: 기본(M0) / 스킵 중 중요 결과(≤0.6초) / 스킵
  // cues: 결과별 효과음 교체(없으면 기본 큐)
  const FX_FULL = { charge: 650, shatter: 650, particles: true, resultMs: 0, flashMs: 0, cues: {} };
  const FX_SHORT = { charge: 250, shatter: 300, particles: true, resultMs: C.SKIP_RESULT_MS, flashMs: 0,
    cues: { success: 'skipBigWin', destroy: 'skipDestroy' } };
  const FX_NONE = { charge: 0, shatter: 0, particles: false, resultMs: C.SKIP_RESULT_MS, flashMs: 120,
    cues: { success: 'skipSuccess', fail: 'skipFail', drop: 'skipFail', kept: 'skipFail', destroy: 'skipDestroy' } };
  const resultCue = (outcome, fx, fallback) => fx.cues[outcome] || fallback;

  const UNLOCK_NOTICES = [
    { best: C.QUEST_UNLOCK_BEST, msg: `${C.ICONS.quests} 의뢰 탭이 열렸습니다!` },
    { best: C.FORGE_UNLOCK_BEST, msg: `${C.ICONS.forge} 대장간이 열렸습니다! 모루와 광석을 확인하세요.` },
    { best: C.AUTO_UNLOCK_BEST, msg: `${C.ICONS.auto} 자동 사냥이 해금되었습니다!` },
    { best: C.ORE_UNLOCK_LV.silver, msg: `${C.ICONS.silver} 은광석을 캘 수 있습니다!` },
    { best: C.ORE_UNLOCK_LV.mithril, msg: `${C.ICONS.mithril} 미스릴 광석을 캘 수 있습니다!` },
  ];

  // localStorage 접근 자체가 막힌 환경에서도 게임은 돌아가게 한다(저장만 안 됨)
  const storage = (() => {
    try { if (root.localStorage) return root.localStorage; } catch (e) { /* 접근 거부 */ }
    return { getItem: () => null, setItem: () => {} };
  })();

  const loaded = SV.load(storage, now());
  let S = loaded.state;
  const audio = SG.createAudio(() => S.settings.muted);
  const sfx = cue => audio.play(cue);

  const ui = {
    tab: 'shop', selectedId: S.active, armed: {}, busy: false, view: null,
    huntUntil: 0, nextAutoAt: now() + I.autoInterval(S), nextEnhanceAt: 0,
  };
  let lastSaveAt = 0;
  // 다른 탭이 같은 저장을 쓰기 시작하면 true: 이 탭은 저장·틱·입력을 멈춘다
  let suspended = false;

  function persist() {
    if (suspended) return;
    SV.save(storage, S, now());
    lastSaveAt = now();
  }
  function render() { V.render(S, ui, now()); }
  function afterChange() {
    R.cleanupUse(S);
    Q.refreshQuests(S, now(), rng);
    persist();
    render();
  }
  function reject(reason) {
    FX.toast(V.REASON[reason] || '지금은 사용할 수 없습니다.', 'bad');
    if (reason === 'noGold') FX.denyGold();
    sfx('error');
    render();
  }
  /** 2회 클릭 확인: 처음엔 무장만 하고 false, 제한 시간 안에 다시 누르면 true */
  function confirmed(key) {
    const t = now();
    if ((ui.armed[key] || 0) > t) { delete ui.armed[key]; return true; }
    ui.armed[key] = t + C.SELL_CONFIRM_MS;
    render();
    setTimeout(render, C.SELL_CONFIRM_MS + RENDER_SLACK_MS);
    return false;
  }
  function announceUnlocks(prevBest) {
    const notices = UNLOCK_NOTICES.filter(n => prevBest < n.best && S.best >= n.best);
    notices.forEach(n => FX.toast(n.msg, 'special'));
    if (notices.length) sfx('unlock');
  }

  // ============================================================ 강화
  function announceFound(nl) {
    const nsw = C.SWORDS[nl];
    const rar = R.rarity(nl);
    if (nl === C.MAX) {
      sfx('fanfare');
      FX.banner('무한의 검 완성!', `+${C.MAX} 신화 등급 달성 · 시도 ${fmt(S.stats.tries)}회`, rar.color);
    } else if (C.BANNER_LV.includes(nl)) {
      sfx('fanfare');
      FX.banner(`${rar.name} 등급 달성!`, `+${nl} ${nsw.n}`, rar.color);
    } else {
      FX.toast(`📖 도감 등록: +${nl} ${nsw.n}`, 'special');
    }
  }

  // 결과별 연출. holdView: 연출이 끝날 때까지 이전 검을 화면에 유지(파괴)
  const OUTCOME_FX = {
    success: { play(r, fx) {
      const nsw = C.SWORDS[r.to];
      if (fx.particles) {
        FX.setSwordAnim('pop');
        FX.burst([nsw.g || '#ffffff', nsw.a, '#ffffff'], 40 + r.to * 5, { speed: 5 + r.to * .3 });
      }
      FX.flash(nsw.g || '#ffffff', fx.flashMs);
      FX.showResult('성공!', 'var(--good)', fx.resultMs);
      sfx(resultCue('success', fx, 'success'));
      FX.log(`+${r.from} → +${r.to} 강화 성공! ${nsw.n}`, 'good');
      if (r.firstFound) announceFound(r.to);
    } },
    protected: { play(r, fx) {
      FX.flash('#4da3ff', fx.flashMs);
      if (fx.particles) FX.burst(['#4da3ff', '#9fd0ff', '#ffffff'], 40, { speed: 5 });
      FX.showResult('보호됨!', 'var(--info)', fx.resultMs);
      sfx('protect');
      FX.log(`파괴될 뻔했지만 보호권 ${r.protectUsed}장으로 +${r.from}을 지켜냈습니다. 이 단계 남은 횟수 ${r.protLeft}`, 'info');
    } },
    destroy: { holdView: true, async play(r, fx) {
      const sw = C.SWORDS[r.from];
      if (fx.particles) {
        FX.shake();
        FX.setSwordAnim('shatter');
        FX.burst([sw.a, sw.b, '#888888'], 50, { shard: true, speed: 7, gravity: .25 });
      }
      FX.flash('#ff2a2a', fx.flashMs);
      FX.showResult(`파괴! +${r.shards} 파편`, 'var(--bad)', fx.resultMs);
      sfx(resultCue('destroy', fx, 'destroy'));
      FX.log(`+${r.from} ${sw.n}이(가) 산산조각 났습니다... 파편 ${r.shards}개 획득`, 'bad');
      if (fx.shatter) await wait(fx.shatter);
      if (r.shards > 0) sfx('shardGain');
      ui.view = null;
      ui.selectedId = S.active;
      render();
      if (fx.particles) FX.setSwordAnim('appear');
      if (r.freeSword) FX.log('보유 검이 없어 +0 검 1자루를 무료로 받았습니다.', 'info');
    } },
    fail: { play(r, fx) {
      if (fx.particles) FX.shake();
      FX.showResult('실패', '#9aa4b2', fx.resultMs);
      sfx(resultCue('fail', fx, 'fail'));
      FX.log(`+${r.from} 강화 실패. 단계가 유지됩니다.`);
    } },
    drop: { play(r, fx) {
      if (fx.particles) FX.shake();
      FX.showResult('하락', 'var(--warn)', fx.resultMs);
      sfx(resultCue('drop', fx, 'drop'));
      FX.log(`강화 실패. +${r.from} → +${r.to}로 하락했습니다.`, 'warn');
    } },
    kept: { play(r, fx) {
      if (fx.particles) FX.shake();
      FX.showResult('하락 방지!', 'var(--info)', fx.resultMs);
      sfx(resultCue('kept', fx, 'useKeepdown'));
      FX.log(`강화 실패. 하락 방지 주문서로 +${r.from}을 지켰습니다.`, 'info');
    } },
  };

  const isImportant = r =>
    (r.outcome === 'success' && (r.to >= C.SKIP_KEEP_LV || r.firstFound)) ||
    (r.outcome === 'destroy' && r.from >= C.SKIP_KEEP_DESTROY_LV);
  const pickFx = r => (!S.settings.skipFx ? FX_FULL : isImportant(r) ? FX_SHORT : FX_NONE);

  async function enhance() {
    const startedAt = now();
    if (ui.busy || startedAt < ui.nextEnhanceAt) return;
    const prevBest = S.best;
    const r = R.attemptEnhance(S, rng);
    if (!r.ok) {
      if (r.reason === 'noGold') reject('noGold');
      return;
    }
    // 결과·소모는 여기서 확정·저장되고, 연출은 표시만 늦춘다 (새로고침해도 다시 굴릴 수 없음)
    Q.refreshQuests(S, startedAt, rng);
    persist();
    const fx = pickFx(r);
    const outcome = OUTCOME_FX[r.outcome];
    if (r.used.sure) sfx('useSure');
    ui.busy = true;
    ui.view = { lv: r.from, chances: r.chances };
    render();

    if (fx.charge) {
      FX.setSwordAnim('charging');
      sfx('charge');
      await wait(fx.charge);
      FX.setSwordAnim(null);
    }
    if (!outcome.holdView) { ui.view = null; render(); }
    await outcome.play(r, fx);
    if (r.anvilBroke) { FX.toast('모루가 파손되었습니다 (수리 필요)', 'bad'); sfx('anvilBreak'); }
    announceUnlocks(prevBest);

    ui.view = null;
    ui.busy = false;
    if (S.settings.skipFx) ui.nextEnhanceAt = startedAt + C.SKIP_MIN_INTERVAL_MS;
    render();
    const left = ui.nextEnhanceAt - now();
    if (left > 0) setTimeout(render, left + RENDER_SLACK_MS);
  }

  // ============================================================ 사냥 / 자동
  function hunt() {
    const t = now();
    if (t < ui.huntUntil) return;
    const r = I.manualHunt(S, t, rng);
    ui.huntUntil = t + C.HUNT_CD;
    FX.floatGold(r.gold);
    sfx('coin');
    if (Object.keys(r.ore).some(k => r.ore[k] > 0)) sfx('oreGain');
    persist();
    render();
    tickHunt();
  }
  function tickHunt() {
    const btn = $('#btnHunt');
    const rem = ui.huntUntil - now();
    if (rem > 0) {
      btn.style.setProperty('--cd', (rem / C.HUNT_CD).toFixed(3));
      requestAnimationFrame(tickHunt);
    } else {
      btn.style.setProperty('--cd', 0);
      btn.disabled = false;
    }
  }
  function setAuto(on) {
    const r = I.setAutoOn(S, on);
    if (!r.ok) return reject(r.reason);
    ui.nextAutoAt = now() + I.autoInterval(S);
    FX.log(on ? '자동 사냥을 켰습니다.' : '자동 사냥을 껐습니다.', 'info');
    sfx(on ? 'toggleOn' : 'toggleOff');
    afterChange();
  }

  // ============================================================ 보관함 / 판매 / 납품
  function sellSword(id) {
    const sw = R.findSword(S, id);
    if (ui.busy || !sw || sw.lv === 0) return;
    if (sw.lv >= C.SELL_CONFIRM_LV && !confirmed('sell:' + id)) return;
    const wasActive = id === S.active;
    const r = R.sellSword(S, id);
    if (!r.ok) return reject(r.reason);
    FX.log(`+${r.lv} ${C.SWORDS[r.lv].n}을(를) ${fmt(r.gold)}G에 판매했습니다.${r.sealed ? ` (감정 인장 ×${C.SEAL_MULT})` : ''}`, 'gold');
    FX.burst(['#ffd166', '#fff3c4', '#e8b23a'], 40, { speed: 6 });
    FX.showResult(`+${fmt(r.gold)}G`, 'var(--gold)');
    FX.floatGold(r.gold);
    sfx('coin');
    if (r.sealed) sfx('useSeal');
    if (r.freeSword) FX.log('보유 검이 없어 +0 검 1자루를 무료로 받았습니다.', 'info');
    ui.selectedId = S.active;
    afterChange();
    if (wasActive) FX.setSwordAnim('appear');
  }

  const rewardGaveShards = reward =>
    !!reward && (reward.fallbackShards > 0 || (reward.granted > 0 && R.itemDef(reward.id).kind === 'shard'));

  function deliverSlot(slot, swordId) {
    const q = S.quests.list[slot];
    if (ui.busy || !q) return;
    const sw = swordId !== undefined ? R.findSword(S, swordId) : Q.candidate(S, q);
    if (!sw || sw.lv !== q.lv) return reject('noSword');
    const isActive = sw.id === S.active;
    const key = swordId !== undefined ? 'deliverSword:' + swordId : 'deliver:' + slot;
    if (isActive && !confirmed(key)) return;
    const r = Q.deliver(S, slot, now(), { swordId: sw.id, confirmActive: isActive });
    if (!r.ok) return reject(r.reason);
    let msg = `+${q.lv} 검을 납품했습니다. ${fmt(r.gold)}G${r.sealed ? ` (감정 인장 ×${C.SEAL_MULT})` : ''}`;
    if (r.reward) {
      if (r.reward.granted) msg += ` + ${V.itemText(r.reward.id, r.reward.granted)}`;
      if (r.reward.fallbackShards) msg += ` · 보유 한도로 ${C.ICONS.shard} 파편 ${r.reward.fallbackShards}개로 대체`;
    }
    FX.log(msg, 'gold');
    FX.toast(`${C.ICONS.deliver} ${msg}`, 'special');
    FX.floatGold(r.gold);
    sfx('questDeliver');
    if (r.sealed) sfx('useSeal');
    if (rewardGaveShards(r.reward)) sfx('shardGain');
    if (r.freeSword) FX.log('보유 검이 없어 +0 검 1자루를 무료로 받았습니다.', 'info');
    ui.selectedId = S.active;
    afterChange();
  }

  /** 단순 거래형 동작: 성공 시 로그·효과음·저장, 실패 시 사유 토스트 */
  function settle(r, message, cue = 'buy') {
    if (!r.ok) return reject(r.reason);
    if (r.price) FX.floatGold(-r.price);
    sfx(cue);
    FX.log(message(r));
    afterChange();
  }
  const itemName = id => C.ITEMS[id].name;
  const anvilName = id => C.ITEMS['anvil_' + R.findAnvil(S, id).g].name;

  const ACTIONS = {
    tab: id => { ui.tab = id; sfx('tabSwitch'); render(); },
    select: id => { ui.selectedId = +id; render(); },
    activate: id => {
      if (ui.busy) return;
      settle(R.setActive(S, +id), () => `${V.swordName(R.activeSword(S).lv)}을(를) 활성 검으로 정했습니다.`, 'buy');
    },
    sellSel: id => sellSword(+id),
    deliverSel: id => {
      const sw = R.findSword(S, +id);
      const slot = sw ? Q.slotForSword(S, sw) : -1;
      if (slot < 0) return reject('noSword');
      deliverSlot(slot, sw.id);
    },
    deliver: slot => deliverSlot(+slot),
    reroll: slot => settle(Q.rerollQuest(S, +slot, rng), () => '의뢰를 새로 고쳤습니다.'),
    buySword: () => settle(R.buySword(S), () => '새 +0 검을 구매했습니다.'),
    expand: () => settle(R.expandSlots(S), r => `보관함이 ${r.slots}칸으로 늘었습니다.`),
    buy: id => {
      const boost = C.SHOP_ITEMS.find(e => e.id === id).action === 'boost';
      settle(R.buyShopItem(S, id, now()), () => (boost
        ? `${itemName(id)} 적용! 남은 시간 ${V.fmtDuration(R.boostRemainingMs(S, now()))}`
        : `${itemName(id)} 1개를 구매했습니다.`), boost ? 'useBooster' : 'buy');
    },
    exchange: id => settle(R.exchangeShards(S, id), r => `파편 ${r.cost}개로 ${itemName(id)}을(를) 교환했습니다.`, 'shardExchange'),
    craft: g => settle(F.craftAnvil(S, +g), r => `${C.ITEMS['anvil_' + r.anvil.g].name}을(를) 제작했습니다.`, 'anvilCraft'),
    repair: id => settle(F.repairAnvil(S, +id), () => `${anvilName(+id)}을(를) 수리했습니다.`, 'anvilRepair'),
    equip: id => settle(F.equipAnvil(S, +id), () => `${anvilName(+id)}을(를) 장착했습니다.`),
    upgrade: id => settle(I.buyUpgrade(S, id), r => `${C.UPGRADES.find(u => u.id === id).name} Lv ${r.level}`),
    useBooster: () => settle(R.useBoosterFromInv(S, now()), () => `${itemName('booster')} 사용! 남은 시간 ${V.fmtDuration(R.boostRemainingMs(S, now()))}`, 'useBooster'),
    toggleAuto: () => setAuto(!S.idle.autoOn),
    closeModal: () => { $('#modal').hidden = true; sfx('offlineCollect'); },
  };

  const CHANGES = {
    tray: el => {
      const r = R.setUse(S, el.dataset.id, el.checked);
      if (!r.ok) return reject(r.reason);
      afterChange();
    },
    seal: el => { R.setUse(S, 'seal', el.checked); afterChange(); },
    auto: el => setAuto(el.checked),
  };

  // ============================================================ 오프라인 / 주기 갱신
  function showOffline(r) {
    $('#modal').innerHTML = V.offlineModalHTML(r);
    $('#modal').hidden = false;
    FX.log(`자리 비운 동안 ${fmt(r.gold)}G를 벌었습니다.`, 'gold');
  }
  /**
   * 저장소의 유효한 v2 상태를 이어받는다. force가 아니면 다른 탭이 더 나중에 저장했을 때(lastSeen이 더 최근)만.
   * 오래된 탭이 옛 lastSeen으로 오프라인 보상을 다시 받고 최신 저장을 덮어쓰는 것을 막는다.
   * 이 탭의 저장이 실패해 저장소 쪽이 더 오래된 경우에는 메모리 상태를 유지한다.
   */
  function adoptStoredSave(t, force) {
    const latest = SV.peek(storage, t);
    if (!latest || (!force && latest.idle.lastSeen <= S.idle.lastSeen)) return;
    S = latest;
    // 이 탭의 옛 자동 사냥 시각을 두면, 다른 탭이 이미 지급한 몫을 catch-up으로 다시 지급한다
    ui.nextAutoAt = t + I.autoInterval(S);
    ui.view = null;
    ui.busy = false;
    ui.selectedId = S.active;
    ui.armed = {};
  }
  function resume(forceAdopt = false) {
    if (suspended) return;
    const t = now();
    adoptStoredSave(t, forceAdopt);
    const off = I.settleOffline(S, t);
    if (off) ui.nextAutoAt = t + I.autoInterval(S);
    Q.refreshQuests(S, t, rng);
    persist();
    render();
    if (off && off.gold > 0) showOffline(off);
  }
  function tick() {
    if (suspended || document.hidden) return;   // 숨김 동안은 복귀 정산(resume)이 처리
    const t = now();
    // 탭 동결 등으로 visibilitychange 없이 오래 멈췄다 깨어난 경우도 복귀 정산으로 처리
    if (t - S.idle.lastSeen >= C.OFFLINE_MIN_SEC * 1000) return resume();
    const auto = I.runAutoCatchup(S, t, ui.nextAutoAt, rng);
    ui.nextAutoAt = auto.nextAutoAt;
    const created = Q.refreshQuests(S, t, rng);
    if (auto.runs) FX.floatGold(auto.gold);
    if (auto.runs || created.length || t - lastSaveAt >= AUTOSAVE_MS) persist();
    render();
  }

  // ============================================================ 다른 탭과의 충돌 방지
  // 같은 저장 키를 다른 탭이 쓰면(storage 이벤트) 이 탭을 멈추고, 사용자가 고르면 최신 저장을 이어받아 계속한다.
  // 잠금 화면 뒤의 조작부에 키보드 포커스가 닿지 않게 한다
  function setLocked(locked) {
    $('#tabLock').hidden = !locked;
    $('header').inert = locked;
    $('main').inert = locked;
  }
  function suspendForOtherTab() {
    if (suspended) return;
    suspended = true;
    ui.armed = {};
    $('#modal').hidden = true;
    $('#settingsPop').hidden = true;
    setLocked(true);
  }
  /** 사용자가 이 탭을 고르면 저장소의 유효한 저장을 무조건 이어받는다(없으면 메모리 상태로 계속) */
  function takeOver() {
    suspended = false;
    setLocked(false);
    resume(true);
  }
  // key === null: 다른 탭의 localStorage.clear()도 저장 변경으로 본다
  root.addEventListener('storage', e => { if (e.key === C.SAVE_KEY || e.key === null) suspendForOtherTab(); });
  $('#btnTakeover').addEventListener('click', takeOver);
  /** 멈춘 동안에는 입력을 무시 */
  const whenActive = fn => (...args) => (suspended ? undefined : fn(...args));

  // ============================================================ 이벤트
  document.addEventListener('click', whenActive(e => {
    const pop = $('#settingsPop');
    if (!pop.hidden && !e.target.closest('.settings-wrap')) pop.hidden = true;
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.act];
    if (fn) fn(el.dataset.id);
  }));
  document.addEventListener('change', whenActive(e => {
    const el = e.target.closest('[data-change]');
    if (el && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el);
  }));
  $('#btnEnhance').addEventListener('click', whenActive(enhance));
  $('#btnSell').addEventListener('click', whenActive(() => sellSword(S.active)));
  $('#btnHunt').addEventListener('click', whenActive(hunt));
  $('#btnSettings').addEventListener('click', whenActive(() => { $('#settingsPop').hidden = !$('#settingsPop').hidden; }));
  $('#setSound').addEventListener('change', whenActive(e => { S.settings.muted = !e.target.checked; persist(); render(); }));
  $('#setSkip').addEventListener('change', whenActive(e => {
    S.settings.skipFx = e.target.checked;
    FX.log(S.settings.skipFx ? '강화 연출 건너뛰기를 켰습니다.' : '강화 연출 건너뛰기를 껐습니다.', 'info');
    persist();
    render();
  }));
  /** 현재 저장 키(C.SAVE_KEY)의 진행을 새 게임으로 덮어쓴다 */
  function startNewGame() {
    S = SV.defaultState(now());
    Object.assign(ui, { selectedId: S.active, armed: {}, view: null, nextEnhanceAt: 0, nextAutoAt: now() + I.autoInterval(S) });
    $('#log').innerHTML = '';
    $('#settingsPop').hidden = true;
    persist();
    render();
    FX.log('새 게임을 시작했습니다. 행운을 빕니다!');
  }
  $('#btnReset').addEventListener('click', whenActive(() => {
    if (!confirm('모든 진행 상황을 지우고 처음부터 시작할까요?')) return;
    startNewGame();
  }));
  $('#banner').addEventListener('click', () => $('#banner').classList.remove('show'));

  document.addEventListener('keydown', whenActive(e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) enhance();
    } else if (e.code === 'KeyS' && !e.repeat) {
      sellSword(S.active);
    } else if (e.code === 'KeyH' && !e.repeat) {
      hunt();
    } else if (e.code === 'Escape') {
      $('#banner').classList.remove('show');
      $('#modal').hidden = true;
      $('#settingsPop').hidden = true;
    }
  }));
  // 포커스된 버튼·체크박스가 Space로 한 번 더 눌리는 것을 막음
  document.addEventListener('keyup', e => { if (e.code === 'Space') e.preventDefault(); });
  document.addEventListener('visibilitychange', () => (document.hidden ? persist() : resume()));
  root.addEventListener('pagehide', persist);
  root.addEventListener('resize', FX.sizeFx);

  // ============================================================ 시작
  const START_LOG = {
    v1: '이전 저장을 새 형식으로 옮겼습니다. 기존 검은 보관함 첫 칸에 있습니다.',
    corrupt: '저장 데이터를 읽을 수 없어 새 게임으로 시작합니다.',
  };
  /** 손상 저장 토스트: 이번 원문이 실제로 어디에 남았는지(또는 남지 않았는지)만 말한다 */
  function corruptNotice(l) {
    const head = START_LOG.corrupt;
    if (l.keptAt) {
      return l.keptAt === C.SAVE_KEY_V1
        ? `${head} v1 원본은 '${l.keptAt}'에 그대로 두었습니다.`
        : `${head} 원본은 '${l.keptAt}'에 백업되어 있습니다.`;
    }
    if (l.earlierBackupAt) return `${head} '${l.earlierBackupAt}'에 이전 백업이 이미 있어 그대로 두었습니다. (이번 원본은 보관되지 않음)`;
    return `${head} (원본 백업 실패)`;
  }
  // 확장 지점: main.js보다 먼저 로드된 페이지 전용 스크립트(예: test.html의 js/test-panel.js)가 SG.extensions에
  // 넣은 함수에 좁은 조작 API를 넘긴다. 추가 동작은 data-act 클릭으로만 불리므로 탭 잠금(whenActive)도 그대로 적용된다
  const controllerApi = {
    state: () => S,
    commit: afterChange,
    newGame: startNewGame,
    addActions: actions => Object.assign(ACTIONS, actions),
  };
  (SG.extensions || []).forEach(extend => extend(controllerApi));

  V.buildCollection();
  V.decorateStatic();
  FX.sizeFx();
  resume();
  FX.log(START_LOG[loaded.source] || (S.stats.tries ? '저장된 게임을 불러왔습니다.' : '검을 강화해 전설을 만들어 보세요! (Space: 강화)'));
  if (loaded.source === 'corrupt') FX.toast(corruptNotice(loaded), 'bad');
  setInterval(tick, TICK_MS);
})(typeof globalThis !== 'undefined' ? globalThis : this);
