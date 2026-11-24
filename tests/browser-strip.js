/* 실제 브라우저 회귀 테스트: 헤드리스 Chrome/Edge를 CDP(WebSocket)로 조종해 보관함 칸의 실제 마우스 입력을 확인한다.
 * DOM 스텁(smoke-dom)으로는 잡히지 않는 click 대상·pointer capture 상호작용(V3)을 지킨다.
 *  (a) 활성 아닌 카드를 한 번 클릭하면 활성 검이 된다
 *  (b) 임계값을 넘겨 끌면 칸이 옮겨지고 순서가 localStorage에 저장된다(새로고침 후에도 유지)
 *  (c) 끌다가 스트립 밖에서 놓아도 드래그 상태가 남지 않고, 다음 클릭이 활성 전환을 한다
 *  (d) 우측 탭 패널(상점·대장간·의뢰·방치·기록)이 내용보다 작게 줄어들지 않는다(1280x800, 1280x600)
 *  (e) 골드 사용처가 열린 상태(best ≥ 13, 특성 검, 기념비 일부 보유)에서도 (d)와 같다 — 대장간 "각인"·기록 "기념비" 섹션 포함
 *  (f) 모바일 폭(360·375px)에서 특성 칩이 있는 보관함 카드가 늘어나거나 넘치지 않고 가로 스크롤이 생기지 않는다(m2-traits AC 51)
 *  (h) 채워진 기록 탭(일일 과제·업적·긴 칭호·탭 점)이 360·375px·1280px에서 가로로 넘치지 않고, 1280x800·1280x600에서 5탭 높이 검사(V4)를 통과한다
 *  (i) 시간 이벤트 칩·팝오버(7-2)가 360·375·520·521·720·721·760·1280px에서 헤더를 넘치게 하지 않고 헤더 항목끼리 겹치지 않으며, 팝오버가 화면 안에서 열리고 닫히며, 이벤트 종료 후 칩이 사라진다.
 *      저장 실패 배지·큰 골드·기념비 배지가 함께 있는 스트레스(360·721·760px, 721~1000px 1px 간격 훑기) 포함. index.html은 시드 저장, test.html은 조작판 버튼으로 이벤트를 지정한다
 *  (j) 환생 섹션·확인 창(8-B): 기록 탭 맨 위 환생 섹션(잠김·열림·환생 1회 이상·큰 숫자)이 360·375·721·1280px에서 넘치거나 겹치지 않고,
 *      확인 창이 화면 안에 있으며 바깥 클릭·Esc로 닫힌다
 *  (g) index.html·test.html 모두 콘솔 오류·예외 없이 열린다
 * 실행: node tests/browser-strip.js  (브라우저 경로 직접 지정: BROWSER_PATH=...)
 * Chrome/Edge가 없으면 "SKIP: no Chrome/Edge"를 출력하고 0으로 끝난다. 외부 패키지 없음(Node 22 전역 WebSocket·fetch).
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'js', 'constants.js'));
const SV = require(path.join(ROOT, 'js', 'save.js'));
const A = require(path.join(ROOT, 'js', 'achievements.js'));

const BROWSER_CANDIDATES = [
  path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
];
const LAUNCH_TIMEOUT_MS = 15000;
const WAIT_TIMEOUT_MS = 5000;
const POLL_MS = 50;
const EXIT_TIMEOUT_MS = 5000;
const DRAG_STEPS = 12;            // 끄는 동안 보낼 mouseMoved 수(실제 손 움직임처럼 여러 번)
const OUTSIDE_GAP_PX = 80;        // (c) 스트립 위쪽 바깥으로 벗어나는 거리
const SWORD_IDS = [1, 2, 3];
const TAB_IDS = ['shop', 'forge', 'quests', 'idle', 'records'];
const PANEL_VIEWPORTS = [{ width: 1280, height: 800 }, { width: 1280, height: 600 }];   // (d) 데스크톱 레이아웃 높이 두 가지
const PANEL_TOLERANCE_PX = 1;     // (d) 소수점 반올림 오차 허용
const MOBILE_WIDTHS = [360, 375];  // (f) AC 51 최소 폭과 일반 폰 폭
const MOBILE_HEIGHT = 800;
const RECORDS_VIEWPORTS = [{ width: 360, mobile: true }, { width: 375, mobile: true }, { width: 1280, mobile: false }];   // (h)
const RECORDS_EDGE_PX = 1;        // (h) 카드·행이 패널 좌우 끝을 넘어도 되는 오차

const EVENT_VIEWPORTS = [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 520, height: 800 },
  { width: 521, height: 800 }, { width: 720, height: 800 }, { width: 721, height: 800 }, { width: 760, height: 800 },
  { width: 1280, height: 800 }];   // (i) 721·760: 헤더가 줄바꿈하지 않는 경계 바로 위(V4)
const EVENT_STRESS_VIEWPORTS = [{ width: 360, height: 640 }, { width: 721, height: 800 }, { width: 760, height: 800 }];   // (i) 모든 배지 스트레스
const EVENT_SWEEP_MIN = 721;      // (i) 스트레스 저장으로 1px씩 훑는 폭 범위(줄바꿈하지 않는 헤더)
const EVENT_SWEEP_MAX = 1000;
const EVENT_REPORT_WIDTHS = [721, 760, 800, 1000];
const EVENT_NAME_HIDE_MAX = 520;  // (i) 이 폭 이하에서는 칩의 이름 글자를 화면에서 감춘다(css 규칙과 같은 경계)
const EVENT_MOBILE_MAX = 720;     // (i) 이 폭 이하에서는 모바일 에뮬레이션으로 연다
const EVENT_TEST_ID = 'luck';     // (i) 이름이 가장 긴 이벤트(헤더 폭 최악)
const EVENT_SEED_REMAIN_MS = 125000;
const EVENT_STRESS_GOLD = 9e15;   // (i) 스트레스: 자릿수 많은 골드
const EVENT_EDGE_PX = 1;

// ------------------------------------------------------------ 결과
const results = { pass: 0, fail: 0 };
function check(name, cond, detail) {
  if (cond) { results.pass++; return; }
  results.fail++;
  console.log(`FAIL  ${name}${detail === undefined ? '' : `\n      ${detail}`}`);
}

const delay = ms => new Promise(r => setTimeout(r, ms));
/** cond()가 참이 될 때까지 짧게 반복 확인한다. 시간 안에 안 되면 false */
async function pollUntil(cond, timeoutMs = WAIT_TIMEOUT_MS) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (await cond()) return true;
    if (Date.now() > end) return false;
    await delay(POLL_MS);
  }
}

// ------------------------------------------------------------ 브라우저
function findBrowser() {
  if (process.env.BROWSER_PATH) {
    if (!fs.existsSync(process.env.BROWSER_PATH)) throw new Error('BROWSER_PATH does not exist: ' + process.env.BROWSER_PATH);
    return process.env.BROWSER_PATH;
  }
  return BROWSER_CANDIDATES.find(p => fs.existsSync(p)) || null;
}

/** 프로필의 DevToolsActivePort(1행 포트, 2행 브라우저 WebSocket 경로). 아직 다 쓰이지 않았으면 null */
function readDevToolsPort(profileDir) {
  const file = path.join(profileDir, 'DevToolsActivePort');
  if (!fs.existsSync(file)) return null;
  const [port, wsPath] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  return port && wsPath ? { port: +port, wsPath } : null;
}

/**
 * 새 임시 프로필로 띄워 localStorage가 비어 있게 한다. 포트는 0(자동)으로 받고 DevToolsActivePort에서 읽는다.
 * Edge는 실행한 프로세스가 곧바로 0으로 끝나고 다른 프로세스가 브라우저가 되므로, 0 종료는 실패로 보지 않는다.
 */
