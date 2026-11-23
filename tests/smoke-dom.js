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
  select() { El.selected = this; }
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
    body: new El('body'),
    // opts.execCommand: 복사 대체 경로(선택 + execCommand) 스텁. 기본은 실패
    execCommand: opts.execCommand || (() => false),
  };
  // opts.failKeys: 이 키들에 대한 setItem은 QuotaExceededError (테스트 도중 바꿀 수 있음)
  const failKeys = new Set(opts.failKeys || []);
  // opts.now: 가짜 시계(탭 동결 등 시간 경과 재현용)
  const ClockDate = opts.now ? Object.assign(class extends Date {}, { now: opts.now }) : Date;
  const ctx = {
    console, Math, Date: ClockDate, JSON, Promise, Object, Array, Number, String, Set, Map, Proxy, Error,
    document,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { if (failKeys.has(k)) throw new Error('QuotaExceededError'); store[k] = String(v); },
    },
    navigator: opts.navigator,
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
  // opts.extensions: main.js 확장 지점(SG.extensions)에 미리 넣을 함수 — 테스트가 컨트롤러 API(state/commit)를 잡는다
  if (opts.extensions) ctx.SG = { extensions: opts.extensions };
  vm.createContext(ctx);
  const html = fs.readFileSync(path.join(ROOT, opts.page || 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])
    .filter(src => !(opts.withoutAssets && src.startsWith('assets/')));
  scripts.forEach(src => vm.runInContext(fs.readFileSync(path.join(ROOT, src), 'utf8'), ctx, { filename: src }));
  return { ctx, byId, docListeners, winListeners, store, failKeys, tick: () => timers.forEach(f => f()), scripts, runTimer, runAllTimers };
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
  st.swords.push({ id: 50, lv: q.lv, prot: 2, pity: 0, trait: { k: 'hunt', t: 1 } });   // 상인 아님: 납품액 = 인장만 (부팅 각인 무작위 방지)
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
  stripAutoScroll(ok);

  // 7b-2) M2-A F14: 각인 배선(부팅·강화 성공·복귀), 토스트 1개로 합침, 판매 미리보기 = 지급
  await traitsWiring(ok);
  // 7b-3) 5-B: 특성 표시·수입 몫·지급 미리보기, 각인 관리(2회 클릭), 기념비
  await traitsUi(ok);

  // 7c) 대장간 탭이 열려 있으면 파편 0개여도 파편 교환 섹션을 보여 준다
  forgeShardExchange(ok);

  // 8) 테스트 페이지(test.html): 같은 스크립트 + 테스트 설정. 강화 100%, 별도 저장 키, 실제 저장 불가침
  await testPage(ok);

  // 9) 3-3 REQ-012: 연출 중 이어받기·새 게임, 탭 잠금 clear 판정·포커스, 알림 3종
  await req012(ok);
  particleCap(ok);

  // 10) 3-4 저장 안전: 보호 모드·손상 저장 이어받기·빈 v1·저장 실패 배지·잠금 문구 (m1-storage AC 15/17/18, 30~36)
  await saveSafety(ok);

  // 11) REQ-031 저장 안전 마무리
  await req031(ok);

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
  // S6: 안내 문구는 view.js의 NO_ACTIVE_TEXT 하나에서 나온다(마크업에는 적지 않는다)
  const PROMPT = env.ctx.SG.view.NO_ACTIVE_TEXT;
  ok(PROMPT === '보관함에서 강화할 검을 선택하세요' && env.byId['#stageEmpty'].textContent === PROMPT, 'stage prompt text set from view.NO_ACTIVE_TEXT');
  ok(env.byId['#stripActions']._html.includes(PROMPT) && env.ctx.SG.view.REASON.noActive.startsWith(PROMPT), 'strip note and noActive reason use the same text');
  ok(['index.html', 'test.html'].every(page => !fs.readFileSync(path.join(ROOT, page), 'utf8').includes(PROMPT)), 'prompt text not duplicated in the page markup');

  // 저장된 active 0은 다시 불러와도 '없음'
  env = makeEnv(env.store);
  assertEmpty('after reload');
  scanRendered();
  click(env, 'activate', 2);
  ok(saved(env).active === 2 && env.byId['#stageEmpty'].hidden === true && env.byId['#vCost'].textContent !== '-', 'one click picks the next sword');
  ok(!env.byId['#btnEnhance'].disabled && !env.byId['#btnSell'].disabled, 'enhance / sell enabled again');
  scanRendered();
}

