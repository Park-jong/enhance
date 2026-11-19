/* 실제 브라우저 회귀 테스트: 헤드리스 Chrome/Edge를 CDP(WebSocket)로 조종해 보관함 칸의 실제 마우스 입력을 확인한다.
 * DOM 스텁(smoke-dom)으로는 잡히지 않는 click 대상·pointer capture 상호작용(V3)을 지킨다.
 *  (a) 활성 아닌 카드를 한 번 클릭하면 활성 검이 된다
 *  (b) 임계값을 넘겨 끌면 칸이 옮겨지고 순서가 localStorage에 저장된다(새로고침 후에도 유지)
 *  (c) 끌다가 스트립 밖에서 놓아도 드래그 상태가 남지 않고, 다음 클릭이 활성 전환을 한다
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
  st.best = SWORD_IDS.length;
  return JSON.stringify(st);
}

/** 시드 저장을 게임 스크립트보다 먼저 넣고 index.html을 연다. 시드 스크립트는 첫 로드 뒤 지워 새로고침에는 쓰지 않는다 */
async function openGame(cdp, page) {
  const source = `localStorage.setItem(${KEY}, ${JSON.stringify(seedSave())});`;
  const { identifier } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source });
  await cdp.send('Page.navigate', { url: pathToFileURL(path.join(ROOT, 'index.html')).href });
  const loaded = await page.waitFor(`document.readyState === 'complete' && ${JS.domOrder} === '${SWORD_IDS.join()}'`);
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
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    check('index.html loads with the seeded 3-sword save', await openGame(cdp, page), await page.evaluate(JS.domOrder));
    await clickActivates(page);
    await dragReorders(cdp, page);
    await releaseOutside(page);
    check('no uncaught page errors', pageErrors.length === 0, pageErrors.join('\n      '));
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