async function launchBrowser(exe) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sword-browser-strip-'));
  const proc = spawn(exe, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1280,900', 'about:blank',
  ], { stdio: 'ignore' });
  let exited = false;
  let failed = false;
  proc.on('exit', code => { exited = true; failed = code !== 0; });
  proc.on('error', () => { exited = true; failed = true; });
  // 브라우저가 끝나면 프로필의 lockfile이 사라진다(실행 프로세스가 먼저 끝나는 Edge에도 통하는 종료 신호)
  const gone = () => exited && !fs.existsSync(path.join(profileDir, 'lockfile'));
  const browser = { proc, profileDir, gone, port: 0 };
  let devTools = null;
  await pollUntil(() => failed || !!(devTools = readDevToolsPort(profileDir)), LAUNCH_TIMEOUT_MS);
  if (!devTools) throw Object.assign(new Error('browser did not start (no DevToolsActivePort)'), { browser });
  browser.port = devTools.port;
  return browser;
}

/** 브라우저를 닫고(안 닫히면 강제 종료) 임시 프로필을 지운다. 정리 실패는 테스트 결과와 별개로 경고만 한다 */
async function closeBrowser(browser) {
  // 시작 대기가 시간 초과였어도 그 뒤에 포트가 열렸을 수 있어 여기서 다시 읽는다
  const devTools = readDevToolsPort(browser.profileDir);
  if (devTools) {
    try {
      const b = await connect(`ws://127.0.0.1:${devTools.port}${devTools.wsPath}`);
      b.send('Browser.close').catch(() => {});
    } catch (e) { /* 이미 닫히는 중 */ }
  }
  if (!await pollUntil(browser.gone, EXIT_TIMEOUT_MS)) {
    browser.proc.kill();
    if (!await pollUntil(browser.gone, EXIT_TIMEOUT_MS)) console.log('WARN  browser did not exit; profile: ' + browser.profileDir);
  }
  try {
    // 자식 프로세스가 프로필 파일을 잠깐 더 잡고 있을 수 있어 재시도한다
    fs.rmSync(browser.profileDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  } catch (e) {
    console.log(`WARN  could not remove temp profile ${browser.profileDir}: ${e.code || e.message}`);
  }
}

// ------------------------------------------------------------ CDP
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    const listeners = {};
    let nextId = 0;
    ws.onmessage = m => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        const { ok, fail } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) fail(new Error(`${msg.error.message} (${msg.error.code})`)); else ok(msg.result);
      } else if (msg.method) (listeners[msg.method] || []).forEach(f => f(msg.params));
    };
    ws.onerror = () => reject(new Error('CDP connection failed: ' + url));
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((ok, fail) => {
        const id = ++nextId;
        pending.set(id, { ok, fail });
        ws.send(JSON.stringify({ id, method, params }));
      }),
      on: (method, f) => { (listeners[method] = listeners[method] || []).push(f); },
      close: () => ws.close(),
    });
  });
}

async function openPage(browser) {
  let target = null;
  await pollUntil(async () => {
    const list = await (await fetch(`http://127.0.0.1:${browser.port}/json/list`)).json();
    target = list.find(t => t.type === 'page');
    return !!target;
  }, LAUNCH_TIMEOUT_MS);
  if (!target) throw new Error('no page target');
  return connect(target.webSocketDebuggerUrl);
}

/** 페이지 조작 도우미: 식 평가, 상태 대기, 실제 마우스 입력 */
function pageApi(cdp) {
  async function evaluate(expression) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error('page eval failed: ' + (r.exceptionDetails.exception || {}).description);
    return r.result.value;
  }
  const waitFor = (expression, timeoutMs) => pollUntil(() => evaluate(`!!(${expression})`), timeoutMs);
  const mouse = (type, x, y, buttons, button = 'left') =>
    cdp.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const press = (x, y) => mouse('mousePressed', x, y, 1);
  const release = (x, y) => mouse('mouseReleased', x, y, 0);
  async function dragPath(from, to) {
    for (let i = 1; i <= DRAG_STEPS; i++) {
      const t = i / DRAG_STEPS;
      await mouse('mouseMoved', from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 1);
    }
  }
  async function click(p) { await mouse('mouseMoved', p.x, p.y, 0, 'none'); await press(p.x, p.y); await release(p.x, p.y); }
  return { evaluate, waitFor, press, release, dragPath, click };
}