/** M2-A F14 (m2-traits AC 5, 10, 11, 12, 53, 54, 30a/52): main.js가 같은 rng로 engravePending을 부르는 세 지점과 알림 */
async function traitsWiring(ok) {
  const ENGRAVE = '검에 각인';
  const engraveToasts = env => (env.byId['#toasts'] ? texts(env.byId['#toasts']) : []).filter(t => t.startsWith(ENGRAVE));   // 토스트가 없으면 #toasts도 아직 없다
  const realRandom = Math.random;
  /** main.js는 로드 시점의 Math.random을 잡으므로 로드하는 동안만 바꿔 둔다(잡힌 함수는 이후에도 vals를 이어서 낸다) */
  const loadWithRandom = (vals, store) => {
    let i = 0;
    Math.random = () => vals[Math.min(i++, vals.length - 1)];
    try { return makeEnv(store); } finally { Math.random = realRandom; }
  };
  const oldSave = (swords, fields) => {
    const s = Object.assign(SG_default(), { gold: 4321 }, fields);
    s.swords = swords.map(([id, lv]) => ({ id, lv, prot: 2, pity: 0 }));   // trait 필드 없음 = 옛 저장
    s.nextSwordId = 10;
    s.best = Math.max(...swords.map(x => x[1]));
    return s;
  };

  // 부팅: 옛 저장의 +7·+9만 무료 각인(배열 순서, 검마다 rng 2회), 골드 불변, 토스트 1개로 합침
  let env = loadWithRandom([0.99, 0.99, 0, 0, 0.5], { 'sword-enhance-v2': JSON.stringify(oldSave([[1, 7], [2, 2], [3, 9]])) });
  let st = saved(env);
  ok(JSON.stringify(st.swords.map(s => s.trait)) === JSON.stringify([{ k: 'anvil', t: 3 }, null, { k: 'hunt', t: 1 }]), 'boot engraves only +5 and above swords: ' + JSON.stringify(st.swords.map(s => s.trait)));
  ok(st.gold === 4321 && st.stats.traitRolls === 2, 'boot engraving is free and counts traitRolls');
  ok(engraveToasts(env).length === 1 && engraveToasts(env)[0] === '검에 각인: 완벽한 대장장이, 평범한 약탈자', 'one merged engrave toast: ' + engraveToasts(env).join(' | '));
  scanRendered();
  env = makeEnv(env.store);
  ok(engraveToasts(env).length === 0 && saved(env).stats.traitRolls === 2, 'reloading an engraved save does not engrave again');

  // 강화 성공 직후: +4 → +5 성공에 같은 rng로 각인, 알림은 결과 연출 뒤 1회. 이미 특성이 있으면 다시 굴리지 않음
  env = loadWithRandom([0], { 'sword-enhance-v2': JSON.stringify(oldSave([[1, 4]], { gold: 1e6 })) });
  ok(saved(env).swords[0].trait === null && engraveToasts(env).length === 0, '+4 sword is not engraved at boot');
  await env.byId['#btnEnhance'].listeners.click[0]();
  st = saved(env);
  ok(st.swords[0].lv === 5 && JSON.stringify(st.swords[0].trait) === '{"k":"hunt","t":1}' && st.stats.traitRolls === 1, 'success to +5 engraves the sword and saves it');
  ok(engraveToasts(env).length === 1 && engraveToasts(env)[0] === '검에 각인: 평범한 약탈자', 'engrave toast after the success');
  await env.byId['#btnEnhance'].listeners.click[0]();
  st = saved(env);
  ok(st.swords[0].lv === 6 && JSON.stringify(st.swords[0].trait) === '{"k":"hunt","t":1}' && st.stats.traitRolls === 1 && engraveToasts(env).length === 1,
    'a later success keeps the trait and shows no new toast');
  scanRendered();

  // 복귀(resume): 다른 탭이 쓴 더 최근 저장에 미각인 검이 있으면 이어받은 직후 각인
  env = loadWithRandom([0.5], { 'sword-enhance-v2': JSON.stringify(oldSave([[1, 3]])) });
  setVisible(env, false);
  await sleep(10);
  const newer = oldSave([[1, 3], [2, 6]], { gold: 9999 });
  newer.idle.lastSeen = Date.now() + 5;
  env.store['sword-enhance-v2'] = JSON.stringify(newer);
  setVisible(env, true);
  st = saved(env);
  ok(st.gold === 9999 && st.swords[1].trait !== null && st.swords[0].trait === null && engraveToasts(env).length === 1, 'resume adopts the newer save and engraves its +6 sword');

  // 판매 미리보기와 실제 지급이 같다(상인 {trade,2}, 인장 꺼짐)
  const tradeSave = oldSave([[1, 12], [2, 9]], { gold: 1000 });
  tradeSave.swords[1].trait = { k: 'trade', t: 2 };
  tradeSave.swords[0].trait = { k: 'ore', t: 1 };
  tradeSave.active = 2;
  env = makeEnv({ 'sword-enhance-v2': JSON.stringify(tradeSave) });
  const want = Math.floor(env.ctx.SG.rules.sell(9) * 120 / 100);
  ok(env.byId['#stripActions']._html.includes(`판매 ${env.ctx.SG.fx.fmt(want)}G`), 'sell button preview includes the merchant bonus');
  const before = saved(env).gold;
  click(env, 'sellSel', 2); click(env, 'sellSel', 2);
  ok(saved(env).gold - before === want, 'sell pays exactly the previewed amount');
  scanRendered();

  // AC 53: 연출 건너뛰기를 켜도 첫 각인 토스트는 1회 나온다
  env = loadWithRandom([0], { 'sword-enhance-v2': JSON.stringify(oldSave([[1, 4]], { gold: 1e6, settings: { muted: true, skipFx: true } })) });
  ok(saved(env).settings.skipFx === true, 'AC53 setup: skipFx on');
  await env.byId['#btnEnhance'].listeners.click[0]();
  ok(saved(env).swords[0].lv === 5 && engraveToasts(env).length === 1 && engraveToasts(env)[0] === '검에 각인: 평범한 약탈자',
    'AC53: the engrave toast is shown once with skipFx on: ' + engraveToasts(env).join(' | '));
}

/**
 * 5-B (m2-traits §11, AC 45, 50, 52; m2-overview §C.3): 특성 칩·이름 줄·효과, 수입 몫 표기와 표시 = 지급,
 * 대장간 각인 관리(2회 클릭·잠금·바쁨·확인 상태 정리), 기록 탭 기념비와 머리글 배지
 */
