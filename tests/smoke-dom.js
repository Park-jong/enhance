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
    this.attrs = {};
    allEls.push(this);
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
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
  // opts.pageRegions: index.html처럼 body 자식(header·main·#modal)을 두고 #modal을 hidden으로 시작한다(창 밖 inert 검사용).
  // 스텁 요소에는 inert 속성이 없다: main.js가 쓰는 값만 읽는다
  if (opts.pageRegions) {
    ['header', 'main', '#modal'].forEach(s => document.body.children.push(document.querySelector(s)));
    byId['#modal'].hidden = true;
  }
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
    // opts.performance: 가짜 단조 시계({ now }). 없으면 main.js는 Date.now로 대체한다
    performance: opts.performance,
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
  ok(env.scripts.length === 18, 'all scripts loaded');
  ok(!!env.ctx.M1_ICONS && !!env.ctx.M2_ICONS && !!env.ctx.M1_SFX_PLAY, 'content assets loaded');
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
  // 오프라인 보상 창도 같은 #modal: 열린 동안 창 밖(header·main) inert, 받기(closeModal)로 풀린다(V1)
  const offClock = { t: Date.now() };
  const offSave = JSON.parse(JSON.stringify(idleSave));
  offSave.idle.lastSeen = offClock.t;
  env = makeEnv({ 'sword-enhance-v2': JSON.stringify(offSave) }, { now: () => offClock.t, pageRegions: true });
  offClock.t += 2 * 3600 * 1000;
  env.tick();
  ok(offlineShown(env) && env.byId['header'].inert === true && env.byId['main'].inert === true, 'offline reward modal makes the page outside it inert');
  click(env, 'closeModal');
  ok(!offlineShown(env) && !env.byId['header'].inert && !env.byId['main'].inert, 'collecting the offline reward clears inert');

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
  // 7b-4) 6-A F12: 일일 세트 갱신(부팅·틱·복귀), 업적 동기화, 수령 즉시 저장, 두 탭 재확인·멈춘 탭
  await achievementsWiring(ok);
  // 7b-5) 6-B F12 화면: 기록 탭 일일 과제·업적·칭호·탭 점, 수령 토스트
  await recordsUi(ok);
  // 7b-6) 7-1 F13: 시간 이벤트 틱 배선(단조 시계·숨김·멈춘 탭·즉시 저장·catch-up 무보너스)
  await eventsWiring(ok);
  // 7b-7) 7-2 F13 화면: 칩·팝오버(열고 닫기)·시작/종료 토스트·효과 표시·이벤트 덕 성공 로그·테스트 페이지 조작
  await eventsUi(ok);
  // 7b-8) 8-A F11: 환생·명성 상점 배선(draft 교체·저장 1번·멈춘 탭·다시 불러오기·미러 키)
  await rebirthWiring(ok);
  // 7b-9) 8-B F11 화면: 기록 탭 환생 섹션(잠김·표시·상점·사유), 확인 창(열기·확인·취소·닫힘 경로·연출 중·재검사)
  await rebirthUi(ok);
  // 7b-10) 9-2: M2 아이콘(SVG 있음 / 에셋 없음 폴백)·특성 등급 점·확정 배지·토스트는 이모지
  await m2IconsUi(ok);

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

/**
 * 6-A F12 배선 (m2-achievements §6·§9·§10·§11, AC 10b·29·30·30b·30c·30d): main.js가 부팅·틱·복귀에서 일일 세트를 갱신하고
 * 업적을 동기화하며, 수령 직후 즉시 저장하고, 다른 탭의 저장을 다시 확인한다. 화면(6-B)은 검사하지 않는다
 */
// F12 화면·배선 시나리오 공용: 주입 시계 기준 날짜, 고정 rng 로드, 저장 조립
const F12 = (() => {
  const A = require(path.join(ROOT, 'js', 'achievements.js'));
  const HOUR = 3600 * 1000;
  const offAt = ms => new Date(ms).getTimezoneOffset();
  const realRandom = Math.random;
  return {
    KEY: 'sword-enhance-v2', A, HOUR, D: 20777,
    dayOf: ms => A.dayKey(ms, offAt(ms)),
    /** 이 기기 시간대에서 dayKey가 d로 바뀌는 시각(지역 04:00) */
    dayStart: d => { const t = d * 86400000 + 4 * HOUR; return t + offAt(t) * 60000; },
    /** main.js는 로드 시점의 Math.random을 잡으므로 로드하는 동안만 고정한다(일일 생성 9회·강화 굴림도 이 값, V6) */
    loadWith: (store, opts, value = 0) => {
      Math.random = () => value;
      try { return makeEnv(store, opts); } finally { Math.random = realRandom; }
    },
    save: fields => Object.assign(SG_default(), fields),
    setOf: (day, done) => ({ maxDay: day, tasks: [
      { e: 'hunt_s', goal: 10, base: done ? 0 : 5, item: null, claimed: 0 },
      { e: 'succ_m', goal: 4, base: 0, item: null, claimed: 0 },
      { e: 'dlv_l', goal: 1, base: 0, item: null, claimed: 0 }], bonus: 0 }),
    withLv: (s, lv) => { s.best = lv; s.swords = [{ id: 1, lv, prot: 2, pity: 0, trait: null }]; return s; },
  };
})();

async function achievementsWiring(ok) {
  const { KEY, A, HOUR, D, dayOf, dayStart, loadWith, save, setOf, withLv } = F12;

  // 부팅: best 4는 일일 잠김(세트·maxDay 없음), best 5는 오늘 세트 1개(첫 후보들, 고정 rng 0)
  const clk = { t: dayStart(D) + 5 * HOUR };
  let env = loadWith({ [KEY]: JSON.stringify(withLv(save({}), 4)) }, { now: () => clk.t });
  ok(JSON.stringify(saved(env).daily) === JSON.stringify({ maxDay: 0, tasks: [], bonus: 0 }), 'F12 boot: daily locked below +5');
  env = loadWith({ [KEY]: JSON.stringify(withLv(save({}), 5)) }, { now: () => clk.t });
  let st = saved(env);
  ok(st.daily.maxDay === D && st.daily.tasks.map(t => t.e).join() === 'hunt_s,succ_m,dlv_l', 'F12 boot: best 5 gets today\'s set: ' + JSON.stringify(st.daily));
  scanRendered();

  // 틱: 지역 04:00 경계를 넘으면 새 세트 1개를 만들고 바로 저장, 시계를 되돌리면 그대로(역행 무시)
  clk.t = dayStart(D + 1) - 1000;
  env = loadWith({ [KEY]: JSON.stringify(withLv(save({ daily: setOf(D, true) }), 5)) }, { now: () => clk.t });
  ok(saved(env).daily.maxDay === D, 'F12 tick: 03:59:59 is still the previous day');
  clk.t = dayStart(D + 1) + 1000;
  env.tick();
  st = saved(env);
  ok(st.daily.maxDay === D + 1 && st.daily.tasks.length === 3 && st.daily.tasks[0].base === st.stats.hunts, 'F12 tick: 04:00 creates the new day\'s set and saves it');
  const afterBoundary = env.store[KEY];
  clk.t = dayStart(D + 1) - 1000;
  env.tick();
  ok(saved(env).daily.maxDay === D + 1 && JSON.stringify(saved(env).daily) === JSON.stringify(JSON.parse(afterBoundary).daily), 'F12 tick: clock rollback keeps the set');

  // 복귀: 1주 오프라인(자동 ON) 뒤에도 세트는 1개(AC 10b), 오프라인 지급은 일일 진행에 들어가지 않는다
  clk.t = dayStart(D) + 5 * HOUR;
  const away = withLv(save({ daily: setOf(D, false), gold: 1000 }), 8);
  away.idle.autoOn = true;
  away.idle.lastSeen = clk.t;
  env = loadWith({ [KEY]: JSON.stringify(away) }, { now: () => clk.t });
  setVisible(env, false);   // 숨길 때 저장하며 lastSeen을 갱신하므로 숨긴 뒤에 시계를 민다
  clk.t += 7 * 24 * HOUR;
  setVisible(env, true);
  st = saved(env);
  ok(st.daily.maxDay === dayOf(clk.t) && st.stats.autoRuns === 0 && st.stats.offlineGold > 0 && st.daily.tasks.every(t => t.claimed === 0),
    'F12 resume: one set after a week offline, offline gold does not count as daily progress');

  // 업적: 부팅 동기화로 달성(1), 수령하면 플래그 2와 보상이 같은 저장에 즉시 들어간다(AC 30b), 다시 받으면 변화 없음
  clk.t = dayStart(D) + 5 * HOUR;
  const ready = withLv(save({ gold: 1000, daily: setOf(D, true) }), 13);
  Object.assign(ready.stats, { tries: 100, hunts: 10 });
  env = loadWith({ [KEY]: JSON.stringify(ready) }, { now: () => clk.t });
  ok(saved(env).achievements.tries_1 === 1, 'F12 boot syncs achievements (tries_1 reached)');
  click(env, 'claimAch', 'tries_1');
  st = saved(env);
  ok(st.achievements.tries_1 === 2 && st.gold === 1000 + 2680 && st.stats.rewardGold === 2680, 'F12 claim: flag and reward saved together immediately');
  click(env, 'claimAch', 'tries_1');
  ok(saved(env).gold === 1000 + 2680, 'F12 claim: second claim pays nothing');
  click(env, 'setTitle', 'tries_1');
  ok(saved(env).title === 'tries_1', 'F12 setTitle saves the chosen title');
  click(env, 'claimDaily', '0');
  st = saved(env);
  ok(st.daily.tasks[0].claimed === 1 && st.stats.dailyDone === 1 && st.gold === 1000 + 2680 + 5350, 'F12 claimDaily (data-id string "0") pays and saves');
  click(env, 'claimDaily', 'bonus');
  ok(saved(env).daily.bonus === 0, 'F12 bonus is refused until all 3 tasks are done');
  scanRendered();

  // 두 탭 (AC 30·30d): 다른 탭이 이미 받은 항목은 claimed, 다른 날 세트로 바뀌었으면 stale → 최신 저장을 이어받고 저장하지 않는다
  let game = null;
  const twoTab = () => {
    env = loadWith({ [KEY]: JSON.stringify(ready) }, { now: () => clk.t, extensions: [api => { game = api; }] });
  };
  twoTab();
  const otherClaimed = JSON.parse(env.store[KEY]);
  otherClaimed.daily.tasks[0].claimed = 1;
  otherClaimed.gold = 4444;
  env.store[KEY] = JSON.stringify(otherClaimed);
  click(env, 'claimDaily', '0');
  ok(env.store[KEY] === JSON.stringify(otherClaimed) && game.state().gold === 1000 && game.state().daily.tasks[0].claimed === 1,
    'F12 two tabs: an item the other tab saved is "claimed" with no reward and no write');
  twoTab();
  const otherDay = JSON.parse(env.store[KEY]);
  otherDay.daily = setOf(D + 1, false);
  otherDay.gold = 7777;
  otherDay.idle.lastSeen = clk.t + 5;   // 다른 탭이 더 나중에 저장함
  env.store[KEY] = JSON.stringify(otherDay);
  click(env, 'claimDaily', '0');
  ok(env.store[KEY] === JSON.stringify(otherDay) && game.state().gold === 7777 && game.state().daily.maxDay === D + 1,
    'F12 two tabs: stale set → adopts the newer save, pays nothing, does not write');
  // 이 탭의 저장이 실패 중이라 저장소가 더 오래된 경우: stale이어도 메모리 진행을 버리지 않는다
  twoTab();
  game.state().gold = 5555;
  const olderDay = JSON.parse(env.store[KEY]);
  olderDay.daily = setOf(D - 1, true);
  olderDay.idle.lastSeen = clk.t - 5;
  env.store[KEY] = JSON.stringify(olderDay);
  click(env, 'claimDaily', '0');
  ok(game.state().gold === 5555 && game.state().daily.maxDay === D && env.store[KEY] === JSON.stringify(olderDay),
    'F12 two tabs: an older stored set is stale but not adopted (no lost in-memory progress)');
  // claimAll이 stale을 만나면(업적은 받아도) 옛 날 세트를 더 최신 저장 위에 쓰지 않고 단일 stale처럼 이어받는다
  twoTab();
  env.store[KEY] = JSON.stringify(otherDay);
  click(env, 'claimAll');
  ok(env.store[KEY] === JSON.stringify(otherDay) && game.state().gold === 7777 && game.state().daily.maxDay === D + 1,
    'F12 two tabs: claimAll with a stale set adopts the newer save and does not write the old-day set');
  // stale로 이어받은 뒤 날이 또 바뀌어 새 세트를 만들면 바로 저장한다: 다음 수령이 자동 저장을 기다리지 않고 성공
  twoTab();
  env.store[KEY] = JSON.stringify(otherDay);
  clk.t = dayStart(D + 2) + HOUR;
  click(env, 'claimDaily', '0');
  ok(game.state().gold === 7777 && saved(env).daily.maxDay === D + 2 && saved(env).gold === 7777,
    'F12 two tabs: stale → adopt → a new day set is created and saved at once');
  game.state().stats.hunts += 1000;
  click(env, 'claimDaily', '0');
  ok(saved(env).daily.tasks[0].claimed === 1 && saved(env).gold > 7777, 'F12 two tabs: the next claim after that is not stale again');
  clk.t = dayStart(D) + 5 * HOUR;
  // claimAll은 클릭 한 번에 저장소를 한 번만 읽는다(항목마다 peek하지 않음)
  const many = JSON.parse(JSON.stringify(ready));
  Object.assign(many.stats, { success: 4, delivered: 1 });
  env = loadWith({ [KEY]: JSON.stringify(many) }, { now: () => clk.t });
  let reads = 0;
  const getItem = env.ctx.localStorage.getItem;
  env.ctx.localStorage.getItem = k => { if (k === KEY) reads++; return getItem(k); };
  click(env, 'claimAll');
  st = saved(env);
  ok(reads === 1 && st.daily.tasks.every(t => t.claimed === 1) && st.daily.bonus === 1 && st.achievements.tries_1 === 2,
    'F12 claimAll reads the stored save once per click: ' + reads);
  // claimDaily data-id는 정확한 정수 표기만 슬롯 번호: '', ' 0', '0x0', '1e0', '00'은 슬롯 0이 아니다
  env = loadWith({ [KEY]: JSON.stringify(ready) }, { now: () => clk.t });
  const beforeIds = env.store[KEY];
  ['', ' 0', '0x0', '1e0', '00', '-0'].forEach(id => click(env, 'claimDaily', id));
  ok(env.store[KEY] === beforeIds, 'F12 claimDaily ignores non-canonical slot ids');
  click(env, 'claimDaily', '0');
  ok(saved(env).daily.tasks[0].claimed === 1, 'F12 claimDaily "0" still claims slot 0');
  scanRendered();

  // 멈춘 탭 (AC 29·30c): 틱·복귀가 일일 갱신·저장을 하지 않고 수령 입력도 무시, 이어받은 뒤 최신 저장 기준으로 갱신
  twoTab();
  fire(env, 'storage', { key: KEY });
  const frozen = env.store[KEY];
  clk.t += 24 * HOUR;
  env.tick();
  setVisible(env, false);
  setVisible(env, true);
  click(env, 'claimAll');
  ok(isLocked(env) && env.store[KEY] === frozen, 'F12 suspended tab: no daily refresh, no claim, no write');
  env.byId['#btnTakeover'].listeners.click[0]();
  ok(!isLocked(env) && saved(env).daily.maxDay === D + 1, 'F12 takeover adopts the stored save then refreshes daily');
  click(env, 'claimAll');
  ok(saved(env).achievements.tries_1 === 2, 'F12 claimAll on the active tab claims and saves');
  scanRendered();
}