// ------------------------------------------------------------ 게임 페이지 상태 (페이지 안에서 평가할 식)
const KEY = JSON.stringify(C.SAVE_KEY);
const JS = {
  savedOrder: `JSON.parse(localStorage.getItem(${KEY})).swords.map(s => s.id).join()`,
  savedActive: `JSON.parse(localStorage.getItem(${KEY})).active`,
  domOrder: `[...document.querySelectorAll('#strip [data-sword]')].map(el => el.dataset.sword).join()`,
  card: id => `document.querySelector('#strip [data-sword="${id}"]')`,
  cardCenter: id => `(() => { const r = ${JS.card(id)}.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
  stripTop: `document.getElementById('strip').getBoundingClientRect().top`,
  // 드래그가 남긴 흔적: 들린 카드, 스트립 드래그 표시, 놓을 자리 표시선, 카드 이동 transform
  dragLeftovers: `document.querySelectorAll('#strip .dragging, #strip .drop-before, #strip .drop-after').length
    + (document.getElementById('strip').classList.contains('drag-on') ? 1 : 0)
    + [...document.querySelectorAll('#strip [data-sword]')].filter(el => el.style.transform).length`,
};
const isActive = id => `${JS.card(id)} && ${JS.card(id)}.classList.contains('active') && ${JS.savedActive} === ${id}`;

/** 실제 저장 형식(save.js defaultState)에 검 3자루를 넣은 시드 */
function seedSave() {
  const st = SV.defaultState(Date.now());
  st.swords = SWORD_IDS.map(id => ({ id, lv: id, prot: C.PROTECT_USES, pity: 0 }));
  st.nextSwordId = SWORD_IDS.length + 1;
  st.active = SWORD_IDS[0];
  st.best = Math.max(SWORD_IDS.length, C.FORGE_UNLOCK_BEST);   // 모든 탭(대장간 포함)이 열린 상태
  return JSON.stringify(st);
}

/**
 * (e)(f) 골드 사용처가 열린 후반 시드: best 17, 특성 검 3자루 + 특성 없는 검 1자루(칩 유무 비교), 기념비 +13·+14 보유.
 * 각인 관리·기념비 섹션의 모든 상태(보유/구매 가능/잠김)와 칩 1~3등급이 함께 그려진다
 */
const SINK_SWORDS = [
  { id: 1, lv: 17, trait: { k: 'hunt', t: 3 } },
  { id: 2, lv: 13, trait: { k: 'trade', t: 2 } },
  { id: 3, lv: 2, trait: null },
  { id: 4, lv: 5, trait: { k: 'anvil', t: 1 } },
];
function sinkSeedSave() {
  const st = SV.defaultState(Date.now());
  st.swords = SINK_SWORDS.map(s => ({ id: s.id, lv: s.lv, prot: C.PROTECT_USES, pity: 0, trait: s.trait }));
  st.nextSwordId = SINK_SWORDS.length + 1;
  st.slots = SINK_SWORDS.length;
  st.active = SINK_SWORDS[1].id;   // 등급 2 검: 종류 변경·등급 올리기 버튼이 둘 다 보인다
  st.best = SINK_SWORDS[0].lv;
  st.gold = 5e6;
  st.monuments = st.monuments.map((_, i) => (i < 2 ? 1 : 0));
  st.found = st.found.map((f, l) => f || l <= st.best);
  return JSON.stringify(st);
}

/**
 * 시드 저장을 게임 스크립트보다 먼저 넣고 페이지(기본 index.html)를 연다. 시드 스크립트는 첫 로드 뒤 지워 새로고침에는 쓰지 않는다.
 * opts: { save(시드 JSON), page(파일 이름), key(저장 키), order(기대하는 칸 순서) }
 */
async function openGame(cdp, page, opts = {}) {
  const o = Object.assign({ save: seedSave(), page: 'index.html', key: KEY, order: SWORD_IDS.join() }, opts);
  const source = `localStorage.setItem(${o.key}, ${JSON.stringify(o.save)});`;
  const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
  await cdp.send('Page.navigate', { url: pathToFileURL(path.join(ROOT, o.page)).href });
  const loaded = await page.waitFor(`document.readyState === 'complete' && ${JS.domOrder} === '${o.order}'`);
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  await page.evaluate(`document.getElementById('strip').scrollIntoView({ block: 'center' })`);
  return loaded;
}

// ------------------------------------------------------------ 시나리오
async function clickActivates(page) {
  check('(a) seeded save starts with sword 1 active', await page.waitFor(isActive(1)));
  await page.click(await page.evaluate(JS.cardCenter(2)));
  check('(a) a single click on a non-active card makes it active', await page.waitFor(isActive(2)), await page.evaluate(JS.savedActive));
}

async function dragReorders(cdp, page) {
  const from = await page.evaluate(JS.cardCenter(1));
  const last = await page.evaluate(JS.cardCenter(3));
  await page.press(from.x, from.y);
  const to = { x: last.x + 20, y: from.y };   // 마지막 카드 중심을 넘어 맨 뒤 자리
  await page.dragPath(from, to);
  check('(b) moving past the threshold lifts the card', await page.waitFor(`${JS.card(1)}.classList.contains('dragging')`));
  check('(b) drop marker after the last card', await page.waitFor(`${JS.card(3)}.classList.contains('drop-after')`));
  await page.release(to.x, to.y);
  const moved = await page.waitFor(`${JS.savedOrder} === '2,3,1' && ${JS.domOrder} === '2,3,1'`);
  check('(b) drop moves the card to the new slot and saves the order', moved, await page.evaluate(JS.savedOrder));
  check('(b) no drag leftovers after the drop', await page.waitFor(`${JS.dragLeftovers} === 0`));
  check('(b) the click after a drag does not change the active sword', await page.evaluate(isActive(2)));

  await page.evaluate('window.__beforeReload = true');
  await cdp.send('Page.reload');
  const kept = await page.waitFor(`!window.__beforeReload && document.readyState === 'complete' && ${JS.domOrder} === '2,3,1'`);
  check('(b) the new order survives a reload', kept, await page.evaluate(JS.domOrder));
  await page.evaluate(`document.getElementById('strip').scrollIntoView({ block: 'center' })`);
}

async function releaseOutside(page) {
  const order = await page.evaluate(JS.domOrder);
  const from = await page.evaluate(JS.cardCenter(3));
  const outside = { x: from.x, y: (await page.evaluate(JS.stripTop)) - OUTSIDE_GAP_PX };
  await page.press(from.x, from.y);
  await page.dragPath(from, outside);
  check('(c) the drag started before leaving the strip',
    await page.waitFor(`${JS.card(3)}.classList.contains('dragging') && document.getElementById('strip').classList.contains('drag-on')`));
  await page.release(outside.x, outside.y);
  check('(c) releasing outside the strip leaves no drag state', await page.waitFor(`${JS.dragLeftovers} === 0`),
    await page.evaluate(JS.dragLeftovers));
  check('(c) released over its own column, the order is unchanged', await page.evaluate(`${JS.domOrder} === '${order}'`));
  await page.click(await page.evaluate(JS.cardCenter(3)));
  check('(c) the next click still activates', await page.waitFor(isActive(3)), await page.evaluate(JS.savedActive));
}

/** 탭을 눌러 패널을 연 뒤 높이를 잰다. 카드 바닥이 마지막 자식 바닥보다 위면 내용이 카드 밖으로 넘친 것 */
async function measurePanel(page, id) {
  await page.click(await page.evaluate(`(() => { const r = document.querySelector('[data-act="tab"][data-id="${id}"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`));
  const shown = await page.waitFor(`(() => { const p = document.querySelector('[data-panel="${id}"]'); return p && !p.hidden && p.offsetHeight > 0; })()`);
  const m = await page.evaluate(`(() => { const p = document.querySelector('[data-panel="${id}"]'); const last = p.lastElementChild;
    return { scrollHeight: p.scrollHeight, clientHeight: p.clientHeight, bottom: p.getBoundingClientRect().bottom,
      lastBottom: last ? last.getBoundingClientRect().bottom : 0,
      sideHeight: document.querySelector('.side').getBoundingClientRect().height }; })()`);
  return { shown, ...m };
}

async function panelsContainContent(cdp, page, tag = '(d)') {
  for (const vp of PANEL_VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { ...vp, deviceScaleFactor: 1, mobile: false });
    for (const id of TAB_IDS) {
      const m = await measurePanel(page, id);
      const label = `${tag} ${vp.width}x${vp.height} ${id} panel`;
      const detail = JSON.stringify(m);
      check(`${label} is shown`, m.shown, detail);
      check(`${label} is not shorter than its content (scrollHeight <= clientHeight)`,
        m.scrollHeight <= m.clientHeight + PANEL_TOLERANCE_PX, detail);
      check(`${label} card bottom is not above its last child`, m.bottom + PANEL_TOLERANCE_PX >= m.lastBottom, detail);
    }
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
}

/** (e) 사용처 섹션이 실제로 그려진 상태(대장간 각인 버튼, 기념비 8칸)에서 (d)와 같은 패널 높이 검사 */
async function sinkPanelsContainContent(cdp, page) {
  const order = SINK_SWORDS.map(s => s.id).join();
  check('(e) index.html loads the late-game sink save', await openGame(cdp, page, { save: sinkSeedSave(), order }));
  const sections = await page.evaluate(`(() => {
    const forge = document.querySelector('[data-panel="forge"] .panel-body');
    return { rekind: !!forge.querySelector('[data-act="traitRekind"]'), tierUp: !!forge.querySelector('[data-act="traitTierUp"]'),
      noOdds: forge.textContent.includes('특성은 강화 확률에 영향을 주지 않는다'),
      monuments: document.querySelectorAll('#monumentList .mon').length,
      buyable: document.querySelectorAll('#monumentList [data-act="buyMonument"]').length,
      badge: !document.getElementById('monumentBadge').hidden }; })()`);
  check('(e) forge tab shows the 각인 section with both sink buttons', sections.rekind && sections.tierUp && sections.noOdds, JSON.stringify(sections));
  check('(e) records tab shows 8 monuments, buyable ones and the header badge', sections.monuments === C.MONUMENT_COUNT && sections.buyable > 0 && sections.badge,
    JSON.stringify(sections));
  await panelsContainContent(cdp, page, '(e)');
}

/** (f) 칩이 있는 카드: 칩을 숨겨도 카드 크기가 같고(흐름 밖), 칩이 카드 안·검 그림 밖에 있으며, 페이지 가로 스크롤 없음 */
async function mobileTraitChips(cdp, page) {
  for (const width of MOBILE_WIDTHS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: MOBILE_HEIGHT, deviceScaleFactor: 1, mobile: true });
    await page.evaluate(`document.getElementById('strip').scrollIntoView({ block: 'center' })`);
    const m = await page.evaluate(`(() => {
      const box = el => el.getBoundingClientRect();
      const cards = [...document.querySelectorAll('#strip [data-sword]')].map(card => {
        const chip = card.querySelector('.trait-chip');
        if (!chip) return { chip: false, h: box(card).height };
        const withChip = box(card);
        chip.style.display = 'none';
        const without = box(card);
        chip.style.display = '';
        const c = box(chip);
        const svg = box(card.querySelector('svg'));
        return { chip: true, h: withChip.height, same: withChip.width === without.width && withChip.height === without.height,
          inside: c.left >= withChip.left && c.right <= withChip.right && c.top >= withChip.top && c.bottom <= withChip.bottom,
          clearOfSword: c.left >= svg.right - 1, chipOverflow: chip.scrollWidth > chip.clientWidth + 1,
          cardOverflow: card.scrollWidth > card.clientWidth + 1 };
      });
      return { cards, pageScroll: document.documentElement.scrollWidth - window.innerWidth };
    })()`);
    const label = `(f) ${width}px`;
    const chips = m.cards.filter(c => c.chip);
    const detail = JSON.stringify(m);
    check(`${label} strip has trait chips to measure`, chips.length === SINK_SWORDS.filter(s => s.trait).length, detail);
    check(`${label} a chip does not change its card size (out of flow)`, chips.every(c => c.same), detail);
    check(`${label} chip cards are as tall as the card without a trait`, m.cards.every(c => c.h === m.cards[0].h), detail);
    check(`${label} chips stay inside the card and clear of the sword art`, chips.every(c => c.inside && c.clearOfSword), detail);
    check(`${label} no chip / card overflow`, chips.every(c => !c.chipOverflow && !c.cardOverflow), detail);
    check(`${label} no horizontal page scroll`, m.pageScroll <= 0, detail);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
}

/**
 * (h) 기록 탭이 가득 찬 시드: best 17, 수령 완료 업적 5개(그중 가장 긴 칭호를 장착), 수령 가능 업적 4개(succ_2·hunt_2·dlv_2·best_2),
 * 오늘 날짜의 일일 세트(수령 가능 1·수령 완료 1·진행 중 1). 날짜는 실제 시계로 잡아 부팅이 세트를 다시 만들지 않는다
 */
const RECORDS_CLAIMED = ['tries_1', 'succ_1', 'best_1', 'hunt_1', 'dlv_1'];
const RECORDS_READY = ['succ_2', 'hunt_2', 'dlv_2', 'best_2'];
const RECORDS_TITLE_ACH = C.ACHIEVEMENTS.filter(a => RECORDS_CLAIMED.includes(a.id)).sort((a, b) => b.title.length - a.title.length)[0];
function recordsSeedSave() {
  const now = Date.now();
  const st = SV.defaultState(now);
  st.swords = [{ id: 1, lv: 17, prot: C.PROTECT_USES, pity: 0, trait: null }];
  st.nextSwordId = 2;
  st.active = 1;
  st.best = 17;
  st.gold = 5e6;
  st.found = st.found.map((f, l) => f || l <= st.best);
  Object.assign(st.stats, { tries: 150, success: 600, hunts: 1100, delivered: 30 });
  RECORDS_CLAIMED.forEach(id => { st.achievements[id] = C.ACH_CLAIMED; });
  RECORDS_READY.forEach(id => { st.achievements[id] = C.ACH_REACHED; });
  st.title = RECORDS_TITLE_ACH.id;
  st.daily = {
    maxDay: A.dayKey(now, new Date(now).getTimezoneOffset()),
    tasks: [
      { e: 'hunt_s', goal: 10, base: 1000, item: null, claimed: 0 },   // 수령 가능
      { e: 'succ_m', goal: 4, base: 596, item: null, claimed: 1 },     // 수령 완료
      { e: 'dlv_l', goal: 1, base: 30, item: null, claimed: 0 },       // 진행 중
    ],
    bonus: 0,
  };
  return JSON.stringify(st);
}

/** 기록 탭이 열린 상태에서 가로 넘침·카드 가장자리·칭호 배지·탭 점 겹침을 재는 식 */
const RECORDS_MEASURE = `(() => {
  const rect = el => el.getBoundingClientRect();
  const panel = document.querySelector('[data-panel="records"]');
  const pr = rect(panel);
  const items = [...panel.querySelectorAll('.daily-card, .daily-bonus, .ach-track, .ach-row')];
  const outside = items.filter(el => { const r = rect(el); return r.left < pr.left - ${RECORDS_EDGE_PX} || r.right > pr.right + ${RECORDS_EDGE_PX}; })
    .map(el => el.className + ':' + Math.round(rect(el).left) + '..' + Math.round(rect(el).right));
  const badge = document.getElementById('titleBadge');
  const header = document.querySelector('header');
  const headerH = rect(header).height;
  const badgeVisible = !badge.hidden && rect(badge).width > 0 && rect(badge).height > 0;
  const prevDisplay = badge.style.display;
  badge.style.display = 'none';
  const headerHNoBadge = rect(header).height;
  badge.style.display = prevDisplay;
  const tab = document.querySelector('[data-act="tab"][data-id="records"]');
  const dot = tab.querySelector('.dot');
  let dotOverlap = null;
  if (dot) {
    const d = rect(dot);
    const hit = r => r.width > 0 && d.left < r.right && d.right > r.left && d.top < r.bottom && d.bottom > r.top;
    const range = document.createRange();
    const labelHit = [...tab.childNodes].some(n => n.nodeType === 3 && n.textContent.trim() && (range.selectNode(n), [...range.getClientRects()].some(hit)));
    dotOverlap = { icon: hit(rect(tab.querySelector('.ti'))), label: labelHit };
  }
  const last = panel.lastElementChild;
  return {
    panelScroll: panel.scrollWidth, panelClient: panel.clientWidth,
    pageScroll: document.documentElement.scrollWidth - window.innerWidth,
    counts: { daily: panel.querySelectorAll('.daily-card').length, bonus: panel.querySelectorAll('.daily-bonus').length,
      track: panel.querySelectorAll('.ach-track').length, row: panel.querySelectorAll('.ach-row').length,
      claim: panel.querySelectorAll('.claim-btn').length, claimAll: panel.querySelectorAll('.claim-all').length,
      hasDaily: !!document.getElementById('dailySection'), hasAch: !!document.getElementById('achSection') },
    outside, badgeVisible, headerH, headerHNoBadge, badgeText: badge.textContent, dotOverlap,
    panelBottom: pr.bottom, lastBottom: last ? rect(last).bottom : 0,
  };
})()`;

async function recordsLayout(cdp, page) {
  check('(h) index.html loads the populated records save', await openGame(cdp, page, { save: recordsSeedSave(), order: '1' }));
  for (const vp of RECORDS_VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: MOBILE_HEIGHT, deviceScaleFactor: 1, mobile: vp.mobile });
    const shown = (await measurePanel(page, 'records')).shown;
    const m = await page.evaluate(RECORDS_MEASURE);
    const label = `(h) ${vp.width}px records`;
    const detail = JSON.stringify(m);
    check(`${label} panel is shown with daily and achievement sections`, shown && m.counts.hasDaily && m.counts.hasAch, detail);
    check(`${label} has populated cards, rows and claim buttons`,
      m.counts.daily === C.DAILY_TASKS && m.counts.bonus === 1 && m.counts.track > 0 && m.counts.row > 0 && m.counts.claim > 0 && m.counts.claimAll > 0, detail);
    check(`${label} panel has no horizontal overflow (scrollWidth <= clientWidth)`, m.panelScroll <= m.panelClient + RECORDS_EDGE_PX, detail);
    check(`${label} no horizontal page scroll`, m.pageScroll <= 0, detail);
    check(`${label} daily cards, bonus, achievement tracks and rows stay within the panel edges`, m.outside.length === 0, detail);
    check(`${label} title badge is visible with the long title`, m.badgeVisible && m.badgeText.includes(RECORDS_TITLE_ACH.title), detail);
    check(`${label} title badge does not make the header taller`, m.headerH <= m.headerHNoBadge + RECORDS_EDGE_PX, detail);
    check(`${label} records tab dot exists and overlaps neither icon nor label`, !!m.dotOverlap && !m.dotOverlap.icon && !m.dotOverlap.label, detail);
    check(`${label} panel bottom is not above its last child`, m.panelBottom + PANEL_TOLERANCE_PX >= m.lastBottom, detail);
  }
  await cdp.send('Emulation.clearDeviceMetricsOverride');
  await panelsContainContent(cdp, page, '(h)');
}