async function traitsUi(ok) {
  const KEY = 'sword-enhance-v2';
  const R = require(path.join(ROOT, 'js', 'rules.js'));
  const C = require(path.join(ROOT, 'js', 'constants.js'));
  const fmtG = n => Math.floor(n).toLocaleString('ko-KR');
  const H = l => R.huntReward(l);
  const sinkPrice = (mult, l) => Math.round(mult * H(l) / C.TRAIT_PRICE_ROUND) * C.TRAIT_PRICE_ROUND;
  const forgeBody = env => env.byId['[data-panel="forge"]'].querySelector('.panel-body')._html;
  const idleBody = env => env.byId['[data-panel="idle"]'].querySelector('.panel-body')._html;
  const questBody = env => env.byId['[data-panel="quests"]'].querySelector('.panel-body')._html;
  const cardHTML = (env, id) => env.byId['#strip']._html.split('<button class="slot-card').find(c => c.includes(`data-sword="${id}"`)) || '';
  const buttonHTML = (html, act, id) => (html.match(new RegExp(`<button[^>]*data-act="${act}" data-id="${id}"[^>]*>[\\s\\S]*?</button>`)) || [''])[0];
  /** best 17 · 수입 검(+17) 셋: 약탈자3·광부2·일꾼1, +16 일꾼3(수입 검 아님), 활성 = +13 상인2 */
  const lateSave = fields => {
    const s = Object.assign(SG_default(), { gold: 5e6, best: 17, slots: 7 });
    s.swords = [
      [1, 17, { k: 'hunt', t: 3 }], [2, 13, { k: 'trade', t: 2 }], [3, 2, null], [4, 17, { k: 'ore', t: 2 }],
      [5, 17, { k: 'work', t: 1 }], [6, 16, { k: 'work', t: 3 }],
    ].map(([id, lv, trait]) => ({ id, lv, prot: 2, pity: 0, trait }));
    s.nextSwordId = 7;
    s.active = 2;
    s.idle.autoOn = true;
    return Object.assign(s, fields);
  };
  const load = (s, opts) => makeEnv({ [KEY]: JSON.stringify(s) }, opts);

  // 1) 보관함 칩(약자 + 등급 점 수, 특성 없으면 없음)·카드 제목, 이름 줄·효과 문장
  let env = load(lateSave());
  const V = env.ctx.SG.view;
  const chip = (env2, id) => (cardHTML(env2, id).match(/<span class="trait-chip trait-t(\d)"><b>(.)<\/b><span class="pips">((?:<i><\/i>)*)<\/span><\/span>/) || []);
  ok(chip(env, 1)[1] === '3' && chip(env, 1)[2] === '약' && chip(env, 1)[3] === '<i></i>'.repeat(3), 'strip chip: letter 약 + 3 tier pips for {hunt,3}');
  ok(chip(env, 2)[2] === '상' && chip(env, 2)[3] === '<i></i>'.repeat(2) && chip(env, 5)[3] === '<i></i>', 'strip chip pips follow the tier (2, 1)');
  ok(!cardHTML(env, 3).includes('trait-chip') && cardHTML(env, 3).includes('data-sword="3"'), 'a sword without a trait shows no chip');
  ok(cardHTML(env, 1).includes('title="+17 시간을 베는 검 · 완벽한 약탈자 ·'), 'card title names the trait');
  ok(env.byId['#swordName'].textContent === '정교한 상인 · ' + V.swordName(13), 'name line "<tier> <kind> · <sword>": ' + env.byId['#swordName'].textContent);
  ok(env.byId['#traitLine'].hidden === false && env.byId['#traitLine'].textContent === '이 검을 판매·납품할 때 골드 +20%', 'trade effect says "이 검" only: ' + env.byId['#traitLine'].textContent);
  click(env, 'activate', 3);
  ok(env.byId['#swordName'].textContent === V.swordName(2) && env.byId['#traitLine'].hidden === true, 'no trait: plain sword name, no effect line');
  click(env, 'activate', 4);
  ok(env.byId['#traitLine'].textContent === '사냥당 광석 +40% · 수입 검 적용 중', 'income trait on a top sword: ' + env.byId['#traitLine'].textContent);
  click(env, 'activate', 6);
  ok(env.byId['#traitLine'].textContent === '자동 사냥·오프라인 골드 +45% · 최고 단계 검(+17)일 때만 적용', 'income trait on a non-top sword: ' + env.byId['#traitLine'].textContent);
  scanRendered();

  // 2) 수입 몫: 종류별 최댓값만(+16 일꾼3은 제외), 표시 = 규칙 지급
  env = load(lateSave());
  const huntGold = Math.floor(H(17) * 130 / 100);
  ok(env.byId['#btnHunt'].firstChild.textContent === `사냥 +${fmtG(huntGold)}` && env.byId['#huntSub'].textContent === 'H · +30%(약탈자)',
    'hunt button shows the 약탈자 gold and share: ' + env.byId['#huntSub'].textContent);
  const goldBefore = saved(env).gold;
  env.byId['#btnHunt'].listeners.click[0]();
  ok(saved(env).gold - goldBefore === huntGold, 'hunt pays exactly the shown amount');
  ok(env.byId['#incomeNote'].textContent.endsWith(' · 특성 +30%(약탈자) · +15%(일꾼) · +40%(광부)'), 'income note lists the max share per kind: ' + env.byId['#incomeNote'].textContent);
  const autoGold = Math.round(R.autoReward(17) * 115 / 100);
  ok(plain(env.byId['#autoRow']._html).endsWith(`1회 +${fmtG(autoGold)}G +15%(일꾼)`), 'auto row: 일꾼 gold (max of top swords only) + share: ' + plain(env.byId['#autoRow']._html));
  ok(env.ctx.SG.idle.autoRunGold(saved(env), Date.now()) === autoGold, 'auto row amount = the auto payout rule');
  const idle = plain(idleBody(env));
  ok(idle.includes(`+${fmtG(autoGold)}G +15%(일꾼)`) && /\+2\.8 .*\+1\.4 .*\+0\.7 \+40%\(광부\)/.test(idle), 'idle panel: work share and miner ore per hunt: ' + idle.slice(0, 120));
  const forge = plain(forgeBody(env));
  ok(['사냥당 +2.8', '사냥당 +1.4', '사냥당 +0.7', '사냥당 광석 +40%(광부) 적용 중'].every(t => forge.includes(t)), 'forge ore grid shows ore per hunt with the miner bonus');
  const noTraits = lateSave();
  noTraits.swords.forEach(s => { s.trait = { k: 'anvil', t: 1 }; });   // 특성 없음(null)은 부팅 각인이 무작위로 채우므로 수입형이 아닌 종류로
  env = load(noTraits);
  ok(env.byId['#huntSub'].textContent === 'H' && !env.byId['#incomeNote'].textContent.includes('특성') && plain(forgeBody(env)).includes('사냥당 +0.5'),
    'without income traits: no share text, raw ORE_PER_HUNT');
  scanRendered();

  // 3) AC 52: 판매·납품 미리보기 = 지급 (상인 유무 × 인장 켜짐/꺼짐)
  for (const [id, lv, merchant] of [[2, 13, 120], [1, 17, 100]]) {
    for (const seal of [false, true]) {
      const s = lateSave({ active: id });
      s.inv.seal = 1; s.use.seal = seal;
      env = load(s);
      const base = Math.floor(R.sell(lv) * merchant / 100);
      const want = seal ? Math.floor(base * C.SEAL_MULT) : base;
      const label = `AC52 sell (merchant ${merchant > 100}, seal ${seal})`;
      ok(env.byId['#stripActions']._html.includes(`판매 ${fmtG(want)}G`) && env.byId['#vSell'].textContent === fmtG(want), label + ': preview');
      const g0 = saved(env).gold;
      click(env, 'sellSel', id); click(env, 'sellSel', id);
      ok(saved(env).gold - g0 === want, label + ': paid = preview');
    }
  }
  for (const seal of [false, true]) {
    const s = lateSave();
    s.inv.seal = 1; s.use.seal = seal;
    s.quests.list = [{ id: 1, tier: C.QUEST_TIERS[0], lv: 13, gold: 0, item: null }, null, null];
    s.quests.readyAt = [0, Date.now() + 1e6, Date.now() + 1e6];
    env = load(s);
    const qGold = saved(env).quests.list[0].gold;
    const base = Math.floor(qGold * 120 / 100);
    const want = seal ? Math.floor(base * C.SEAL_MULT) : base;
    const label = `AC52 deliver (merchant candidate, seal ${seal})`;
    ok(plain(questBody(env)).includes(`${fmtG(want)}G (상인 +20%)`), label + ': card gold includes the merchant bonus: ' + plain(questBody(env)).slice(0, 80));
    const g0 = saved(env).gold;
    click(env, 'deliver', 0); click(env, 'deliver', 0);
    ok(saved(env).gold - g0 === want && saved(env).stats.delivered === 1, label + ': paid = preview');
  }

  // 4) 대장간 각인 관리: AC 50 안내, 가격, 2회 클릭(AC 45), 수입 검 표시
  env = load(lateSave());
  let html = forgeBody(env);
  const rekindPrice = sinkPrice(C.TRAIT_REKIND_MULT, 17);
  const tierPrice = sinkPrice(C.TRAIT_TIER_UP_MULT[1], 17);
  ok(html.includes('각인 · 활성 검') && plain(html).includes('특성은 강화 확률에 영향을 주지 않는다'), 'AC50: forge 각인 section with the no-odds line');
  ok(!/상인|특성|각인/.test(env.byId['#breakdown']._html), 'AC50: the odds breakdown has no trait row');
  const plainTrait = lateSave();
  plainTrait.swords[1].trait = null;
  ok(env.byId['#vSucc'].textContent === load(plainTrait).byId['#vSucc'].textContent, 'AC50: shown odds equal those of the same sword without a trait');
  env = load(lateSave());
  html = forgeBody(env);
  ok(plain(buttonHTML(html, 'traitRekind', 2)) === `종류 변경 ${fmtG(rekindPrice)}G` && !buttonHTML(html, 'traitRekind', 2).includes('disabled'), 'rekind button with its price');
  ok(buttonHTML(html, 'traitTierUp', 2).includes('disabled') && plain(buttonHTML(html, 'traitTierUp', 2)) === `등급 올리기 ${fmtG(tierPrice)}G`
    && plain(html).includes('등급 올리기: 골드가 부족합니다.'), 'tier up blocked by gold with its reason');
  ok(!html.includes('badge good">수입 검') && plain(html).includes('수입 검: 보관함 최고 +17 3자루'), 'the +13 sword is not marked as an income sword; income swords listed');
  let st = saved(env);
  click(env, 'traitRekind', 2);
  ok(saved(env).gold === st.gold && saved(env).swords[1].trait.k === 'trade', 'AC45: one click buys nothing');
  ok(buttonHTML(forgeBody(env), 'traitRekind', 2).includes('armed') && plain(buttonHTML(forgeBody(env), 'traitRekind', 2)).startsWith('한 번 더 누르면 구매'), 'AC45: first click shows the confirm state');
  click(env, 'traitRekind', 2);
  let after = saved(env);
  ok(after.gold === st.gold - rekindPrice && after.stats.sinkGold === rekindPrice && after.stats.traitRolls === st.stats.traitRolls + 1, 'AC45: second click buys at the shown price');
  ok(after.swords[1].trait.k !== 'trade' && after.swords[1].trait.t === 2, 're-kind keeps the tier and changes the kind');
  ok(texts(env.byId['#toasts']).some(t => t.startsWith('특성 종류 변경: 정교한 상인 → 정교한 ')), 're-kind toast names old → new trait');
  scanRendered();

  // 확인 시간 초과는 다시 확인 상태부터, 활성 검을 바꾸면 확인 상태를 버린다(V1)
  let clock = Date.now();
  env = load(lateSave(), { now: () => clock });
  st = saved(env);
  click(env, 'traitRekind', 2);
  clock += C.SELL_CONFIRM_MS + 1;
  click(env, 'traitRekind', 2);
  ok(saved(env).gold === st.gold, 'AC45: a second click after SELL_CONFIRM_MS only re-arms');
  click(env, 'activate', 1); click(env, 'activate', 2);
  click(env, 'traitRekind', 2);
  ok(saved(env).gold === st.gold, 'switching the active sword clears the pending confirm');
  click(env, 'traitRekind', 2);
  ok(saved(env).gold === st.gold - rekindPrice, 'a fresh double click still buys');
  // 탭을 옮기면 확인 상태를 버린다(V1): 돌아와 한 번 누르면 다시 확인 상태부터
  env = load(lateSave({ gold: 1e9 }), { now: () => clock });
  st = saved(env);
  click(env, 'traitRekind', 2);
  ok(buttonHTML(forgeBody(env), 'traitRekind', 2).includes('armed'), 'tab switch setup: the first click arms');
  click(env, 'tab', 'idle'); click(env, 'tab', 'forge');
  ok(!buttonHTML(forgeBody(env), 'traitRekind', 2).includes('armed'), 'switching tabs drops the confirm state');
  click(env, 'traitRekind', 2);
  ok(saved(env).gold === st.gold && buttonHTML(forgeBody(env), 'traitRekind', 2).includes('armed'), 'after a tab switch one click only re-arms');

  // 강화 연출 중(busy)에는 버튼이 막히고 눌러도 사지 않는다. main.js는 로드 시점의 Math.random을 잡으므로
  // 로드 동안 0으로 바꿔 강화가 반드시 성공하게 한다(파괴로 대상 검이 사라지면 notFound로 헛통과한다, V6)
  const realRandom = Math.random;
  Math.random = () => 0;
  try { env = load(lateSave({ gold: 1e9 })); } finally { Math.random = realRandom; }
  const pending = env.byId['#btnEnhance'].listeners.click[0]();
  ok(buttonHTML(forgeBody(env), 'traitRekind', 2).includes('disabled'), 'sink buttons disabled while the enhance animation runs');
  click(env, 'traitRekind', 2); click(env, 'traitRekind', 2);
  ok(saved(env).stats.sinkGold === 0 && !buttonHTML(forgeBody(env), 'traitRekind', 2).includes('armed'), 'no purchase or confirm state while busy');
  await pending;
  ok(saved(env).swords.find(s => s.id === 2).lv === 14 && !buttonHTML(forgeBody(env), 'traitRekind', 2).includes('disabled'),
    'busy setup: the enhance succeeded and the target sword is buyable afterwards');
  click(env, 'traitRekind', 2); click(env, 'traitRekind', 2);
  ok(saved(env).stats.sinkGold === sinkPrice(C.TRAIT_REKIND_MULT, 17), 'the same double click buys once busy ends (only the busy guard blocked it)');

  // 등급 올리기 2회 클릭 → 등급 3, 이후 "최고 등급" 비활성
  env = load(lateSave({ gold: 1e9 }));
  st = saved(env);
  click(env, 'traitTierUp', 2);
  ok(saved(env).swords[1].trait.t === 2, 'tier up: one click buys nothing');
  click(env, 'traitTierUp', 2);
  after = saved(env);
  ok(after.swords[1].trait.t === 3 && after.gold === st.gold - tierPrice && after.stats.sinkGold === tierPrice, 'tier up: second click buys at the shown price');
  ok(forgeBody(env).includes('<button class="small-btn" disabled>최고 등급</button>') && !forgeBody(env).includes('data-act="traitTierUp"'), 'max tier shows a disabled 최고 등급 button');
  ok(env.byId['#swordName'].textContent.startsWith('완벽한 상인 · '), 'name line follows the new tier');

  // 잠금(best 12): 버튼 비활성 + 잠금 사유, 눌러도 상태 불변
  const early = Object.assign(SG_default(), { gold: 1e9, best: 12 });
  early.swords = [{ id: 1, lv: 12, prot: 2, pity: 0, trait: { k: 'hunt', t: 1 } }, { id: 2, lv: 2, prot: 2, pity: 0, trait: null }];
  early.nextSwordId = 3; early.active = 1; early.slots = 3;
  env = load(early);
  html = forgeBody(env);
  ok(plain(html).includes('최고 +13 이상에서 열림') && buttonHTML(html, 'traitRekind', 1).includes('disabled') && buttonHTML(html, 'traitTierUp', 1).includes('disabled'),
    'best < 13: both buttons disabled with the lock hint');
  click(env, 'traitRekind', 1); click(env, 'traitRekind', 1); click(env, 'traitTierUp', 1); click(env, 'traitTierUp', 1);
  ok(saved(env).gold === 1e9 && JSON.stringify(saved(env).swords[0].trait) === '{"k":"hunt","t":1}', 'locked: clicks change nothing');
  click(env, 'activate', 2);
  ok(plain(forgeBody(env)).includes('특성 없음') && !forgeBody(env).includes('data-act="traitRekind"'), 'a sword without a trait: no sink buttons');
  // 잠긴 동안에도 3등급은 "최고 등급"(가격 0G 표기 금지, V7)
  early.swords[0].trait = { k: 'hunt', t: 3 };
  env = load(early);
  html = forgeBody(env);
  ok(html.includes('<button class="small-btn" disabled>최고 등급</button>') && !html.includes('data-act="traitTierUp"') && !plain(html).includes('등급 올리기'),
    'best < 13 with a tier-3 trait: disabled 최고 등급, no 0G price');
  ok(buttonHTML(html, 'traitRekind', 1).includes('disabled') && plain(html).includes('최고 +13 이상에서 열림'), 'best < 13 with a tier-3 trait: re-kind still locked with the hint');
  scanRendered();

  // 5) 기념비: 8칸(보유·구매 가능·잠김), 머리글 배지, 2회 클릭 구매
  const monSave = lateSave();
  monSave.monuments = [1, 1, 0, 0, 0, 0, 0, 0];
  env = load(monSave);
  const cells = env => env.byId['#monumentList']._html.match(/<div class="mon[ "]/g) || [];
  html = env.byId['#monumentList']._html;
  ok(cells(env).length === C.MONUMENT_COUNT && (html.match(/badge good">보유/g) || []).length === 2, '8 monument cells, 2 owned');
  ok([15, 16, 17].every(L => buttonHTML(html, 'buyMonument', L)) && [18, 19, 20].every(L => plain(html).includes(`최고 +${L} 달성 시`)), 'reachable levels buyable, the rest locked');
  ok(env.byId['#monumentCount'].textContent === '(2 / 8)' && env.byId['#monumentBadge'].hidden === false && env.byId['#monumentBadge'].textContent === '🏛️ +14',
    'count and header badge show the highest monument: ' + env.byId['#monumentBadge'].textContent);
  ok(plain(html).includes('대표 기념비: 🏛️ +14 별빛 검 기념비'), 'records title line names the highest monument');
  const price15 = sinkPrice(C.MONUMENT_MULT, 15);
  ok(plain(buttonHTML(html, 'buyMonument', 15)) === `세우기 ${fmtG(price15)}G`, 'monument price = monumentCost');
  st = saved(env);
  click(env, 'buyMonument', 15);
  ok(saved(env).monuments[2] === 0 && saved(env).gold === st.gold, 'monument: one click buys nothing');
  click(env, 'buyMonument', 15);
  after = saved(env);
  ok(after.monuments[2] === 1 && after.gold === st.gold - price15 && after.stats.sinkGold === price15, 'monument: second click buys at the shown price');
  ok(env.byId['#monumentBadge'].textContent === '🏛️ +15' && env.byId['#monumentCount'].textContent === '(3 / 8)', 'badge and count follow the purchase');
  ok(buttonHTML(env.byId['#monumentList']._html, 'buyMonument', 17).includes('disabled'), 'unaffordable monument disabled');
  const poor = [16, 17].filter(L => R.monumentCost(L) > after.gold).map(L => `+${L}`);
  ok(poor.length > 0 && plain(env.byId['#monumentList']._html).includes(`${poor.join('·')}: 골드가 부족합니다.`),
    'unaffordable monument shows a text reason: ' + poor.join('·'));
  env = makeEnv({});
  ok(cells(env).length === C.MONUMENT_COUNT && !env.byId['#monumentList']._html.includes('data-act="buyMonument"') && env.byId['#monumentBadge'].hidden === true,
    'new game: all monuments locked, no header badge');
  scanRendered();
}

let stripSetup = null;   // stripDrag가 채우는 카드 3장 환경 생성기(stripAutoScroll이 재사용)

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
    return { env, strip, card, pointer, clickCard, order: () => saved(env).swords.map(x => x.id).join() };
  };

  stripSetup = setup;

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

/** S7: 가장자리에 멈춘 포인터에도 자동 스크롤이 프레임마다 이어지고, 제스처가 끝나는 모든 경로에서 멈춘다(V1). 스트립은 x=0~1000 */
function stripAutoScroll(ok) {
  const STEP = 12;   // C.DRAG_SCROLL_STEP_PX
  const setup = () => {
    const d = stripSetup([1, 2, 3]);
    const frames = new Map();
    let nextId = 0;
    d.env.ctx.requestAnimationFrame = fn => { frames.set(++nextId, fn); return nextId; };
    d.env.ctx.cancelAnimationFrame = id => frames.delete(id);
    d.frames = frames;
    d.runFrame = () => { const due = [...frames.values()]; frames.clear(); due.forEach(f => f()); };
    d.lift = () => { d.pointer('pointerdown', 3, 243); d.pointer('pointermove', 3, 990); };   // 오른쪽 가장자리(32px) 안에서 멈춤
    return d;
  };

  let d = setup();
  d.lift();
  ok(d.frames.size === 1 && d.strip.scrollLeft === 0, 'S7: entering the edge zone schedules an autoscroll frame');
  d.runFrame(); d.runFrame(); d.runFrame();
  ok(d.strip.scrollLeft === 3 * STEP && d.frames.size === 1, 'S7: autoscroll keeps going each frame with no further pointermove');
  ok(d.card(3).style.transform === `translateX(${990 - 243 + 3 * STEP}px)`, 'S7: the lifted card follows the scrolled content');
  d.pointer('pointermove', 3, 500);
  d.runFrame();
  ok(d.frames.size === 0 && d.strip.scrollLeft === 3 * STEP, 'S7: leaving the edge zone stops the loop');
  d.pointer('pointermove', 3, 5);
  d.runFrame();
  ok(d.strip.scrollLeft === 2 * STEP && d.frames.size === 1, 'S7: the left edge scrolls back');
  d.pointer('pointerup', 3, 5);
  ok(d.frames.size === 0, 'S7: drop stops the loop');

  // 더 스크롤할 수 없으면(브라우저가 scrollLeft를 0으로 묶음) 루프를 멈춘다
  d = setup();
  let scroll = 0;
  Object.defineProperty(d.strip, 'scrollLeft', { get: () => scroll, set: v => { scroll = Math.max(0, v); } });
  d.pointer('pointerdown', 1, 43); d.pointer('pointermove', 1, 5);
  d.runFrame();
  ok(scroll === 0 && d.frames.size === 0, 'S7: loop stops when the strip cannot scroll further');
  d.pointer('pointerup', 1, 5);

  // 드롭 외의 모든 종료 경로: 순서는 그대로, 프레임은 남지 않는다
  const endings = {
    pointercancel: x => x.pointer('pointercancel', 3, 990),
    lostpointercapture: x => x.pointer('lostpointercapture', 3, 990),
    'button-less move': x => x.pointer('pointermove', 3, 990, 'mouse', 0),
    'cancelDrag (other-tab lock)': x => fire(x.env, 'storage', { key: 'sword-enhance-v2' }),
    'cancelDrag (new game)': x => x.env.byId['#btnReset'].listeners.click[0](),
  };
  Object.keys(endings).forEach(name => {
    const x = setup();
    x.lift();
    x.runFrame();
    endings[name](x);
    const scrolled = x.strip.scrollLeft;
    x.runFrame();
    ok(x.frames.size === 0 && x.strip.scrollLeft === scrolled && !x.card(3).classList.contains('dragging'), 'S7: ' + name + ' stops the autoscroll loop');
  });
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

  // 5-B: 활성 검 특성 지정(종류·등급 선택 → SG.rules.setTrait), 조작판 저장(commit)은 +5 이상 미각인 검을 각인한다
  {
    let game = null;
    const tEnv = makeEnv(realStore, { page: 'test.html', extensions: [api => { game = api; }] });
    const kindSel = tEnv.byId['#testTraitKind'];
    const tierSel = tEnv.byId['#testTraitTier'];
    ok((kindSel.innerHTML.match(/<option /g) || []).length === 6 && kindSel.innerHTML.includes('<option value="trade">상인</option>')
      && (tierSel.innerHTML.match(/<option /g) || []).length === 3 && tierSel.innerHTML.includes('<option value="3">완벽한</option>'), 'test panel trait selectors filled from constants');
    kindSel.value = 'trade'; tierSel.value = '3';
    click(tEnv, 'testSetTrait');
    ok(JSON.stringify(savedTest(tEnv).swords[0].trait) === '{"k":"trade","t":3}', 'test panel sets {trade,3} on the active sword');
    ok(tEnv.byId['#swordName'].textContent.startsWith('완벽한 상인 · '), 'the set trait shows in the name line');
    game.state().swords[0].lv = 6;
    game.state().swords[0].trait = null;
    click(tEnv, 'testGold');
    ok(savedTest(tEnv).swords[0].trait !== null && texts(tEnv.byId['#toasts']).some(t => t.startsWith('검에 각인: ')), 'test panel commit engraves a raised +6 sword at once');
    ok(realUntouched(tEnv), 'real saves untouched by the trait control');
  }

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
  const traitBefore = JSON.stringify(saved(env).swords[0].trait);
  click(env, 'testSetTrait');
  ok(JSON.stringify(saved(env).swords[0].trait) === traitBefore && !indexHtml.includes('testTrait'), 'AC49: real page has no trait-setting control');
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

/** 대장간 탭이 열려 있으면 파편 0개여도 파편 교환 섹션을 보여 준다(사용자 요청) */
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

/** 3-3 REQ-012 */
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

/** 3-4 저장 안전 (m1-storage 저장 안전, AC 15/17/18, 30~36) */
async function saveSafety(ok) {
  const KEY = 'sword-enhance-v2';
  const BACKUP = 'sword-enhance-v2-corrupt';
  const RAW = '{"gold": 123456, "swords": [';   // 파싱 불가 v2
  const T = require(path.join(ROOT, 'js', 'constants.js'));
  const toastTexts = env => (env.byId['#toasts'] ? texts(env.byId['#toasts']) : []);
  const TXT = env => env.ctx.SG.view.SAVE_SAFETY_TEXT;
  const bannerShown = env => env.byId['#saveGuard'].hidden === false;
  const badgeShown = env => env.byId['#saveBadge'].hidden === false;
  const gold = env => Number(env.byId['#gold'].textContent.replace(/,/g, ''));
  const hunt = env => env.byId['#btnHunt'].listeners.click[0]();
  const flush = () => sleep(10);
  const validSave = fields => JSON.stringify(Object.assign(SG_default(), fields));
  const protectedEnv = (extra, opts) => makeEnv(Object.assign({ [KEY]: RAW }, extra), Object.assign({ failKeys: [BACKUP] }, opts));

  // AC 30: 백업 실패 → 보호 모드. 기본 상태로 시작, 원문 유지, 배너, 입력은 동작
  {
    const clk = { t: Date.now() };
    const env = protectedEnv({}, { now: () => clk.t });
    ok(env.store[KEY] === RAW && !(BACKUP in env.store), 'AC 30: corrupt raw kept in the save key at start (backup failed)');
    ok(bannerShown(env) && env.byId['#saveGuard']._html.includes(TXT(env).banner), 'AC 30: protected-mode banner shown with the spec text');
    ok(['copyCorrupt', 'retryBackup', 'abandonCorrupt'].every(a => env.byId['#saveGuard']._html.includes(`data-act="${a}"`)), 'AC 30: banner has copy / retry / abandon buttons');
    ok(!/data-act="(close|dismiss)/.test(env.byId['#saveGuard']._html), 'AC 30: banner has no close button');
    ok(env.ctx.document.documentElement.classList.contains('save-guarded'), 'AC 30: page marked save-guarded (side panel layout)');
    ok(!badgeShown(env), 'AC 30: blocked saves are not shown as failed saves');
    ok(gold(env) === 300, 'AC 30: starts from the default state');
    hunt(env);
    ok(gold(env) > 300, 'AC 30: hunting works in memory');
    key(env, 'Space');
    await flush();
    ok(texts(env.byId['#log']).some(t => /강화 (성공|실패)|파괴|하락|보호/.test(t)), 'AC 30: enhancing works in memory');
    clk.t += 6000;
    env.tick();
    setVisible(env, false);
    fire(env, 'pagehide', {});
    clk.t += 1000;
    setVisible(env, true);
    click(env, 'buySword');
    ok(env.store[KEY] === RAW, 'AC 30: autosave tick, visibilitychange, pagehide, and actions never write the save key');
    env.byId['#btnReset'].listeners.click[0]();
    ok(env.store[KEY] === RAW && bannerShown(env) && gold(env) === 300, 'AC 30: new game does not write the save key; banner stays');
    // 탭 잠금은 보호 모드에서도 동작하고, 잠긴 동안 배너 버튼은 먹히지 않는다. 이어받기 후에도 원문 유지·메모리 상태 유지
    hunt(env);
    const goldBeforeLock = gold(env);
    fire(env, 'storage', { key: KEY });
    ok(isLocked(env), 'AC 30: tab lock still works in protected mode');
    click(env, 'abandonCorrupt');
    ok(env.store[KEY] === RAW && bannerShown(env), 'AC 30: banner buttons are ignored while the tab is locked');
    env.byId['#btnTakeover'].listeners.click[0]();
    ok(env.store[KEY] === RAW && bannerShown(env) && gold(env) === goldBeforeLock, 'AC 15/33: take over with the protected raw keeps memory state and keeps protecting');
    ok(!isLocked(env), 'take over unlocks');
    scanRendered();
  }

  // AC 31: [백업 다시 시도] 실패 → 유지, 성공 → 백업·해제·즉시 저장
  {
    const env = protectedEnv();
    hunt(env);
    click(env, 'retryBackup');
    ok(bannerShown(env) && env.store[KEY] === RAW && !(BACKUP in env.store), 'AC 31: failed retry keeps the banner and storage unchanged');
    ok(toastTexts(env).includes(TXT(env).retryFailed), 'AC 31: failed retry says so');
    env.failKeys.clear();
    click(env, 'retryBackup');
    ok(env.store[BACKUP] === RAW, 'AC 31: successful retry writes the raw to the backup key');
    ok(!bannerShown(env) && !env.ctx.document.documentElement.classList.contains('save-guarded'), 'AC 31: banner removed');
    ok(saved(env).gold === gold(env) && gold(env) > 300, 'AC 31: current state saved immediately');
    ok(toastTexts(env).includes(env.ctx.SG.view.corruptKeptText(BACKUP)), 'AC 31: kept toast names the backup key');
    click(env, 'buySword');
    ok(saved(env).swords.length === 2, 'AC 31: saving resumes after the retry');
  }

  // AC 32: [보존 포기하고 저장] 취소 → 변화 없음, 확인 → 저장·해제
  {
    const env = protectedEnv();
    hunt(env);
    let asked = null;
    env.ctx.confirm = msg => { asked = msg; return false; };
    click(env, 'abandonCorrupt');
    ok(asked === TXT(env).abandonConfirm && asked === '손상된 저장 원문이 영구히 사라집니다', 'AC 32: confirm dialog text');
    ok(env.store[KEY] === RAW && bannerShown(env), 'AC 32: cancel changes nothing');
    env.ctx.confirm = () => true;
    click(env, 'abandonCorrupt');
    ok(saved(env).gold === gold(env) && !bannerShown(env), 'AC 32: confirm overwrites with the current state and leaves protected mode');
    ok(!(BACKUP in env.store), 'AC 32: abandon writes no backup');
    click(env, 'buySword');
    ok(saved(env).swords.length === 2, 'AC 32: saving continues after abandon');
  }

  // AC 32: [원문 복사] — Clipboard API / execCommand 대체 / 둘 다 실패 시 읽기 전용 칸 (예외 없음)
  {
    let copied = null;
    let env = protectedEnv({}, { navigator: { clipboard: { writeText: text => { copied = text; return Promise.resolve(); } } } });
    click(env, 'copyCorrupt');
    await flush();
    ok(copied === RAW && toastTexts(env).includes(TXT(env).copied), 'AC 32: copy puts the exact raw on the clipboard');
    ok(env.store[KEY] === RAW && !(BACKUP in env.store) && bannerShown(env), 'AC 32: copy writes no storage and keeps protected mode');

    let selected = null;
    env = protectedEnv({}, { execCommand: cmd => { selected = cmd === 'copy' ? El.selected.value : null; return true; } });
    click(env, 'copyCorrupt');
    await flush();
    ok(selected === RAW && toastTexts(env).includes(TXT(env).copied), 'AC 32: without the Clipboard API (file://) the selection + execCommand fallback copies the raw');
    ok(!env.byId['#saveGuardRaw'] || env.byId['#saveGuardRaw'].hidden !== false, 'AC 32: no raw box when the fallback copy worked');

    env = protectedEnv({}, {
      navigator: { clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) } },
      execCommand: () => { throw new Error('unsupported'); },
    });
    click(env, 'copyCorrupt');
    await flush();
    const box = env.byId['#saveGuardRaw'];
    ok(box.hidden === false && box.value === RAW && El.selected === box, 'AC 32: both copy paths failing shows the raw in a selected read-only box');
    ok(toastTexts(env).includes(TXT(env).copyFailed), 'AC 32: copy failure toast');
    ok(env.byId['#saveGuard']._html.includes('id="saveGuardRaw" readonly'), 'AC 32: the raw box is read-only');
    env.failKeys.clear();
    click(env, 'retryBackup');
    ok(box.hidden === true && box.value === '', 'raw box cleared when protected mode ends');
  }

  // AC 33: 실행 중 저장이 손상되면 복귀·이어받기에서 이어받지 않고 메모리 상태 유지, 저장 전에 백업
  {
    const env = makeEnv({ [KEY]: validSave({ gold: 5000 }) });
    hunt(env);
    const g = gold(env);
    setVisible(env, false);
    env.store[KEY] = RAW;
    setVisible(env, true);
    ok(env.store[BACKUP] === RAW, 'AC 33: resume backs the corrupt raw up before saving');
    ok(gold(env) === g && saved(env).gold === g, 'AC 33: resume keeps the in-memory state (no reset) and saves it');
    ok(toastTexts(env).includes(env.ctx.SG.view.corruptKeptText(BACKUP)) && toastTexts(env).includes('손상된 저장을 sword-enhance-v2-corrupt에 보관했습니다'), 'AC 33: kept toast');
    ok(!bannerShown(env), 'AC 33: no protected mode when the backup worked');
  }
  {
    const env = makeEnv({ [KEY]: validSave({ gold: 5000 }), [BACKUP]: '{older' });
    hunt(env);
    const g = gold(env);
    fire(env, 'storage', { key: KEY });
    env.store[KEY] = RAW;
    env.byId['#btnTakeover'].listeners.click[0]();
    ok(env.store[BACKUP] === '{older', 'AC 33: take over keeps the earlier backup (occupied)');
    ok(toastTexts(env).filter(t => t === TXT(env).occupied).length === 1 && TXT(env).occupied === '이전 백업이 있어 이번 손상본은 보관하지 못했습니다', 'AC 33: occupied toast once');
    ok(gold(env) === g && saved(env).gold === g, 'AC 15/33: take over of a corrupt save keeps memory state, then saves');
  }
  {
    const env = makeEnv({ [KEY]: validSave({ gold: 5000 }) }, { failKeys: [BACKUP] });
    hunt(env);
    const g = gold(env);
    fire(env, 'storage', { key: KEY });
    env.store[KEY] = RAW;
    env.byId['#btnTakeover'].listeners.click[0]();
    ok(env.store[KEY] === RAW && bannerShown(env) && gold(env) === g, 'AC 33: failed backup on take over → protected mode, raw kept, memory state kept');
    hunt(env);
    setVisible(env, false);
    ok(env.store[KEY] === RAW, 'AC 33: no writes after entering protected mode on take over');
    // 다른 탭이 유효한 저장으로 덮어쓴 뒤 이어받으면 지킬 원문이 없으므로 보호를 끝내고 이어받는다
    setVisible(env, true);
    fire(env, 'storage', { key: KEY });
    env.store[KEY] = validSave({ gold: 8888 });
    env.byId['#btnTakeover'].listeners.click[0]();
    ok(!bannerShown(env) && saved(env).gold === 8888 && gold(env) === 8888, 'take over of a valid save ends protected mode (nothing left to protect)');
  }

  // AC 18: 시작 시 손상 v2 백업 성공 → 토스트 1회(이어지는 시작 정산에서 같은 원문을 다시 알리지 않음)
  {
    const env = makeEnv({ [KEY]: RAW });
    const corruptToasts = toastTexts(env).filter(t => t.includes(BACKUP));
    ok(env.store[BACKUP] === RAW && corruptToasts.length === 1, 'AC 18: one backup toast at start: ' + corruptToasts.join(' | '));
    ok(!bannerShown(env) && saved(env).gold === 300, 'AC 18: saving starts normally after the backup');
  }

  // AC 35: v1 '' (v2 없음 또는 '') → 새 게임, 손상 백업·토스트 없음
  for (const init of [{ 'sword-enhance-v1': '' }, { [KEY]: '', 'sword-enhance-v1': '' }]) {
    const env = makeEnv(init);
    ok(saved(env).gold === 300 && !(BACKUP in env.store) && env.store['sword-enhance-v1'] === '', 'AC 35: empty v1 → new game, no backup: ' + JSON.stringify(init));
    ok(!toastTexts(env).some(t => t.includes('읽을 수 없어')), 'AC 35: no corrupt toast');
  }

  // AC 36: 저장 실패 배지는 실패가 이어지는 동안 유지, 성공하면 사라짐. 토스트는 세션당 1회
  {
    const env = makeEnv({});
    ok(!badgeShown(env) && env.byId['#saveBadge'].textContent === '저장 안 됨 — 저장 공간 확인', 'AC 36: badge hidden while saving works (text set)');
    env.failKeys.add(KEY);
    hunt(env);
    ok(badgeShown(env), 'AC 36: badge shown after a failed save');
    ok(gold(env) > 300, 'AC 36: game continues in memory while saves fail');
    click(env, 'buySword');
    env.tick();
    setVisible(env, false);
    setVisible(env, true);
    ok(badgeShown(env) && toastTexts(env).filter(t => t === env.ctx.SG.view.SAVE_FAILED_TEXT).length === 1, 'AC 36: badge stays, toast once per session');
    ok(!bannerShown(env), 'AC 36: failing saves are not protected mode');
    env.failKeys.clear();
    setVisible(env, false);   // 다음 저장 시도(숨김 시 저장)
    ok(!badgeShown(env) && saved(env).gold === gold(env), 'AC 36: badge cleared after a successful save');
  }

  // 테스트 페이지: 조작판(commit/newGame) 경로도 보호 모드에서 테스트 저장 키에 쓰지 않는다
  {
    const env = makeEnv({ [TEST_KEY]: RAW }, { page: 'test.html', failKeys: [TEST_KEY + '-corrupt'] });
    ok(env.scripts.length === 16 && bannerShown(env), 'test page: protected mode on a corrupt test save whose backup fails');
    click(env, 'testGold');
    click(env, 'testToggleForce');
    click(env, 'testReset');
    ok(env.store[TEST_KEY] === RAW, 'test page: test panel actions do not write while protected');
    ok(!('sword-enhance-v2' in env.store), 'test page: real save key never written');
  }

  // AC 17: 잠금 화면 문구, z-order(잠금 화면 > 배너), 배너는 헤더 안(하단 탭바와 겹치지 않음) — 두 페이지 모두
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  const zOf = sel => Number((css.match(new RegExp('(?:^|\\n)' + sel.replace(/[#.]/g, '\\$&') + '\\s*\\{[^}]*z-index:\\s*(\\d+)')) || [])[1]);
  ok(zOf('#tabLock') > zOf('header') && zOf('#tabLock') > zOf('#toasts'), `AC 17: lock overlay (z ${zOf('#tabLock')}) above the header banner (z ${zOf('header')})`);
  for (const page of ['index.html', 'test.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const lock = html.match(/<div id="tabLock" hidden>[\s\S]*?<\/div>\s*<\/div>/)[0];
    ok(lock.includes('<h3>다른 탭에서 게임이 실행 중입니다</h3>'), `AC 17 ${page}: lock title`);
    ok(lock.includes('저장이 서로 덮어쓰이지 않도록 이 탭을 멈췄습니다.') && lock.includes('누르면 다른 탭이 멈춥니다.'), `AC 17 ${page}: lock body`);
    ok(/<button[^>]*id="btnTakeover"[^>]*>이 탭에서 계속하기<\/button>/.test(lock), `AC 17 ${page}: take over button label`);
    const header = html.match(/<header>[\s\S]*?<\/header>/)[0];
    ok(header.includes('id="saveGuard"') && header.includes('id="saveBadge"'), `${page}: banner and badge live in the sticky header (inert while locked, away from the bottom tab bar)`);
  }
  ok(T.SAVE_KEY === KEY, 'real save key unchanged');
}

/** REQ-031 저장 안전 마무리: 입력 칸 단축키, 보호 모드 한정 헤더 줄바꿈·모바일 헤더, 읽기 실패 시 보호 유지 */
async function req031(ok) {
  const KEY = 'sword-enhance-v2';
  const BACKUP = 'sword-enhance-v2-corrupt';
  const RAW = '{"gold": 1, "swords": [';
  /** keydown/keyup을 target과 함께 보내고 preventDefault 호출 여부를 돌려준다 */
  const press = (env, type, code, target) => {
    let prevented = false;
    env.docListeners[type].forEach(f => f({ code, repeat: false, target, preventDefault() { prevented = true; } }));
    return prevented;
  };
  const startSave = () => {
    const s = Object.assign(SG_default(), { gold: 1e6, best: 5 });
    s.swords = [{ id: 1, lv: 3, prot: 2, pity: 0 }, { id: 2, lv: 0, prot: 2, pity: 0 }]; s.nextSwordId = 3; s.active = 1;
    return JSON.stringify(s);
  };

  // 1) 글자 입력 칸에서는 Space·S·H·Escape 단축키가 아무것도 하지 않고 기본 동작(공백 입력)도 막지 않는다
  const textTargets = {
    textarea: { tagName: 'TEXTAREA' },
    'input text': { tagName: 'INPUT', type: 'text' },
    'input number': { tagName: 'INPUT', type: 'number' },
    select: { tagName: 'SELECT' },
    contenteditable: { tagName: 'DIV', isContentEditable: true },
  };
  for (const [name, target] of Object.entries(textTargets)) {
    const env = makeEnv({ [KEY]: startSave() });
    const before = saved(env);
    env.ctx.document.querySelector('#settingsPop').hidden = false;
    const prevented = ['Space', 'KeyS', 'KeyH', 'Escape'].map(code => press(env, 'keydown', code, target));
    const after = saved(env);
    ok(after.stats.tries === before.stats.tries && after.gold === before.gold && after.swords.length === 2,
      `REQ-031 ${name}: Space/S/H do not enhance, sell or hunt`);
    ok(env.ctx.document.querySelector('#settingsPop').hidden === false, `REQ-031 ${name}: Escape keeps the popover (key belongs to the field)`);
    ok(prevented.every(p => !p) && !press(env, 'keyup', 'Space', target), `REQ-031 ${name}: keydown/keyup Space not prevented (a space can be typed)`);
  }

  // 체크박스·버튼·문서 본문은 입력 칸이 아니므로 기존대로 단축키가 동작한다
  {
    const env = makeEnv({ [KEY]: startSave() });
    const tries = saved(env).stats.tries;
    ok(press(env, 'keydown', 'Space', { tagName: 'INPUT', type: 'checkbox' }) && saved(env).stats.tries === tries + 1,
      'REQ-031: Space on a focused checkbox still enhances (prevented)');
    ok(press(env, 'keyup', 'Space', { tagName: 'INPUT', type: 'checkbox' }), 'REQ-031: keyup Space on a checkbox is still prevented (no double toggle)');
    const gold = saved(env).gold;
    press(env, 'keydown', 'KeyH', { tagName: 'BUTTON' });
    ok(saved(env).gold > gold, 'REQ-031: H on a focused button still hunts');
    env.ctx.document.querySelector('#settingsPop').hidden = false;
    press(env, 'keydown', 'Escape', { tagName: 'BODY' });
    ok(env.ctx.document.querySelector('#settingsPop').hidden === true, 'REQ-031: Escape outside fields still closes the popover');
  }

  // 2·3) CSS: 헤더 줄바꿈은 보호 모드에서만, 좁은 화면 보호 모드에서는 헤더가 sticky가 아니고 원문 칸 높이 제한
  {
    const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8').replace(/\r\n/g, '\n');
    const rule = (src, sel) => (src.match(new RegExp('(?:^|\\n)\\s*' + sel.replace(/[.#]/g, '\\$&') + '\\s*\\{([^}]*)\\}')) || [])[1];
    const topLevel = css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, '');
    const mobile = (css.match(/@media \(max-width: 720px\) \{((?:[^{}]*\{[^}]*\})*[^{}]*)\}/) || [])[1] || '';
    ok(/position:\s*sticky/.test(rule(topLevel, 'header')) && !/flex-wrap/.test(rule(topLevel, 'header')), 'REQ-031: the normal header does not wrap (721~1000px layout unchanged)');
    ok(/flex-wrap:\s*wrap/.test(rule(topLevel, '.save-guarded header') || ''), 'REQ-031: the header wraps only under .save-guarded');
    ok(/position:\s*static/.test(rule(mobile, '.save-guarded header') || ''), 'REQ-031: on mobile (<= 720px) the protected header is not sticky');
    const raw = rule(topLevel, '.save-guard-raw') || '';
    const maxH = Number((raw.match(/max-height:\s*(\d+)px/) || [])[1]);
    ok(maxH > 0 && maxH <= 120 && /overflow:\s*auto/.test(raw), 'REQ-031: the raw box height is capped (<= 120px) and scrolls: ' + maxH);
    // 보호 모드 표시(html.save-guarded)는 배너와 함께 켜지고 꺼진다
    const env = makeEnv({ [KEY]: RAW }, { failKeys: [BACKUP] });
    const marked = () => env.ctx.document.documentElement.classList.contains('save-guarded');
    ok(marked(), 'REQ-031: html.save-guarded set in protected mode');
    env.failKeys.clear();
    click(env, 'retryBackup');
    ok(!marked(), 'REQ-031: html.save-guarded cleared when protected mode ends (normal header layout)');
  }

  // 4) 저장 키 읽기가 예외를 던져도 보호 모드를 끝내지 않는다(복귀·이어받기)
  {
    const env = makeEnv({ [KEY]: RAW }, { failKeys: [BACKUP] });
    const bannerShown = () => env.byId['#saveGuard'].hidden === false;
    ok(bannerShown(), 'REQ-031: protected at start');
    const getItem = env.ctx.localStorage.getItem;
    env.ctx.localStorage.getItem = () => { throw new Error('SecurityError'); };
    setVisible(env, false);
    setVisible(env, true);
    fire(env, 'storage', { key: KEY });
    env.byId['#btnTakeover'].listeners.click[0]();
    ok(bannerShown() && env.store[KEY] === RAW, 'REQ-031: a throwing read on resume/take over keeps protected mode and the raw');
    env.ctx.localStorage.getItem = getItem;
    setVisible(env, false);
    setVisible(env, true);
    ok(bannerShown() && env.store[KEY] === RAW, 'REQ-031: once readable again, the same raw is still protected');
  }
}

main().catch(e => { console.error('smoke-dom FAILED:', e.stack || e.message); process.exit(1); });
