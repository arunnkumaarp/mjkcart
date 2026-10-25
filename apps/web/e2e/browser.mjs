// A small driver for headless Chrome over the DevTools Protocol, so the end-to-end tests need no extra packages.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const WEB = process.env.WEB_URL ?? 'http://localhost:4200';
export const API = process.env.API_URL ?? 'http://localhost:8001';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  const port = 9400 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'mjk-e2e-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, '--window-size=1280,900', 'about:blank',
  ], { stdio: 'ignore' });

  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => undefined);
  }
  if (!targets) throw new Error(`Chrome didn't start. Set CHROME to its path (now ${CHROME}).`);
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Page.enable');
  await send('DOM.enable');
  return new Page(send, async () => {
    ws.close();
    // Wait for Chrome to exit before removing its profile; it writes to it until then.
    const exited = new Promise((r) => chrome.once('exit', r));
    chrome.kill();
    await Promise.race([exited, sleep(5000)]);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
}

class Page {
  constructor(send, close) {
    this.send = send;
    this.close = close;
  }

  /** Runs JavaScript in the page and returns its (JSON) value; a thrown error fails the test. */
  async eval(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(`In the page: ${exceptionDetails.exception?.description ?? exceptionDetails.text}\n${expression}`);
    return result.value;
  }

  /** Waits until the expression is truthy and returns its value. */
  async waitFor(expression, what = expression, timeout = 10000) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      last = await this.eval(expression).catch((e) => e);
      if (last && !(last instanceof Error)) return last;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for ${what}${last instanceof Error ? ` (${last.message})` : ''}\nPage: ${await this.text('body').catch(() => '?')}`.slice(0, 1500));
  }

  async goto(path) {
    await this.send('Page.navigate', { url: WEB + path });
    await this.waitFor(`document.readyState === 'complete' && !!document.querySelector('app-root')?.children.length`, `${path} to load`);
  }

  path() {
    return this.eval('location.pathname');
  }

  /** Waits until the address is this path, e.g. after a redirect. */
  waitForPath(path) {
    return this.waitFor(`location.pathname === ${JSON.stringify(path)}`, `the address to become ${path}`);
  }

  /** The visible text inside a selector, with whitespace squashed. */
  async text(selector) {
    const t = await this.eval(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`);
    return t.replace(/\s+/g, ' ').trim();
  }

  waitForText(selector, text) {
    return this.waitFor(
      `(document.querySelector(${JSON.stringify(selector)})?.innerText ?? '').replace(/\\s+/g, ' ').includes(${JSON.stringify(text)})`,
      `"${text}" in ${selector}`,
    );
  }

  exists(selector) {
    return this.eval(`!!document.querySelector(${JSON.stringify(selector)})`);
  }

  /** Waits for an element to be on the page. */
  async present(selector) {
    await this.waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, selector);
  }

  /** Types into an input the way Angular hears it: value, then an input event. */
  async type(selector, value) {
    await this.present(selector);
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('No field ' + ${JSON.stringify(selector)});
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  }

  /** Picks the option whose text contains the label. */
  async choose(selector, label) {
    await this.present(selector);
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const o = [...el.options].find((o) => o.textContent.includes(${JSON.stringify(label)}));
      if (!o) throw new Error('No option ' + ${JSON.stringify(label)});
      el.value = o.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  }

  async click(selector) {
    await this.present(selector);
    return this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('Nothing to click at ' + ${JSON.stringify(selector)});
      el.click();
    })()`);
  }

  /**
   * Clicks the button or link whose text starts with this, inside the first element matching `within`
   * that contains `near` (e.g. the order card with that order number). Waits for it to appear.
   */
  async press(text, { within = 'body', near = '' } = {}) {
    const find = `(() => {
      const scope = [...document.querySelectorAll(${JSON.stringify(within)})].find((s) => s.innerText.includes(${JSON.stringify(near)}));
      return scope && [...scope.querySelectorAll('button, a')].find((b) => !b.disabled && b.innerText.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(text)}));
    })()`;
    await this.waitFor(`!!${find}`, `a "${text}" button${near ? ` near "${near}"` : ''}`);
    await this.eval(`${find}.click()`);
  }

  /** Logs in by putting this account's tokens where the app keeps them, then opens the path. */
  async session(account, path) {
    await this.goto('/');
    await this.eval(`localStorage.setItem('mjk.access', ${JSON.stringify(JSON.stringify(account.access))});
      localStorage.setItem('mjk.refresh', ${JSON.stringify(JSON.stringify(account.refresh))});
      localStorage.setItem('mjk.user', ${JSON.stringify(JSON.stringify(account.user))});`);
    await this.goto(path);
  }

  async loggedOut(path = '/') {
    await this.goto('/');
    await this.eval('localStorage.clear()');
    await this.goto(path);
  }

  /** Logs in through the login form, the way a person does. */
  async login(username, password) {
    await this.loggedOut('/');
    await this.waitFor(`!!document.querySelector('#login-username')`, 'the login form');
    await this.type('#login-username', username);
    await this.type('#login-password', password);
    await this.click('form button[type=submit]');
  }

  /** Narrows or widens the window, e.g. 500 for a phone. */
  async width(px) {
    await this.send('Emulation.setDeviceMetricsOverride', { width: px, height: 900, deviceScaleFactor: 1, mobile: px < 800 });
  }

  /** Calls the API as the logged-in person, for checks the screen doesn't show. */
  api(path) {
    return this.eval(`fetch(${JSON.stringify(API + path)}, {
      headers: { Authorization: 'Bearer ' + JSON.parse(localStorage.getItem('mjk.access')) },
    }).then(async (r) => ({ status: r.status, body: await r.text() }))`);
  }
}
