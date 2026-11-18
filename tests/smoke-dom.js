/* 브라우저 스크립트 스모크 테스트: 최소 DOM 스텁 위에서 index.html의 스크립트를 순서대로 실행하고
 * 클릭·키·틱을 흉내 내어 예외가 없는지, 렌더 결과에 undefined/NaN이 없는지 확인한다.
 * 레이아웃·CSS·실제 애니메이션은 검증하지 않는다(브라우저 필요). 실행: node tests/smoke-dom.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');

// ------------------------------------------------------------ DOM 스텁
const allEls = [];
class El {
  constructor(sel) {
    this.sel = sel;
    this.style = { setProperty() {} };
    const cls = new Set();
    this.classList = { add: c => cls.add(c), remove: (...c) => c.forEach(x => cls.delete(x)), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: c => cls.has(c) };
    this.dataset = {};
    this.children = [];
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.textContent = '';
    this.firstChild = { textContent: '' };
    this.listeners = {};
    this._q = {};
    this._html = '';
    allEls.push(this);
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  querySelector(s) { return this._q[s] || (this._q[s] = new El(s)); }
  querySelectorAll() { return []; }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  appendChild(c) { this.children.push(c); return c; }
  prepend(c) { this.children.unshift(c); }
  remove() {}
  get lastChild() { return this.children.pop() || { remove() {} }; }
  get offsetWidth() { return 0; }
  getBoundingClientRect() { return { width: 300, height: 300 }; }
  getContext() {
    return new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  }
  closest() { return null; }
}

function makeEnv(initialStorage, opts = {}) {
  allEls.length = 0;
  const byId = {};
  const docListeners = {};
  const store = Object.assign({}, initialStorage);
  const timers = [];
  const winListeners = {};
  const document = {
    hidden: false,
    documentElement: new El('html'),
    querySelector: s => byId[s] || (byId[s] = new El(s)),
    querySelectorAll: () => [],
    createElement: t => new El(t),
    addEventListener: (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); },
  };
  // opts.now: 가짜 시계(탭 동결 등 시간 경과 재현용)
  const ClockDate = opts.now ? Object.assign(class extends Date {}, { now: opts.now }) : Date;
  const ctx = {
    console, Math, Date: ClockDate, JSON, Promise, Object, Array, Number, String, Set, Map, Proxy, Error,
    document,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    requestAnimationFrame: () => 0,
    setTimeout: (f, ms) => setTimeout(f, Math.min(ms || 0, 5)),   // 연출 대기를 짧게
    setInterval: f => { timers.push(f); return timers.length; },
    confirm: () => true,
    addEventListener: (t, f) => { (winListeners[t] = winListeners[t] || []).push(f); },
    devicePixelRatio: 1,
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  const html = fs.readFileSync(path.join(ROOT, opts.page || 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])
    .filter(src => !(opts.withoutAssets && src.startsWith('assets/')));
  scripts.forEach(src => vm.runInContext(fs.readFileSync(path.join(ROOT, src), 'utf8'), ctx, { filename: src }));
  return { ctx, byId, docListeners, winListeners, store, tick: () => timers.forEach(f => f()), scripts };
}

function click(env, act, id) {
  const target = { closest: sel => (sel === '[data-act]' ? { dataset: { act, id: id === undefined ? undefined : String(id) }, disabled: false } : null) };
  env.docListeners.click.forEach(f => f({ target }));
}
function change(env, kind, id, checked) {
  const el = { dataset: { change: kind, id }, checked };
  const target = { closest: sel => (sel === '[data-change]' ? el : null) };
  env.docListeners.change.forEach(f => f({ target }));
}
function key(env, code) {
  env.docListeners.keydown.forEach(f => f({ code, repeat: false, preventDefault() {} }));
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
function scanRendered() {
  const bad = allEls.filter(e => /undefined|NaN/.test(e._html + e.textContent + e.firstChild.textContent));
  assert.deepStrictEqual(bad.map(e => e.sel + ': ' + (e._html + e.textContent).slice(0, 160)), []);
}
const saved = env => JSON.parse(env.store['sword-enhance-v2']);
const texts = el => el.children.map(c => c.textContent);
const offlineShown = env => !!env.byId['#modal'] && !env.byId['#modal'].hidden && env.byId['#modal']._html.includes('자리 비운 동안');
function fire(env, type, ev) { (env.winListeners[type] || []).forEach(f => f(ev)); }
function setVisible(env, visible) {
  env.ctx.document.hidden = !visible;
  env.docListeners.visibilitychange.forEach(f => f());
}

const SG_default = () => require(path.join(ROOT, 'js', 'save.js')).defaultState(Date.now());

async function main() {
  let checks = 0;
  const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

  // 1) 새 게임: 로드·렌더·저장
  let env = makeEnv({});
  ok(env.scripts.length === 12, 'all scripts loaded');
  ok(!!env.ctx.M1_ICONS && !!env.ctx.M1_SFX_PLAY, 'content assets loaded');
  ok(env.byId['#tabbar']._html.includes('<svg'), 'content SVG icons used in tabs');
  ok(saved(env).v === 2, 'v2 saved on start');
  scanRendered();
  ok(env.byId['#tabbar']._html.includes(env.ctx.M1_ICONS.lock), 'locked tabs show lock icon');
  ok(env.byId['#btnSettings']._html === '<span class="ic">' + env.ctx.M1_ICONS.settings + '</span>', 'settings button uses content icon');

  // 2) 사냥, 새 검 구매, 칸 선택/활성 전환, 상점, 탭 전환
  env.byId['#btnHunt'].listeners.click[0]();
  ok(saved(env).gold > 300, 'hunt adds gold');
  click(env, 'buySword');
  ok(saved(env).swords.length === 2, 'buy sword');
  click(env, 'select', 2);
  click(env, 'activate', 2);
  ok(saved(env).active === 2, 'activate');
  ['shop', 'forge', 'quests', 'idle', 'records'].forEach(t => click(env, 'tab', t));
  scanRendered();

  // 3) 강화 반복(연출 포함 / 스킵) — 예외 없이 진행
  env.ctx.SG.save.save(env.ctx.localStorage, Object.assign(saved(env), { gold: 5e6 }), Date.now());
  env = makeEnv(env.store);
  for (let i = 0; i < 30; i++) { env.byId['#btnEnhance'].listeners.click[0](); await sleep(25); }
  ok(saved(env).stats.tries >= 25, 'enhance attempts recorded: ' + saved(env).stats.tries);
  env.byId['#setSkip'].checked = true;
  env.byId['#setSkip'].listeners.change[0]({ target: env.byId['#setSkip'] });
  for (let i = 0; i < 30; i++) { key(env, 'Space'); await sleep(260); }
  ok(saved(env).settings.skipFx === true, 'skip setting saved');
  env.tick();
  scanRendered();

  // 4) 고단계 상태에서 모든 패널/트레이/퀘스트/대장간 동작
  const rich = saved(env);
  Object.assign(rich, { gold: 1e8, best: 13, shards: 500, slots: 5 });
  rich.swords = [{ id: 1, lv: 12, prot: 0, pity: 4 }, { id: 2, lv: 9, prot: 2, pity: 0 }, { id: 3, lv: 6, prot: 2, pity: 0 }];
  rich.active = 1;
  rich.nextSwordId = 10;
  Object.assign(rich.inv, { bless: 3, protect: 9, keepdown: 2, sure: 1, booster: 2, seal: 1 });
  Object.assign(rich.ore, { iron: 500, silver: 500, mithril: 200 });
  rich.idle.autoOn = true;
  rich.idle.lastSeen = Date.now() - 10 * 3600 * 1000;   // 오프라인 10시간
  env = makeEnv({ 'sword-enhance-v2': JSON.stringify(rich) });
  ok(!env.byId['#modal'].hidden, 'offline modal shown');
  ok(env.byId['#modal']._html.includes('최대 8시간까지 적립'), 'offline cap text');
  ok(saved(env).stats.offlineGold > 0, 'offline gold credited');
  ok(!env.byId['#destWarn'].hidden, 'protect exhausted warning');
  ok(env.byId['#enhanceSub'].textContent.includes('보호 없음'), 'enhance subtitle warns');
  click(env, 'closeModal');
  ['bless', 'protect', 'keepdown'].forEach(id => change(env, 'tray', id, true));
  ok(saved(env).use.bless === true && saved(env).use.keepdown === true, 'tray toggles saved');
  ok(!env.byId['#tray']._html.includes('상한 도달'), 'keepdown/bless with anvil off are not shown as "no effect" (#1)');
  ['bless', 'protect', 'keepdown', 'sure', 'seal', 'booster', 'anvil_1'].forEach(id => click(env, 'buy', id));
  click(env, 'craft', 1); click(env, 'craft', 2); click(env, 'craft', 3);
  ok(saved(env).anvils.length === 4, 'shop anvil + crafted 3 anvils');
  click(env, 'equip', saved(env).anvils[2].id);
  change(env, 'tray', 'anvil', true);
  ok(saved(env).use.anvil === true, 'anvil toggle');
  click(env, 'exchange', 'protect'); click(env, 'exchange', 'anvil_2');
  click(env, 'upgrade', 'speed'); click(env, 'upgrade', 'gold'); click(env, 'upgrade', 'offline');
  ok(saved(env).idle.up.speed === 1, 'upgrade bought');
  click(env, 'useBooster');
  ok(saved(env).idle.boostUntil > Date.now(), 'booster active');
  click(env, 'expand');
  ['shop', 'forge', 'quests', 'idle', 'records'].forEach(t => click(env, 'tab', t));
  scanRendered();
  const quests = saved(env).quests.list;
  ok(quests.every(Boolean), 'quests generated for best 13');
  // 납품: 요구 단계 검을 하나 만들어 두고 납품
  const q = quests[0];
  const st = saved(env);
  st.swords.push({ id: 50, lv: q.lv, prot: 2, pity: 0 });
  st.nextSwordId = 51;
  st.slots = Math.max(st.slots, st.swords.length);
  st.quests.list[0].item = { id: 'bless', n: 2 };
  st.inv.bless = 0;
  env = makeEnv({ 'sword-enhance-v2': JSON.stringify(st) });
  change(env, 'seal', undefined, true);
  const goldBefore = saved(env).gold;
  click(env, 'deliver', 0);
  const after = saved(env);
  ok(after.stats.delivered === 1 && !after.swords.some(s => s.id === 50), 'delivered quest');
  ok(after.gold - goldBefore === Math.floor(q.gold * 1.3), 'seal applied to quest gold');
  ok(after.inv.bless === 2, 'quest item reward granted');
  const rewardLog = texts(env.byId['#log']).find(t => t.includes('납품했습니다'));
  const rewardToast = texts(env.byId['#toasts']).find(t => t.includes('납품했습니다'));
  ok(rewardLog.includes('✨ 축복 주문서 ×2') && !/[<>]/.test(rewardLog), 'quest reward log is plain text (#2): ' + rewardLog);
  ok(rewardToast.includes('축복 주문서 ×2') && !/[<>]/.test(rewardToast), 'quest reward toast is plain text (#2)');
  click(env, 'reroll', 1);
  click(env, 'sellSel', 2);   // +9 → 확인 필요
  ok(saved(env).swords.some(s => s.id === 2), 'sell +9 needs second click');
  click(env, 'sellSel', 2);
  ok(!saved(env).swords.some(s => s.id === 2), 'sold after confirm');
  for (let i = 0; i < 20; i++) { key(env, 'Space'); await sleep(30); }
  env.tick();
  scanRendered();

  // 5) v1 마이그레이션 (브라우저 경로) + 손상 데이터
  const v1 = { gold: 5000, level: 7, best: 12, muted: true, inv: { bless: 3, protect: 2 }, use: { bless: true, protect: false }, found: [true], stats: { tries: 9, success: 7, fail: 2, destroy: 0, earned: 0 } };
  env = makeEnv({ 'sword-enhance-v1': JSON.stringify(v1) });
  const m = saved(env);
  ok(m.swords[0].lv === 7 && m.gold === 5000 && m.best === 12 && m.settings.muted === true, 'v1 migrated in browser');
  ok(env.store['sword-enhance-v1'] === JSON.stringify(v1), 'v1 key untouched');
  ok(m.quests.list.every(Boolean), 'quests created right after migration (best >= 3)');
  ok(!env.byId['#modal'] || env.byId['#modal']._html === '', 'no offline popup right after migration');
  scanRendered();
  env = makeEnv({ 'sword-enhance-v2': '{broken' });
  ok(saved(env).gold === 300, 'corrupt v2 → new game');
  ok(env.store['sword-enhance-v2-corrupt'] === '{broken', 'corrupt v2 backed up before overwrite');
  ok(texts(env.byId['#toasts']).some(t => t.includes('sword-enhance-v2-corrupt') && t.includes('백업되어')), 'corrupt backup toast shown');
  scanRendered();
  // AC 18: 백업 키가 이미 차 있으면 덮어쓰지 않고, 토스트는 이번 원본이 보관됐다고 말하지 않는다
  env = makeEnv({ 'sword-enhance-v2': '{second', 'sword-enhance-v2-corrupt': '{first' });
  ok(saved(env).gold === 300, 'second corrupt v2 → new game');
  ok(env.store['sword-enhance-v2-corrupt'] === '{first', 'existing corrupt backup is never overwritten');
  {
    const toast = texts(env.byId['#toasts']).find(t => t.includes('sword-enhance-v2-corrupt'));
    ok(!!toast && toast.includes('이전 백업') && !toast.includes('백업되어'), 'toast says the earlier backup was kept, not this original: ' + toast);
  }

  // 5b) 두 탭 (#3): 다른 탭이 저장하면 이 탭은 멈추고 덮어쓰지 않는다. 이어받으면 최신 저장으로 계속
  const idleSave = Object.assign(SG_default(), { gold: 1000, best: 8 });
  idleSave.swords = [{ id: 1, lv: 8, prot: 2, pity: 0 }];
  idleSave.idle.autoOn = true;
  env = makeEnv({ 'sword-enhance-v2': JSON.stringify(idleSave) });
  const otherTab = Object.assign(saved(env), { gold: 777777 });
  otherTab.idle.lastSeen = Date.now() + 5;
  env.store['sword-enhance-v2'] = JSON.stringify(otherTab);
  fire(env, 'storage', { key: 'sword-enhance-v2' });
  ok(env.byId['#tabLock'].hidden === false, 'other-tab lock shown on storage event');
  env.byId['#btnHunt'].listeners.click[0]();
  key(env, 'KeyH');
  env.tick();
  setVisible(env, false);
  fire(env, 'pagehide', {});
  ok(saved(env).gold === 777777, 'suspended tab neither acts nor overwrites the other tab save');
  await sleep(10);
  env.byId['#btnTakeover'].listeners.click[0]();
  ok(env.byId['#tabLock'].hidden === true, 'take over hides the lock');
  ok(saved(env).gold === 777777 && env.byId['#gold'].textContent === '777,777', 'take over continues from the latest save');
  env.byId['#btnHunt'].listeners.click[0]();
  ok(saved(env).gold > 777777, 'tab is active again after take over');

  // 5c) storage 이벤트 없이도: 숨김→복귀 시 다른 탭의 더 최근 저장을 이어받고 오프라인 보상을 다시 주지 않는다
  env = makeEnv({ 'sword-enhance-v2': JSON.stringify(idleSave) });
  setVisible(env, false);
  await sleep(10);
  const newer = Object.assign(saved(env), { gold: 424242 });
  newer.idle.lastSeen = Date.now() + 5;
  env.store['sword-enhance-v2'] = JSON.stringify(newer);
  setVisible(env, true);
  ok(saved(env).gold === 424242 && saved(env).stats.offlineGold === 0, 'resume adopts the newer save from another tab');
  ok(!offlineShown(env), 'no duplicate offline reward on resume');

  // 5e) 이어받기 직후 이 탭의 옛 자동 사냥 시각으로 다른 탭이 이미 받은 몫을 다시 지급하지 않는다 (가짜 시계)
  const TAKEOVER_GAP_MS = 5 * 60 * 1000;     // 이 탭이 멈춰 있던 시간
  const OTHER_TAB_SAVE_AGO_MS = 10 * 1000;   // 다른 탭의 마지막 저장: OFFLINE_MIN_SEC보다 최근
  const tickMs = 500;
  const autoSave = t => {
    const s = JSON.parse(JSON.stringify(idleSave));
    s.gold = 50000;
    s.idle.lastSeen = t;
    return s;
  };
  const otherTabWrites = (env2, t, gold) => {
    const s = Object.assign(saved(env2), { gold });
    s.idle.lastSeen = t - OTHER_TAB_SAVE_AGO_MS;
    env2.store['sword-enhance-v2'] = JSON.stringify(s);
  };
  const oneAutoRun = (env2, t) => env2.ctx.SG.idle.autoRunGold(saved(env2), t);
  const autoMs = env2 => env2.ctx.SG.idle.autoInterval(saved(env2));
  {
    const clk = { t: Date.now() };
    env = makeEnv({ 'sword-enhance-v2': JSON.stringify(autoSave(clk.t)) }, { now: () => clk.t });
    env.tick();
    fire(env, 'storage', { key: 'sword-enhance-v2' });
    ok(env.byId['header'].inert === true && env.byId['main'].inert === true, 'locked tab makes header/main inert');
    clk.t += TAKEOVER_GAP_MS;
    otherTabWrites(env, clk.t, 60000);
    env.byId['#btnTakeover'].listeners.click[0]();
    ok(env.byId['header'].inert === false && env.byId['main'].inert === false, 'take over removes inert');
    ok(saved(env).gold === 60000 && !offlineShown(env), 'take over adopts the other tab save without offline reward');
    clk.t += tickMs;
    env.tick();
    ok(saved(env).gold === 60000, 'no auto catch-up payout right after take over: ' + saved(env).gold);
    clk.t += autoMs(env);
    const expected = 60000 + oneAutoRun(env, clk.t);
    env.tick();
    ok(saved(env).gold === expected, 'next auto run pays exactly once after take over');
  }

  // 5f) 숨김→복귀 시 다른 탭의 더 최근 저장(storage 이벤트 없음)을 이어받아도 추가 지급 없음
  {
    const clk = { t: Date.now() };
    env = makeEnv({ 'sword-enhance-v2': JSON.stringify(autoSave(clk.t)) }, { now: () => clk.t });
    env.tick();
    setVisible(env, false);
    clk.t += TAKEOVER_GAP_MS;
    otherTabWrites(env, clk.t, 70000);
    setVisible(env, true);
    ok(saved(env).gold === 70000 && !offlineShown(env), 'resume adopts the newer save without offline reward');
    clk.t += tickMs;
    env.tick();
    ok(saved(env).gold === 70000, 'no auto catch-up payout right after resume with a newer save: ' + saved(env).gold);
  }

  // 5g) 이어받기 버튼은 lastSeen 비교 없이 저장된 유효 v2를 이어받는다. localStorage.clear(key=null)도 잠금
  {
    const clk = { t: Date.now() };
    env = makeEnv({ 'sword-enhance-v2': JSON.stringify(autoSave(clk.t)) }, { now: () => clk.t });
    fire(env, 'storage', { key: null });
    ok(env.byId['#tabLock'].hidden === false, 'storage clear (key null) locks the tab');
    const older = Object.assign(saved(env), { gold: 999 });
    older.idle.lastSeen = clk.t - OTHER_TAB_SAVE_AGO_MS;
    env.store['sword-enhance-v2'] = JSON.stringify(older);
    env.byId['#btnTakeover'].listeners.click[0]();
    ok(saved(env).gold === 999, 'take over adopts the stored save even with an older lastSeen');
    fire(env, 'storage', { key: null });
    delete env.store['sword-enhance-v2'];
    env.byId['#btnTakeover'].listeners.click[0]();
    ok(saved(env).gold === 999, 'take over with no stored save keeps and re-saves the in-memory state');
    fire(env, 'storage', { key: 'other-key' });
    ok(env.byId['#tabLock'].hidden === true, 'unrelated storage keys do not lock');
  }

  // 5h) 손상된 v1: v1 키는 덮어쓰지 않으므로 "백업 실패"가 아니라 원본 위치를 알린다
  env = makeEnv({ 'sword-enhance-v1': '{gold:' });
  ok(saved(env).gold === 300 && env.store['sword-enhance-v1'] === '{gold:', 'corrupt v1 → new game, v1 key kept');
  ok(texts(env.byId['#toasts']).some(t => t.includes('sword-enhance-v1') && t.includes('그대로') && !t.includes('백업 실패')), 'corrupt v1 toast says the v1 original was left as is (AC 19)');
  ok(!('sword-enhance-v2-corrupt' in env.store), 'corrupt v1 writes no v2 backup');

  // 5d) visibilitychange 없이 탭이 동결됐다 깨어나도 tick에서 오프라인 정산
  const clock = { t: Date.now() };
  const frozenSave = JSON.parse(JSON.stringify(idleSave));
  frozenSave.idle.lastSeen = clock.t;
  env = makeEnv({ 'sword-enhance-v2': JSON.stringify(frozenSave) }, { now: () => clock.t });
  ok(!offlineShown(env), 'no offline popup right after load');
  clock.t += 2 * 3600 * 1000;
  env.tick();
  ok(offlineShown(env) && saved(env).stats.offlineGold > 0, 'tick after a freeze settles offline income');
  ok(saved(env).idle.lastSeen === clock.t, 'lastSeen advanced after freeze settlement');

  // 6) 콘텐츠 에셋 없이도 동작(이모지·합성음 대체)
  env = makeEnv({}, { withoutAssets: true });
  ok(env.byId['#tabbar']._html.includes('🔒'), 'emoji fallback without assets');
  ok(env.byId['#btnSettings']._html === '⚙️', 'settings emoji fallback without assets');
  env.byId['#btnHunt'].listeners.click[0]();
  click(env, 'tab', 'idle');
  scanRendered();

  // 7) M1.1 천장 게이지 + 성공 숙련 화면 (m1.1-late-correction §11, AC 13)
  await lateCorrection(ok);

  // 8) 테스트 페이지(test.html): 같은 스크립트 + 테스트 설정. 강화 100%, 별도 저장 키, 실제 저장 불가침
  await testPage(ok);

  console.log(`smoke-dom: ${checks} checks passed`);
}

/** 태그를 지운 화면 글자(공백 정리) */
const plain = html => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function lateCorrection(ok) {
  const MASTERY_TOAST_16 = '+16 숙련! 이후 +16 강화 성공률 +3%p';
  /** 활성 검 하나(+lv), 넉넉한 골드·소모품, 미스릴 모루 장착 */
  const lateSave = (lv, fields) => {
    const s = Object.assign(SG_default(), { gold: 1e9, best: Math.max(lv, 15) }, fields);
    s.swords = [{ id: 1, lv, prot: 2, pity: (fields && fields.pity) || 0 }];
    Object.assign(s.inv, { bless: 3, protect: 20, keepdown: 3 });
    s.anvils = [{ id: 1, g: 3, dura: 50 }]; s.anvilEq = 1; s.nextAnvilId = 2;
    return s;
  };
  const load = s => makeEnv({ 'sword-enhance-v2': JSON.stringify(s) });
  const toastCount = (env, text) => texts(env.byId['#toasts']).filter(t => t === text).length;
  const masteryRows = env => (env.byId['#masteryList']._html.match(/<li>[\s\S]*?<\/li>/g) || []).map(plain);

  // +14 이하: 게이지 줄 숨김. 기록 탭에는 5단계 숙련 행
  let env = load(lateSave(14, { gauge: [3, 3, 3, 3, 3], mastery: [0, 2, 0, 0, 0] }));
  ok(env.byId['#gaugeLine'].hidden === true && env.byId['#gaugeLine']._html === '', 'gauge line hidden at +14');
  ok(!env.byId['#breakdown']._html.includes('숙련'), 'no mastery term at +14');
  ok(JSON.stringify(masteryRows(env)) === JSON.stringify(['+15 숙련 +0%p (0/4)', '+16 숙련 +6%p (2/4)', '+17 숙련 +0%p (0/4)',
    '+18 숙련 +0%p (0/3)', '+19 숙련 +0%p (0/2)']), 'records tab lists 5 mastery rows: ' + masteryRows(env).join(' | '));
  scanRendered();

  // +16 게이지 3/5 (저장값과 일치), 확정 아님
  env = load(lateSave(16, { gauge: [0, 3, 0, 0, 0] }));
  ok(env.byId['#gaugeLine'].hidden === false && plain(env.byId['#gaugeLine']._html) === '천장 3/5', 'gauge 3/5 at +16 matches the save');
  ok(env.byId['#vSucc'].textContent === '15%', 'odds unchanged while the gauge is not full');

  // 숙련 항목은 상한 표시와 분리: +16 숙련 2회 + 축복 + 미스릴 = 35%
  const mastered = lateSave(16, { mastery: [0, 2, 0, 0, 0] });
  Object.assign(mastered.use, { bless: true, anvil: true });
  env = load(mastered);
  ok(env.byId['#vSucc'].textContent === '35%', 'success 15 + 14 + 6 = 35%');
  ok(plain(env.byId['#breakdown']._html) === '기본 15% + 축복 10 + 모루 4 = +14 + 숙련 +6 = 35%', 'breakdown: ' + plain(env.byId['#breakdown']._html));
  // +15 상한 초과(축복+미스릴+보정 최대) + 숙련 최대: 취소선·상한 뱃지 뒤에 숙련이 따로 붙는다
  const capped = lateSave(15, { mastery: [4, 0, 0, 0, 0], pity: 10 });
  Object.assign(capped.use, { bless: true, anvil: true });
  env = load(capped);
  const bd = env.byId['#breakdown']._html;
  ok(env.byId['#vSucc'].textContent === '46%', 'success 20 + 14(cap) + 12 = 46%');
  ok(bd.includes('<s>+24</s> +14') && bd.indexOf('상한 14') < bd.indexOf('mastery-term') && !/<s>[^<]*숙련/.test(bd), 'mastery term sits apart from the cap strikethrough/badge: ' + plain(bd));
  scanRendered();

  // 게이지 가득: 확정!, 100%/0%, 토글 전부 잠금(gaugeFull 사유). 시도는 cost만 쓰고 숙련 토스트 1회
  const full = lateSave(16, { gauge: [0, 5, 0, 0, 0], mastery: [0, 1, 0, 0, 0] });
  Object.assign(full.use, { bless: true, anvil: true, protect: true });
  env = load(full);
  ok(plain(env.byId['#gaugeLine']._html) === '천장 5/5 확정!', 'full gauge shows 확정!');
  ok(env.byId['#vSucc'].textContent === '100%' && env.byId['#vDest'].textContent === '0%', 'full gauge odds 100% / 0%');
  ok(env.byId['#breakdown']._html.includes('천장 확정'), 'breakdown names the guaranteed attempt');
  const trayHtml = env.byId['#tray']._html;
  const rows = (trayHtml.match(/<label class="opt/g) || []).length;
  ok(rows >= 4 && (trayHtml.match(/disabled>/g) || []).length === rows && (trayHtml.match(/천장 확정: 소모품이 필요 없음/g) || []).length === rows,
    'every tray toggle is locked with the gaugeFull reason');
  const before = saved(env);
  const pending = env.byId['#btnEnhance'].listeners.click[0]();
  ok(plain(env.byId['#gaugeLine']._html) === '천장 5/5 확정!', 'during the animation the pre-attempt gauge is shown (no spoiler)');
  await pending;
  const after = saved(env);
  ok(after.swords[0].lv === 17 && JSON.stringify(after.gauge) === '[0,0,0,0,0]' && JSON.stringify(after.mastery) === '[0,2,0,0,0]', 'guaranteed success resets the gauge and records mastery');
  ok(after.gold === before.gold - env.ctx.SG.rules.cost(16), 'only cost(16) was paid');
  ok(after.inv.bless === 3 && after.inv.protect === 20 && after.anvils[0].dura === 50, 'no consumable / anvil durability spent');
  ok(after.use.bless && after.use.anvil && after.use.protect, 'saved toggle choices kept');
  ok(toastCount(env, MASTERY_TOAST_16) === 1, 'one mastery toast per new record');
  ok(plain(env.byId['#gaugeLine']._html) === '천장 0/6', 'gauge line follows the sword to +17');
  ok(masteryRows(env)[1] === '+16 숙련 +6%p (2/4)', 'records tab updated');
  scanRendered();

  // 기록 상한(REC_MAX)에서는 성공해도 토스트 없음
  env = load(lateSave(16, { gauge: [0, 5, 0, 0, 0], mastery: [0, 4, 0, 0, 0] }));
  await env.byId['#btnEnhance'].listeners.click[0]();
  ok(saved(env).swords[0].lv === 17 && saved(env).mastery[1] === 4 && toastCount(env, MASTERY_TOAST_16) === 0
    && !texts(env.byId['#toasts']).some(t => t.includes('숙련!')), 'no mastery toast once the record is maxed');
}

const TEST_KEY = 'sword-enhance-test';
const REAL_KEYS = ['sword-enhance-v2', 'sword-enhance-v1', 'sword-enhance-v2-corrupt'];
// 잠금 화면은 setLocked가 처음 호출될 때 스텁 요소가 생긴다
const isLocked = env => !!env.byId['#tabLock'] && env.byId['#tabLock'].hidden === false;
const savedTest = env => JSON.parse(env.store[TEST_KEY]);
const scriptList = page => [...fs.readFileSync(path.join(ROOT, page), 'utf8').matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const elementIds = page => [...fs.readFileSync(path.join(ROOT, page), 'utf8').matchAll(/id="([^"]+)"/g)].map(m => m[1]);

async function testPage(ok) {
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const testHtml = fs.readFileSync(path.join(ROOT, 'test.html'), 'utf8');
  const title = html => html.match(/<title>([^<]*)<\/title>/)[1];
  ok(title(testHtml) !== title(indexHtml) && title(testHtml).includes('TEST'), 'test page has its own title');
  ok(testHtml.includes('TEST MODE · 강화 100%') && !indexHtml.includes('TEST MODE'), 'TEST MODE banner only on the test page');
  ok(!/test-mode|test-panel/.test(indexHtml), 'index.html loads no test scripts');
  // 마크업은 복제본이므로 index.html과 어긋나지 않는지 확인: 같은 요소 id + 같은 게임 스크립트 순서
  ok(elementIds('index.html').every(id => elementIds('test.html').includes(id)), 'test page keeps every index.html element id');
  const expectedScripts = ['js/test-mode.js', ...scriptList('index.html')];
  expectedScripts.splice(expectedScripts.indexOf('js/main.js'), 0, 'js/test-panel.js');
  ok(JSON.stringify(scriptList('test.html')) === JSON.stringify(expectedScripts), 'test page = real scripts + test config first + panel before main');

  const realStore = {
    'sword-enhance-v2': JSON.stringify(Object.assign(SG_default(), { gold: 4242 })),
    'sword-enhance-v1': JSON.stringify({ gold: 5000, level: 7 }),
    'sword-enhance-v2-corrupt': '{old',
  };
  const realUntouched = env => REAL_KEYS.every(k => env.store[k] === realStore[k]);

  let env = makeEnv(realStore, { page: 'test.html' });
  ok(env.scripts.length === 14, 'test page loads all scripts');
  ok(env.ctx.SG.C.SAVE_KEY === TEST_KEY && env.ctx.SG.config.forceSuccess === true, 'test config applied');
  ok(savedTest(env).gold === 300 && savedTest(env).swords[0].lv === 0, 'test page starts its own new game (no v1 migration, no real save)');
  ok(realUntouched(env), 'real v2 / v1 / corrupt-backup keys untouched on test page start');
  ok(env.byId['#testBannerText'].textContent === 'TEST MODE · 강화 100%', 'banner text');
  ok(env.byId['#vSucc'].textContent === '100%' && env.byId['#vDest'].textContent === '0%', 'shown odds are 100% / 0%');
  click(env, 'testGold');
  ok(savedTest(env).gold === 300 + 1000000, 'gold +1,000,000');
  scanRendered();

  for (let i = 0; i < 60 && savedTest(env).swords[0].lv < 20; i++) {
    env.byId['#btnEnhance'].listeners.click[0]();
    await sleep(20);
  }
  const top = savedTest(env);
  ok(top.swords[0].lv === 20 && top.stats.success === 20 && top.stats.tries === 20, 'enhance always succeeds: +0 → +20 in 20 tries');
  ok(top.stats.fail === 0 && top.stats.destroy === 0, 'no fail / destroy');
  ok(realUntouched(env), 'real saves untouched after test play');
  scanRendered();

  // 탭 잠금: 테스트 탭은 자기 키에만 반응
  fire(env, 'storage', { key: 'sword-enhance-v2' });
  fire(env, 'storage', { key: 'sword-enhance-v1' });
  fire(env, 'storage', { key: 'sword-enhance-v2-corrupt' });
  const goldNow = savedTest(env).gold;
  click(env, 'testGold');
  ok(!isLocked(env) && savedTest(env).gold === goldNow + 1000000, 'real-game storage events do not lock the test tab');
  fire(env, 'storage', { key: TEST_KEY });
  ok(isLocked(env), 'another test tab locks the test tab');
  env.byId['#btnTakeover'].listeners.click[0]();
  ok(!isLocked(env), 'test tab take over');

  click(env, 'testReset');
  ok(savedTest(env).gold === 300 && savedTest(env).swords[0].lv === 0, 'reset clears only the test save');
  ok(realUntouched(env), 'real saves untouched after test reset');
  click(env, 'testToggleForce');
  ok(env.ctx.SG.config.forceSuccess === false && env.byId['#vSucc'].textContent === '95%', '100% toggle off shows the real table');
  ok(env.byId['#testBannerText'].textContent.includes('꺼짐') && env.byId['#btnTestForce'].textContent.includes('꺼짐'), 'banner/button show the toggle state');
  click(env, 'testToggleForce');
  ok(env.ctx.SG.config.forceSuccess === true && env.byId['#vSucc'].textContent === '100%', '100% toggle back on');

  // 손상된 테스트 저장: 테스트 백업 키에만 백업, 실제 백업 키는 그대로
  env = makeEnv(Object.assign({}, realStore, { [TEST_KEY]: '{broken' }), { page: 'test.html' });
  ok(env.store['sword-enhance-test-corrupt'] === '{broken' && realUntouched(env), 'corrupt test save backed up to the test backup key only');
  ok(texts(env.byId['#toasts']).some(t => t.includes('sword-enhance-test-corrupt')), 'corrupt toast names the test backup key');

  // 실제 페이지: 테스트 키 이벤트로 잠기지 않고, 테스트 조작은 없다
  env = makeEnv({});
  fire(env, 'storage', { key: TEST_KEY });
  env.byId['#btnHunt'].listeners.click[0]();
  const goldBefore = saved(env).gold;
  ok(!isLocked(env) && goldBefore > 300, 'test-tab storage events do not lock the real tab');
  click(env, 'testGold');
  ok(saved(env).gold === goldBefore && !(TEST_KEY in env.store), 'real page has no test actions and never writes the test key');
  ok(env.ctx.SG.config.forceSuccess === false && env.byId['#vSucc'].textContent === '95%', 'real page odds unchanged');
}

main().catch(e => { console.error('smoke-dom FAILED:', e.stack || e.message); process.exit(1); });
