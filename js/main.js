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

  // 저장 키에 쓰는 길은 이 관문 하나뿐이다(persist). 손상 원문을 지키는 보호 모드도 여기서 막는다
  const keeper = SV.createSaveKeeper(storage);
  const loaded = keeper.load(now());
  let S = loaded.state;
  const audio = SG.createAudio(() => S.settings.muted);
  const sfx = cue => audio.play(cue);

  // epoch: 상태를 통째로 바꿀 때(resetUiFor)마다 증가. 진행 중인 강화 연출이 바뀐 상태에 결과를 적용하지 않게 한다
  const ui = {
    tab: 'shop', dragId: null, armed: {}, busy: false, view: null, epoch: 0,
    huntUntil: 0, nextAutoAt: now() + I.autoInterval(S), nextEnhanceAt: 0,
  };
  let lastSaveAt = 0;
  let saveFailNoticed = false;
  // 다른 탭이 같은 저장을 쓰기 시작하면 이 탭은 저장·틱·입력을 멈춘다(tabGuard: 아래 '다른 탭과의 충돌 방지')
  const isSuspended = () => tabGuard.isSuspended();

  function persist() {
    if (isSuspended()) return;
    if (keeper.save(S, now()) === 'failed') noticeSaveFailedOnce();
    lastSaveAt = now();
    showSaveStatus();
  }
  // 보호 모드 배너와 '저장 안 됨' 배지(마지막 저장 시도가 실패한 동안)
  const showSaveStatus = () => V.renderSaveStatus({ guarding: keeper.isProtected(), failed: keeper.lastSaveFailed() });
  // 저장 실패는 틱마다 반복되므로 이번 세션에 한 번만 알린다
  function noticeSaveFailedOnce() {
    if (saveFailNoticed) return;
    saveFailNoticed = true;
    FX.toast(V.SAVE_FAILED_TEXT, 'bad');
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
  // play(r, fx, current): 기다림이 있는 연출은 기다린 뒤 current()가 false면(상태가 바뀜) 멈춘다
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
    destroy: { holdView: true, async play(r, fx, current) {
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
      if (!current()) return;
      if (r.shards > 0) sfx('shardGain');
      // 다른 검을 자동으로 고르지 않는다(규칙: 활성 없음). 연타가 다른 검의 강화로 이어지지 않게 한다
      ui.view = null;
      render();
      FX.setSwordAnim(null);
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
    if (r.used.sure && !r.chances.forced) sfx('useSure');   // 강제 성공(테스트 페이지)은 확정 강화권을 쓰지 않는다
    ui.busy = true;
    ui.view = { lv: r.from, chances: r.chances, gauge: r.gaugeBefore };
    render();
    // 연출 도중 이어받기·새 게임으로 상태가 바뀌면 이 시도의 표시를 버리고, 새 상태의 busy·view도 건드리지 않는다
    const epoch = ui.epoch;
    const current = () => ui.epoch === epoch;

    if (fx.charge) {
      FX.setSwordAnim('charging');
      sfx('charge');
      await wait(fx.charge);
      if (!current()) return;
      FX.setSwordAnim(null);
    }
    if (!outcome.holdView) { ui.view = null; render(); }
    await outcome.play(r, fx, current);
    if (!current()) return;
    if (r.mastery) {
      const msg = V.masteryToastText(r.mastery);
      FX.toast(msg, 'special');
      FX.log(msg, 'good');
    }
    if (r.anvilBroke) { FX.toast('모루가 파손되었습니다 (수리 필요)', 'bad'); sfx('anvilBreak'); }
    if (r.ranOut.length) FX.toast(V.ranOutToastText(r.ranOut));
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
    // 보관함 칸 한 번 클릭 = 활성 검. 강화 연출 중이거나 이미 활성인 검이면 무시
    activate: id => {
      if (ui.busy || +id === S.active) return;
      const r = R.setActive(S, +id);
      settle(r, () => `${V.swordName(R.activeSword(S).lv)}을(를) 활성 검으로 정했습니다.`, 'buy');
      if (r.ok) FX.setSwordAnim('appear');
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
    copyCorrupt: () => copyGuardedRaw(),
    retryBackup: () => retryCorruptBackup(),
    abandonCorrupt: () => abandonCorruptSave(),
    closeModal: () => { $('#modal').hidden = true; sfx('offlineCollect'); },
  };

  const CHANGES = {
    tray: el => {
      const r = R.setUse(S, el.dataset.id, el.checked);
      if (!r.ok) return reject(r.reason);
      afterChange();
    },
    seal: el => { R.setSeal(S, el.checked); afterChange(); },
    auto: el => setAuto(el.checked),
  };

  // ============================================================ 오프라인 / 주기 갱신
  function showOffline(r) {
    $('#modal').innerHTML = V.offlineModalHTML(r);
    $('#modal').hidden = false;
    FX.log(`자리 비운 동안 ${fmt(r.gold)}G를 벌었습니다.`, 'gold');
  }
  let stripDrag = null;
  const cancelDrag = () => { if (stripDrag) stripDrag.cancel(); };
  /**
   * 상태를 통째로 바꿀 때(이어받기·새 게임) 이전 상태에 묶인 UI 상태를 모두 버린다:
   * 드래그 제스처(V1), 진행 중인 강화 연출(epoch·busy·view·검 애니메이션), 2회 클릭 확인, 강화·자동 사냥 시각
   */
  function resetUiFor(state, t) {
    cancelDrag();
    S = state;
    ui.epoch++;
    FX.setSwordAnim(null);
    // 이 탭의 옛 자동 사냥 시각을 두면, 다른 탭이 이미 지급한 몫을 catch-up으로 다시 지급한다
    Object.assign(ui, { view: null, busy: false, armed: {}, nextEnhanceAt: 0, nextAutoAt: t + I.autoInterval(state) });
  }
  /**
   * 저장소의 유효한 v2 상태를 이어받는다. force가 아니면 다른 탭이 더 나중에 저장했을 때(lastSeen이 더 최근)만.
   * 오래된 탭이 옛 lastSeen으로 오프라인 보상을 다시 받고 최신 저장을 덮어쓰는 것을 막는다.
   * 이 탭의 저장이 실패해 저장소 쪽이 더 오래된 경우에는 메모리 상태를 유지한다.
   * 저장이 손상이면 이어받지 않고(메모리 상태 유지) 다음 저장 전에 원문을 백업한다(실패하면 보호 모드, AC 33)
   */
  function adoptStoredSave(t, force) {
    const stored = keeper.checkStored(t);
    if (stored.backup) noticeCorruptBackup(stored.backup);
    const latest = stored.state;
    if (!latest || (!force && latest.idle.lastSeen <= S.idle.lastSeen)) return;
    resetUiFor(latest, t);
  }
  /** 이어받기·복귀·다시 시도에서 손상 원문을 백업한 결과 알림. 실패(보호 모드)는 배너가 알린다 */
  function noticeCorruptBackup(backup) {
    if (backup === 'written' || backup === 'same') FX.toast(V.corruptKeptText(SV.CORRUPT_BACKUP_KEY));
    else if (backup === 'occupied') FX.toast(V.SAVE_SAFETY_TEXT.occupied, 'bad');
  }
  /** 복귀 정산: 다른 탭의 더 최근 저장을 이어받고, 오프라인 수입을 한 번 정산한다 */
  function resume() {
    if (isSuspended()) return;
    const t = now();
    adoptStoredSave(t, false);
    const off = I.settleOffline(S, t);
    if (off) ui.nextAutoAt = t + I.autoInterval(S);
    Q.refreshQuests(S, t, rng);
    persist();
    render();
    if (off && off.gold > 0) showOffline(off);
  }
  function tick() {
    if (isSuspended() || document.hidden) return;   // 숨김 동안은 복귀 정산(resume)이 처리
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

  // ============================================================ 저장 보호 모드 (손상 원문 백업 실패)
  // 버튼은 data-act 클릭으로만 불리므로 탭 잠금(whenActive) 중에는 동작하지 않는다
  async function copyGuardedRaw() {
    const raw = keeper.guardedRaw();
    if (raw === null) return;
    if (await copyText(raw)) return FX.toast(V.SAVE_SAFETY_TEXT.copied);
    FX.toast(V.SAVE_SAFETY_TEXT.copyFailed, 'bad');
    V.showCorruptRaw(raw);
  }
  function retryCorruptBackup() {
    const backup = keeper.retryBackup();
    if (backup === null) return;
    if (backup === 'failed') return FX.toast(V.SAVE_SAFETY_TEXT.retryFailed, 'bad');
    noticeCorruptBackup(backup);
    persist();
  }
  function abandonCorruptSave() {
    if (!keeper.isProtected() || !confirm(V.SAVE_SAFETY_TEXT.abandonConfirm)) return;
    keeper.abandon();
    persist();
  }
  /** 클립보드 복사. Clipboard API가 없거나 거부되면(file:// 등) 선택+execCommand로, 그것도 안 되면 false. 예외를 던지지 않는다 */
  async function copyText(text) {
    try {
      await root.navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      return copyBySelection(text);
    }
  }
  function copyBySelection(text) {
    let helper = null;
    try {
      helper = document.createElement('textarea');
      helper.value = text;
      helper.readOnly = true;
      helper.className = 'clip-helper';
      document.body.appendChild(helper);
      helper.select();
      return document.execCommand('copy') === true;
    } catch (e) {
      return false;
    } finally {
      if (helper) helper.remove();
    }
  }

  // ============================================================ 다른 탭과의 충돌 방지
  // 같은 저장 키를 다른 탭이 쓰면 이 탭을 멈추고(잠금 화면은 js/tab-guard.js), 사용자가 고르면 최신 저장을 이어받아 계속한다
  function suspendForOtherTab() {
    cancelDrag();
    ui.armed = {};
    $('#modal').hidden = true;
    $('#settingsPop').hidden = true;
  }
  /** 사용자가 이 탭을 고르면 저장소의 유효한 저장을 lastSeen 비교 없이 이어받는다(없거나 손상이면 메모리 상태로 계속) */
  function takeOver() {
    adoptStoredSave(now(), true);
    resume();
  }
  const tabGuard = SG.createTabGuard({
    win: root, key: C.SAVE_KEY, storageArea: storage,
    overlay: $('#tabLock'), takeoverButton: $('#btnTakeover'), inertEls: [$('header'), $('main')],
    onSuspend: suspendForOtherTab, onTakeOver: takeOver,
  });
  const whenActive = tabGuard.whenActive;

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
    const t = now();
    resetUiFor(SV.defaultState(t), t);
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

  // 보관함 칸 드래그: 놓은 자리로 순서만 바꾼다(활성 검은 그대로). 강화 연출 중·탭 잠금 중에는 시작하지 않는다
  stripDrag = SG.createStripDrag($('#strip'), {
    item: '[data-sword]',
    canStart: () => !isSuspended() && !ui.busy,
    onStart: id => { ui.dragId = id; },
    onEnd: (id, toIndex) => {
      ui.dragId = null;
      const r = toIndex === null || isSuspended() || ui.busy ? null : R.moveSword(S, id, toIndex);
      if (r && r.ok && r.moved) afterChange();
      else render();
    },
  });

  document.addEventListener('keydown', whenActive(e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (ui.dragId !== null && (e.code === 'Space' || e.code === 'KeyS')) { e.preventDefault(); return; }   // 드래그 중에는 강화·판매 금지
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