/**
 * 6-B F12 화면 (m2-achievements §12, §10.3, AC 55~59): 기록 탭 섹션 순서·일일 카드·업적 행·칭호·탭 점,
 * 받기·모두 받기·stale·실패 문구, 달성·도착 토스트(강화는 결과 공개 뒤), 멈춘 탭 무알림
 */
async function recordsUi(ok) {
  const { KEY, A, HOUR, D, dayStart, loadWith, save, setOf, withLv } = F12;
  const toastTexts = env => (env.byId['#toasts'] ? texts(env.byId['#toasts']) : []);
  const toastCount = (env, text) => toastTexts(env).filter(t => t === text).length;
  const daily = env => env.byId['#dailySection']._html;
  const achs = env => env.byId['#achSection']._html;
  /** 마크업 조각: start 표시부터 다음 같은 종류 표시(또는 끝)까지 */
  const piece = (html, start, next) => {
    const i = html.indexOf(start);
    if (i < 0) return '';
    const j = html.indexOf(next, i + start.length);
    return html.slice(i, j < 0 ? html.length : j);
  };
  const card = (env, slot) => piece(daily(env), `data-slot="${slot}"`, 'data-slot="').replace(/<div class="daily-bonus[\s\S]*$/, '');
  const cardClass = (env, slot) => (daily(env).match(new RegExp(`class="daily-card (\\w+)" data-slot="${slot}"`)) || [])[1];
  const bonus = env => piece(daily(env), 'class="daily-bonus', '\u0000');
  const row = (env, id) => piece(achs(env), `data-ach="${id}"`, 'data-ach="');
  const rowClass = (env, id) => (achs(env).match(new RegExp(`class="ach-row (\\w+)" data-ach="${id}"`)) || [])[1];
  const recordsDot = env => /class="dot"/.test(env.byId['#tabbar']._html.split('<button').find(b => b.includes('data-id="records"')) || '');
  const hasButton = (html, act, id) => html.includes(`data-act="${act}" data-id="${id}"`);
  const fmt = env => env.ctx.SG.fx.fmt;
  const clk = { t: dayStart(D) + 5 * HOUR };   // 다음 갱신(04:00)까지 19:00
  const opts = extra => Object.assign({ now: () => clk.t }, extra);
  /** +5 이상 검은 부팅 때 무료 각인되어 trt_1이 같이 달성되므로, 이미 특성이 있는 검으로 둔다 */
  const engraved = s => { s.swords.forEach(sw => { sw.trait = { k: "anvil", t: 1 }; }); return s; };

  // 마크업: 기록 탭 섹션 순서와 탭 5칸(새 탭 없음), test.html도 같은 순서 (AC 56)
  ['index.html', 'test.html'].forEach(page => {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const panel = html.match(/data-panel="records"[\s\S]*?<\/section>/)[0];
    const at = id => panel.indexOf(`id="${id}"`);
    const order = ['rebirthSection', 'dailySection', 'statsGrid', 'masteryList', 'monumentList', 'log', 'achSection'].map(at);
    ok(order.every((p, i) => p > 0 && (i === 0 || p > order[i - 1])), `${page}: records order 환생 → 일일 과제 → 통계 → 숙련 → 기념비 → 로그 → 업적: ${order}`);
    ok(/<header>[\s\S]*id="titleBadge"[\s\S]*<\/header>/.test(html), `${page}: title badge lives in the header`);
  });

  // 새 게임(+0): 일일 잠김, 업적 34행·12묶음, 수령 0/34, 모두 받기 비활성, 칭호 없음, 점 없음
  let env = loadWith({}, opts());
  ok((env.byId['#tabbar']._html.match(/data-act="tab"/g) || []).length === 5, 'tab bar keeps 5 tabs');
  ok(plain(daily(env)).includes(`최고 +${env.ctx.SG.C.DAILY_UNLOCK_BEST} 이상에서 열림`) && daily(env).includes('locked-msg') && !daily(env).includes('다음 갱신까지'),
    'daily locked below +5 (lockedHTML style, no countdown)');
  ok((achs(env).match(/class="ach-row /g) || []).length === 34 && (achs(env).match(/class="ach-track"/g) || []).length === 12,
    'achievements: 34 rows in 11 tracks + 1 single');
  ok(plain(achs(env)).includes('수령 0/34') && /data-act="claimAll" disabled/.test(achs(env)), 'nothing claimable: 수령 0/34, 모두 받기 disabled');
  ok(rowClass(env, 'tries_1') === 'locked' && plain(row(env, 'tries_1')).includes('0/100') && plain(row(env, 'tries_1')).includes('진행 중')
    && plain(row(env, 'tries_1')).includes('강화 100회 시도') && !row(env, 'tries_1').includes('data-act'), 'locked row: condition, progress, 진행 중, no button');
  ok(plain(row(env, 'perfect')).includes('완벽한 등급 특성 검 보유') && piece(achs(env), 'data-track="perfect"', '\u0000').includes('단발'), 'single achievement shown as 단발');
  ok(env.byId['#titleBadge'].hidden && env.byId['#recordsTitle'].hidden && hasButton(achs(env), 'setTitle', ''), 'no title: badges hidden, 없음 option only');
  ok(!recordsDot(env), 'AC55: no records dot when nothing is claimable');
  ok(!toastTexts(env).some(t => t.includes('업적') || t.includes('일일 과제')), 'fresh game: no F12 toasts');
  scanRendered();

  // 옛 저장 첫 로드: 여러 개가 한꺼번에 달성되면 토스트 1개로 합친다
  const many = engraved(withLv(save({ gold: 1000, daily: setOf(D, true) }), 13));
  Object.assign(many.stats, { tries: 100, hunts: 10 });
  env = loadWith({ [KEY]: JSON.stringify(many) }, opts());
  ok(toastCount(env, '업적 2개 달성') === 1 && !toastTexts(env).some(t => t.startsWith('업적 달성:')), 'old save: tries_1 + best_1 merged into one toast');

  // 일일 카드: 설명·막대·진행·보상 미리보기·상태 (best 9, 슬롯 0 달성)
  const one = engraved(withLv(save({ gold: 1000, daily: setOf(D, true) }), 9));
  Object.assign(one.stats, { tries: 100, hunts: 10 });
  let game = null;
  env = loadWith({ [KEY]: JSON.stringify(one) }, opts({ extensions: [api => { game = api; }] }));
  ok(toastCount(env, '업적 달성: 첫 단련 — 기록 탭에서 보상을 받으세요') === 1, 'one new achievement → its name in the toast');
  ok(plain(daily(env)).includes('다음 갱신까지 19:00'), 'countdown to the next 04:00 from the injected clock: ' + plain(daily(env)).slice(0, 40));
  ok((daily(env).match(/class="daily-card /g) || []).length === 3 && daily(env).includes('★★★'), '3 daily cards with stars');
  const S9 = game.state();
  const pv0 = A.dailyRewardPreview(S9, 0);
  ok(cardClass(env, 0) === 'ready' && plain(card(env, 0)).includes('수동 사냥 10회') && plain(card(env, 0)).includes('10/10')
    && plain(card(env, 0)).includes(`+${fmt(env)(pv0.gold)}G`) && hasButton(card(env, 0), 'claimDaily', 0), 'reached card: full progress, reward amount, 받기');
  ok(cardClass(env, 1) === 'progress' && plain(card(env, 1)).includes('강화 4회 성공') && plain(card(env, 1)).includes('0/4')
    && plain(card(env, 1)).includes('진행 중') && !card(env, 1).includes('data-act'), 'in-progress card: numbers and 진행 중, no button');
  const pvB = A.dailyRewardPreview(S9, A.BONUS);
  ok(plain(bonus(env)).includes(`오늘 3개 모두 달성: 보너스 +${fmt(env)(pvB.gold)}G · 파편 ${fmt(env)(pvB.shards)}`) && plain(bonus(env)).includes('1/3 달성')
    && !bonus(env).includes('data-act'), 'bonus row: amounts and 1/3 달성');
  ok(!/의뢰|퀘스트/.test(plain(daily(env))), 'AC54: daily section never says 의뢰/퀘스트');
  ok(recordsDot(env) && !/data-act="claimAll" disabled/.test(achs(env)), 'AC55: dot and enabled 모두 받기 while something is claimable');
  ok(rowClass(env, 'tries_1') === 'ready' && hasButton(row(env, 'tries_1'), 'claimAch', 'tries_1'), 'reached row: accent + 받기');
  scanRendered();

  // 받기: 일일 → 토스트(실제 지급액)·수령 표시, 업적 → 보상 토스트·✔ 받음·칭호
  let gold = saved(env).gold;
  click(env, 'claimDaily', '0');
  ok(toastCount(env, `일일 과제 보상: +${fmt(env)(saved(env).gold - gold)}G`) === 1 && saved(env).gold - gold === pv0.gold, 'daily claim toast shows the paid amount (= preview)');
  ok(cardClass(env, 0) === 'claimed' && plain(card(env, 0)).includes('✔ 받음') && !card(env, 0).includes('data-act'), 'claimed card: ✔ 받음, no button');
  gold = saved(env).gold;
  const pvT = A.achRewardPreview(game.state(), 'tries_1');
  click(env, 'claimAch', 'tries_1');
  ok(toastCount(env, `업적 보상: +${fmt(env)(pvT.gold)}G · 칭호 「견습 대장장이」`) === 1 && saved(env).gold - gold === pvT.gold, 'achievement claim toast (zero parts omitted)');
  ok(rowClass(env, 'tries_1') === 'claimed' && plain(row(env, 'tries_1')).includes('✔ 받음') && plain(row(env, 'tries_1')).includes('칭호 「견습 대장장이」')
    && plain(achs(env)).includes('수령 1/34'), 'claimed row: ✔ 받음 + title, count 1/34');
  ok(piece(achs(env), 'data-track="tries"', 'data-track="').includes('class="ach-chip claimed"'), 'track chip I shows claimed');
  ok(!recordsDot(env) && /data-act="claimAll" disabled/.test(achs(env)), 'AC55: dot gone once everything is claimed');

  // 칭호: 선택 → 상단 바·기록 제목에 「칭호」, 없음 → 숨김
  ok(hasButton(achs(env), 'setTitle', 'tries_1'), 'claimed title appears in the selector');
  click(env, 'setTitle', 'tries_1');
  const titleIcon = `<span class="ic">${env.ctx.M2_ICONS.title}</span>`;
  ok(env.byId['#titleBadge']._html === titleIcon + ' 「견습 대장장이」' && !env.byId['#titleBadge'].hidden && env.byId['#recordsTitle']._html === titleIcon + ' 「견습 대장장이」'
    && /class="title-opt on" data-act="setTitle" data-id="tries_1"/.test(achs(env)), 'title (with the title SVG, 9-2) shown in header and records title, option marked');
  ok(achs(env).includes(`<span class="muted">${titleIcon} 칭호</span>`) && achs(env).includes(`<h2><span class="ic">${env.ctx.M2_ICONS.achievement}</span> 업적 `),
    '9-2: title picker label and achievements heading use their SVGs');
  click(env, 'setTitle', '');
  ok(env.byId['#titleBadge'].hidden && env.byId['#recordsTitle'].hidden && env.byId['#titleBadge']._html === '' && saved(env).title === '', '없음 hides the title');

  // 실패 문구 (§10.3): 미달성 일일·업적, 이미 받음
  click(env, 'claimDaily', '1');
  click(env, 'claimAch', 'tries_2');
  ok(toastCount(env, '아직 달성하지 못했습니다') === 2, 'notDone / notReached → 아직 달성하지 못했습니다');
  click(env, 'claimDaily', '0');
  ok(toastCount(env, '이미 받은 보상입니다') === 1, 'claimed → 이미 받은 보상입니다');

  // 3개 달성 → 남은 과제와 보너스 받기, 보너스 토스트
  game.state().stats.success += 4;
  game.state().stats.delivered += 1;
  game.state().stats.dailyDone = 9;   // 다음 일일 수령으로 day_1(10회) 달성
  click(env, 'claimDaily', '1');
  ok(toastCount(env, '업적 달성: 성실한 하루 — 기록 탭에서 보상을 받으세요') === 1, 'a claim that reaches an achievement announces it');
  click(env, 'claimDaily', '2');
  ok(plain(bonus(env)).includes('받기') && hasButton(bonus(env), 'claimDaily', 'bonus') && /class="daily-bonus ready"/.test(daily(env)), 'bonus row becomes claimable');
  gold = saved(env).gold;
  click(env, 'claimDaily', 'bonus');
  ok(toastCount(env, `오늘의 과제 완료! 보너스: +${fmt(env)(pvB.gold)}G · 파편 ${fmt(env)(pvB.shards)}`) === 1 && saved(env).gold - gold === pvB.gold,
    'bonus claim toast');
  ok(/class="daily-bonus claimed"/.test(daily(env)) && plain(bonus(env)).includes('✔ 받음'), 'bonus claimed');
  scanRendered();

  // 모두 받기: 업적 + 일일 합산 토스트 1개, 이후 점 없음
  env = loadWith({ [KEY]: JSON.stringify(Object.assign(JSON.parse(JSON.stringify(many)), { stats: Object.assign({}, many.stats, { success: 4, delivered: 1 }) })) }, opts());
  gold = saved(env).gold;
  click(env, 'claimAll');
  const st = saved(env);
  const allToast = toastTexts(env).filter(t => t.startsWith('보상 '));
  ok(allToast.length === 1 && allToast[0] === `보상 6개를 받았습니다: +${fmt(env)(st.gold - gold)}G · 파편 ${fmt(env)(st.shards)} · 칭호 2개`,
    'claimAll: one merged toast: ' + allToast.join(' | '));
  ok(!recordsDot(env) && st.daily.bonus === 1 && st.achievements.best_1 === 2, 'claimAll claimed achievements and daily, dot gone');

  // stale: 다른 탭이 새 날 세트로 바꿈 → 갱신 문구, 새 세트로 다시 그림, 보상 토스트 없음
  env = loadWith({ [KEY]: JSON.stringify(one) }, opts({ extensions: [api => { game = api; }] }));
  const otherDay = JSON.parse(env.store[KEY]);
  otherDay.daily = setOf(D + 1, false);
  otherDay.daily.tasks[0].e = 'auto_s';
  otherDay.idle.lastSeen = clk.t + 5;
  env.store[KEY] = JSON.stringify(otherDay);
  click(env, 'claimDaily', '0');
  ok(toastCount(env, '일일 과제가 갱신되었습니다') === 1 && !toastTexts(env).some(t => t.startsWith('일일 과제 보상')) && plain(card(env, 0)).includes('자동 사냥 10회 실행'),
    'stale → 일일 과제가 갱신되었습니다 and the adopted set is drawn');

  // 새 세트 도착 토스트: 04:00 틱에서 1번, 시계 역행은 조용히
  clk.t = dayStart(D + 1) - 1000;
  env = loadWith({ [KEY]: JSON.stringify(withLv(save({ daily: setOf(D, false) }), 5)) }, opts());
  ok(toastCount(env, '새 일일 과제가 도착했습니다') === 0, 'same day on load: no arrival toast');
  clk.t = dayStart(D + 1) + 1000;
  env.tick();
  env.tick();
  ok(toastCount(env, '새 일일 과제가 도착했습니다') === 1 && plain(daily(env)).includes('다음 갱신까지 23:59'), 'new day at 04:00: one arrival toast, countdown restarts');
  const toastsBefore = toastTexts(env).length;
  clk.t = dayStart(D + 1) - 5 * HOUR;
  env.tick();
  ok(toastTexts(env).length === toastsBefore && saved(env).daily.maxDay === D + 1, 'AC59: clock rollback shows no toast and keeps the set');
  ok(/다음 갱신까지 \d\d:\d\d/.test(plain(daily(env))), 'AC59: countdown still renders on a rolled-back clock');
  // 세트가 없는 동안(maxDay가 앞서 있고 세트가 비었음): 카드 대신 안내
  clk.t = dayStart(D) + 5 * HOUR;
  env = loadWith({ [KEY]: JSON.stringify(withLv(save({ daily: { maxDay: D + 3, tasks: [], bonus: 0 } }), 7)) }, opts());
  ok(plain(daily(env)).includes('오늘의 일일 과제가 아직 없습니다') && !daily(env).includes('daily-card'), 'no set yet: notice instead of cards');
  scanRendered();

  // 멈춘 탭: 날이 바뀌어도 도착 토스트·달성 토스트 없음
  env = loadWith({ [KEY]: JSON.stringify(one) }, opts());
  fire(env, 'storage', { key: KEY });
  const frozenToasts = toastTexts(env).length;
  clk.t += 24 * HOUR;
  env.tick();
  setVisible(env, false);
  setVisible(env, true);
  ok(isLocked(env) && toastTexts(env).length === frozenToasts, 'suspended tab: no F12 toasts');
  clk.t = dayStart(D) + 5 * HOUR;

  // 강화로 달성: 토스트는 결과 공개 뒤(연출 중에는 없음). 성공 굴림 0으로 고정(V6)
  const pre = withLv(save({ gold: 1e6 }), 3);
  pre.stats.tries = 99;
  env = loadWith({ [KEY]: JSON.stringify(pre) }, opts({ manualTimers: true }));
  const reachedToast = '업적 달성: 첫 단련 — 기록 탭에서 보상을 받으세요';
  env.byId['#btnEnhance'].listeners.click[0]();
  ok(saved(env).achievements.tries_1 === 1 && toastCount(env, reachedToast) === 0, 'enhance: latched and saved, but no toast during the animation');
  await env.runAllTimers();
  ok(saved(env).swords[0].lv === 4 && toastCount(env, reachedToast) === 1, 'enhance: achievement toast after the outcome reveal');

  // 좁은 화면 규칙(정적 CSS): 카드·행은 넘치지 않고 줄바꿈, 상단 칭호 배지는 길이 제한
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8').replace(/\r\n/g, '\n');
  const block = (css.match(/\.daily-card, \.daily-bonus, \.ach-row \{([^}]*)\}/) || [])[1] || '';
  ok(/overflow:\s*hidden/.test(block) && /overflow-wrap:\s*anywhere/.test(block) && /min-width:\s*0/.test(block), 'cards/rows clip and wrap instead of overflowing');
  const badge = (css.match(/\.title-badge \{([^}]*)\}/) || [])[1] || '';
  ok(/max-width/.test(badge) && /text-overflow:\s*ellipsis/.test(badge) && /white-space:\s*nowrap/.test(badge), 'header title badge is length-capped');
}

/** 태그를 지운 화면 글자(공백 정리) */
const plain = html => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function lateCorrection(ok) {
  const MASTERY_TOAST_16 = '🎖️ +16 숙련! 이후 +16 강화 성공률 +3%p';
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
  const masteryIcon = '<span class="ic">' + env.ctx.M2_ICONS.mastery + '</span>';
  ok((env.byId['#masteryList']._html.match(/<li>[\s\S]*?<\/li>/g) || []).every(li => li.startsWith('<li>' + masteryIcon + ' +')),
    '9-2: every mastery row starts with the mastery SVG');
  ok(env.byId['#masteryHeadIcon']._html === masteryIcon, '9-2: records 숙련 heading gets the mastery SVG (decorateStatic)');
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
  ok(env.byId['#gaugeLine']._html.includes(`<span class="badge good"><span class="ic">${env.ctx.M2_ICONS.sure_badge}</span> 확정!</span>`)
    && !env.byId['#gaugeLine']._html.includes(env.ctx.M1_ICONS.sure), '9-2: 확정! badge uses the sure_badge SVG, not the item icon sure');
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

/**
 * 7-1 F13 틱 배선 (m2-events §6.2·§15, AC 22a·35·37a·37b·38~42): main.js가 단조 시계(performance.now) 경과만큼만 이벤트를 진행하고,
 * 숨김·멈춘 탭은 진행·스폰·저장·rng가 없으며, 시작·종료를 그 틱에 저장한다. 토스트·헤더 표시(7-2)는 검사하지 않는다
 */
async function eventsWiring(ok) {
  const KEY = 'sword-enhance-v2';
  const C = require(path.join(ROOT, 'js', 'constants.js'));
  const HOUR = 3600 * 1000;
  const TICK = 500;
  const DURATION = C.EVENTS.hunt.durationSec * 1000;
  const GAP_MIN = C.EVENT_GAP_MIN_SEC * 1000;
  const realRandom = Math.random;
  /** best 13(사냥 대목·자동 풍년 후보), 이미 각인된 +13 검(부팅 각인 rng 없음), 주어진 events */
  const evSave = (t, events, autoOn = true) => {
    const s = Object.assign(SG_default(), { best: 13 });
    s.swords = [{ id: 1, lv: 13, prot: 2, pity: 0, trait: { k: 'hunt', t: 1 } }];
    s.idle.autoOn = autoOn;
    s.idle.lastSeen = t;
    s.events = events;
    return s;
  };
  const running = (id, remainMs) => ({ active: { id, remainMs }, sinceMs: 0, nextAtMs: GAP_MIN });
  const almostDue = sinceMs => ({ active: null, sinceMs, nextAtMs: GAP_MIN });
  /** clk.t = 기기 시계, clk.m = 단조 시계. main.js는 로드 시점의 Math.random을 잡으므로 로드하는 동안만 호출 수를 세는 0.5로 고정(V6) */
  const boot = (store, clk, withPerformance = true) => {
    let api = null;
    const rng = { n: 0 };
    Math.random = () => { rng.n++; return 0.5; };
    try {
      const env = makeEnv(store, { now: () => clk.t, performance: withPerformance ? { now: () => clk.m } : undefined, extensions: [a => { api = a; }] });
      return Object.assign(env, { rng, state: () => api.state() });
    } finally { Math.random = realRandom; }
  };
  const bootSave = (save, clk, withPerformance) => boot({ [KEY]: JSON.stringify(save) }, clk, withPerformance);
  const clock = () => ({ t: Date.now(), m: 1000 });
  const step = (env, clk, wallMs, monoMs = TICK) => { clk.t += wallMs; clk.m += monoMs; env.tick(); };
  const remain = env => env.state().events.active.remainMs;
  const eventsJson = env => JSON.stringify(env.state().events);

  // AC 37a: 기기 시계를 +1시간 / −1시간 / +1일 바꿔도 remainMs는 단조 시계 흐름(틱당 500ms)대로만 준다
  {
    const clk = clock();
    const env = bootSave(evSave(clk.t, running('hunt', DURATION)), clk);
    step(env, clk, TICK);
    let want = DURATION - TICK;
    ok(remain(env) === want, 'AC 37a: a tick advances remainMs by the mono dt: ' + remain(env));
    for (const [name, wallMs] of [['+1h', HOUR], ['-1h', -HOUR], ['-1h (before start)', -HOUR], ['+1 day', 24 * HOUR]]) {
      step(env, clk, wallMs);
      want -= TICK;
      ok(remain(env) === want, `AC 37a: device clock ${name} changes remainMs only by the mono dt: ${remain(env)}`);
    }
    ok(saved(env).events.active.remainMs === want, 'AC 37a: the offline settle on +1 day saves the event untouched');
  }

  // AC 37b: 단조 시계가 한 틱에 10분 뛰어도 그 틱에는 EVENT_DT_MAX_MS만 반영
  {
    const clk = clock();
    const env = bootSave(evSave(clk.t, running('hunt', DURATION)), clk);
    step(env, clk, TICK, 10 * 60 * 1000);
    ok(remain(env) === DURATION - C.EVENT_DT_MAX_MS, `AC 37b: a 10 min mono jump advances only ${C.EVENT_DT_MAX_MS} ms: ${remain(env)}`);
  }

  // AC 35: 숨김 동안의 틱은 진행·스폰·저장·rng 없음. 10분 뒤 복귀해도 첫 틱은 자기 dt만
  {
    const clk = clock();
    const env = bootSave(evSave(clk.t, running('hunt', DURATION)), clk);
    step(env, clk, TICK);
    setVisible(env, false);   // 숨길 때 1회 저장
    const stored = env.store[KEY];
    const calls = env.rng.n;
    for (let i = 0; i < 4; i++) step(env, clk, TICK);
    step(env, clk, 10 * 60 * 1000, 10 * 60 * 1000);
    ok(remain(env) === DURATION - TICK, 'AC 35: hidden ticks do not advance the event: ' + remain(env));
    ok(env.store[KEY] === stored && env.rng.n === calls, 'AC 35: hidden ticks neither persist nor draw rng');
    setVisible(env, true);
    ok(remain(env) === DURATION - TICK, 'AC 35: resume after 10 min (offline settle) does not advance the event');
    step(env, clk, TICK);
    ok(remain(env) === DURATION - 2 * TICK, 'AC 35: the first tick after resume counts only its own dt: ' + remain(env));
  }
  {
    const clk = clock();
    const env = bootSave(evSave(clk.t, almostDue(GAP_MIN - 1000)), clk);
    setVisible(env, false);
    const stored = env.store[KEY];
    const calls = env.rng.n;
    for (let i = 0; i < 4; i++) step(env, clk, TICK);
    step(env, clk, 10 * 60 * 1000, 10 * 60 * 1000);
    ok(eventsJson(env) === JSON.stringify(almostDue(GAP_MIN - 1000)) && env.state().stats.eventsSeen === 0, 'AC 35: no spawn and no sinceMs growth while hidden');
    ok(env.store[KEY] === stored && env.rng.n === calls, 'AC 35: hidden spawn-due ticks neither persist nor draw rng');
    setVisible(env, true);
    step(env, clk, TICK);
    ok(env.state().events.active === null && env.state().events.sinceMs === GAP_MIN - 1000 + TICK, 'AC 35: after resume sinceMs grows only by the first tick dt');
  }

  // AC 38~41: 탭 A가 스폰·저장하면 B는 멈춘다. 멈춘 B는 스폰 시점이 지나도 진행·스폰·저장·rng 없음, 메모리 events 불변.
  // B가 이어받으면 A의 저장값(id, remainMs)을 쓰고 이후 B만 줄어든다. 저장소 공유는 storage 이벤트처럼 저장 문자열을 옮겨 흉내 낸다
  {
    const clkA = clock();
    const clkB = { t: clkA.t, m: 50 };
    const start = evSave(clkA.t, almostDue(GAP_MIN - TICK), false);
    const A = bootSave(start, clkA);
    const B = bootSave(start, clkB);
    const both = (n, monoA = TICK, monoB = TICK) => {
      for (let i = 0; i < n; i++) { step(A, clkA, TICK, monoA); clkB.t = clkA.t; clkB.m += monoB; B.tick(); }
    };
    step(A, clkA, TICK);
    const spawned = saved(A).events.active;
    ok(spawned && spawned.remainMs === DURATION && saved(A).stats.eventsSeen === 1, 'AC 38: tab A spawns and saves in the same tick');
    B.store[KEY] = A.store[KEY];
    fire(B, 'storage', { key: KEY });
    ok(B.byId['#tabLock'].hidden === false, 'AC 38: tab B locks on the storage event');
    const bEvents = eventsJson(B);
    const bStored = B.store[KEY];
    const bCalls = B.rng.n;
    both(60);   // A 30초 진행. B의 sinceMs는 이미 nextAtMs - 500이라 한 틱만 흘러도 스폰한다
    ok(eventsJson(B) === bEvents && B.state().stats.eventsSeen === 0, 'AC 39/41: locked tab B keeps its memory events (no advance, no second spawn)');
    ok(B.store[KEY] === bStored && B.rng.n === bCalls, 'AC 38: locked tab B neither persists nor draws rng');
    ok(remain(A) === DURATION - 60 * TICK, 'AC 39: tab A alone counted 30 s: ' + remain(A));
    const fromA = JSON.parse(A.store[KEY]).events.active;
    B.store[KEY] = A.store[KEY];
    clkB.m += 60 * 1000;   // 잠긴 동안의 단조 시간은 이어받은 뒤에도 흐르지 않아야 한다
    B.byId['#btnTakeover'].listeners.click[0]();
    ok(B.byId['#tabLock'].hidden === true && JSON.stringify(B.state().events.active) === JSON.stringify(fromA) && fromA.remainMs < DURATION,
      'AC 40: take over adopts the stored id/remainMs: ' + JSON.stringify(fromA));
    A.store[KEY] = B.store[KEY];
    fire(A, 'storage', { key: KEY });
    const aEvents = eventsJson(A);
    const aStored = A.store[KEY];
    both(10);
    ok(remain(B) === fromA.remainMs - 10 * TICK && B.state().stats.eventsSeen === 1, 'AC 40/41: after take over only tab B counts down, eventsSeen 1: ' + remain(B));
    ok(A.byId['#tabLock'].hidden === false && eventsJson(A) === aEvents && A.store[KEY] === aStored, 'AC 40: tab A is locked and frozen');
  }

  // AC 42: 시작·종료는 그 틱에 저장(자동 저장 주기 전), 새로고침은 같은 id·remainMs·다음 간격을 rng 없이 복원
  {
    const clk = clock();
    const env = bootSave(evSave(clk.t, almostDue(GAP_MIN - 2 * TICK), false), clk);
    const atBoot = env.store[KEY];
    step(env, clk, TICK);
    ok(env.store[KEY] === atBoot && env.state().events.sinceMs === GAP_MIN - TICK, 'AC 42 setup: a tick without start/end does not save (autosave not due)');
    step(env, clk, TICK);
    const st = saved(env);
    ok(st.events.active !== null && JSON.stringify(st.events.active) === JSON.stringify(env.state().events.active) && st.events.active.remainMs === DURATION && st.stats.eventsSeen === 1,
      'AC 42: the start is saved in the same tick: ' + JSON.stringify(st.events.active));
    const re = boot(env.store, clk);
    ok(JSON.stringify(re.state().events.active) === JSON.stringify(st.events.active) && re.state().stats.eventsSeen === 1 && re.rng.n === 0,
      `AC 42: reload restores the same id/remainMs without rng (rng calls ${re.rng.n})`);
  }
  {
    const clk = clock();
    const env = bootSave(evSave(clk.t, running('hunt', 2 * TICK), false), clk);
    const atBoot = env.store[KEY];
    step(env, clk, TICK);
    ok(env.store[KEY] === atBoot && remain(env) === TICK, 'AC 42 setup: a running tick does not save');
    step(env, clk, TICK);
    const st = saved(env);
    ok(st.events.active === null && st.events.sinceMs === 0 && st.events.nextAtMs === env.state().events.nextAtMs
      && st.events.nextAtMs >= GAP_MIN && st.events.nextAtMs <= C.EVENT_GAP_MAX_SEC * 1000, 'AC 42: the end is saved in the same tick: ' + JSON.stringify(st.events));
    const re = boot(env.store, clk);
    ok(eventsJson(re) === JSON.stringify(st.events) && re.rng.n === 0, `AC 42: reload keeps the drawn next gap without rng (rng calls ${re.rng.n})`);
  }

  // AC 22a: 30초 숨김 뒤 첫 틱의 자동 사냥 catch-up은 이벤트 없는 값과 같고, 정상 틱(wallDt <= EVENT_DT_MAX_MS)은 보너스를 받는다
  {
    const run = (active, play) => {
      const clk = clock();
      const env = bootSave(evSave(clk.t, { active, sinceMs: 0, nextAtMs: C.EVENT_GAP_MAX_SEC * 1000 }), clk);
      const g0 = env.state().gold;
      play(env, clk);
      const S = env.state();
      return { gold: S.gold - g0, runs: S.stats.autoRuns, ore: JSON.stringify(S.ore), remainMs: S.events.active && S.events.active.remainMs };
    };
    const hide30 = (env, clk) => {
      setVisible(env, false);
      clk.t += 30 * 1000; clk.m += 30 * 1000;
      setVisible(env, true);
      step(env, clk, TICK);
    };
    const normal = (env, clk) => { for (let i = 0; i < 60; i++) step(env, clk, TICK); };
    const auto = { id: 'auto', remainMs: DURATION };
    const [hidEv, hidNo] = [run(auto, hide30), run(null, hide30)];
    ok(hidEv.runs > 0 && hidEv.runs === hidNo.runs && hidEv.gold === hidNo.gold && hidEv.ore === hidNo.ore,
      `AC 22a: catch-up after a 30 s hide pays the no-event gold/ore (${JSON.stringify([hidEv.runs, hidEv.gold, hidNo.gold])})`);
    ok(hidEv.remainMs === DURATION - TICK, 'AC 22a: the hidden 30 s did not shorten the event: ' + hidEv.remainMs);
    const [normEv, normNo] = [run(auto, normal), run(null, normal)];
    ok(normEv.runs > 0 && normEv.runs === normNo.runs && normEv.gold > normNo.gold,
      `AC 22a: normal ticks get the auto event bonus (${JSON.stringify([normEv.runs, normEv.gold, normNo.gold])})`);
  }

  // performance가 없는 환경: 단조 시계는 Date.now로 대체
  {
    const clk = clock();
    const env = bootSave(evSave(clk.t, running('hunt', DURATION)), clk, false);
    clk.t += TICK;
    env.tick();
    ok(env.state().events.active.remainMs === DURATION - TICK, 'without performance the event clock falls back to Date.now');
  }
}

/**
 * 7-2 F13 화면 (m2-events §9, AC 32·33·34·50): 헤더 칩·상세 팝오버의 열고 닫기(V1: 어느 경로로도 열린 채 남지 않음),
 * 시작·종료 토스트(틱당 최대 1개, skipFx 무관, 숨김·잠금 탭 없음), 효과 표시(특가·가호·광석·수입), 이벤트 덕 성공 로그, test.html 조작판
 */
async function eventsUi(ok) {
  const KEY = 'sword-enhance-v2';
  const C = require(path.join(ROOT, 'js', 'constants.js'));
  const TICK = 500;
  const DURATION = C.EVENTS.luck.durationSec * 1000;
  const GAP_MIN = C.EVENT_GAP_MIN_SEC * 1000;
  const realRandom = Math.random;
  /** best 13, 이미 각인된 검 하나(부팅 각인 rng 없음), 주어진 events */
  const uiSave = (t, events, { lv = 13, fields = {} } = {}) => {
    const s = Object.assign(SG_default(), { best: Math.max(13, lv), gold: 1e6 }, fields);
    s.swords = [{ id: 1, lv, prot: 2, pity: 0, trait: { k: 'hunt', t: 1 } }];
    s.idle.lastSeen = t;
    s.events = events;
    return s;
  };
  const running = (id, remainMs) => ({ active: { id, remainMs }, sinceMs: 0, nextAtMs: GAP_MIN });
  const almostDue = () => ({ active: null, sinceMs: GAP_MIN - TICK, nextAtMs: GAP_MIN });
  const clock = () => ({ t: Date.now(), m: 1000 });
  // DOM 스텁은 마크업의 hidden·aria-expanded 속성을 읽지 않는다: 팝오버가 마크업에서 닫힌 채 시작하는지 확인하고 부팅 뒤 같은 값으로 맞춘다
  const popHiddenInMarkup = page => /<div class="popover event-pop" id="eventPop" hidden><\/div>/.test(fs.readFileSync(path.join(ROOT, page), 'utf8'));
  ok(popHiddenInMarkup('index.html') && popHiddenInMarkup('test.html'), '#eventPop starts hidden in both pages');
  /** main.js는 로드 시점의 Math.random을 잡으므로 로드하는 동안만 상수 value로 바꿔 둔다(잡힌 함수는 이후에도 value, V6) */
  const boot = (save, clk, value = 0) => {
    let api = null;
    Math.random = () => value;
    try {
      const env = makeEnv({ [KEY]: JSON.stringify(save) }, { now: () => clk.t, performance: { now: () => clk.m }, extensions: [a => { api = a; }] });
      env.byId['#eventPop'].hidden = true;
      env.byId['#eventChip'].setAttribute('aria-expanded', 'false');   // 마크업 초기값(아래 a11y 마크업 검사)과 같게
      return Object.assign(env, { state: () => api.state() });
    } finally { Math.random = realRandom; }
  };
  const step = (env, clk, ms = TICK) => { clk.t += ms; clk.m += ms; env.tick(); };
  const chip = env => env.byId['#eventChip'];
  const pop = env => env.byId['#eventPop'];
  const chipShown = env => !env.byId['#eventWrap'].hidden && !chip(env).hidden;
  const chipText = env => plain(chip(env)._html);
  const evIcon = (env, id) => `<span class="ic">${env.ctx.M2_ICONS['event_' + id]}</span>`;
  const popOpen = env => !pop(env).hidden;
  /** 문서 클릭: inside가 '.event-wrap'이면 칩·팝오버 안쪽 클릭, null이면 바깥 빈 곳 클릭 */
  const docClick = (env, inside) => env.docListeners.click.forEach(f => f({ target: { closest: sel => (sel === inside ? {} : null) } }));
  /** 칩 클릭: 칩 자신의 리스너 다음 문서 위임 리스너로 버블링(브라우저 순서) */
  const clickChip = env => { chip(env).listeners.click.forEach(f => f({ target: chip(env) })); docClick(env, '.event-wrap'); };
  const toastEls = env => (env.byId['#toasts'] ? env.byId['#toasts'].children : []);
  const isEventToast = t => /이벤트 시작: |^이벤트 종료: /.test(t);
  const eventToasts = env => toastEls(env).filter(el => isEventToast(el.textContent));
  const logTexts = env => texts(env.byId['#log']);
  // 문구는 view.js 함수가 아닌 기획서(§9) 문장으로 직접 비교한다
  const START_LUCK = '🍀 이벤트 시작: 행운의 시간 — 5분간 강화 성공 확률 +5%p';
  const END_LUCK = '이벤트 종료: 행운의 시간';

  // AC 32·34: 칩 숨김 → 스폰 틱에 시작 토스트(good) 1개 + 칩 표시, 틱마다 m:ss 갱신, 0:01, 종료 틱에 종료 토스트 1개 + 칩 숨김.
  // 연출 건너뛰기를 켜도 꺼도 같다. 모든 틱에서 이벤트 토스트는 최대 1개
  for (const skipFx of [false, true]) {
    const tag = `(skipFx ${skipFx})`;
    const clk = clock();
    const env = boot(uiSave(clk.t, almostDue(), { fields: { settings: { muted: true, skipFx } } }), clk);
    ok(env.state().settings.skipFx === skipFx, `chip setup ${tag}`);
    ok(!chipShown(env) && chip(env).hidden && env.byId['#eventWrap'].hidden && !popOpen(env), `AC 32: no event → chip and wrap hidden ${tag}`);
    let maxPerTick = 0;
    const counted = () => { const before = eventToasts(env).length; step(env, clk); maxPerTick = Math.max(maxPerTick, eventToasts(env).length - before); };
    counted();
    const toasts = () => eventToasts(env).map(el => [el.textContent, el.className]);
    ok(env.state().events.active.id === 'luck' && JSON.stringify(toasts()) === JSON.stringify([[START_LUCK, 'toast good']]),
      `AC 34: the spawn tick shows one start toast of kind good ${tag}: ${JSON.stringify(toasts())}`);
    ok(logTexts(env).includes(START_LUCK), `the start text is also in the log ${tag}`);
    ok(chipShown(env) && chipText(env) === '행운의 시간 5:00' && chip(env).title === '행운의 시간 5:00 남음 · 강화 성공 확률 +5%p'
      && chip(env)._html.startsWith(`<span class="ev-icon" aria-hidden="true">${evIcon(env, 'luck')}</span>`),
      `AC 32: chip shows icon (event_luck SVG, 9-2) + name + m:ss with the full title ${tag}: ${chipText(env)}`);
    ok(eventToasts(env).length === 1 && eventToasts(env).every(el => !el.textContent.includes('<span') && el.textContent.startsWith(C.EVENTS.luck.icon + ' ')),
      `9-2: the start toast keeps the emoji fallback (no SVG markup in textContent) ${tag}`);
    counted();
    counted();
    ok(chipText(env) === '행운의 시간 4:59', `the chip clock follows each tick ${tag}: ${chipText(env)}`);
    env.state().events.active.remainMs = 2 * TICK + 1;
    counted();
    ok(chipShown(env) && chipText(env) === '행운의 시간 0:01' && eventToasts(env).length === 1, `AC 32: 501 ms left shows 0:01, no toast yet ${tag}`);
    counted();
    counted();
    ok(!chipShown(env) && env.state().events.active === null, `the end tick hides the chip ${tag}`);
    ok(JSON.stringify(toasts()) === JSON.stringify([[START_LUCK, 'toast good'], [END_LUCK, 'toast ']]) && logTexts(env).includes(END_LUCK),
      `AC 34: exactly one end toast (plain kind) and a log line ${tag}: ${JSON.stringify(toasts())}`);
    for (let i = 0; i < 6; i++) counted();
    ok(eventToasts(env).length === 2 && maxPerTick === 1, `AC 34: at most one event toast per tick, no repeats ${tag}`);
    scanRendered();
  }

  // §9 상세 팝오버: 칩 클릭 토글, 안쪽 클릭 유지, 바깥 클릭·Esc·탭 전환·상태 교체(resetUiFor)·잠금·이벤트 종료·새 게임으로 닫힘
  {
    const clk = clock();
    let env = boot(uiSave(clk.t, running('hunt', 251500)), clk);
    ok(chipShown(env) && !popOpen(env), 'popover closed at boot');
    const expanded = () => chip(env).getAttribute('aria-expanded');
    ok(expanded() === 'false', 'a11y: chip aria-expanded is false while the popover is closed');
    clickChip(env);
    ok(expanded() === 'true', 'a11y: chip aria-expanded becomes true when the popover opens');
    const html = pop(env)._html;
    ok(popOpen(env) && html.includes(`<b class="ev-pop-title">${evIcon(env, 'hunt')} 사냥 대목</b>`) && html.includes('수동 사냥 골드 +40%') && html.includes('<b class="ev-clock">4:12</b>')
      && html.includes('접속 중에만 흐르고 오프라인에서는 적용되지 않습니다'), 'chip click opens the popover with icon, name, effect, clock, offline note');
    step(env, clk);
    ok(popOpen(env) && pop(env)._html.includes('<b class="ev-clock">4:11</b>'), 'the open popover clock updates per tick');
    clickChip(env);
    ok(!popOpen(env), 'a second chip click closes it');
    clickChip(env);
    docClick(env, '.event-wrap');
    ok(popOpen(env), 'a click inside the chip/popover box keeps it open');
    docClick(env, null);
    ok(!popOpen(env) && expanded() === 'false', 'an outside click closes it (aria-expanded false at once)');
    clickChip(env);
    key(env, 'Escape');
    ok(!popOpen(env) && expanded() === 'false', 'Esc closes it (aria-expanded false at once)');
    clickChip(env);
    // 탭 전환 동작 자체가 닫는지(바깥 클릭 경로와 분리): 위임 대상만 탭 버튼으로 둔다
    env.docListeners.click.forEach(f => f({ target: { closest: sel => (sel === '[data-act]' ? { dataset: { act: 'tab', id: 'shop' }, disabled: false } : sel === '.event-wrap' ? {} : null) } }));
    ok(!popOpen(env), 'a tab switch closes it');
    clickChip(env);
    ok(popOpen(env), 'reopens after the tab switch (no stuck state)');

    // 복귀 때 더 최근 저장(이벤트 진행 중)을 이어받으면 resetUiFor가 닫는다(이벤트가 남아 있어도)
    setVisible(env, false);
    const newer = uiSave(clk.t + 5, running('hunt', 200000));
    clk.t += 10; clk.m += 10;
    env.store[KEY] = JSON.stringify(newer);
    setVisible(env, true);
    ok(env.state().events.active.remainMs === 200000 && chipShown(env) && !popOpen(env), 'adopting a newer save (resetUiFor) closes the popover');
    clickChip(env);
    ok(popOpen(env), 'reopens after the adopt');

    // 다른 탭 때문에 잠김 → 닫힘, 잠긴 동안 칩 클릭은 무시, 이어받은 뒤 다시 열린다
    fire(env, 'storage', { key: KEY });
    ok(isLocked(env) && !popOpen(env), 'locking for another tab closes it');
    clickChip(env);
    ok(!popOpen(env), 'chip clicks do nothing while locked');
    env.byId['#btnTakeover'].listeners.click[0]();
    ok(!isLocked(env) && !popOpen(env) && chipShown(env), 'take over leaves it closed');
    clickChip(env);
    ok(popOpen(env), 'reopens after the take over');

    // 이벤트 종료 → 칩·팝오버 모두 숨김. 다음 이벤트가 시작돼도 저절로 열리지 않는다
    env.state().events.active.remainMs = TICK + 100;
    step(env, clk);
    ok(popOpen(env), 'still open while the event runs');
    step(env, clk);
    ok(!chipShown(env) && !popOpen(env), 'the event end hides the chip and closes the popover');
    env.state().events.sinceMs = env.state().events.nextAtMs - TICK;
    step(env, clk);
    ok(env.state().events.active !== null && chipShown(env) && !popOpen(env), 'the next event starts with the popover closed');
    clickChip(env);
    ok(popOpen(env), 'and the chip opens it normally');

    // 새 게임(resetUiFor + 이벤트 없음) → 닫힘
    env.byId['#btnReset'].listeners.click[0]();
    ok(!popOpen(env) && !chipShown(env), 'a new game closes the popover and hides the chip');
    scanRendered();

    // 행운의 시간이 지금 효과가 없으면(축복+미스릴 +13 = 상한) 사유 한 줄
    const capSave = uiSave(clk.t, running('luck', DURATION), { fields: { inv: Object.assign(SG_default().inv, { bless: 3 }) } });
    Object.assign(capSave, { anvils: [{ id: 1, g: 3, dura: 20 }], anvilEq: 1, nextAnvilId: 2 });
    Object.assign(capSave.use, { bless: true, anvil: true });
    env = boot(capSave, clk);
    clickChip(env);
    ok(pop(env)._html.includes('<small class="ev-idle">보너스 상한(+14%p)에 이미 도달해 지금은 효과가 없습니다</small>'), 'capped lucky hour shows the idle reason: ' + pop(env)._html);
    ok(plain(env.byId['#breakdown']._html).endsWith('이벤트 5 = +19 → +19 +14 상한 14 · 이벤트 효과 없음(상한)'), 'AC 33: breakdown shows the event term and 효과 없음(상한): ' + plain(env.byId['#breakdown']._html));
  }

  // AC 34: 숨김 탭은 토스트·진행 없음, 복귀해도 이미 지난 종료처럼 알리지 않고 실제로 끝나는 틱에 1회
  {
    const clk = clock();
    const env = boot(uiSave(clk.t, running('luck', 2 * TICK + 100)), clk);
    setVisible(env, false);
    for (let i = 0; i < 4; i++) step(env, clk);
    step(env, clk, 10 * 60 * 1000);
    ok(eventToasts(env).length === 0 && env.state().events.active.remainMs === 2 * TICK + 100, 'AC 34: hidden ticks show no toast and do not advance');
    setVisible(env, true);
    ok(eventToasts(env).length === 0 && env.state().events.active.remainMs === 2 * TICK + 100 && chipShown(env), 'AC 34: returning after 10 min announces no end');
    step(env, clk);
    step(env, clk);
    ok(eventToasts(env).length === 0 && chipText(env) === '행운의 시간 0:01', 'the first ticks after return count only their own dt');
    step(env, clk);
    ok(JSON.stringify(eventToasts(env).map(el => el.textContent)) === JSON.stringify([END_LUCK]), 'the end is announced once on the tick it really ends');
  }
  {
    const clk = clock();
    const env = boot(uiSave(clk.t, almostDue()), clk);
    setVisible(env, false);
    for (let i = 0; i < 4; i++) step(env, clk);
    ok(eventToasts(env).length === 0 && env.state().events.active === null, 'AC 34: a spawn-due hidden tab neither spawns nor toasts');
    setVisible(env, true);
    ok(eventToasts(env).length === 0, 'no toast on return itself');
    step(env, clk);
    ok(JSON.stringify(eventToasts(env).map(el => el.textContent)) === JSON.stringify([START_LUCK]), 'the start toast comes with the first visible tick that spawns');
  }
  // 잠긴 탭: 토스트·진행 없음. 이어받은 저장에서 이벤트가 이미 끝났으면 종료를 알리지 않는다
  {
    const clk = clock();
    const env = boot(uiSave(clk.t, running('luck', TICK + 100)), clk);
    fire(env, 'storage', { key: KEY });
    for (let i = 0; i < 5; i++) step(env, clk);
    ok(isLocked(env) && eventToasts(env).length === 0 && env.state().events.active.remainMs === TICK + 100, 'AC 34: a locked tab shows no toast and does not advance');
    const other = uiSave(clk.t, { active: null, sinceMs: 0, nextAtMs: GAP_MIN });
    env.store[KEY] = JSON.stringify(other);
    env.byId['#btnTakeover'].listeners.click[0]();
    for (let i = 0; i < 3; i++) step(env, clk);
    ok(!isLocked(env) && env.state().events.active === null && !chipShown(env) && eventToasts(env).length === 0,
      'taking over a save whose event already ended announces nothing');
  }
  {
    const clk = clock();
    const env = boot(uiSave(clk.t, almostDue()), clk);
    fire(env, 'storage', { key: KEY });
    for (let i = 0; i < 4; i++) step(env, clk);
    ok(eventToasts(env).length === 0 && env.state().events.active === null, 'AC 34: a locked spawn-due tab neither spawns nor toasts');
  }

  // §9 효과 표시: 의뢰 새로고침 특가(할인 가격), 모루 가호 태그, 광맥 +50%(대장간·방치), 수입 줄
  {
    const clk = clock();
    const save = uiSave(clk.t, { active: null, sinceMs: 0, nextAtMs: GAP_MIN });
    Object.assign(save, { anvils: [{ id: 1, g: 2, dura: 20 }], anvilEq: 1, nextAnvilId: 2 });
    save.idle.autoOn = true;
    const env = boot(save, clk);
    const questBody = () => env.byId['[data-panel="quests"]'].querySelector('.panel-body')._html;
    const forgeBody = () => env.byId['[data-panel="forge"]'].querySelector('.panel-body')._html;
    const idleBody = () => env.byId['[data-panel="idle"]'].querySelector('.panel-body')._html;
    const tray = () => env.byId['#tray']._html;
    const income = () => env.byId['#incomeNote'].textContent;
    const fmt = env.ctx.SG.fx.fmt;
    const fullPrice = env.ctx.SG.quests.rerollCost(env.state());
    const setActive = id => { env.state().events.active = id ? { id, remainMs: DURATION } : null; step(env, clk); };
    ok(questBody().includes(`새로고침 ${fmt(fullPrice)}G</button>`) && !questBody().includes('특가') && !tray().includes('가호')
      && !forgeBody().includes('ev-up') && !idleBody().includes('광맥 발견') && !income().includes('이벤트'), 'no event: no event marks anywhere');
    setActive('quest');
    const dealPrice = env.ctx.SG.quests.rerollCost(env.state());
    ok(dealPrice < fullPrice && questBody().includes(`새로고침 ${fmt(dealPrice)}G <span class="badge good">특가</span>`), `quest deal: discounted price + 특가 badge (${fullPrice} → ${dealPrice})`);
    setActive('anvil');
    ok(tray().includes('<span class="tag">가호 40%</span>') && !questBody().includes('특가'), 'anvil guard: tray anvil row shows 가호 40%');
    setActive('ore');
    ok(forgeBody().includes('<span class="ev-up" title="광맥 발견">+50%</span>') && idleBody().includes('+50%(광맥 발견)') && !tray().includes('가호'),
      'ore vein: forge ore cells and the idle ore line show +50%');
    setActive('hunt');
    ok(income().endsWith(' · 이벤트 사냥 +40%') && !forgeBody().includes('ev-up'), 'hunt rush: income note ends with 이벤트 사냥 +40%: ' + income());
    setActive('auto');
    ok(income().endsWith(' · 이벤트 자동 +50%'), 'auto harvest: income note ends with 이벤트 자동 +50%: ' + income());
    setActive(null);
    ok(!income().includes('이벤트') && !questBody().includes('특가'), 'marks go away with the event');
    scanRendered();
  }

  // §9 이벤트 덕 성공 로그: 결과 롤이 [무이벤트 성공률, 이벤트 성공률) 안이면 한 줄 추가(+15~+19는 숙련 미기록 안내). Math.random 고정(V6)
  {
    const enhanceWith = async (lv, value, events) => {
      const clk = clock();
      const env = boot(uiSave(clk.t, events, { lv }), clk, value);
      await env.byId['#btnEnhance'].listeners.click[0]();
      return env;
    };
    const assistLines = env => logTexts(env).filter(t => t.includes('이벤트 덕에 성공'));
    for (let run = 0; run < 3; run++) {
      let env = await enhanceWith(13, 0.32, running('luck', DURATION));   // +13: 30% → 35%, 롤 32
      ok(env.state().swords[0].lv === 14 && JSON.stringify(assistLines(env)) === JSON.stringify(['🍀 이벤트 덕에 성공']), 'assisted +13 success logs 이벤트 덕에 성공: ' + assistLines(env));
      env = await enhanceWith(15, 0.22, running('luck', DURATION));   // +15: 20% → 25%, 롤 22
      ok(env.state().swords[0].lv === 16 && env.state().mastery[0] === 0
        && JSON.stringify(assistLines(env)) === JSON.stringify(['🍀 이벤트 덕에 성공 — 숙련 기록에는 세지 않습니다']), 'assisted +15 success adds the no-mastery note: ' + assistLines(env));
      env = await enhanceWith(13, 0.10, running('luck', DURATION));
      ok(env.state().swords[0].lv === 14 && assistLines(env).length === 0, 'a success the event did not decide logs no assist line');
      env = await enhanceWith(13, 0.32, { active: null, sinceMs: 0, nextAtMs: GAP_MIN });
      ok(env.state().stats.tries === 1 && env.state().stats.success === 0 && assistLines(env).length === 0, 'without the event the same roll is not a success and logs no assist line');
    }
  }

  // AC 50: test.html 조작판(이벤트 선택·시작·끝내기)과 index.html에 진입점 없음, 새 DOM id는 두 페이지 모두
  {
    ok(['eventWrap', 'eventChip', 'eventPop'].every(id => elementIds('index.html').includes(id) && elementIds('test.html').includes(id)),
      'event chip ids exist in both index.html and test.html');
    ok(['index.html', 'test.html'].every(p => /<button class="event-chip" id="eventChip" aria-haspopup="dialog" aria-expanded="false" aria-controls="eventPop"/.test(fs.readFileSync(path.join(ROOT, p), 'utf8'))),
      'a11y: the chip declares a dialog popup and starts aria-expanded="false" in both pages');
    ok(elementIds('test.html').includes('testEventId') && !elementIds('index.html').includes('testEventId'), '#testEventId only on the test page');
    const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    ok(!/setEvent|testSetEvent|testEndEvent/.test(indexHtml) && ['main.js', 'view.js'].every(f => !/\bsetEvent\b/.test(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'))),
      'AC 50: index.html / main.js / view.js never reference setEvent');
    const testHtml = fs.readFileSync(path.join(ROOT, 'test.html'), 'utf8');
    ok(testHtml.includes('data-act="testSetEvent"') && testHtml.includes('data-act="testEndEvent"'), 'test.html has the start / end buttons');

    const clk = clock();
    let game = null;
    const tEnv = makeEnv({}, { page: 'test.html', now: () => clk.t, performance: { now: () => clk.m }, extensions: [api => { game = api; }] });
    const sel = tEnv.byId['#testEventId'];
    const want = C.EVENT_IDS.map(id => `<option value="${id}">${C.EVENTS[id].icon} ${C.EVENTS[id].name}</option>`).join('');
    ok(sel.innerHTML === want, 'event selector lists EVENT_IDS in order with icon + name');
    const toastTexts = () => texts(tEnv.byId['#toasts'] || { children: [] });
    sel.value = 'luck';
    click(tEnv, 'testSetEvent');
    ok(JSON.stringify(savedTest(tEnv).events.active) === JSON.stringify({ id: 'luck', remainMs: DURATION }) && toastTexts().includes('[TEST] 최고 +5 미만이라 이벤트가 적용되지 않습니다')
      && !chipShown(tEnv), 'best 0: the event is set and saved, with a no-effect warning and no chip');
    game.state().best = 13;
    sel.value = 'hunt';
    click(tEnv, 'testSetEvent');
    ok(JSON.stringify(savedTest(tEnv).events.active) === JSON.stringify({ id: 'hunt', remainMs: DURATION }) && chipShown(tEnv) && chipText(tEnv) === '사냥 대목 5:00'
      && logTexts(tEnv).includes('[TEST] 🏹 이벤트 시작: 사냥 대목 — 5분간 수동 사냥 골드 +40%'), 'start applies the full duration, saves, shows the chip and logs');
    click(tEnv, 'testEndEvent');
    ok(savedTest(tEnv).events.active.remainMs === 1 && !toastTexts().includes('이벤트 종료: 사냥 대목'), 'end sets 1 ms left (the next tick ends it)');
    step(tEnv, clk);
    const st = savedTest(tEnv);
    ok(st.events.active === null && st.events.sinceMs === 0 && st.events.nextAtMs >= GAP_MIN && st.events.nextAtMs <= C.EVENT_GAP_MAX_SEC * 1000
      && toastTexts().filter(t => t === '이벤트 종료: 사냥 대목').length === 1 && !chipShown(tEnv), 'the next tick takes the real end path: toast, next gap, saved');
    click(tEnv, 'testEndEvent');
    ok(toastTexts().includes('[TEST] 진행 중인 이벤트가 없습니다.'), 'end without an event warns');
    ok(REAL_KEYS.every(k => !(k in tEnv.store)), 'the event control never writes the real save keys');
    scanRendered();

    const env = makeEnv({});
    click(env, 'testSetEvent');
    ok(saved(env).events.active === null, 'real page: the test event action does nothing');
  }
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
  // 칩 = 종류 SVG(9-2) + 등급 점 3개(채운 수 = 등급), 등급 이름은 aria-label
  const chip = (env2, id) => (cardHTML(env2, id).match(/<span class="trait-chip trait-t(\d)" role="img" aria-label="([^"]+)"><span class="ic">([\s\S]*?)<\/span><span class="pips" aria-hidden="true">((?:<i[^>]*><\/i>)*)<\/span><\/span>/) || []);
  const pipsOf = t => '<i class="on"></i>'.repeat(t) + '<i></i>'.repeat(C.TRAIT_TIER_MAX - t);
  ok(chip(env, 1)[1] === '3' && chip(env, 1)[2] === '완벽한 약탈자' && chip(env, 1)[3] === env.ctx.M2_ICONS.trait_hunt && chip(env, 1)[4] === pipsOf(3),
    'strip chip: trait_hunt SVG + 3 filled pips for {hunt,3}, tier name in aria-label');
  ok(chip(env, 2)[3] === env.ctx.M2_ICONS.trait_trade && chip(env, 2)[4] === pipsOf(2) && chip(env, 5)[3] === env.ctx.M2_ICONS.trait_work && chip(env, 5)[4] === pipsOf(1),
    'strip chip: 3 pips always drawn, filled count follows the tier (2, 1)');
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
  ok(html.includes('각인 · 활성 검') && plain(html).includes('특성은 강화 확률에 영향을 주지 않습니다.'), 'AC50: forge 각인 section with the no-odds line');
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
  const monumentIcon = `<span class="ic">${env.ctx.M2_ICONS.monument}</span>`;
  const cells = env => env.byId['#monumentList']._html.match(/<div class="mon[ "]/g) || [];
  html = env.byId['#monumentList']._html;
  ok(cells(env).length === C.MONUMENT_COUNT && (html.match(/badge good">보유/g) || []).length === 2, '8 monument cells, 2 owned');
  ok([15, 16, 17].every(L => buttonHTML(html, 'buyMonument', L)) && [18, 19, 20].every(L => plain(html).includes(`최고 +${L} 달성 시`)), 'reachable levels buyable, the rest locked');
  ok(env.byId['#monumentCount'].textContent === '(2 / 8)' && env.byId['#monumentBadge'].hidden === false && env.byId['#monumentBadge']._html === monumentIcon + ' +14',
    'count and header badge show the highest monument (monument SVG, 9-2): ' + plain(env.byId['#monumentBadge']._html));
  ok(html.includes(`대표 기념비: ${monumentIcon} +14 별빛 검 기념비`), 'records title line names the highest monument');
  const price15 = sinkPrice(C.MONUMENT_MULT, 15);
  ok(plain(buttonHTML(html, 'buyMonument', 15)) === `세우기 ${fmtG(price15)}G`, 'monument price = monumentCost');
  st = saved(env);
  click(env, 'buyMonument', 15);
  ok(saved(env).monuments[2] === 0 && saved(env).gold === st.gold, 'monument: one click buys nothing');
  click(env, 'buyMonument', 15);
  after = saved(env);
  ok(after.monuments[2] === 1 && after.gold === st.gold - price15 && after.stats.sinkGold === price15, 'monument: second click buys at the shown price');
  ok(env.byId['#monumentBadge']._html === monumentIcon + ' +15' && env.byId['#monumentCount'].textContent === '(3 / 8)', 'badge and count follow the purchase');
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
  ok(env.scripts.length === 20, 'test page loads all scripts');
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
/**
 * 8-A F11 배선 (m2-rebirth §3.2·§7, AC 7·37, REQ-037): rebirth·buyFame 동작(버튼·확인 창은 8-B).
 * 정규화 복사본에서 환생해 성공했을 때만 상태를 교체하고 저장 키를 정확히 1번(+ 미러 키 1번) 쓴다.
 * 실패·멈춘 탭은 쓰기 0번, 환생 뒤 다시 불러와도 같은 상태. 환생·명성 규칙은 rng를 쓰지 않는다(V6 해당 없음)
 */
async function rebirthWiring(ok) {
  const KEY = 'sword-enhance-v2';
  const MIRROR = 'sword-enhance-v2-rebirth';
  const FEE = 19846200;
  const clk = { t: Date.now() };
  const ready = fields => {
    const s = SG_default();
    s.swords = [{ id: 1, lv: 20, prot: 2, pity: 0, trait: null }, { id: 2, lv: 7, prot: 2, pity: 0, trait: { k: 'hunt', t: 1 } }];
    Object.assign(s, { best: 20, gold: FEE + 5000, nextSwordId: 3, active: 1, title: 'tries_1', achievements: { tries_1: 2 } });
    s.stats.tries = 150;
    s.events = { active: { id: 'luck', remainMs: 60000 }, sinceMs: 0, nextAtMs: 900000 };
    s.idle.lastSeen = clk.t;
    return Object.assign(s, fields || {});
  };
  let game = null;
  const boot = (store, page) => makeEnv(store, { page, now: () => clk.t, extensions: [api => { game = api; }] });
  /** 이 시점 이후 setItem 횟수를 키별로 센다(main.js와 save.js는 같은 localStorage 객체의 setItem을 호출 시점에 찾는다) */
  const countWrites = env => {
    const counts = {};
    const setItem = env.ctx.localStorage.setItem;
    env.ctx.localStorage.setItem = (k, v) => { counts[k] = (counts[k] || 0) + 1; setItem(k, v); };
    return counts;
  };

  // N3: rebirth 동작은 확인 창이 열려 있을 때만 실행된다(창 없이 눌리면 쓰기·상태 변화 없음). 아래 시나리오는 askRebirth로 창을 먼저 연다
  let env = boot({ [KEY]: JSON.stringify(ready()) });
  let writes = countWrites(env);
  click(env, 'rebirth');
  ok(JSON.stringify(writes) === '{}' && game.state().rebirth.count === 0 && game.state().swords.length === 2, 'F11 rebirth (N3): without the confirm modal open it does nothing');

  // 성공: 저장 키 1번 + 미러 1번, 메모리 상태 = 저장, 이벤트 초기화·업적/칭호/통계 유지
  env = boot({ [KEY]: JSON.stringify(ready()) });
  const achievementsBefore = JSON.stringify(saved(env).achievements);
  click(env, 'askRebirth');
  writes = countWrites(env);
  click(env, 'rebirth');
  let st = saved(env);
  ok(JSON.stringify(writes) === JSON.stringify({ [KEY]: 1, [MIRROR]: 1 }), 'F11 rebirth: exactly one main-save write (+ one mirror write): ' + JSON.stringify(writes));
  ok(st.rebirth.count === 1 && st.rebirth.fame === 3 && st.best === 0 && st.gold === 300 &&
    JSON.stringify(st.swords) === JSON.stringify([{ id: 3, lv: 0, prot: 2, pity: 0, trait: null }]) && st.active === 3,
  'F11 rebirth: state replaced by the reborn state (one +0 sword, start gold, fame +3)');
  ok(JSON.stringify(st.events) === JSON.stringify({ active: null, sinceMs: 0, nextAtMs: 900000 }) &&
    JSON.stringify(st.achievements) === achievementsBefore && st.title === 'tries_1' && st.stats.tries === 150,
  'F11 rebirth: events reset (m2-events §13), achievements/title/stats kept (m2-achievements §18)');
  ok(JSON.stringify(game.state()) === env.store[KEY], 'F11 rebirth: the in-memory state is exactly what was saved');
  ok(JSON.parse(env.store[MIRROR]).count === 1, 'REQ-037: mirror holds the new rebirth');
  scanRendered();

  // 다시 불러오기: 같은 상태(같은 시계)
  const afterRebirth = env.store[KEY];
  const env2 = boot(Object.assign({}, env.store));
  ok(JSON.stringify(game.state()) === afterRebirth && env2.store[KEY] === afterRebirth, 'F11 rebirth: reload after rebirth gives the same state');

  // 명성 상점: 구매 1번 = 저장 1번(+ 미러), 면허는 즉시 자동 사냥 해금. 잘못된 트랙은 쓰기 없음
  writes = countWrites(env2);
  click(env2, 'buyFame', 'autoStart');
  st = saved(env2);
  ok(JSON.stringify(writes) === JSON.stringify({ [KEY]: 1, [MIRROR]: 1 }) && st.rebirth.fame === 0 && st.rebirth.up.autoStart === 1,
    'F11 buyFame: one save with the purchase, mirror updated');
  click(env2, 'toggleAuto');
  ok(saved(env2).idle.autoOn === true && saved(env2).best === 0, 'F11 buyFame: the license unlocks auto hunt at best 0');
  writes = countWrites(env2);
  click(env2, 'buyFame', '__proto__');
  click(env2, 'buyFame', 'autoStart');
  ok(JSON.stringify(writes) === '{}' && saved(env2).rebirth.fame === 0, 'F11 buyFame: invalid / maxed purchases write nothing');
  scanRendered();

  // 실패(창을 연 뒤 골드 부족·+20 없음이 됨): 상태·저장 불변, 쓰기 0번
  for (const [fields, label] of [[{ gold: FEE - 1 }, 'noGold'], [{ swords: [{ id: 1, lv: 19, prot: 2, pity: 0, trait: null }] }, 'notReached']]) {
    env = boot({ [KEY]: JSON.stringify(ready()) });
    click(env, 'askRebirth');
    Object.assign(game.state(), JSON.parse(JSON.stringify(fields)));
    const before = env.store[KEY];
    const mem = JSON.stringify(game.state());
    writes = countWrites(env);
    click(env, 'rebirth');
    ok(JSON.stringify(writes) === '{}' && env.store[KEY] === before && JSON.stringify(game.state()) === mem, `F11 rebirth ${label}: no write, state unchanged`);
  }

  // 강화 연출 중(busy): activate처럼 무시한다(상태 교체·저장·토스트 없음). main.js는 로드 시점의 Math.random을
  // 잡으므로 로드 동안 0으로 바꿔 활성 검(+7) 강화가 반드시 성공하게 한다(V6)
  const realRandom = Math.random;
  Math.random = () => 0;
  try { env = boot({ [KEY]: JSON.stringify(ready({ active: 2 })) }); } finally { Math.random = realRandom; }
  const pending = env.byId['#btnEnhance'].listeners.click[0]();
  const busyMem = JSON.stringify(game.state());
  writes = countWrites(env);
  click(env, 'askRebirth');
  click(env, 'rebirth');
  ok(JSON.stringify(writes) === '{}' && JSON.stringify(game.state()) === busyMem && game.state().rebirth.count === 0,
    'F11 rebirth: ignored while the enhance animation runs (the modal does not open, no write, state unchanged)');
  await pending;
  ok(game.state().rebirth.count === 0 && game.state().swords.length === 2, 'F11 rebirth: still not reborn after the enhance finishes');

  // 멈춘 탭(다른 탭이 저장함): 환생하지 않고 쓰지 않는다
  env = boot({ [KEY]: JSON.stringify(ready()) });
  click(env, 'askRebirth');
  fire(env, 'storage', { key: KEY });
  writes = countWrites(env);
  click(env, 'rebirth');
  ok(JSON.stringify(writes) === '{}' && game.state().rebirth.count === 0 && game.state().swords.length === 2, 'F11 rebirth: a suspended tab cannot rebirth');

  // 테스트 페이지: 자기 키(미러 포함)만 쓴다
  const TEST = 'sword-enhance-test';
  env = boot({ [TEST]: JSON.stringify(ready()) }, 'test.html');
  click(env, 'askRebirth');
  click(env, 'rebirth');
  ok(JSON.parse(env.store[TEST]).rebirth.count === 1 && JSON.parse(env.store[TEST + '-rebirth']).count === 1 &&
    !Object.keys(env.store).some(k => k.startsWith('sword-enhance-v')), 'F11 rebirth on the test page writes only the test keys');
}

/**
 * 8-B F11 화면 (m2-rebirth §4·§7, AC 41): 기록 탭 맨 위 환생 섹션과 확인 창(#modal).
 * 확인 창은 상태 교체·잠금·새 게임·Esc·바깥 클릭·취소로 닫히고, 강화 연출 중에는 열리지 않으며, 확인 때 canRebirth를 다시 검사한다.
 * 모든 부팅은 Math.random을 고정한다(일일 생성·강화 굴림, V6)
 */
async function rebirthUi(ok) {
  const { KEY, loadWith } = F12;
  const MIRROR = 'sword-enhance-v2-rebirth';
  const FEE = 19846200;
  const clk = { t: Date.now() };
  const ready = fields => {
    const s = SG_default();
    s.swords = [{ id: 1, lv: 20, prot: 2, pity: 0, trait: { k: 'hunt', t: 2 } }, { id: 2, lv: 7, prot: 2, pity: 0, trait: { k: 'work', t: 1 } }];
    Object.assign(s, { best: 20, gold: FEE + 5000, nextSwordId: 3, active: 2 });
    s.idle.lastSeen = clk.t;
    return Object.assign(s, fields || {});
  };
  let game = null;
  // pageRegions: index.html처럼 #modal이 hidden으로 시작하고 body에 header·main이 있다(창 밖 inert 검사)
  const boot = (store, value = 0.5) => loadWith(store, { now: () => clk.t, extensions: [api => { game = api; }], pageRegions: true }, value);
  const section = env => env.byId['#rebirthSection']._html;
  const modal = env => env.byId['#modal'];
  // 창 밖(header·main)이 창 때문에 inert인가 / 풀렸는가(V1: 모든 닫힘 경로에서 풀려야 한다)
  const pageInert = env => env.byId['header'].inert === true && env.byId['main'].inert === true;
  const pageFree = env => !env.byId['header'].inert && !env.byId['main'].inert;
  const modalOpen = env => !modal(env).hidden && modal(env).dataset.kind === 'rebirth';
  const toasts = env => (env.byId['#toasts'] ? texts(env.byId['#toasts']) : []);
  const fameRow = (env, track) => (section(env).match(new RegExp(`data-track="${track}"[\\s\\S]*?</button>`)) || [''])[0];
  const askDisabled = env => /data-act="askRebirth" disabled/.test(section(env));
  const V = env => env.ctx.SG.view;

  // 마크업: 두 페이지 모두 기록 탭 맨 위(일일 과제 앞)에 환생 섹션 (V2)
  ['index.html', 'test.html'].forEach(page => {
    const panel = fs.readFileSync(path.join(ROOT, page), 'utf8').match(/data-panel="records"[\s\S]*?<\/section>/)[0];
    const at = id => panel.indexOf(`id="${id}"`);
    ok(at('rebirthSection') > 0 && at('rebirthSection') < at('dailySection'), `${page}: rebirth section sits above the daily section`);
  });

  // 잠김: 최고 +19, 환생 0회 → 잠금 한 줄만
  let env = boot({ [KEY]: JSON.stringify(ready({ best: 19, swords: [{ id: 1, lv: 19, prot: 2, pity: 0, trait: null }], active: 1 })) });
  ok(plain(section(env)).endsWith('최고 강화 +20 달성 시 환생이 열립니다') && section(env).includes('rebirth-locked') && !section(env).includes('data-act') && !section(env).includes('sec-head'),
    'locked: one line 최고 강화 +20 달성 시 환생이 열립니다, no buttons: ' + plain(section(env)));

  // 표시(최고 +20, +20 검 보유, 골드 충분): 명성·횟수·상점 4행·환생 버튼 활성
  env = boot({ [KEY]: JSON.stringify(ready()) });
  ok(plain(section(env)).includes('환생 0회') && plain(section(env)).includes('명성 0') && plain(section(env)).includes('명성 상점'), 'visible: count 0회, fame 0, shop heading');
  ok(['startGold', 'income', 'slots', 'autoStart'].every(t => fameRow(env, t).includes(`data-act="buyFame" data-id="${t}"`)), 'shop: 4 rows with buyFame buttons');
  ok(plain(fameRow(env, 'startGold')).includes('여유 자금 Lv 0/4') && plain(fameRow(env, 'startGold')).includes('환생 시작 골드 +2,000 G · 다음 환생부터')
    && /disabled/.test(fameRow(env, 'startGold')), 'row: name, Lv n/max, effect, applies next rebirth, disabled without fame');
  ok(plain(fameRow(env, 'income')).includes('즉시 적용') && plain(fameRow(env, 'autoStart')).includes('환생 후 처음부터 자동 사냥 해금'), 'income/license apply now');
  ok(section(env).includes(`<span class="fame-balance"><span class="ic">${env.ctx.M2_ICONS.fame}</span> 명성`)
    && section(env).includes(`data-act="askRebirth" ><span class="ic">${env.ctx.M2_ICONS.rebirth}</span> 환생</button>`),
    '9-2: fame balance keeps the fame SVG, the [환생] button uses the rebirth SVG');
  ok(!askDisabled(env) && plain(section(env)).includes(`수수료 ${env.ctx.SG.fx.fmt(FEE)} G`), 'rebirth button enabled with the fee line');
  scanRendered();

  // 사유: +20 검 없음(최고 +20) / 골드 부족 — 버튼 비활성 + 문구(§7). 클릭해도 같은 문구 토스트, 창은 열리지 않음
  env = boot({ [KEY]: JSON.stringify(ready({ swords: [{ id: 1, lv: 19, prot: 2, pity: 0, trait: null }], active: 1 })) });
  ok(askDisabled(env) && plain(section(env)).includes('+20 검이 보관함에 있어야 합니다'), 'notReached: disabled + reason');
  click(env, 'askRebirth');
  ok(!modalOpen(env) && toasts(env).includes('+20 검이 보관함에 있어야 합니다'), 'notReached click: rebirth wording toast (not the monument wording), no modal');
  env = boot({ [KEY]: JSON.stringify(ready({ gold: FEE - 1 })) });
  ok(askDisabled(env) && plain(section(env)).includes('필요 19,846,200 G'), 'noGold: disabled + 필요 19,846,200 G');
  ok(V(env).REASON.notReached === '아직 그 단계에 도달하지 못했습니다.', 'monument notReached wording unchanged');

  // 상점 구매(환생 1회 뒤, 최고 0): 명성 3 → 여유 자금 1단계(1) → 최대·명성 부족 문구
  const after = ready({ best: 0, swords: [{ id: 3, lv: 0, prot: 2, pity: 0, trait: null }], active: 3, nextSwordId: 4, gold: 300,
    rebirth: { count: 1, fame: 3, up: { startGold: 3, income: 0, slots: 0, autoStart: 0 } } });
  env = boot({ [KEY]: JSON.stringify(after) });
  ok(plain(section(env)).includes('환생 1회') && plain(section(env)).includes('명성 3') && askDisabled(env), 'after a rebirth (best 0): section still visible, button disabled');
  ok(plain(fameRow(env, 'startGold')).includes('Lv 3/4') && plain(fameRow(env, 'startGold')).includes('+10,000 G → +20,000 G') && !/disabled/.test(fameRow(env, 'startGold')),
    'row shows current → next and the next cost (3) is affordable');
  click(env, 'buyFame', 'startGold');
  ok(saved(env).rebirth.fame === 0 && saved(env).rebirth.up.startGold === 4 && plain(fameRow(env, 'startGold')).includes('최대')
    && /disabled/.test(fameRow(env, 'startGold')) && plain(section(env)).includes('명성 0'), 'buy: fame spent, row at max shows 최대 (disabled)');
  click(env, 'buyFame', 'startGold');
  click(env, 'buyFame', 'income');
  ok(toasts(env).includes('이미 최대 단계입니다') && toasts(env).includes('명성이 부족합니다'), 'maxed / noFame toasts');
  scanRendered();

  // 확인 창: 열기 → 내용 = rebirthPreview, 포커스는 취소 버튼, 창 뒤 단축키 없음, 골드가 늘면 숫자만 갱신
  const unclaimed = ready();
  unclaimed.stats.tries = 150;   // tries_1 달성(미수령) → 안내 한 줄
  env = boot({ [KEY]: JSON.stringify(unclaimed) });
  const opener = { isConnected: true, focus() { this.focused = true; } };
  env.ctx.document.activeElement = opener;
  click(env, 'askRebirth');
  const html = modal(env)._html;
  const p = env.ctx.SG.rebirth.rebirthPreview(game.state());
  const fmt = env.ctx.SG.fx.fmt;
  ok(modalOpen(env) && html.includes('aria-modal="true"'), 'askRebirth opens the confirm modal');
  ok([`${fmt(p.fee)} G`, `${fmt(p.gold)} G`, `${fmt(p.goldLost)} G`, `+${p.fameGain}`, `${fmt(p.startGold)} G`, `${p.slots}칸`, `+${p.incomePct}%`].every(s => plain(html).includes(s))
    && p.goldLost === 5000, 'modal numbers equal rebirthPreview (fee, gold, gold lost, fame, start gold, slots, income)');
  ok(plain(html).includes('+20 무한의 검') && plain(html).includes('업적·칭호·일일 과제·기념비·도감·통계·설정·명성·명성 상점')
    && plain(html).includes('이벤트 진행, 숙련 기록(단계별 1개만 남김)') && plain(html).includes('시작 보관함')
    && html.includes(`<h3 id="rebirthTitle"><span class="ic">${env.ctx.M2_ICONS.rebirth}</span> 환생할까요?</h3>`)
    && plain(html).includes('받지 않은 업적·일일 과제 보상이 있습니다'), 'modal: rebirth SVG title, offered sword, kept / lost lists (9-2 wording), 시작 보관함, unclaimed reward line');
  ok(html.includes('data-act="rebirth"') && html.includes('data-act="cancelRebirth"'), 'modal: confirm (rebirth) and cancel buttons');
  ok(El.focused === modal(env).querySelector('[data-act="cancelRebirth"]'), 'keyboard focus moves to the cancel button');
  ok(pageInert(env) && !modal(env).inert, 'V1: the page outside the modal (header, main) is inert while it is open');
  // Tab 순환(V1): 창 안의 버튼(취소·확인) 사이에서만 돈다. 스텁 querySelectorAll은 비어 있으므로 창의 두 버튼을 돌려주게 한다
  const cancelBtn = modal(env).querySelector('[data-act="cancelRebirth"]');
  const confirmBtn = modal(env).querySelector('[data-act="rebirth"]');
  modal(env).querySelectorAll = () => [cancelBtn, confirmBtn];
  const pressTab = (shiftKey, active) => {
    env.ctx.document.activeElement = active;
    El.focused = null;
    let prevented = false;
    env.docListeners.keydown.forEach(f => f({ code: 'Tab', key: 'Tab', shiftKey, repeat: false, preventDefault() { prevented = true; } }));
    return { prevented, focused: El.focused };
  };
  let tabbed = pressTab(false, cancelBtn);
  ok(!tabbed.prevented && tabbed.focused === null, 'Tab from the first modal button is left to the browser (next button in the sheet)');
  tabbed = pressTab(false, confirmBtn);
  ok(tabbed.prevented && tabbed.focused === cancelBtn, 'Tab from the last modal button wraps to the first (stays in the sheet)');
  tabbed = pressTab(true, cancelBtn);
  ok(tabbed.prevented && tabbed.focused === confirmBtn, 'Shift+Tab from the first modal button wraps to the last (does not reach the page)');
  tabbed = pressTab(false, env.ctx.document.body);
  ok(tabbed.prevented && tabbed.focused === cancelBtn, 'Tab with focus outside the sheet pulls it into the sheet');
  env.ctx.document.activeElement = opener;
  // 창 뒤 강화(버튼 직접 호출): 창이 열린 동안 시작되지 않는다 → busy가 생기지 않는다(S2)
  env.byId['#btnEnhance'].listeners.click[0]();
  ok(game.state().stats.tries === 150 && modalOpen(env) && !askDisabled(env), 'V1: enhance cannot start behind the open modal (no try, no busy)');
  const goldBefore = saved(env).gold;
  key(env, 'KeyH');
  key(env, 'Space');
  ok(game.state().gold === goldBefore && game.state().stats.hunts === 0 && game.state().stats.tries === 150, 'no hunt / enhance shortcuts behind the modal');
  game.state().gold += 1000;
  env.tick();
  ok(modal(env).querySelector('.rb-gold').textContent === `${fmt(FEE + 6000)} G` && modal(env).querySelector('.rb-lost').textContent === '6,000 G',
    'open modal follows gold changes (current gold, gold lost)');

  // 취소 경로: 취소 버튼 / Esc / 바깥 클릭 — 상태·저장 불변, 포커스 복귀. 창 안 클릭은 닫지 않음
  const store0 = env.store[KEY];
  click(env, 'cancelRebirth');
  ok(!modalOpen(env) && opener.focused && env.store[KEY] === store0 && game.state().rebirth.count === 0, 'cancel closes, restores focus, state unchanged');
  ok(pageFree(env), 'V1: cancel clears inert');
  click(env, 'askRebirth');
  ok(pageInert(env), 'V1: reopening makes the page inert again');
  key(env, 'Escape');
  ok(!modalOpen(env) && game.state().rebirth.count === 0, 'Esc cancels');
  ok(pageFree(env), 'V1: Esc clears inert');
  click(env, 'askRebirth');
  modal(env).listeners.click.forEach(f => f({ target: {} }));
  ok(modalOpen(env) && pageInert(env), 'a click inside the sheet keeps it open (page stays inert)');
  modal(env).listeners.click.forEach(f => f({ target: modal(env) }));
  ok(!modalOpen(env) && game.state().rebirth.count === 0, 'outside click cancels');
  ok(pageFree(env), 'V1: outside click clears inert');

  // 확인: rebirth 1번 → 토스트·맨 위 스크롤·창 닫힘·미러
  const scrolls = [];
  env.ctx.scrollTo = (x, y) => scrolls.push([x, y]);
  const side = env.ctx.document.querySelector('.side');
  side.scrollTop = 480;
  click(env, 'askRebirth');
  click(env, 'rebirth');
  ok(!modalOpen(env) && saved(env).rebirth.count === 1 && toasts(env).includes('환생! 명성 +3'), 'confirm: reborn once, toast, modal closed');
  ok(pageFree(env), 'V1: confirm (rebirth) clears inert');
  ok(JSON.stringify(scrolls) === '[[0,0]]' && side.scrollTop === 0, 'confirm: scrolled to the top (page and side panel)');
  ok(plain(section(env)).includes('환생 1회') && plain(section(env)).includes('명성 3') && askDisabled(env), 'records section after rebirth: 1회, fame 3');
  ok(JSON.parse(env.store[MIRROR]).count === 1 && JSON.parse(env.store[MIRROR]).mark === 4, 'mirror carries the watermark (post-rebirth nextSwordId)');
  scanRendered();

  // 재검사: 창을 연 뒤 골드가 줄면 확인해도 환생하지 않는다(문구 토스트, 창 닫힘, 쓰기 없음)
  env = boot({ [KEY]: JSON.stringify(ready()) });
  click(env, 'askRebirth');
  game.state().gold = FEE - 1;
  const beforeConfirm = env.store[KEY];
  click(env, 'rebirth');
  ok(!modalOpen(env) && game.state().rebirth.count === 0 && env.store[KEY] === beforeConfirm && toasts(env).includes('필요 19,846,200 G'),
    'confirm re-checks canRebirth: gold dropped → no rebirth, reason toast, modal closed');
  ok(pageFree(env), 'V1: a rejected confirm clears inert');

  // 닫힘 경로: 다른 탭 잠금(멈춤) → 이어받기 후에도 닫힘
  env = boot({ [KEY]: JSON.stringify(ready()) });
  click(env, 'askRebirth');
  fire(env, 'storage', { key: KEY });
  ok(isLocked(env) && !modalOpen(env), 'suspend (other tab) closes the confirm modal');
  env.byId['#btnTakeover'].listeners.click[0]();
  ok(!isLocked(env) && !modalOpen(env) && game.state().rebirth.count === 0, 'take-over: modal stays closed, no rebirth');
  ok(pageFree(env), 'V1: suspend + take-over leaves no inert page (lock inert handed back by the tab guard)');

  // 상태 교체(복귀 때 다른 탭의 더 최근 저장 이어받기) → 닫힘
  env = boot({ [KEY]: JSON.stringify(ready()) });
  click(env, 'askRebirth');
  setVisible(env, false);
  const newer = JSON.parse(env.store[KEY]);
  newer.idle.lastSeen = clk.t + 5;
  newer.gold = FEE + 1;
  env.store[KEY] = JSON.stringify(newer);
  setVisible(env, true);
  ok(!modalOpen(env) && game.state().gold === FEE + 1, 'state replaced by adopting a newer save closes the modal');
  ok(pageFree(env), 'V1: state replacement (resetUiFor) clears inert');

  // 새 게임 → 닫힘, 미러도 기본값으로 낮춤(REQ-037 명시적 새 게임)
  env = boot({ [KEY]: JSON.stringify(ready({ rebirth: { count: 2, fame: 1, up: { startGold: 1, income: 0, slots: 0, autoStart: 0 } } })) });
  ok(JSON.parse(env.store[MIRROR]).count === 2, 'mirror written on boot');
  click(env, 'askRebirth');
  env.byId['#btnReset'].listeners.click[0]();
  ok(!modalOpen(env) && saved(env).rebirth.count === 0 && env.store[MIRROR] === JSON.stringify(SG_default().rebirth), 'new game closes the modal and resets the mirror');
  ok(pageFree(env), 'V1: new game clears inert');

  // 강화 연출 중: 버튼 비활성, askRebirth는 창을 열지 않는다(V1·V9). 성공 굴림 0 고정(V6)
  env = boot({ [KEY]: JSON.stringify(ready()) }, 0);
  const pending = env.byId['#btnEnhance'].listeners.click[0]();
  ok(askDisabled(env), 'busy: rebirth button disabled during the enhance animation');
  click(env, 'askRebirth');
  ok(!modalOpen(env), 'busy: askRebirth does not open the modal');
  // S2 방어 분기: 창이 열린 채 busy인 상태를 스텁에서 직접 만든다(UI로는 창이 열린 동안 강화가 시작되지 않는다).
  // 확인을 누르면 창을 닫고 다시 시도 안내 토스트, 환생·저장 없음(§7.1)
  modal(env).hidden = false;
  modal(env).dataset.kind = 'rebirth';
  const busyStore = env.store[KEY];
  click(env, 'rebirth');
  ok(!modalOpen(env) && toasts(env).includes('강화 연출이 끝난 뒤 다시 시도하세요') && game.state().rebirth.count === 0 && env.store[KEY] === busyStore,
    'S2: confirm during the enhance animation closes the modal with a retry toast (no rebirth, no write)');
  await pending;
  ok(!askDisabled(env) && game.state().swords[1].lv === 8, 'after the animation the button is enabled again');
  click(env, 'askRebirth');
  ok(modalOpen(env), 'after the animation the modal opens');

  ok(V(env).REBIRTH_REASON.noGold === '필요 19,846,200 G' && V(env).REBIRTH_REASON.maxed === '이미 최대 단계입니다', 'REBIRTH_REASON derives from REASON + fee');
}

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
    ok(env.scripts.length === 20 && bannerShown(env), 'test page: protected mode on a corrupt test save whose backup fails');
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

  // 2·3) CSS: 헤더는 모든 폭에서 줄바꿈하고 보호 모드 배너는 전체 폭(자기 줄), 좁은 화면 보호 모드에서는 헤더가 sticky가 아니고 원문 칸 높이 제한
  {
    const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8').replace(/\r\n/g, '\n');
    const rule = (src, sel) => (src.match(new RegExp('(?:^|\\n)\\s*' + sel.replace(/[.#]/g, '\\$&') + '\\s*\\{([^}]*)\\}')) || [])[1];
    const topLevel = css.replace(/@media[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, '');
    const mobile = (css.match(/@media \(max-width: 720px\) \{((?:[^{}]*\{[^}]*\})*[^{}]*)\}/) || [])[1] || '';
    ok(/position:\s*sticky/.test(rule(topLevel, 'header')) && /flex-wrap:\s*wrap/.test(rule(topLevel, 'header')), 'header sticky and wraps at every width (REQ-046)');
    ok(/white-space:\s*nowrap/.test(rule(topLevel, '.logo')) && /flex-shrink:\s*0/.test(rule(topLevel, '.logo')), 'logo never shrinks or breaks');
    ok(/flex:\s*1 1 100%/.test(rule(topLevel, '.save-guard') || ''), 'REQ-031: the protected-mode banner takes the full header width (its own row)');
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

/** 9-2: M2 아이콘 연결. 같은 저장을 에셋 있음/없음으로 열어 SVG와 폴백(이모지·특성 약자)을 비교한다 */
async function m2IconsUi(ok) {
  const C = require(path.join(ROOT, 'js', 'constants.js'));
  const KEY = 'sword-enhance-v2';
  const M2_KEYS = ['trait_hunt', 'trait_work', 'trait_trade', 'trait_ore', 'trait_shard', 'trait_anvil', 'event_luck', 'event_hunt', 'event_auto',
    'event_ore', 'event_anvil', 'event_quest', 'fame', 'rebirth', 'monument', 'achievement', 'title', 'sure_badge', 'mastery'];
  /** best 17, 활성 +16 완벽한 약탈자(게이지 가득), +13 평범한 상인, 기념비 +13·+14, 칭호 장착, 행운의 시간 진행 중 */
  const iconSave = () => {
    const s = Object.assign(SG_default(), { gold: 1e9, best: 17, gauge: [0, 5, 0, 0, 0], mastery: [0, 1, 0, 0, 0] });
    s.swords = [{ id: 1, lv: 16, prot: 2, pity: 0, trait: { k: 'hunt', t: 3 } }, { id: 2, lv: 13, prot: 2, pity: 0, trait: { k: 'trade', t: 1 } }];
    s.nextSwordId = 3;
    s.active = 1;
    s.monuments = s.monuments.map((_, i) => (i < 2 ? 1 : 0));
    s.achievements = { tries_1: C.ACH_CLAIMED };
    s.title = 'tries_1';
    s.events = { active: { id: 'luck', remainMs: 125000 }, sinceMs: 0, nextAtMs: C.EVENT_GAP_MIN_SEC * 1000 };
    return s;
  };
  // main.js가 로드 때 잡는 Math.random을 고정한다(V6): 게이지 확정 강화라 결과는 같지만 다른 굴림도 결정적으로
  const realRandom = Math.random;
  const boot = opts => {
    Math.random = () => 0;
    try { return makeEnv({ [KEY]: JSON.stringify(iconSave()) }, opts); } finally { Math.random = realRandom; }
  };
  const strip = env => env.byId['#strip']._html;
  const cardOf = (env, id) => strip(env).split('<button class="slot-card').find(c => c.includes(`data-sword="${id}"`)) || '';
  const chipOf = (env, id) => (cardOf(env, id).match(/<span class="trait-chip[\s\S]*?<\/span><\/span>/) || [''])[0];
  const pipsOn = html => (html.match(/<i class="on"><\/i>/g) || []).length;
  const pipsAll = html => (html.match(/<i[ >]/g) || []).length;
  const svg = (env, key) => `<span class="ic">${env.ctx.M2_ICONS[key]}</span>`;
  const enhance = async env => { await env.byId['#btnEnhance'].listeners.click[0](); };
  const masteryToast = env => texts(env.byId['#toasts']).find(t => t.includes('숙련!')) || '';

  // 매핑: 19개 게임 id가 모두 실제 M2_ICONS 키를 가리키고, 특성에는 이모지 폴백이 없다(약자 글자로 돌아감)
  let env = boot();
  ok(M2_KEYS.every(k => C.ICON_ASSET_KEYS[k] === k && typeof env.ctx.M2_ICONS[k] === 'string' && env.ctx.M2_ICONS[k].startsWith('<svg')),
    '9-2: ICON_ASSET_KEYS maps all 19 M2 ids to existing M2_ICONS keys');
  ok(C.TRAIT_KINDS.every(k => !('trait_' + k in C.ICONS)) && C.EVENT_IDS.every(id => C.ICONS['event_' + id] === C.EVENTS[id].icon)
    && ['rebirth', 'achievement', 'title', 'sure_badge', 'mastery', 'fame', 'monument'].every(k => !!C.ICONS[k]),
    '9-2: emoji fallbacks for the new ids (event_* = EVENTS icon), none for trait_*');

  // SVG 있음
  [[1, 3, 'trait_hunt'], [2, 1, 'trait_trade']].forEach(([id, t, key]) => {
    const html = chipOf(env, id);
    ok(html.includes(svg(env, key)) && !html.includes('<b>') && pipsAll(html) === C.TRAIT_TIER_MAX && pipsOn(html) === t,
      `9-2 SVG: sword ${id} chip = ${key} SVG + ${C.TRAIT_TIER_MAX} pips, ${t} filled: ${html.replace(/<svg[\s\S]*?<\/svg>/, '<svg/>')}`);
  });
  const forgeChip = (env.byId['[data-panel="forge"]'].querySelector('.panel-body')._html.match(/<div class="shop-icon">([\s\S]*?)<\/div>/) || [])[1] || '';
  ok(forgeChip.includes(svg(env, 'trait_hunt')) && forgeChip.includes('aria-label="완벽한 약탈자"') && pipsOn(forgeChip) === 3, '9-2 SVG: forge 각인 row chip uses the trait SVG');
  ok(env.byId['#eventChip']._html.includes(svg(env, 'event_luck')) && !env.byId['#eventChip']._html.includes(C.EVENTS.luck.icon), '9-2 SVG: event chip uses event_luck');
  ok(env.byId['#gaugeLine']._html.includes(`${svg(env, 'sure_badge')} 확정!`), '9-2 SVG: full gauge badge uses sure_badge');
  ok(env.byId['#monumentBadge']._html === `${svg(env, 'monument')} +14`, '9-2 SVG: header monument badge');
  ok(env.byId['#titleBadge']._html === `${svg(env, 'title')} 「견습 대장장이」`, '9-2 SVG: header title badge');
  await enhance(env);
  ok(saved(env).swords[0].lv === 17 && masteryToast(env) === `${C.ICONS.mastery} +16 숙련! 이후 +16 강화 성공률 +3%p` && !masteryToast(env).includes('<span'),
    '9-2: the mastery toast leads with the emoji fallback even when SVGs are loaded: ' + masteryToast(env));
  scanRendered();

  // 에셋 없음: 같은 자리에 이모지, 특성 칩은 약자 글자(등급 점은 그대로 3개)
  env = boot({ withoutAssets: true });
  ok(env.ctx.M1_ICONS === undefined && env.ctx.M2_ICONS === undefined, 'fallback setup: no icon assets loaded');
  const noSvg = html => !html.includes('<span class="ic">') && !html.includes('<svg');
  [[1, 3, '약'], [2, 1, '상']].forEach(([id, t, letter]) => {
    const html = chipOf(env, id);
    ok(html.includes(`<b>${letter}</b>`) && noSvg(html) && pipsAll(html) === C.TRAIT_TIER_MAX && pipsOn(html) === t,
      `9-2 fallback: sword ${id} chip = letter ${letter} + ${C.TRAIT_TIER_MAX} pips, ${t} filled: ${html}`);
  });
  ok(env.byId['#eventChip']._html.startsWith(`<span class="ev-icon" aria-hidden="true">${C.EVENTS.luck.icon}</span>`), '9-2 fallback: event chip shows the EVENTS emoji');
  ok(env.byId['#gaugeLine']._html.includes(`<span class="badge good">${C.ICONS.sure_badge} 확정!</span>`) && !env.byId['#gaugeLine']._html.includes(C.ICONS.sure),
    '9-2 fallback: 확정! badge shows the sure_badge emoji (not the 확정 강화권 icon)');
  ok((env.byId['#masteryList']._html.match(/<li>[\s\S]*?<\/li>/g) || []).every(li => li.startsWith(`<li>${C.ICONS.mastery} +`))
    && env.byId['#masteryHeadIcon']._html === C.ICONS.mastery, '9-2 fallback: mastery rows and the 숙련 heading show the mastery emoji');
  ok(env.byId['#monumentBadge']._html === `${C.ICONS.monument} +14` && env.byId['#titleBadge']._html === `${C.ICONS.title} 「견습 대장장이」`,
    '9-2 fallback: monument / title badges show emoji');
  const achs = env.byId['#achSection']._html;
  ok(achs.includes(`<h2>${C.ICONS.achievement} 업적 `) && achs.includes(`<span class="muted">${C.ICONS.title} 칭호</span>`), '9-2 fallback: achievements heading and title picker label');
  [env.byId['#strip'], env.byId['#eventChip'], env.byId['#gaugeLine'], env.byId['#masteryList'], env.byId['#monumentBadge'], env.byId['#titleBadge'], env.byId['#achSection']]
    .forEach(el => ok(!el._html.includes('<span class="ic">'), `9-2 fallback: no SVG icon markup in ${el.sel}`));   // 보관함의 검 그림 SVG는 아이콘이 아니다
  await enhance(env);
  ok(masteryToast(env) === `${C.ICONS.mastery} +16 숙련! 이후 +16 강화 성공률 +3%p`, '9-2 fallback: same mastery toast text');
  scanRendered();
}

main().catch(e => { console.error('smoke-dom FAILED:', e.stack || e.message); process.exit(1); });
