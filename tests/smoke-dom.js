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
  const document = {
    hidden: false,
    documentElement: new El('html'),
    querySelector: s => byId[s] || (byId[s] = new El(s)),
    querySelectorAll: () => [],
    createElement: t => new El(t),
    addEventListener: (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); },
  };
  const ctx = {
    console, Math, Date, JSON, Promise, Object, Array, Number, String, Set, Map, Proxy, Error,
    document,
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    requestAnimationFrame: () => 0,
    setTimeout: (f, ms) => setTimeout(f, Math.min(ms || 0, 5)),   // 연출 대기를 짧게
    setInterval: f => { timers.push(f); return timers.length; },
    confirm: () => true,
    addEventListener: () => {},
    devicePixelRatio: 1,
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])
    .filter(src => !(opts.withoutAssets && src.startsWith('assets/')));
  scripts.forEach(src => vm.runInContext(fs.readFileSync(path.join(ROOT, src), 'utf8'), ctx, { filename: src }));
  return { ctx, byId, docListeners, store, tick: () => timers.forEach(f => f()), scripts };
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
  env = makeEnv({ 'sword-enhance-v2': JSON.stringify(st) });
  change(env, 'seal', undefined, true);
  const goldBefore = saved(env).gold;
  click(env, 'deliver', 0);
  const after = saved(env);
  ok(after.stats.delivered === 1 && !after.swords.some(s => s.id === 50), 'delivered quest');
  ok(after.gold - goldBefore === Math.floor(q.gold * 1.3), 'seal applied to quest gold');
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
  scanRendered();

  // 6) 콘텐츠 에셋 없이도 동작(이모지·합성음 대체)
  env = makeEnv({}, { withoutAssets: true });
  ok(env.byId['#tabbar']._html.includes('🔒'), 'emoji fallback without assets');
  env.byId['#btnHunt'].listeners.click[0]();
  click(env, 'tab', 'idle');
  scanRendered();

  console.log(`smoke-dom: ${checks} checks passed`);
}

main().catch(e => { console.error('smoke-dom FAILED:', e.stack || e.message); process.exit(1); });
