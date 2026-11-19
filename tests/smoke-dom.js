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
  focus() { El.focused = this; }
}

function makeEnv(initialStorage, opts = {}) {
  allEls.length = 0;
  const byId = {};
  const docListeners = {};
  const store = Object.assign({}, initialStorage);
  const timers = [];
  // opts.manualTimers: setTimeout을 가상 시계 큐에 넣고 테스트가 runTimer로 하나씩 실행한다(연출 순서 재현용)
  const queue = [];
  let virtualMs = 0;
  const queueTimeout = (f, ms) => { queue.push({ f, due: virtualMs + (ms || 0) }); return queue.length; };
  async function runTimer() {
    if (!queue.length) return false;
    const next = queue.reduce((best, t) => (t.due < best.due ? t : best), queue[0]);
    queue.splice(queue.indexOf(next), 1);
    virtualMs = next.due;
    next.f();
    await new Promise(r => setImmediate(r));   // 깨어난 async 함수가 다음 await까지 진행하게 한다
    return true;
  }
  async function runAllTimers() { while (await runTimer()); }
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
    setTimeout: opts.manualTimers ? queueTimeout : (f, ms) => setTimeout(f, Math.min(ms || 0, 5)),   // 연출 대기를 짧게
    clearTimeout,
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
  return { ctx, byId, docListeners, winListeners, store, tick: () => timers.forEach(f => f()), scripts, runTimer, runAllTimers };
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
  ok(env.scripts.length === 14, 'all scripts loaded');
  ok(!!env.ctx.M1_ICONS && !!env.ctx.M1_SFX_PLAY, 'content assets loaded');
  ok(env.byId['#tabbar']._html.includes('<svg'), 'content SVG icons used in tabs');
  ok(saved(env).v === 2, 'v2 saved on start');
  scanRendered();
  ok(env.byId['#tabbar']._html.includes(env.ctx.M1_ICONS.lock), 'locked tabs show lock icon');
  ok(env.byId['#btnSettings']._html === '<span class="ic">' + env.ctx.M1_ICONS.settings + '</span>', 'settings button uses content icon');

  // 2) 사냥, 새 검 구매, 칸 한 번 클릭으로 활성 전환(3-6), 상점, 탭 전환
  env.byId['#btnHunt'].listeners.click[0]();
  ok(saved(env).gold > 300, 'hunt adds gold');
  click(env, 'buySword');
  ok(saved(env).swords.length === 2, 'buy sword');
  ok(env.byId['#strip']._html.includes('data-act="activate" data-id="2"') && !env.byId['#strip']._html.includes('data-act="select"'),
    'strip cards activate on click (no select step)');
  ok(!env.byId['#stripActions']._html.includes('활성으로'), 'no separate 활성으로 button');
  click(env, 'activate', 2);
  ok(saved(env).active === 2, 'one click activates');
  const logCount = env.byId['#log'].children.length;
  click(env, 'activate', 2);
  ok(saved(env).active === 2 && env.byId['#log'].children.length === logCount, 'clicking the already-active sword does nothing');
  ok(env.byId['#stripActions']._html.includes('data-act="sellSel" data-id="2"'), 'strip actions follow the active sword');
  ['shop', 'forge', 'quests', 'idle', 'records'].forEach(t => click(env, 'tab', t));
  scanRendered();

  // 3) 강화 반복(연출 포함 / 스킵) — 예외 없이 진행
  env.ctx.SG.save.save(env.ctx.localStorage, Object.assign(saved(env), { gold: 5e6 }), Date.now());
  env = makeEnv(env.store);
  // 파괴되면 활성 검이 없어지므로(3-6) 반복 강화 점검은 다음 검을 직접 고른다
  const pickIfNone = () => { const st0 = saved(env); if (st0.active === 0) click(env, 'activate', st0.swords[0].id); };
  for (let i = 0; i < 30; i++) { pickIfNone(); env.byId['#btnEnhance'].listeners.click[0](); await sleep(25); }
  ok(saved(env).stats.tries >= 25, 'enhance attempts recorded: ' + saved(env).stats.tries);
  env.byId['#setSkip'].checked = true;
  env.byId['#setSkip'].listeners.change[0]({ target: env.byId['#setSkip'] });
  for (let i = 0; i < 30; i++) { pickIfNone(); key(env, 'Space'); await sleep(260); }
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
  click(env, 'activate', 2);
  click(env, 'sellSel', 2);   // +9 → 확인 필요
  ok(saved(env).swords.some(s => s.id === 2), 'sell +9 needs second click');
  click(env, 'sellSel', 2);
  ok(!saved(env).swords.some(s => s.id === 2), 'sold after confirm');
  ok(saved(env).active === 1, 'selling the active sword still auto-picks the best sword');
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

  // 7b) 3-6: 파괴 뒤 활성 검 없음, 칸 드래그
  await noActiveAfterDestroy(ok);
  await stripDrag(ok);

  // 7c) 대장간 탭이 열려 있으면 파편 0개여도 파편 교환 섹션을 보여 준다
  forgeShardExchange(ok);

  // 8) 테스트 페이지(test.html): 같은 스크립트 + 테스트 설정. 강화 100%, 별도 저장 키, 실제 저장 불가침
  await testPage(ok);

  // 9) 3-3 REQ-012: 연출 중 이어받기·새 게임, 탭 잠금 clear 판정·포커스, 알림 3종
  await req012(ok);
  particleCap(ok);

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

/** 3-6: 파괴 뒤에는 어떤 검도 활성이 되지 않고, 연타(Space/S)가 다른 검에 닿지 않는다 */
async function noActiveAfterDestroy(ok) {
  const st = Object.assign(SG_default(), { gold: 1e9, best: 19 });
  st.swords = [{ id: 1, lv: 19, prot: 0, pity: 0 }, { id: 2, lv: 9, prot: 2, pity: 0 }];
  st.nextSwordId = 3;
  st.active = 1;
  // +19: 성공 5% · 파괴 35% → 굴림 20은 파괴. main.js가 로드 시점의 Math.random을 잡으므로 로드 전에 바꾼다
  const realRandom = Math.random;
  Math.random = () => 0.2;
  let env;
  try {
    env = makeEnv({ 'sword-enhance-v2': JSON.stringify(st) });
    await env.byId['#btnEnhance'].listeners.click[0]();
  } finally {
    Math.random = realRandom;
  }
  const after = saved(env);
  ok(after.stats.destroy === 1 && after.active === 0 && after.swords.map(s => s.id).join() === '2', 'destroy leaves no active sword (saved active 0)');
  for (let i = 0; i < 5; i++) { key(env, 'Space'); key(env, 'KeyS'); env.byId['#btnEnhance'].listeners.click[0](); env.byId['#btnSell'].listeners.click[0](); }
  await sleep(20);
  ok(saved(env).stats.tries === 1 && saved(env).swords[0].lv === 9 && saved(env).swords.length === 1, 'Space / S / buttons spam does not touch the other sword');
  const assertEmpty = label => {
    ok(env.byId['#stageEmpty'].hidden === false, label + ': stage shows the choose-a-sword prompt');
    ok(['#vSucc', '#vDest', '#vCost', '#vSell'].every(id => env.byId[id].textContent === '-'), label + ': odds / cost / sell show -');
    ok(env.byId['#btnEnhance'].disabled && env.byId['#btnSell'].disabled, label + ': enhance and sell disabled');
    ok(env.byId['#gaugeLine'].hidden === true && (!env.byId['#sword'] || env.byId['#sword']._html === ''), label + ': no gauge line, no sword drawn');
    ok(env.byId['#stripActions']._html.includes('활성 검 없음') && !env.byId['#stripActions']._html.includes('sellSel'), label + ': strip says no active sword');
    ok(!/class="slot-card active/.test(env.byId['#strip']._html), label + ': no card marked active');
  };
  assertEmpty('after destroy');
  ['shop', 'forge', 'quests', 'idle', 'records'].forEach(t => click(env, 'tab', t));
  env.tick();
  scanRendered();
  ok(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('보관함에서 강화할 검을 선택하세요'), 'prompt text in the stage markup');

  // 저장된 active 0은 다시 불러와도 '없음'
  env = makeEnv(env.store);
  assertEmpty('after reload');
  scanRendered();
  click(env, 'activate', 2);
  ok(saved(env).active === 2 && env.byId['#stageEmpty'].hidden === true && env.byId['#vCost'].textContent !== '-', 'one click picks the next sword');
  ok(!env.byId['#btnEnhance'].disabled && !env.byId['#btnSell'].disabled, 'enhance / sell enabled again');
  scanRendered();
}

/** 3-6: 칸 드래그(Pointer Events 스텁). 카드 3장을 x=0/100/200에 둔다 */
async function stripDrag(ok) {
  const st = Object.assign(SG_default(), { gold: 1e6, best: 5 });
  st.swords = [1, 2, 3].map(id => ({ id, lv: id, prot: 2, pity: 0 }));
  st.nextSwordId = 4;
  st.active = 1;
  const CARD_W = 86;
  const setup = order => {
    const env = makeEnv({ 'sword-enhance-v2': JSON.stringify(Object.assign({}, st, { swords: order.map(id => st.swords.find(x => x.id === id)) })) });
    const strip = env.byId['#strip'];
    const cards = order.map((id, i) => {
      const el = new El('card' + id);
      el.dataset.sword = String(id);
      el.getBoundingClientRect = () => ({ left: i * 100, width: CARD_W, right: i * 100 + CARD_W });
      el.setPointerCapture = () => {};
      return el;
    });
    strip.querySelectorAll = () => cards;
    strip.getBoundingClientRect = () => ({ left: 0, right: 1000, width: 1000 });
    strip.scrollLeft = 0;
    const card = id => cards.find(c => c.dataset.sword === String(id));
    strip.setPointerCapture = () => {};
    const pointer = (type, id, x, kind = 'mouse', buttons = 1) => (strip.listeners[type] || []).forEach(f => f({
      target: { closest: () => card(id) }, isPrimary: true, button: 0, buttons, pointerId: 7, pointerType: kind, clientX: x, clientY: 50,
    }));
    /** 실제 브라우저 순서: 스트립 캡처 리스너(드래그 뒤 click 삼킴) → 문서의 data-act 처리 */
    const clickCard = id => {
      const ev = { stopped: false, stopPropagation() { this.stopped = true; }, preventDefault() {} };
      strip.listeners.click.forEach(f => f(ev));
      if (!ev.stopped) click(env, 'activate', id);
    };
    return { env, card, pointer, clickCard, order: () => saved(env).swords.map(x => x.id).join() };
  };

  // 마우스: 임계값(6px) 미만 이동은 클릭 → 활성 전환
  let d = setup([1, 2, 3]);
  d.pointer('pointerdown', 2, 143); d.pointer('pointermove', 2, 147); d.pointer('pointerup', 2, 147);
  d.clickCard(2);
  ok(!d.card(2).classList.contains('dragging') && d.order() === '1,2,3' && saved(d.env).active === 2, 'mouse move under 6px is a click (activates, no reorder)');

  // 마우스 드래그: 1번을 끝으로 → 표시선은 마지막 카드 뒤, 놓으면 순서 저장, 뒤따르는 click은 삼켜 활성 그대로
  d = setup([1, 2, 3]);
  d.pointer('pointerdown', 2, 143); d.pointer('pointermove', 2, 260);
  ok(d.card(2).classList.contains('dragging') && d.card(3).classList.contains('drop-after'), 'drag shows the lifted card and the drop marker');
  d.pointer('pointerup', 2, 260);
  d.clickCard(2);
  ok(d.order() === '1,3,2' && saved(d.env).active === 1, 'mouse drag reorders and persists; the click after a drag does not activate');
  ok(!d.card(2).classList.contains('dragging') && !d.card(3).classList.contains('drop-after'), 'drag visuals cleared on drop');
  d.clickCard(3);
  ok(saved(d.env).active === 3, 'the next real click activates again');
  scanRendered();

  // 터치: 길게 누르기 전에 움직이면 스크롤로 양보(드래그 아님)
  d = setup([1, 2, 3]);
  d.pointer('pointerdown', 3, 243, 'touch'); d.pointer('pointermove', 3, 220, 'touch');
  await sleep(20);
  d.pointer('pointermove', 3, 10, 'touch'); d.pointer('pointerup', 3, 10, 'touch');
  ok(!d.card(3).classList.contains('dragging') && d.order() === '1,2,3', 'touch swipe before the long-press scrolls, does not drag');
  // 터치: 길게 누르면(타이머) 드래그 시작 → 맨 앞으로
  d.pointer('pointerdown', 3, 243, 'touch');
  await sleep(20);
  ok(d.card(3).classList.contains('dragging'), 'touch long-press starts the drag');
  d.pointer('pointermove', 3, 10, 'touch');
  ok(d.card(1).classList.contains('drop-before'), 'drop marker before the first card');
  d.pointer('pointerup', 3, 10, 'touch');
  ok(d.order() === '3,1,2' && saved(d.env).active === 1, 'touch drag reorders, active unchanged');

  // 취소(pointercancel)는 순서를 바꾸지 않는다
  d = setup([1, 2, 3]);
  d.pointer('pointerdown', 1, 43); d.pointer('pointermove', 1, 260); d.pointer('pointercancel', 1, 260);
  ok(d.order() === '1,2,3' && !d.card(1).classList.contains('dragging'), 'pointercancel aborts the drag');

  // 버튼 없이 들어온 move(바깥에서 뗀 뒤 돌아옴)는 제스처를 취소한다
  d = setup([1, 2, 3]);
  d.pointer('pointerdown', 2, 143); d.pointer('pointermove', 2, 260);
  d.pointer('pointermove', 2, 270, 'mouse', 0);
  ok(!d.card(2).classList.contains('dragging') && d.order() === '1,2,3', 'move with no button held cancels the drag');
  d.pointer('pointermove', 2, 280);
  ok(!d.card(2).classList.contains('dragging'), 'later moves no longer follow the pointer');
  d = setup([1, 2, 3]);
  d.pointer('pointerdown', 2, 143); d.pointer('pointermove', 2, 150, 'mouse', 0);
  ok(!d.card(2).classList.contains('dragging'), 'button-less move before the threshold also ends the gesture');

  // 강화 연출 중(ui.busy)에는 드래그를 시작하지 않는다
  d = setup([1, 2, 3]);
  const pending = d.env.byId['#btnEnhance'].listeners.click[0]();
  d.pointer('pointerdown', 2, 143); d.pointer('pointermove', 2, 260); d.pointer('pointerup', 2, 260);
  ok(!d.card(2).classList.contains('dragging') && d.order() === '1,2,3', 'no drag while the enhance animation runs');
  await pending;
  scanRendered();

  // 끄는 중 다른 탭 잠금·새 게임(resetUiFor): 제스처를 정리하고 순서를 바꾸지 않는다(V1)
  d = setup([1, 2, 3]);
  d.pointer('pointerdown', 2, 143); d.pointer('pointermove', 2, 260);
  fire(d.env, 'storage', { key: 'sword-enhance-v2' });
  ok(!d.card(2).classList.contains('dragging') && !d.card(3).classList.contains('drop-after'), 'other-tab lock cancels a drag in progress');
  d.env.byId['#btnTakeover'].listeners.click[0]();
  d.pointer('pointerup', 2, 260);
  ok(d.order() === '1,2,3', 'releasing after the lock does not reorder');
  d.pointer('pointerdown', 2, 143); d.pointer('pointermove', 2, 260);
  ok(d.card(2).classList.contains('dragging'), 'drag works again after take over');
  d.env.byId['#btnReset'].listeners.click[0]();
  ok(!d.card(2).classList.contains('dragging') && saved(d.env).gold === 300, 'new game cancels a drag in progress');
  key(d.env, 'Space');
  ok(saved(d.env).stats.tries === 1, 'Space works again after the drag was cancelled by new game');
}

const TEST_KEY = 'sword-enhance-test';
const REAL_KEYS = ['sword-enhance-v2', 'sword-enhance-v1', 'sword-enhance-v2-corrupt'];
// 잠금 화면 스텁은 탭 가드가 시작할 때 만들고 숨긴다
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
  ok(env.scripts.length === 16, 'test page loads all scripts');
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

/** REQ-012 #11: 파티클 상한과 캔버스 크기 캐시(fx.js만 별도 VM에서 실행) */
function particleCap(ok) {
  let draws = 0;
  let layoutReads = 0;
  let frame = null;
  const canvas2d = new Proxy({}, {
    get: (t, k) => (k === 'arc' || k === 'fillRect' ? () => { draws++; } : (k in t ? t[k] : () => {})),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const cv = { width: 0, height: 0, getContext: () => canvas2d, getBoundingClientRect: () => { layoutReads++; return { width: 300, height: 200 }; } };
  const ctx = { Math, Object, Array, devicePixelRatio: 1, document: { querySelector: () => cv }, requestAnimationFrame: fn => { frame = fn; return 1; } };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['js/constants.js', 'js/fx.js'].forEach(src => vm.runInContext(fs.readFileSync(path.join(ROOT, src), 'utf8'), ctx, { filename: src }));
  const FX = ctx.SG.fx;
  FX.sizeFx();
  ok(layoutReads === 1 && cv.width === 300 && cv.height === 200, '#11: sizeFx reads the layout once and sizes the canvas');
  for (let i = 0; i < 10; i++) FX.burst(['#ffffff'], 140);
  frame();
  ok(draws === ctx.SG.C.MAX_PARTICLES, '#11: one frame draws at most MAX_PARTICLES: ' + draws);
  ok(layoutReads === 1, '#11: bursts and frames use the cached canvas size (no layout read)');
}

/** 3-3 REQ-012 */
function forgeShardExchange(ok) {
  const KEY = 'sword-enhance-v2';
  const NOTE = '검이 파괴되면 파편을 얻습니다.';
  const forgeBody = env => env.byId['[data-panel="forge"]'].querySelector('.panel-body')._html;
  const exchangeButtons = html => html.match(/<button class="buy" data-act="exchange"[^>]*>/g) || [];
  const shardIds = Object.keys(require(path.join(ROOT, 'js', 'constants.js')).SHARD_COST);
  const forgeSave = shards => {
    const s = Object.assign(SG_default(), { gold: 1e6, best: 5, shards });
    s.swords = [{ id: 1, lv: 5, prot: 2, pity: 0 }]; s.nextSwordId = 2; s.active = 1;
    return JSON.stringify(s);
  };

  let env = makeEnv({ [KEY]: forgeSave(0) });
  click(env, 'tab', 'forge');
  let html = forgeBody(env);
  ok(saved(env).stats.shardsGained === 0 && html.includes('파편 교환 · 보유'), 'forge: exchange section shown with 0 shards and none ever gained');
  ok(exchangeButtons(html).length === shardIds.length && exchangeButtons(html).every(b => b.includes('disabled')), 'forge: every exchange button disabled at 0 shards');
  ok(html.includes(`<p class="panel-note">${NOTE}</p>`), 'forge: 0-shard note shown');
  scanRendered();

  env = makeEnv({ [KEY]: forgeSave(500) });
  click(env, 'tab', 'forge');
  html = forgeBody(env);
  ok(html.includes('파편 교환 · 보유') && !html.includes(NOTE), 'forge: no 0-shard note when shards are owned');
  ok(exchangeButtons(html).some(b => !b.includes('disabled')), 'forge: exchange buttons enabled with shards');
}

async function req012(ok) {
  const KEY = 'sword-enhance-v2';
  const plainSave = (fields, swords) => {
    const s = Object.assign(SG_default(), fields);
    if (swords) { s.swords = swords; s.nextSwordId = 100; s.active = swords[0].id; }
    return s;
  };
  const resultLogs = env => texts(env.byId['#log']).filter(t => /강화 (성공|실패)/.test(t)).length;
  const enhanceBtn = env => env.byId['#btnEnhance'];
  const toastTexts = env => (env.byId['#toasts'] ? texts(env.byId['#toasts']) : []);

  // #1 연출 중 이어받기: 이전 시도의 결과는 버리고, 새 상태의 busy를 건드리지 않는다
  {
    const env = makeEnv({ [KEY]: JSON.stringify(plainSave({ gold: 1e6, best: 3 }, [{ id: 1, lv: 3, prot: 2, pity: 0 }])) }, { manualTimers: true });
    const pA = enhanceBtn(env).listeners.click[0]();
    ok(enhanceBtn(env).disabled, '#1: enhance A animating');
    const other = plainSave({ gold: 777777, best: 3 }, [{ id: 1, lv: 3, prot: 2, pity: 0 }]);
    other.idle.lastSeen = Date.now() + 5;
    env.store[KEY] = JSON.stringify(other);
    fire(env, 'storage', { key: KEY });
    env.byId['#btnTakeover'].listeners.click[0]();
    ok(!enhanceBtn(env).disabled && saved(env).gold === 777777 && saved(env).stats.tries === 0, '#1: take over mid-animation adopts the other save; enhance usable');
    const pB = enhanceBtn(env).listeners.click[0]();
    ok(enhanceBtn(env).disabled, '#1: enhance B started on the adopted state');
    await env.runTimer();   // A의 충전 대기가 먼저 끝난다
    ok(enhanceBtn(env).disabled, '#1: stale enhance A does not clear busy while B animates');
    ok(resultLogs(env) === 0, '#1: stale enhance A shows no result');
    await env.runAllTimers();
    await pA; await pB;
    ok(resultLogs(env) === 1 && saved(env).stats.tries === 1, '#1: only B is shown and recorded on the adopted state');
    ok(!enhanceBtn(env).disabled, '#1: enhance usable after B');
    scanRendered();
  }
  // #7 연출 중 새 게임도 같은 resetUiFor: 이전 결과를 새 게임에 표시하지 않는다
  {
    const env = makeEnv({ [KEY]: JSON.stringify(plainSave({ gold: 1e6, best: 3 }, [{ id: 1, lv: 3, prot: 2, pity: 0 }])) }, { manualTimers: true });
    const p = enhanceBtn(env).listeners.click[0]();
    env.byId['#btnReset'].listeners.click[0]();
    ok(!enhanceBtn(env).disabled && saved(env).gold === 300, '#7: new game mid-animation resets busy');
    await env.runAllTimers();
    await p;
    ok(resultLogs(env) === 0 && saved(env).stats.tries === 0, '#7: the old attempt is not shown on the new game');
  }

  // #4 storage clear(key null) 판정, #5 잠금 시 '이 탭에서 계속하기'로 포커스
  {
    const env = makeEnv({});
    fire(env, 'storage', { key: null, storageArea: {} });
    ok(!isLocked(env), '#4: clear() of another storage area (sessionStorage) does not lock');
    El.focused = null;
    fire(env, 'storage', { key: null, storageArea: env.ctx.localStorage });
    ok(isLocked(env), '#4: localStorage.clear() in another tab locks');
    ok(El.focused === env.byId['#btnTakeover'], '#5: focus moves to the take over button');
    env.byId['#btnTakeover'].listeners.click[0]();
    ok(!isLocked(env), 'take over unlocks');
  }

  // #6a 마지막 소모품을 써서 토글이 꺼지면 그때 한 번 토스트
  {
    const st = plainSave({ gold: 1e6, best: 3 }, [{ id: 1, lv: 3, prot: 2, pity: 0 }]);
    st.inv.bless = 1; st.use.bless = true;
    const env = makeEnv({ [KEY]: JSON.stringify(st) });
    const ranOutToasts = () => toastTexts(env).filter(t => t.includes('축복 주문서') && t.includes('사용을 껐습니다')).length;
    ok(ranOutToasts() === 0, '#6a: no toast before the attempt');
    await enhanceBtn(env).listeners.click[0]();
    ok(saved(env).use.bless === false && saved(env).inv.bless === 0, '#6a: last bless used, toggle off');
    ok(ranOutToasts() === 1, '#6a: one toast when the toggle was switched off');
    await enhanceBtn(env).listeners.click[0]();
    ok(ranOutToasts() === 1, '#6a: no repeat on later attempts');
  }

  // #6b 의뢰 탭 이름 옆 납품 가능 개수(0이면 숨김)
  {
    const st = plainSave({ gold: 1e6, best: 5 }, [{ id: 1, lv: 5, prot: 2, pity: 0 }, { id: 2, lv: 2, prot: 2, pity: 0 }]);
    const later = Date.now() + 10 * 60 * 1000;
    st.quests = { list: [{ id: 1, tier: 'easy', lv: 2 }, null, null], readyAt: [0, later, later], nextId: 2 };
    const env = makeEnv({ [KEY]: JSON.stringify(st) });
    const tabbar = () => env.byId['#tabbar']._html;
    ok((tabbar().match(/class="tab-count"/g) || []).length === 1 && tabbar().includes('의뢰<span class="tab-count">1</span>'), '#6b: quests tab shows 1 deliverable');
    click(env, 'deliver', 0);
    ok(saved(env).stats.delivered === 1 && !tabbar().includes('tab-count'), '#6b: count hidden at 0 after delivering');
  }

  // #6c 저장 실패는 세션당 한 번만 알린다
  {
    const env = makeEnv({});
    const failedToasts = () => toastTexts(env).filter(t => t === env.ctx.SG.view.SAVE_FAILED_TEXT).length;
    ok(failedToasts() === 0, '#6c: no toast while saving works');
    env.ctx.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    env.byId['#btnHunt'].listeners.click[0]();
    ok(failedToasts() === 1, '#6c: first failed save shows a toast');
    click(env, 'buySword');
    env.tick();
    setVisible(env, false);
    ok(failedToasts() === 1, '#6c: later failed saves stay quiet');
  }
}

main().catch(e => { console.error('smoke-dom FAILED:', e.stack || e.message); process.exit(1); });
