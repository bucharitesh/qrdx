// Minimal Chrome DevTools Protocol driver (no Playwright): launches headless
// Chrome, opens one page and exposes helpers that find elements by role,
// label or visible text, never by CSS classes. Launch/connect code follows
// .claude/build/tools/shot.mjs.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

export function findChrome() {
  return CHROME_PATHS.find((path) => existsSync(path)) ?? null;
}

export async function serverIsUp(baseUrl) {
  try {
    const response = await fetch(baseUrl, {
      signal: AbortSignal.timeout(5000),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const listeners = new Set();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { res, rej } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) rej(new Error(JSON.stringify(message.error)));
        else res(message.result);
      } else {
        for (const listener of listeners) listener(message);
      }
    };
    ws.onerror = reject;
    ws.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const messageId = ++id;
            pending.set(messageId, { res, rej });
            ws.send(JSON.stringify({ id: messageId, method, params }));
          }),
        on: (fn) => listeners.add(fn),
        off: (fn) => listeners.delete(fn),
        close: () => ws.close(),
      });
  });
}

/**
 * Starts Chrome and returns a page driver. Call `close()` when done.
 * @param {{ width?: number; height?: number; downloadDir?: string }} [options]
 */
export async function launch({
  width = 1440,
  height = 1000,
  downloadDir,
} = {}) {
  const chromePath = findChrome();
  if (!chromePath) throw new Error("Chrome not found (set CHROME_PATH)");
  const port = 9333 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(
    join(process.env.TMPDIR || tmpdir(), "qrdx-e2e-"),
  );
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let wsUrl;
  for (let i = 0; i < 75 && !wsUrl; i++) {
    try {
      const list = await (
        await fetch(`http://127.0.0.1:${port}/json/list`)
      ).json();
      wsUrl = list.find(
        (target) => target.type === "page",
      )?.webSocketDebuggerUrl;
    } catch {}
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) {
    chrome.kill();
    throw new Error("Chrome did not start");
  }
  const cdp = await connect(wsUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  // Every document (including dev-server reloads) gets the in-page helpers.
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: PAGE_HELPERS,
  });
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  if (downloadDir) {
    await cdp.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: downloadDir,
      eventsEnabled: true,
    });
  }
  const origin = await cdp.send("Runtime.evaluate", { expression: "1" });
  void origin;

  const consoleErrors = [];
  cdp.on((message) => {
    if (message.method === "Runtime.exceptionThrown") {
      consoleErrors.push(
        message.params.exceptionDetails?.exception?.description ?? "exception",
      );
    }
    // React reports errors caught by error boundaries through console.error.
    if (
      message.method === "Runtime.consoleAPICalled" &&
      message.params.type === "error"
    ) {
      const text = message.params.args
        .map((arg) => arg.value ?? arg.description ?? "")
        .join(" ");
      if (/Error:/.test(text)) consoleErrors.push(text);
    }
  });

  /** Evaluates `fn` (a function source) in the page with JSON args. */
  async function evaluate(fn, ...args) {
    const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
      expression: `(${fn})(...${JSON.stringify(args)})`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(
        exceptionDetails.exception?.description ??
          exceptionDetails.text ??
          "evaluate failed",
      );
    }
    return result.value;
  }

  async function goto(url, { wait = 1500 } = {}) {
    const loaded = new Promise((resolve) => {
      const fn = (message) => {
        if (message.method === "Page.loadEventFired") {
          cdp.off(fn);
          resolve();
        }
      };
      cdp.on(fn);
    });
    await cdp.send("Page.navigate", { url });
    await Promise.race([loaded, sleep(60_000)]);
    await sleep(wait);
  }

  /** Polls `fn` in the page until it returns a truthy value. */
  async function waitFor(
    fn,
    { timeout = 15_000, interval = 150, args = [] } = {},
  ) {
    const started = Date.now();
    let last;
    while (Date.now() - started < timeout) {
      last = await evaluate(fn, ...args).catch((error) => ({
        __error: String(error),
      }));
      if (last && !last.__error) return last;
      await sleep(interval);
    }
    throw new Error(
      `Timed out waiting for condition (${String(fn).slice(0, 80)}…)`,
    );
  }

  async function close() {
    try {
      cdp.close();
    } catch {}
    chrome.kill();
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
  }

  return { cdp, evaluate, goto, waitFor, close, consoleErrors };
}

/**
 * In-page helpers, installed as window.__e2e. Elements are found the way a
 * user (or a screen reader) finds them: role + accessible name, label text,
 * or visible text.
 */
export const PAGE_HELPERS = `(() => {
  if (window.__e2e) return true;
  const norm = (s) => (s || "").replace(/\\s+/g, " ").trim().toLowerCase();
  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const name = (el) =>
    norm(
      el.getAttribute("aria-label") ||
        (el.getAttribute("aria-labelledby") || "")
          .split(" ")
          .map((id) => document.getElementById(id)?.textContent || "")
          .join(" ") ||
        el.textContent ||
        el.getAttribute("title") ||
        el.getAttribute("value")
    );
  const ROLE_SELECTORS = {
    button: 'button, [role="button"]',
    tab: '[role="tab"]',
    option: '[role="option"], [role="menuitem"], [role="menuitemradio"], [role="radio"]',
    menuitem: '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]',
    dialog: '[role="dialog"], [role="alertdialog"], dialog[open]',
    combobox: '[role="combobox"], select',
    textbox: 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, [role="textbox"]',
    switch: '[role="switch"], input[type=checkbox]',
    link: "a[href]",
  };
  const all = (role, root = document) =>
    [...root.querySelectorAll(ROLE_SELECTORS[role] || role)].filter(visible);
  const byRole = (role, text, { exact = false, root } = {}) => {
    const target = norm(text);
    const list = all(role, root || document);
    return (
      list.find((el) => name(el) === target) ||
      (exact ? null : list.find((el) => name(el).includes(target))) ||
      null
    );
  };
  const byLabel = (text, root = document) => {
    const target = norm(text);
    for (const label of root.querySelectorAll("label")) {
      if (!norm(label.textContent).startsWith(target)) continue;
      const id = label.getAttribute("for");
      const el = id ? document.getElementById(id) : label.querySelector("input, textarea, select, button");
      if (el && visible(el)) return el;
    }
    return [...root.querySelectorAll("[aria-label]")].find(
      (el) => visible(el) && norm(el.getAttribute("aria-label")).startsWith(target)
    ) || null;
  };
  const byText = (text, root = document) => {
    const target = norm(text);
    const walker = document.createTreeWalker(root.body || root, NodeFilter.SHOW_ELEMENT);
    let best = null;
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (visible(el) && norm(el.textContent) === target) best = el;
    }
    return best;
  };
  const setValue = (el, value) => {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const click = (el) => {
    el.scrollIntoView({ block: "center" });
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: "mouse", button: 0 }));
    }
    el.click();
  };
  window.__e2e = { norm, visible, name, all, byRole, byLabel, byText, setValue, click };
  return true;
})()`;
