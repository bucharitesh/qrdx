// Minimal Chrome DevTools Protocol driver (no Playwright): launches headless
// Chrome, opens one page and exposes helpers that find elements by role,
// label or visible text, never by CSS classes. Launch/connect code follows
// .claude/build/tools/shot.mjs.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
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
      // Test pages play UI sounds; a headless run must never be heard.
      "--mute-audio",
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
  // The browser never outlives this process: killed on a normal exit, on
  // Ctrl-C or termination, and if anything below throws before close().
  const killChrome = () => {
    try {
      chrome.kill();
    } catch {}
  };
  const onSignal = (signal) => {
    killChrome();
    process.exit(signal === "SIGINT" ? 130 : 143);
  };
  process.on("exit", killChrome);
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  const forget = () => {
    process.off("exit", killChrome);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  };

  try {
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
          message.params.exceptionDetails?.exception?.description ??
            "exception",
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
      killChrome();
      forget();
      await sleep(200);
      rmSync(profile, { recursive: true, force: true });
    }

    return { cdp, evaluate, goto, waitFor, close, consoleErrors };
  } catch (error) {
    killChrome();
    forget();
    rmSync(profile, { recursive: true, force: true });
    throw error;
  }
}

// ── Content-Security-Policy violations ──────────────────────────────────────

// How Chrome words a violation: older versions "Refused to load …", current
// ones "Loading the script '…' violates the following Content Security
// Policy directive …" (blocked scripts no longer say "Refused to").
const CSP_TEXT = /Refused to|violates the following Content Security Policy/;

// A token unique to this run marks the self-test's own violation, so it's
// matched exactly (never by a hostname that could appear anywhere).
const SELFTEST_TOKEN = `csp-selftest-${randomBytes(8).toString("hex")}`;
const SELFTEST_SCRIPT = `https://evil.example.com/${SELFTEST_TOKEN}.js`;

/**
 * True when `baseUrl` enforces a Content-Security-Policy that governs what
 * pages load (production, or `next dev` with CSP_DEV=1). Plain `next dev`
 * still sends a header with only frame-ancestors, which blocks nothing a
 * page loads, so a policy counts only with default-src or script-src.
 * Report-Only and no header are false.
 * @param {string} baseUrl
 */
export async function cspEnforced(baseUrl) {
  const response = await fetch(`${baseUrl}/sign-in`, {
    redirect: "manual",
    signal: AbortSignal.timeout(60_000),
  });
  const policy = response.headers.get("content-security-policy") ?? "";
  return policy
    .split(";")
    .map((part) => part.trim().split(/\s+/)[0]?.toLowerCase())
    .some((name) => name === "default-src" || name === "script-src");
}

/**
 * Records every CSP violation the browser reports, with the page it
 * happened on: Log entries from the "security" source or with violation
 * wording, console messages with that wording, and Audits issues of the
 * content-security-policy kind (one violation usually shows up as both a
 * Log entry and an issue). Call it right after `launch()`.
 *
 * `selfTest(baseUrl)` is the positive control (suites run it with
 * E2E_CSP_SELFTEST=1): it loads a script from evil.example.com on /sign-in
 * and returns whether that was caught. Its entries are dropped afterwards,
 * so they never count as real violations.
 *
 * `result(enforced)` is what a suite reports at the end: `skipped` (with a
 * note) when the server sends no enforced CSP, else `ok` and the lines.
 *
 * @param {Awaited<ReturnType<typeof launch>>} page
 */
export async function recordCspViolations(page) {
  const { cdp } = page;
  /** @type {{ url: string; text: string }[]} */
  const seen = [];
  let currentUrl = "";
  const add = (url, text) => {
    seen.push({
      url: String(url || currentUrl).split("?")[0],
      text: String(text).replace(/\s+/g, " ").slice(0, 400),
    });
  };
  await cdp.send("Log.enable");
  await cdp.send("Audits.enable");
  cdp.on((message) => {
    const params = message.params ?? {};
    if (message.method === "Page.frameNavigated" && !params.frame?.parentId) {
      currentUrl = params.frame?.url ?? currentUrl;
    }
    if (message.method === "Log.entryAdded") {
      const entry = params.entry ?? {};
      const text = String(entry.text ?? "");
      if (entry.source === "security" || CSP_TEXT.test(text)) {
        add(entry.url, `[log] ${text}`);
      }
    }
    if (message.method === "Runtime.consoleAPICalled") {
      const text = (params.args ?? [])
        .map((arg) => String(arg.value ?? arg.description ?? ""))
        .join(" ");
      if (CSP_TEXT.test(text)) add("", `[console] ${text}`);
    }
    if (
      message.method === "Audits.issueAdded" &&
      params.issue?.code === "ContentSecurityPolicyIssue"
    ) {
      const details =
        params.issue.details?.contentSecurityPolicyIssueDetails ?? {};
      add(
        details.sourceCodeLocation?.url,
        `[issue] ${details.contentSecurityPolicyViolationType ?? "csp"}: ${
          details.violatedDirective ?? "?"
        } blocked ${details.blockedURL ?? "(inline)"}`,
      );
    }
  });

  return {
    /** Real violations seen so far (the self-test's are dropped). */
    violations: () => [...seen],

    /** @param {string} baseUrl */
    async selfTest(baseUrl) {
      const before = seen.length;
      await page.goto(`${baseUrl}/sign-in`);
      await page.evaluate((src) => {
        const script = document.createElement("script");
        script.src = src;
        document.head.appendChild(script);
        return true;
      }, SELFTEST_SCRIPT);
      const started = Date.now();
      while (
        Date.now() - started < 5000 &&
        !seen.slice(before).some((v) => v.text.includes(SELFTEST_TOKEN))
      ) {
        await sleep(100);
      }
      const caught = seen.slice(before);
      seen.splice(before);
      return {
        caught: caught.some((v) => v.text.includes(SELFTEST_TOKEN)),
        lines: caught.map((v) => `${v.url} :: ${v.text}`),
      };
    },

    /** @param {boolean} enforced */
    result(enforced) {
      if (!enforced) {
        return {
          skipped: true,
          ok: true,
          note: "CSP not enforced on this server; run next dev with CSP_DEV=1",
          lines: [],
        };
      }
      const lines = [...new Set(seen.map((v) => `${v.url} :: ${v.text}`))];
      return { skipped: false, ok: lines.length === 0, note: "", lines };
    },
  };
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