/** (i) 시간 이벤트가 켜진 헤더·팝오버 배치 측정(페이지 안에서 평가) */
const EVENT_MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const rect = el => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const visible = el => !el.hidden && el.offsetWidth > 0 && el.offsetHeight > 0;
  const header = document.querySelector('header');
  const kids = [...header.querySelectorAll(':scope > *, .event-chip, .resbar, .settings-wrap')].filter(visible);
  const outside = kids.filter(el => { const r = el.getBoundingClientRect(); return r.left < -${EVENT_EDGE_PX} || r.right > vw + ${EVENT_EDGE_PX}; })
    .map(el => (el.id || el.className) + ':' + Math.round(el.getBoundingClientRect().left) + '..' + Math.round(el.getBoundingClientRect().right));
  const chip = document.getElementById('eventChip');
  const name = chip.querySelector('.ev-name');
  const clock = chip.querySelector('.ev-clock');
  const pop = document.getElementById('eventPop');
  // 겹침 검사 대상: 헤더의 보이는 항목(display:contents 묶음은 그 자식). 위에 떠서 여는 팝오버와 빈 spacer는 제외
  const items = [...header.children].flatMap(el => getComputedStyle(el).display === 'contents' ? [...el.children] : [el])
    .filter(el => visible(el) && !el.classList.contains('popover') && !el.classList.contains('spacer'));
  // 항목 상자 = 자신 + 흐름 배치된 보이는 자손의 합집합: 줄어든 묶음 밖으로 넘친 칩(nowrap)도 겹침으로 잡는다. 위에 뜨는(absolute·fixed) 연출은 제외
  const box = el => [el, ...el.querySelectorAll('*')]
    .filter(d => d === el || (d.offsetWidth > 0 && !d.closest('.popover') && !['absolute', 'fixed'].includes(getComputedStyle(d).position)))
    .map(d => d.getBoundingClientRect())
    .reduce((u, r) => ({ left: Math.min(u.left, r.left), right: Math.max(u.right, r.right), top: Math.min(u.top, r.top), bottom: Math.max(u.bottom, r.bottom) }));
  const overlaps = [];
  items.forEach((a, i) => items.slice(i + 1).forEach(b => {
    const p = box(a), q = box(b);
    const ix = Math.min(p.right, q.right) - Math.max(p.left, q.left), iy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
    if (ix > ${EVENT_EDGE_PX} && iy > ${EVENT_EDGE_PX}) overlaps.push((a.id || a.className) + '/' + (b.id || b.className) + ':' + ix.toFixed(1) + 'px');
  }));
  return {
    overlaps, monumentVisible: visible(document.getElementById('monumentBadge')),
    vw, docScroll: document.documentElement.scrollWidth, docClient: vw, bodyScroll: document.body.scrollWidth, outside,
    wrapHidden: document.getElementById('eventWrap').hidden, chipVisible: visible(chip),
    chipText: chip.textContent, clockText: clock ? clock.textContent : '',
    nameVisible: !!name && getComputedStyle(name).display !== 'none' && name.offsetWidth > 1,   // <=520 is visually hidden (1px clip), not display:none
    popOpen: !pop.hidden, pop: visible(pop) ? rect(pop) : null, chip: visible(chip) ? rect(chip) : null,
    badgeVisible: visible(document.getElementById('saveBadge')), headerH: header.getBoundingClientRect().height,
  };
})()`;
const popInside = m => !!m.pop && m.pop.l >= -EVENT_EDGE_PX && m.pop.r <= m.vw + EVENT_EDGE_PX && m.pop.w > 0;
const CLOCK_PATTERN = /^\d:\d\d$/;
const centerOf = sel => `(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;
const setViewport = (cdp, vp) => cdp.send('Emulation.setDeviceMetricsOverride',
  { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.width <= EVENT_MOBILE_MAX });

/** 한 뷰포트에서 칩·헤더·팝오버(열기, 바깥 클릭 닫기, 탭 전환 닫기)를 검사한다 */
async function eventLayoutAt(cdp, page, vp, label) {
  await setViewport(cdp, vp);
  const shown = await page.waitFor(`(() => { const c = document.getElementById('eventChip'); return !c.hidden && c.offsetWidth > 0; })()`);
  const m = await page.evaluate(EVENT_MEASURE);
  const detail = JSON.stringify(m);
  check(`${label} event chip is visible`, shown && m.chipVisible, detail);
  check(`${label} chip shows an m:ss clock`, CLOCK_PATTERN.test(m.clockText), detail);
  check(`${label} event name text is ${vp.width <= EVENT_NAME_HIDE_MAX ? 'hidden' : 'visible'}`,
    m.nameVisible === (vp.width > EVENT_NAME_HIDE_MAX), detail);
  check(`${label} no horizontal overflow (document scrollWidth <= clientWidth)`,
    m.docScroll <= m.docClient + EVENT_EDGE_PX && m.bodyScroll <= m.docClient + EVENT_EDGE_PX, detail);
  check(`${label} header items stay within the viewport`, m.outside.length === 0, detail);
  check(`${label} header items do not overlap each other`, m.overlaps.length === 0, detail);

  await page.click(await page.evaluate(centerOf('#eventChip')));
  const opened = await page.waitFor(`!document.getElementById('eventPop').hidden && document.getElementById('eventPop').offsetWidth > 0`);
  const o = await page.evaluate(EVENT_MEASURE);
  check(`${label} clicking the chip opens the popover inside the viewport`, opened && popInside(o), JSON.stringify(o));
  check(`${label} open popover causes no horizontal overflow`, o.docScroll <= o.docClient + EVENT_EDGE_PX && o.outside.length === 0, JSON.stringify(o));

  await page.click({ x: 2, y: vp.height - 2 });   // 헤더·팝오버 밖(왼쪽 아래 모서리)
  check(`${label} outside click closes the popover`, await page.waitFor(`document.getElementById('eventPop').hidden`));

  await page.click(await page.evaluate(centerOf('#eventChip')));
  check(`${label} popover reopens`, await page.waitFor(`!document.getElementById('eventPop').hidden`));
  await page.click(await page.evaluate(centerOf('[data-act="tab"][data-id="forge"]')));
  check(`${label} tab switch closes the popover`, await page.waitFor(`document.getElementById('eventPop').hidden`));
  await page.click(await page.evaluate(centerOf('[data-act="tab"][data-id="shop"]')));
}

/** (i) 스트레스 저장으로 줄바꿈하지 않는 헤더 폭을 1px씩 훑어 항목 겹침·가로 넘침이 없는지 본다 */
async function stressSweep(cdp, page) {
  const bad = [];
  const report = [];
  for (let w = EVENT_SWEEP_MIN; w <= EVENT_SWEEP_MAX; w++) {
    await setViewport(cdp, { width: w, height: 800 });
    const m = await page.evaluate(EVENT_MEASURE);
    const overflow = Math.max(m.docScroll, m.bodyScroll) - m.docClient;
    if (m.overlaps.length || overflow > EVENT_EDGE_PX || m.outside.length) bad.push(`${w}: overflow ${overflow} ${m.overlaps.concat(m.outside).join(' ')}`);
    if (EVENT_REPORT_WIDTHS.includes(w)) report.push(`${w}px overlaps=[${m.overlaps.join(' ')}] overflow=${overflow} headerH=${Math.round(m.headerH)}`);
  }
  console.log('      (i) stress sweep: ' + report.join(' | '));
  check(`(i) stress ${EVENT_SWEEP_MIN}..${EVENT_SWEEP_MAX}px: no header overlap and no horizontal overflow`, bad.length === 0, bad.slice(0, 10).join('\n      '));
}

/** (i) 시간 이벤트 칩·팝오버 배치(index.html 시드 저장, test.html 조작판), 360px 스트레스, 종료 후 칩 숨김 */
async function eventChipLayout(cdp, page) {
  const seed = JSON.parse(seedSave());
  seed.best = Math.max(seed.best, C.EVENT_UNLOCK_BEST);
  seed.events.active = { id: EVENT_TEST_ID, remainMs: EVENT_SEED_REMAIN_MS };
  check('(i) index.html loads with an active event', await openGame(cdp, page, { save: JSON.stringify(seed) }));
  for (const vp of EVENT_VIEWPORTS) await eventLayoutAt(cdp, page, vp, `(i) index.html ${vp.width}x${vp.height}`);

  // 스트레스: 저장 실패 배지 + 큰 골드 + 기념비 배지 + 이벤트 칩 (저장 실패는 setItem이 던지게 해 실제 경로로 만든다)
  const stress = JSON.parse(sinkSeedSave());
  stress.events.active = { id: EVENT_TEST_ID, remainMs: EVENT_SEED_REMAIN_MS };
  stress.gold = EVENT_STRESS_GOLD;
  check('(i) stress save loads', await openGame(cdp, page, { save: JSON.stringify(stress), order: SINK_SWORDS.map(s => s.id).join() }));
  await page.evaluate(`Storage.prototype.setItem = function () { throw new Error('quota'); }; true`);
  check('(i) stress: save-failed badge becomes visible', await page.waitFor(`!document.getElementById('saveBadge').hidden`, 15000));
  for (const vp of EVENT_STRESS_VIEWPORTS) {
    await eventLayoutAt(cdp, page, vp, `(i) stress ${vp.width}x${vp.height}`);
    const sm = await page.evaluate(EVENT_MEASURE);
    check(`(i) stress ${vp.width}: save and monument badges and event chip visible together`,
      sm.badgeVisible && sm.monumentVisible && sm.chipVisible, JSON.stringify(sm));
  }
  await stressSweep(cdp, page);

  // test.html: 조작판으로 이벤트를 켜고 같은 검사 후, 종료 경로로 칩이 사라지는지 확인
  const testSave = JSON.parse(seedSave());
  testSave.best = Math.max(testSave.best, C.EVENT_UNLOCK_BEST);
  check('(i) test.html loads', await openGame(cdp, page, { save: JSON.stringify(testSave), page: 'test.html', key: JSON.stringify('sword-enhance-test') }));
  await page.evaluate(`document.getElementById('testEventId').value = ${JSON.stringify(EVENT_TEST_ID)}; document.querySelector('[data-act="testSetEvent"]').click(); true`);
  for (const vp of EVENT_VIEWPORTS) await eventLayoutAt(cdp, page, vp, `(i) test.html ${vp.width}x${vp.height}`);

  await setViewport(cdp, { width: 360, height: 640 });
  await page.click(await page.evaluate(centerOf('#eventChip')));
  check('(i) test.html popover is open before ending the event', await page.waitFor(`!document.getElementById('eventPop').hidden`));
  await page.evaluate(`document.querySelector('[data-act="testEndEvent"]').click(); true`);
  check('(i) chip is hidden after the event ends',
    await page.waitFor(`document.getElementById('eventChip').hidden && document.getElementById('eventWrap').hidden`, 8000), JSON.stringify(await page.evaluate(EVENT_MEASURE)));
  check('(i) popover is closed after the event ends', await page.evaluate(`document.getElementById('eventPop').hidden`));
  await cdp.send('Emulation.clearDeviceMetricsOverride');
}

/**
 * (j) 환생 섹션(기록 탭 맨 위)과 확인 창(8-B). 상태 5가지: 잠김 / 열림(+MAX 검·골드·미수령 업적) / 환생 1회 이상 /
 * 환생 1회 이상이지만 +MAX 검 없음(버튼 비활성) / 큰 숫자 스트레스. 360·375·721·1280 폭에서 가로 넘침, 섹션 항목 겹침(V4), 창 위치, 닫기를 본다
 */
const REBIRTH_VIEWPORTS = [{ width: 360, height: 640 }, { width: 375, height: 667 }, { width: 721, height: 800 }, { width: 1280, height: 800 }];
const REBIRTH_EDGE_PX = 1;
const REBIRTH_BIG_COUNT = 999999;
const REBIRTH_BIG_FAME = 999999999;
const REBIRTH_GOLD = 5e7;
const REBIRTH_STRESS_GOLD = 9e15;
const REBIRTH_MIRROR_KEY = JSON.stringify(C.SAVE_KEY + '-rebirth');
/** 상태 이름 → 시드 저장 */
function rebirthSeed(kind) {
  const st = SV.defaultState(Date.now());
  const hasMax = kind !== 'locked' && kind !== 'noSword';
  st.swords = [{ id: 1, lv: hasMax ? C.MAX : 5, prot: C.PROTECT_USES, pity: 0, trait: null }];
  st.nextSwordId = 2;
  st.active = 1;
  st.best = hasMax ? C.MAX : (kind === 'locked' ? 5 : 0);
  st.gold = kind === 'stress' ? REBIRTH_STRESS_GOLD : REBIRTH_GOLD;
  st.found = st.found.map((f, l) => f || l <= st.best);
  if (hasMax) RECORDS_READY.forEach(id => { st.achievements[id] = C.ACH_REACHED; });   // 확인 창의 미수령 경고(가장 긴 창)
  if (kind === 'counted' || kind === 'noSword') {
    st.rebirth.count = 3;
    st.rebirth.fame = 12;
    st.rebirth.up = Object.assign({}, st.rebirth.up, { income: 1, startGold: 1 });
  }
  if (kind === 'stress') {
    st.rebirth.count = REBIRTH_BIG_COUNT;
    st.rebirth.fame = REBIRTH_BIG_FAME;
    st.rebirth.up = C.FAME_TRACKS.reduce((o, k) => { o[k] = C.FAME_SHOP[k].costs.length; return o; }, {});
  }
  return JSON.stringify(st);
}
// canModal: 환생 버튼이 열려 있어 확인 창을 열 수 있다
const REBIRTH_STATES = [
  { kind: 'locked', unlocked: false, canModal: false },
  { kind: 'open', unlocked: true, canModal: true },
  { kind: 'counted', unlocked: true, canModal: true },
  { kind: 'noSword', unlocked: true, canModal: false },
  { kind: 'stress', unlocked: true, canModal: true },
];

/** 환생 섹션 배치 측정(페이지 안에서 평가) */
const REBIRTH_MEASURE = `(() => {
  const rect = el => el.getBoundingClientRect();
  const visible = el => !!el && !el.hidden && el.offsetWidth > 0 && el.offsetHeight > 0;
  const panel = document.querySelector('[data-panel="records"]');
  const sec = document.getElementById('rebirthSection');
  const pr = rect(panel);
  const secKids = [...sec.querySelectorAll('*')].filter(visible);
  const outside = secKids.filter(el => { const r = rect(el); return r.left < pr.left - ${REBIRTH_EDGE_PX} || r.right > pr.right + ${REBIRTH_EDGE_PX}; })
    .map(el => (el.className || el.tagName) + ':' + Math.round(rect(el).left) + '..' + Math.round(rect(el).right));
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > ${REBIRTH_EDGE_PX} && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > ${REBIRTH_EDGE_PX};
  // 형제 항목끼리 겹침: 머리의 자식, 명성 상점 행의 글씨·버튼, 환생 줄의 버튼·안내, 상점 행끼리
  const groups = [...sec.querySelectorAll('.sec-head, .fame-row, .rebirth-act')].map(g => [...g.children].filter(visible));
  groups.push([...sec.querySelectorAll('.fame-row')].filter(visible));
  const overlaps = [];
  groups.forEach(g => g.forEach((a, i) => g.slice(i + 1).forEach(b => {
    if (hit(rect(a), rect(b))) overlaps.push((a.className || a.tagName) + '/' + (b.className || b.tagName));
  })));
  const act = sec.querySelector('[data-act="askRebirth"]');
  const rows = [...sec.querySelectorAll('.fame-row')];
  const daily = document.getElementById('dailySection');
  return {
    unlocked: !sec.querySelector('.rebirth-locked'), lockedNote: !!sec.querySelector('.rebirth-locked'),
    has: { head: !!sec.querySelector('.sec-head'), count: !!sec.querySelector('.rebirth-count'), balance: !!sec.querySelector('.fame-balance'),
      shop: !!sec.querySelector('.fame-shop'), rows: rows.length, tracks: rows.map(r => r.dataset.track).join(), act: !!sec.querySelector('.rebirth-act'),
      btn: !!act, note: !!sec.querySelector('.rebirth-note') },
    btnDisabled: act ? act.disabled : null, reason: !!sec.querySelector('.rebirth-reason'),
    countText: (sec.querySelector('.rebirth-count') || {}).textContent, balanceText: (sec.querySelector('.fame-balance') || {}).textContent,
    secInPanel: rect(sec).left >= pr.left - ${REBIRTH_EDGE_PX} && rect(sec).right <= pr.right + ${REBIRTH_EDGE_PX},
    secBeforeDaily: !daily || !!(sec.compareDocumentPosition(daily) & Node.DOCUMENT_POSITION_FOLLOWING),
    outside, overlaps, panelScroll: panel.scrollWidth, panelClient: panel.clientWidth,
    docScroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), docClient: document.documentElement.clientWidth,
    panelBottom: pr.bottom, lastBottom: panel.lastElementChild ? rect(panel.lastElementChild).bottom : 0,
  };
})()`;

/** 열린 확인 창: 창이 화면 안(안에서 스크롤 허용)·가로 넘침 없음·내용 겹침 없음, 마지막 줄의 버튼이 스크롤로 닿는지 */
const REBIRTH_MODAL_MEASURE = `(() => {
  const rect = el => el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const modal = document.getElementById('modal');
  const sheet = modal.querySelector('.rebirth-sheet');
  if (!sheet) return { sheet: false };
  const sr = rect(sheet);
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > ${REBIRTH_EDGE_PX} && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > ${REBIRTH_EDGE_PX};
  const kids = [...sheet.querySelectorAll('h3, h4, p, dl > div, .rb-btns > *')].filter(el => el.offsetWidth > 0);
  const overlaps = [];
  kids.forEach((a, i) => kids.slice(i + 1).forEach(b => { if (hit(rect(a), rect(b))) overlaps.push((a.className || a.tagName) + '/' + (b.className || b.tagName)); }));
  [...sheet.querySelectorAll('dl > div')].map(d => [...d.children].filter(c => c.offsetWidth > 0))
    .forEach(pair => { if (pair.length === 2 && hit(rect(pair[0]), rect(pair[1]))) overlaps.push('dt/dd:' + pair[0].textContent); });
  const scrolls = sheet.scrollHeight > sheet.clientHeight + ${REBIRTH_EDGE_PX};
  const oy = getComputedStyle(sheet).overflowY;
  sheet.scrollTop = sheet.scrollHeight;
  const btns = [...sheet.querySelectorAll('.rb-btns button')].map(b => rect(b));
  const btnsReachable = btns.length === 2 && btns.every(r => r.top >= -${REBIRTH_EDGE_PX} && r.bottom <= vh + ${REBIRTH_EDGE_PX} && r.left >= -${REBIRTH_EDGE_PX} && r.right <= vw + ${REBIRTH_EDGE_PX});
  sheet.scrollTop = 0;
  const overflowX = [...sheet.querySelectorAll('*')].filter(el => el.offsetWidth > 0 && (rect(el).left < sr.left - ${REBIRTH_EDGE_PX} || rect(el).right > sr.right + ${REBIRTH_EDGE_PX}))
    .map(el => (el.className || el.tagName) + ':' + Math.round(rect(el).left) + '..' + Math.round(rect(el).right));
  return {
    sheet: true, kind: modal.dataset.kind, vw, vh, sr: { l: sr.left, r: sr.right, t: sr.top, b: sr.bottom },
    inside: sr.left >= -${REBIRTH_EDGE_PX} && sr.right <= vw + ${REBIRTH_EDGE_PX} && sr.top >= -${REBIRTH_EDGE_PX} && sr.bottom <= vh + ${REBIRTH_EDGE_PX},
    scrolls, oy, btnsReachable, overlaps, overflowX, sheetScrollX: sheet.scrollWidth - sheet.clientWidth,
    docScroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), docClient: vw,
    hasParts: ['.rb-list', '.rb-gold', '.rb-lost', '.rb-btns'].every(s => !!sheet.querySelector(s)), warn: !!sheet.querySelector('.rb-warn'),
  };
})()`;

const MODAL_HIDDEN = `document.getElementById('modal').hidden`;
const pressEscape = async cdp => {
  for (const type of ['keyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
};

async function openRebirthModal(page) {
  await page.evaluate(`document.querySelector('[data-act="askRebirth"]').scrollIntoView({ block: 'center' }); true`);
  await page.click(await page.evaluate(centerOf('[data-act="askRebirth"]')));
  return page.waitFor(`!${MODAL_HIDDEN} && document.getElementById('modal').dataset.kind === 'rebirth' && document.querySelector('#modal .rebirth-sheet')`);
}

async function rebirthModalAt(cdp, page, label) {
  check(`${label} clicking [환생] opens the confirm modal`, await openRebirthModal(page));
  const m = await page.evaluate(REBIRTH_MODAL_MEASURE);
  const detail = JSON.stringify(m);
  check(`${label} modal has kind rebirth with list, gold, lost and buttons`, m.sheet && m.kind === 'rebirth' && m.hasParts, detail);
  check(`${label} modal sheet is fully inside the viewport (scrolls inside if tall)`, m.inside && (!m.scrolls || m.oy === 'auto' || m.oy === 'scroll'), detail);
  check(`${label} modal buttons are reachable inside the viewport`, m.btnsReachable, detail);
  check(`${label} modal has no horizontal overflow (document, sheet, children)`,
    m.docScroll <= m.docClient + REBIRTH_EDGE_PX && m.sheetScrollX <= REBIRTH_EDGE_PX && m.overflowX.length === 0, detail);
  check(`${label} modal items do not overlap each other`, m.overlaps.length === 0, detail);

  await page.click({ x: 2, y: 2 });   // 창 밖(어두운 배경) 모서리
  check(`${label} outside click on #modal closes it`, await page.waitFor(MODAL_HIDDEN), detail);
  check(`${label} modal opens again`, await openRebirthModal(page));
  await page.click(await page.evaluate(centerOf('#modal .rebirth-sheet h3')));   // 창 안쪽 클릭은 닫지 않는다
  check(`${label} click inside the sheet keeps it open`, await page.evaluate(`!${MODAL_HIDDEN}`));
  await pressEscape(cdp);
  check(`${label} Esc closes the modal`, await page.waitFor(MODAL_HIDDEN, 2000), detail);
}

async function rebirthLayoutAt(cdp, page, st, vp) {
  const label = `(j) ${st.kind} ${vp.width}x${vp.height}`;
  await setViewport(cdp, vp);
  const shown = (await measurePanel(page, 'records')).shown;
  const m = await page.evaluate(REBIRTH_MEASURE);
  const detail = JSON.stringify(m);
  const e = await page.evaluate(EVENT_MEASURE);
  check(`${label} records panel is shown`, shown, detail);
  check(`${label} rebirth section is ${st.unlocked ? 'unlocked' : 'locked (one-line note)'}`, m.unlocked === st.unlocked && m.lockedNote === !st.unlocked, detail);
  check(`${label} no horizontal overflow (document, panel)`, m.docScroll <= m.docClient + REBIRTH_EDGE_PX && m.panelScroll <= m.panelClient + REBIRTH_EDGE_PX, detail);
  check(`${label} section elements stay inside the panel`, m.secInPanel && m.outside.length === 0, detail);
  check(`${label} section items do not overlap each other`, m.overlaps.length === 0, detail);
  check(`${label} header items stay inside the viewport and do not overlap`, e.outside.length === 0 && e.overlaps.length === 0, JSON.stringify(e));
  check(`${label} rebirth section comes before the daily section`, m.secBeforeDaily, detail);
  check(`${label} panel bottom is not above its last child`, m.panelBottom + PANEL_TOLERANCE_PX >= m.lastBottom, detail);
  if (!st.unlocked) return;
  const h = m.has;
  check(`${label} section has head, count, fame balance, shop rows (${C.FAME_TRACKS.length}), action row`,
    h.head && h.count && h.balance && h.shop && h.rows === C.FAME_TRACKS.length && h.tracks === C.FAME_TRACKS.join() && h.act && h.btn && h.note, detail);
  check(`${label} rebirth button is ${st.canModal ? 'enabled' : 'disabled with a reason'}`,
    st.canModal ? m.btnDisabled === false && !m.reason : m.btnDisabled === true && m.reason, detail);
  if (st.kind === 'stress') check(`${label} big count and fame text are shown`, /999,?999/.test(m.countText) && m.balanceText.length > 0, detail);
  if (st.canModal) await rebirthModalAt(cdp, page, label);
}

const TAB_SHIFT_MODIFIER = 8;   // CDP Input 수정키 비트: Shift
const pressTab = async (cdp, shift) => {
  const base = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: shift ? TAB_SHIFT_MODIFIER : 0 };
  for (const type of ['rawKeyDown', 'keyUp']) await cdp.send('Input.dispatchKeyEvent', Object.assign({ type }, base));
};
/** 포커스 위치와 창 밖 inert 여부(페이지 안에서 평가) */
const MODAL_FOCUS_STATE = `(() => {
  const a = document.activeElement;
  const sheet = document.querySelector('#modal .rebirth-sheet');
  return { act: a && a.dataset ? a.dataset.act || a.tagName : null, inSheet: !!sheet && sheet.contains(a),
    headerInert: document.querySelector('header').inert, mainInert: document.querySelector('main').inert, hidden: document.getElementById('modal').hidden };
})()`;

/**
 * (k) 환생 확인 창의 포커스 가두기(V1, 1280x800): 창 밖(header·main)은 inert, Tab은 창 안 버튼(취소↔확인)에서만 돌고,
 * 마지막 버튼에서 Tab·처음 버튼에서 Shift+Tab해도 창 밖으로 나가지 않는다. Esc로 닫으면 inert가 풀리고 [환생]으로 포커스가 돌아온다
 */
async function rebirthModalFocusTrap(cdp, page) {
  check('(k) index.html loads the open rebirth save', await openGame(cdp, page, { save: rebirthSeed('open'), order: '1' }));
  await setViewport(cdp, { width: 1280, height: 800 });
  await measurePanel(page, 'records');
  check('(k) clicking [환생] opens the confirm modal', await openRebirthModal(page));
  let f = await page.evaluate(MODAL_FOCUS_STATE);
  check('(k) focus starts on the cancel button and the page outside the modal is inert',
    f.act === 'cancelRebirth' && f.inSheet && f.headerInert === true && f.mainInert === true, JSON.stringify(f));
  await pressTab(cdp, false);
  f = await page.evaluate(MODAL_FOCUS_STATE);
  check('(k) Tab moves to the confirm button inside the sheet', f.act === 'rebirth' && f.inSheet, JSON.stringify(f));
  await pressTab(cdp, false);
  f = await page.evaluate(MODAL_FOCUS_STATE);
  check('(k) Tab from the last modal button stays inside the sheet (wraps to cancel)', f.act === 'cancelRebirth' && f.inSheet, JSON.stringify(f));
  await pressTab(cdp, true);
  f = await page.evaluate(MODAL_FOCUS_STATE);
  check('(k) Shift+Tab from the first modal button stays inside the sheet (wraps to confirm)', f.act === 'rebirth' && f.inSheet, JSON.stringify(f));
  await pressEscape(cdp);
  await page.waitFor(MODAL_HIDDEN, 2000);
  f = await page.evaluate(MODAL_FOCUS_STATE);
  check('(k) Esc closes the modal, clears inert and returns focus to [환생]',
    f.hidden && f.headerInert === false && f.mainInert === false && f.act === 'askRebirth', JSON.stringify(f));
  await page.evaluate(`localStorage.removeItem(${REBIRTH_MIRROR_KEY}); true`);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
}

async function rebirthLayout(cdp, page) {
  for (const st of REBIRTH_STATES) {
    check(`(j) index.html loads the ${st.kind} rebirth save`, await openGame(cdp, page, { save: rebirthSeed(st.kind), order: '1' }));
    for (const vp of REBIRTH_VIEWPORTS) await rebirthLayoutAt(cdp, page, st, vp);
  }
  // 환생 미러 키는 횟수가 큰 쪽이 이기므로 뒤 시나리오에 새어 들어가지 않게 지운다
  await page.evaluate(`localStorage.removeItem(${REBIRTH_MIRROR_KEY}); true`);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
}

/** (g) 테스트 페이지(test.html)도 같은 후반 시드로 오류 없이 열리고 특성 지정 조작판이 채워진다 */
async function testPageLoads(cdp, page) {
  const order = SINK_SWORDS.map(s => s.id).join();
  const loaded = await openGame(cdp, page, { save: sinkSeedSave(), page: 'test.html', key: JSON.stringify('sword-enhance-test'), order });
  check('(g) test.html loads with the seeded save', loaded);
  const options = await page.evaluate(`[document.querySelectorAll('#testTraitKind option').length, document.querySelectorAll('#testTraitTier option').length]`);
  check('(g) test panel trait selectors are filled', options[0] === C.TRAIT_KINDS.length && options[1] === C.TRAIT_TIER_MAX, JSON.stringify(options));
}

// ------------------------------------------------------------ 실행
async function main() {
  const exe = findBrowser();
  if (!exe) { console.log('SKIP: no Chrome/Edge'); return; }
  console.log('browser: ' + exe);
  let browser = null;
  let cdp = null;
  try {
    browser = await launchBrowser(exe);
    cdp = await openPage(browser);
    const page = pageApi(cdp);
    const pageErrors = [];
    cdp.on('Runtime.exceptionThrown', p => pageErrors.push(p.exceptionDetails.exception
      ? p.exceptionDetails.exception.description : p.exceptionDetails.text));
    cdp.on('Runtime.consoleAPICalled', p => {
      if (p.type === 'error') pageErrors.push('console.error: ' + p.args.map(a => a.value !== undefined ? a.value : a.description).join(' '));
    });
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    check('index.html loads with the seeded 3-sword save', await openGame(cdp, page), await page.evaluate(JS.domOrder));
    await clickActivates(page);
    await dragReorders(cdp, page);
    await releaseOutside(page);
    await panelsContainContent(cdp, page);
    await sinkPanelsContainContent(cdp, page);
    await mobileTraitChips(cdp, page);
    await recordsLayout(cdp, page);
    await eventChipLayout(cdp, page);
    await rebirthLayout(cdp, page);
    await rebirthModalFocusTrap(cdp, page);
    await testPageLoads(cdp, page);
    check('(g) no uncaught page errors or console errors (index.html, test.html)', pageErrors.length === 0, pageErrors.join('\n      '));
  } catch (e) {
    check('browser run completed', false, e.stack || e.message);
    browser = browser || e.browser || null;
  } finally {
    if (cdp) cdp.close();
    if (browser) await closeBrowser(browser);
  }
  console.log(`\n${results.pass} passed, ${results.fail} failed`);
  process.exitCode = results.fail ? 1 : 0;
}

main().catch(e => { console.error('browser-strip FAILED:', e.stack || e.message); process.exit(1); });
