// Signed-in end-to-end checks of the app against the running dev server,
// driven over the Chrome DevTools Protocol (no Playwright). It walks the real
// dashboard and settings UI as the e2e test account:
//
//   codes      create a dynamic code, edit its destination, follow its short link
//   organize   folder + tag it, archive it (short link stops), trash and delete it
//   pages      hosted page from a template with a form: publish, view signed
//              out, submit the form, read the response in the dashboard, delete
//   oauth      create an OAuth app, authorize → token → /v1/me (api.qrdx.dev
//              routing) → refresh → revoke, Authorized apps revoke, delete app
//   webhooks   add and delete an endpoint (or the Business plan gate)
//   settings   every settings page renders with a heading and no page errors
//
//   E2E_COOKIE_FILE=<path to cookie.txt> pnpm --filter docs test:e2e:app
//
// E2E_SESSION_COOKIE (the `better-auth.session_token=…` pair) works instead of
// E2E_COOKIE_FILE. E2E_BASE_URL defaults to http://localhost:3000;
// E2E_SUITES=codes,oauth runs a subset. Skips (exit 0) without a cookie, a
// server or Chrome. Everything it creates is named "E2E …" and removed again.
// Elements are found by role, label or text only.
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { findChrome, launch, PAGE_HELPERS, serverIsUp, sleep } from "./cdp.mjs";

const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const SUITES = process.env.E2E_SUITES?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
/** Unique per run, so parallel runs (and other agents) never collide. */
const RUN = Date.now().toString(36);

/**
 * Destinations are unique per run. In the dev server, saving a code to a URL
 * that earlier runs had used once hung on "Saving…" for over 90 s, while fresh
 * URLs saved in seconds (cause not confirmed; Web Risk lookups already time
 * out after 2.5 s). Fresh URLs keep that from failing every later run.
 */
const DEST_A = `https://example.com/e2e-a?run=${RUN}`;
const DEST_B = `https://example.com/e2e-b?run=${RUN}`;

/**
 * Checks that currently fail because of a known app bug, keyed
 * "area › check". They are still run and printed, but don't fail the suite.
 * Remove an entry once the bug is fixed.
 */
const KNOWN_BUGS: Record<string, string> = {};

type Result = {
  area: string;
  name: string;
  ok: boolean;
  known?: string;
  skipped?: string;
  detail?: string;
};
const results: Result[] = [];

function record(area: string, name: string, ok: boolean, detail?: string) {
  const known = ok ? undefined : KNOWN_BUGS[`${area} › ${name}`];
  results.push({ area, name, ok, known, detail });
  const mark = ok ? "  ✓" : known ? "  ~" : "  ✗";
  const note = known ? ` — known bug: ${known}` : "";
  console.log(
    `${mark} ${area} › ${name}${detail ? ` — ${detail}` : ""}${note}`,
  );
}

function skip(area: string, name: string, reason: string) {
  results.push({ area, name, ok: true, skipped: reason });
  console.log(`  - ${area} › ${name} — skipped: ${reason}`);
}

const errorMessage = (error: unknown) =>
  String(error instanceof Error ? error.message : error).split("\n")[0];

// ── Session cookie ──────────────────────────────────────────────────────────

function readCookie(): { name: string; value: string } | null {
  let pair = process.env.E2E_SESSION_COOKIE?.trim();
  if (!pair && process.env.E2E_COOKIE_FILE) {
    try {
      pair = readFileSync(process.env.E2E_COOKIE_FILE, "utf8").trim();
    } catch {
      return null;
    }
  }
  if (!pair) return null;
  const at = pair.indexOf("=");
  if (at <= 0) return null;
  return { name: pair.slice(0, at).trim(), value: pair.slice(at + 1).trim() };
}

const COOKIE = readCookie();
const cookieHeader = () => (COOKIE ? `${COOKIE.name}=${COOKIE.value}` : "");

// ── HTTP ────────────────────────────────────────────────────────────────────

interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  /** Send the test account's session cookie (default true) */
  signedIn?: boolean;
}

/** One request, redirects not followed (Location is what's under test). */
async function http(path: string, options: HttpOptions = {}) {
  const headers: Record<string, string> = { ...options.headers };
  if (options.signedIn !== false && COOKIE) headers.cookie = cookieHeader();
  const response = await fetch(
    path.startsWith("http") ? path : `${BASE_URL}${path}`,
    {
      method: options.method ?? "GET",
      headers,
      body: options.body,
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    },
  );
  const text = await response.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return {
    status: response.status,
    location: response.headers.get("location"),
    headers: response.headers,
    text,
    json: json as Record<string, unknown> | null,
  };
}

/**
 * GET with an explicit Host header (fetch can't override Host), e.g. to hit
 * the api.qrdx.dev routing on the local server.
 */
function httpWithHost(
  path: string,
  host: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const url = new URL(path, BASE_URL);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method: "GET",
        headers: { ...headers, host },
        timeout: 60_000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          let json: Record<string, unknown> | null = null;
          try {
            json = JSON.parse(body);
          } catch {}
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.end();
  });
}

/** Path + query of a URL the app built (its origin may be the public one). */
const localPath = (url: string) => {
  const parsed = new URL(url, BASE_URL);
  return parsed.pathname + parsed.search;
};

// ── Page helpers ────────────────────────────────────────────────────────────

type Page = Awaited<ReturnType<typeof launch>>;

/**
 * Element lookups on top of PAGE_HELPERS (window.__e2e). A spec is
 * { role, name, exact } | { label } | { text }, optionally narrowed with
 * `dialog: true` (the top-most open dialog) or `within: "<text>"` (the
 * nearest container showing that text, e.g. a table row or card).
 * `hidden: true` also finds controls that only show on hover or focus.
 */
const APP_HELPERS = `(() => {
  if (window.__app) return true;
  const h = window.__e2e;
  const SELECTORS = {
    button: 'button, [role="button"]',
    link: "a[href]",
    menuitem: '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]',
    checkbox: '[role="checkbox"], input[type=checkbox]',
    dialog: '[role="dialog"], [role="alertdialog"], dialog[open]',
  };
  const rootOf = (spec) => {
    if (!spec.dialog) return document;
    const dialogs = h.all("dialog");
    return dialogs[dialogs.length - 1] || null;
  };
  const matches = (el, spec) => {
    const target = h.norm(spec.name);
    const name = h.name(el);
    return spec.exact ? name === target : name === target || name.includes(target);
  };
  const candidates = (spec, root) => {
    const selector = SELECTORS[spec.role] || spec.role;
    const list = [...root.querySelectorAll(selector)].filter(
      (el) => (spec.hidden || h.visible(el)) && matches(el, spec)
    );
    // Exact names first.
    const target = h.norm(spec.name);
    return list.sort((a, b) => (h.name(b) === target) - (h.name(a) === target));
  };
  const depthTo = (el, text) => {
    let node = el;
    for (let depth = 0; node && node !== document.body; depth++) {
      if (h.norm(node.textContent).includes(text)) return depth;
      node = node.parentElement;
    }
    return Infinity;
  };
  const find = (spec) => {
    const root = rootOf(spec);
    if (!root) return null;
    if (spec.label) return h.byLabel(spec.label, root);
    if (spec.text) return h.byText(spec.text, root);
    const list = candidates(spec, root);
    if (!spec.within) return list[0] || null;
    const text = h.norm(spec.within);
    let best = null;
    let bestDepth = Infinity;
    for (const el of list) {
      const depth = depthTo(el, text);
      if (depth < bestDepth) { best = el; bestDepth = depth; }
    }
    return best;
  };
  const hasText = (text) => !!document.body && h.norm(document.body.innerText).includes(h.norm(text));
  window.__app = { find, hasText };
  return true;
})()`;

/** Evaluates `body` (a function source) with both helper sets installed. */
function ev<T = unknown>(page: Page, body: string, ...args: unknown[]) {
  return page.evaluate(
    `(...args) => { ${PAGE_HELPERS}; ${APP_HELPERS}; return (${body})(...args); }`,
    ...args,
  ) as Promise<T>;
}

/** Polls `body` until it returns a truthy value. */
async function until<T = unknown>(
  page: Page,
  body: string,
  { timeout = 30_000, args = [] as unknown[], what = "condition" } = {},
): Promise<T> {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeout) {
    try {
      const value = await ev<T>(page, body, ...args);
      if (value) return value;
    } catch (error) {
      lastError = errorMessage(error);
    }
    await sleep(200);
  }
  throw new Error(
    `Timed out waiting for ${what}${lastError ? ` (${lastError})` : ""}`,
  );
}

type Spec = {
  role?: string;
  name?: string;
  exact?: boolean;
  label?: string;
  text?: string;
  dialog?: boolean;
  within?: string;
  hidden?: boolean;
};

const describe = (spec: Spec) =>
  spec.label
    ? `field "${spec.label}"`
    : spec.text
      ? `text "${spec.text}"`
      : `${spec.role} "${spec.name}"${spec.within ? ` in "${spec.within}"` : ""}`;

/** Waits for an element and clicks it. */
async function click(page: Page, spec: Spec, timeout = 30_000) {
  await until(
    page,
    `(spec) => { const el = __app.find(spec); if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return false; __e2e.click(el); return true; }`,
    { timeout, args: [spec], what: describe(spec) },
  );
  await sleep(250);
}

/** Waits for a text field and types into it (React-compatible). */
async function fill(page: Page, spec: Spec, value: string) {
  await until(
    page,
    `(spec, value) => { const el = __app.find(spec); if (!el) return false; el.focus(); __e2e.setValue(el, value); return true; }`,
    { args: [spec, value], what: describe(spec) },
  );
}

async function waitText(page: Page, text: string, timeout = 30_000) {
  await until(page, "(text) => __app.hasText(text)", {
    timeout,
    args: [text],
    what: `text "${text}"`,
  });
}

async function waitNoText(page: Page, text: string, timeout = 30_000) {
  await until(page, "(text) => !__app.hasText(text)", {
    timeout,
    args: [text],
    what: `"${text}" to disappear`,
  });
}

const hasText = (page: Page, text: string) =>
  ev<boolean>(page, "(text) => __app.hasText(text)", text);

const currentUrl = (page: Page) => ev<string>(page, "() => location.href");

async function open(page: Page, path: string) {
  await page.goto(`${BASE_URL}${path}`, { wait: 1200 });
  // Cookie banner: decline, so nothing else loads and nothing covers buttons.
  await ev(
    page,
    `() => { const b = __e2e.byRole("button", "reject all", { exact: true }); if (b) __e2e.click(b); return true; }`,
  ).catch(() => {});
}

async function pressEscape(page: Page) {
  for (const type of ["keyDown", "keyUp"]) {
    await page.cdp.send("Input.dispatchKeyEvent", {
      type,
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
  }
  await sleep(200);
}

/** Runs one step: records a pass, or the failure, and keeps going. */
async function step<T>(
  area: string,
  name: string,
  fn: () => Promise<T | { ok: boolean; detail?: string }>,
): Promise<T | undefined> {
  try {
    const value = await fn();
    if (value && typeof value === "object" && "ok" in value) {
      const check = value as { ok: boolean; detail?: string };
      record(area, name, check.ok, check.detail);
      return check.ok ? (value as T) : undefined;
    }
    record(area, name, true);
    return value as T;
  } catch (error) {
    record(area, name, false, errorMessage(error));
    return undefined;
  }
}

const check = (ok: boolean, detail?: string) => ({ ok, detail });

// ── Codes ───────────────────────────────────────────────────────────────────

interface CreatedCode {
  id: string;
  title: string;
  slug: string;
  shortPath: string;
}

/** Creates a website-link code through the New code dialog. */
async function createCode(
  page: Page,
  title: string,
  destination: string,
): Promise<CreatedCode> {
  await open(page, "/dashboard/codes");
  await click(page, { role: "button", name: "new code", exact: true });
  await click(page, { role: "button", name: "website link", dialog: true });
  await fill(page, { label: "destination url", dialog: true }, destination);
  await fill(page, { label: "title", dialog: true }, title);
  await click(page, {
    role: "button",
    name: "create code",
    exact: true,
    dialog: true,
  });
  await waitText(page, "your dynamic qr code is ready", 60_000);
  const created = await ev<{ shortLink: string; href: string } | null>(
    page,
    `() => {
      const dialog = __e2e.all("dialog").pop();
      const shortLink = [...dialog.querySelectorAll("code")].map((c) => c.textContent.trim()).find((t) => t.includes("/q/"));
      const link = __e2e.byRole("link", "view analytics", { root: dialog });
      return shortLink && link ? { shortLink, href: link.getAttribute("href") } : null;
    }`,
  );
  if (!created) throw new Error("No short link in the created dialog");
  const shortPath = localPath(
    created.shortLink.startsWith("http")
      ? created.shortLink
      : `http://${created.shortLink}`,
  );
  await click(page, {
    role: "button",
    name: "done",
    exact: true,
    dialog: true,
  });
  return {
    id: decodeURIComponent(created.href.split("/").pop() ?? ""),
    title,
    slug: shortPath.split("/").pop() ?? "",
    shortPath,
  };
}

/** Opens the row's "Code actions" menu and picks `item`. */
async function codeAction(page: Page, title: string, item: string) {
  await click(page, { role: "button", name: "code actions", within: title });
  await click(page, { role: "menuitem", name: item });
}

/** Trashes and permanently deletes a code (cleanup; never throws). */
async function deleteCodeForever(page: Page, code: CreatedCode) {
  try {
    for (const status of ["", "?status=archived"]) {
      await open(page, `/dashboard/codes${status}`);
      const listed = await waitText(page, code.title, 8000).then(
        () => true,
        () => false,
      );
      if (listed) {
        await codeAction(page, code.title, "move to trash");
        await waitText(page, "moved to trash");
        break;
      }
    }
    await open(page, "/dashboard/codes?status=trash");
    await waitText(page, code.title, 15_000);
    await codeAction(page, code.title, "delete forever");
    await click(page, {
      role: "button",
      name: "delete forever",
      exact: true,
      dialog: true,
    });
    await waitNoText(page, code.title);
    return true;
  } catch (error) {
    console.log(
      `    cleanup: couldn't delete ${code.title}: ${errorMessage(error)}`,
    );
    return false;
  }
}

let sharedCode: CreatedCode | null = null;

async function testCodes(page: Page) {
  const area = "codes";
  const title = `E2E code ${RUN}`;
  const code = await step(area, "create a dynamic code in the dashboard", () =>
    createCode(page, title, DEST_A),
  );
  if (!code) return;
  sharedCode = code;

  await step(area, "short link redirects to the destination", async () => {
    const res = await http(code.shortPath, { signedIn: false });
    return check(
      res.status >= 300 && res.status < 400 && res.location === DEST_A,
      `${res.status} → ${res.location}`,
    );
  });

  await step(area, "edit the destination", async () => {
    await open(page, "/dashboard/codes");
    await codeAction(page, title, "edit link");
    await waitText(page, "edit dynamic qr code");
    // The dialog loads the code's current values first; typing earlier races it.
    await until(
      page,
      `(url) => __e2e.byLabel("destination url")?.value === url`,
      { args: [DEST_A], what: "the current destination in the form" },
    );
    await fill(page, { label: "destination url", dialog: true }, DEST_B);
    await click(page, {
      role: "button",
      name: "save changes",
      exact: true,
      dialog: true,
    });
    const outcome = await until<string>(
      page,
      `() => {
        if (!__app.hasText("edit dynamic qr code")) return "saved";
        const alert = [...document.querySelectorAll('[role="dialog"] [role="alert"]')].find((el) => __e2e.visible(el));
        return alert ? "error: " + alert.textContent.trim() : false;
      }`,
      { timeout: 60_000, what: "the edit dialog to save" },
    );
    if (outcome !== "saved") throw new Error(outcome);
    await waitText(page, "example.com/e2e-b");
  });

  await step(area, "short link follows the new destination", async () => {
    const res = await http(code.shortPath, { signedIn: false });
    return check(
      res.status >= 300 && res.status < 400 && res.location === DEST_B,
      `${res.status} → ${res.location}`,
    );
  });

  await step(area, "short link is not cached (no 301)", async () => {
    const res = await http(code.shortPath, {
      method: "HEAD",
      signedIn: false,
    });
    return check(
      res.status !== 301 &&
        (res.headers.get("cache-control") ?? "").includes("no-store"),
      `${res.status}, cache-control: ${res.headers.get("cache-control")}`,
    );
  });
}

// ── Organize: folders, tags, archive, delete ────────────────────────────────

async function testOrganize(page: Page) {
  const area = "organize";
  const code =
    sharedCode ??
    (await step(area, "create a code to organize", () =>
      createCode(page, `E2E code ${RUN}`, DEST_B),
    ));
  if (!code) return;
  sharedCode = null; // this flow deletes it
  const folderName = `E2E folder ${RUN}`;
  const tagName = `E2E tag ${RUN}`;
  let folderCreated = false;
  let tagCreated = false;
  let codeDeleted = false;

  try {
    await open(page, "/dashboard/codes");
    folderCreated = Boolean(
      await step(area, "create a folder", async () => {
        await click(page, { role: "button", name: "new folder", exact: true });
        await fill(page, { label: "name", dialog: true }, folderName);
        await click(page, {
          role: "button",
          name: "create folder",
          exact: true,
          dialog: true,
        });
        await waitText(page, `created "${folderName}"`);
        return true;
      }),
    );

    tagCreated = Boolean(
      await step(area, "create a tag", async () => {
        await click(page, { role: "button", name: "new tag", exact: true });
        await fill(page, { label: "name", dialog: true }, tagName);
        await click(page, {
          role: "button",
          name: "create tag",
          exact: true,
          dialog: true,
        });
        await until(
          page,
          `(name) => !__e2e.all("dialog").length && __app.hasText(name)`,
          { args: [tagName], what: "the new tag in the sidebar" },
        );
        return true;
      }),
    );

    if (folderCreated) {
      await step(area, "move the code into the folder", async () => {
        await open(page, "/dashboard/codes");
        await codeAction(page, code.title, "move to folder");
        await click(page, {
          role: "button",
          name: folderName,
          exact: true,
          dialog: true,
        });
        await waitText(page, `to "${folderName}"`);
        // The folder's own view lists it.
        await click(page, { role: "link", name: folderName });
        await until(
          page,
          `(title) => location.search.includes("folder=") && __app.hasText(title)`,
          { args: [code.title], what: "the code in the folder view" },
        );
        return true;
      });
    }

    if (tagCreated) {
      await step(area, "tag the code", async () => {
        await open(page, "/dashboard/codes");
        await codeAction(page, code.title, "tags");
        await click(page, { label: tagName, dialog: true });
        await click(page, {
          role: "button",
          name: "save",
          exact: true,
          dialog: true,
        });
        await waitText(page, "tags saved");
        // The tag's view lists it.
        await open(page, "/dashboard/codes");
        await click(page, { role: "link", name: tagName });
        await until(
          page,
          `(title) => location.search.includes("tag") && __app.hasText(title)`,
          { args: [code.title], what: "the code in the tag view" },
        );
        return true;
      });
    }

    const archived = await step(area, "archive the code", async () => {
      await open(page, "/dashboard/codes");
      await codeAction(page, code.title, "archive");
      await waitNoText(page, code.title);
      await open(page, "/dashboard/codes?status=archived");
      await waitText(page, code.title);
      return true;
    });

    if (archived) {
      await step(area, "archived short link stops redirecting", async () => {
        const res = await http(code.shortPath, { signedIn: false });
        return check(
          res.status === 410 &&
            !res.location &&
            res.text.includes("no longer active"),
          `${res.status}${res.location ? ` → ${res.location}` : ""}`,
        );
      });
    }

    codeDeleted = Boolean(
      await step(area, "trash and delete the code forever", async () => {
        if (!(await deleteCodeForever(page, code))) {
          throw new Error("delete failed");
        }
        return true;
      }),
    );

    if (codeDeleted) {
      await step(area, "deleted short link is gone", async () => {
        const res = await http(code.shortPath, { signedIn: false });
        return check(res.status === 404, String(res.status));
      });
    }
  } finally {
    if (!codeDeleted) await deleteCodeForever(page, code);
    if (folderCreated) {
      await step(area, "delete the folder", async () => {
        await open(page, "/dashboard/codes");
        await click(page, {
          role: "button",
          name: `${folderName} folder actions`,
          exact: true,
          hidden: true,
        });
        await click(page, { role: "menuitem", name: "delete folder" });
        await click(page, {
          role: "button",
          name: "delete folder",
          exact: true,
          dialog: true,
        });
        await waitText(page, `deleted "${folderName}"`);
        return true;
      });
    }
    if (tagCreated) {
      await step(area, "delete the tag", async () => {
        await open(page, "/dashboard/codes");
        await click(page, {
          role: "button",
          name: `${tagName} tag actions`,
          exact: true,
          hidden: true,
        });
        await click(page, { role: "menuitem", name: "delete tag" });
        await click(page, {
          role: "button",
          name: "delete tag",
          exact: true,
          dialog: true,
        });
        await until(
          page,
          `(name) => !__e2e.all("dialog").length && !__app.hasText(name)`,
          { args: [tagName], what: "the tag to disappear" },
        );
        return true;
      });
    }
  }
}

// ── Hosted pages and forms ──────────────────────────────────────────────────

async function deletePage(page: Page, title: string) {
  await open(page, "/dashboard/pages");
  await waitText(page, title);
  await click(page, { role: "button", name: "more actions", within: title });
  await click(page, { role: "menuitem", name: "delete page" });
  await click(page, {
    role: "button",
    name: "delete page",
    exact: true,
    dialog: true,
  });
  await waitText(page, "page deleted");
}

async function testPages(page: Page) {
  const area = "pages";
  const title = `E2E page ${RUN}`;
  const comment = `E2E response ${RUN}`;
  let pageId: string | null = null;
  let livePath: string | null = null;
  let deleted = false;

  try {
    pageId =
      (await step(
        area,
        "create a page from the Guest feedback template",
        async () => {
          await open(page, "/dashboard/pages");
          await click(page, { role: "button", name: "new page", exact: true });
          await click(page, {
            role: "button",
            name: "feedback & forms",
            dialog: true,
          });
          await click(page, {
            role: "button",
            name: "guest feedback",
            dialog: true,
          });
          await fill(page, { label: "name", dialog: true }, title);
          await click(page, {
            role: "button",
            name: "create page",
            exact: true,
            dialog: true,
          });
          const url = await until<string>(
            page,
            `() => /\\/dashboard\\/pages\\/[^/]+$/.test(location.pathname) && location.pathname`,
            { timeout: 60_000, what: "the page editor" },
          );
          return decodeURIComponent(url.split("/").pop() ?? "");
        },
      )) ?? null;
    if (!pageId) return;

    await step(area, "publish an edit", async () => {
      await until(page, `() => !!__e2e.byLabel("page title")`, {
        timeout: 60_000,
        what: "the editor",
      });
      await fill(page, { label: "page title" }, `${title} v2`);
      await waitText(page, "unpublished changes");
      await click(page, { role: "button", name: "publish", exact: true });
      await waitText(page, "published · v2");
      livePath = await ev<string | null>(
        page,
        `() => { const a = __e2e.byRole("link", "view live"); return a ? a.getAttribute("href") : null; }`,
      );
      return check(Boolean(livePath), `live page: ${livePath}`);
    });
    if (!livePath) return;
    const pagePath = localPath(livePath);

    // Template copy changes often, so these checks rely on structure: the
    // page title, a form with a star rating, a text area and a submit button.
    await step(area, "live page renders signed out", async () => {
      const res = await http(pagePath, { signedIn: false });
      const pageTitle = res.text.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
      return check(
        res.status === 200 &&
          pageTitle.includes(`${title} v2`) &&
          res.text.includes("<form"),
        `${res.status} ${pagePath} (title: ${pageTitle})`,
      );
    });

    await step(area, "submit the form signed out", async () => {
      const visitor = await launch({ width: 420, height: 900 });
      try {
        await visitor.goto(`${BASE_URL}${pagePath}`, { wait: 1500 });
        await until(
          visitor,
          `() => { const form = document.querySelector("form"); return !!(form && form.querySelector("textarea") && form.querySelector('button[type="submit"]')); }`,
          { what: "the page's form" },
        );
        // Highest star, then the first free-text question.
        await click(visitor, { text: "5 of 5 stars" });
        await until(
          visitor,
          `(value) => { const el = document.querySelector("form textarea"); if (!el) return false; el.focus(); __e2e.setValue(el, value); return true; }`,
          { args: [comment], what: "the text question" },
        );
        await until(
          visitor,
          `() => { const b = document.querySelector('form button[type="submit"]'); if (!b || b.disabled) return false; __e2e.click(b); return true; }`,
          { what: "the submit button" },
        );
        // The thank-you message replaces the form (an <output> status).
        await until(
          visitor,
          `() => { const out = [...document.querySelectorAll("output")].find((el) => __e2e.visible(el)); return !!(out && out.textContent.trim() && !document.querySelector("form textarea")); }`,
          { what: "the thank-you message" },
        );
        return check(
          visitor.consoleErrors.length === 0,
          visitor.consoleErrors[0]?.split("\n")[0],
        );
      } finally {
        await visitor.close();
      }
    });

    await step(area, "the response shows in the dashboard", async () => {
      await open(
        page,
        `/dashboard/pages/${encodeURIComponent(pageId as string)}/responses`,
      );
      await waitText(page, comment);
      return true;
    });

    deleted = Boolean(
      await step(area, "delete the page", async () => {
        await deletePage(page, `${title} v2`);
        const res = await http(pagePath, { signedIn: false });
        return check(
          res.status === 404 || res.status === 410,
          String(res.status),
        );
      }),
    );
  } finally {
    if (pageId && !deleted) {
      for (const name of [`${title} v2`, title]) {
        try {
          await deletePage(page, name);
          break;
        } catch {}
      }
    }
  }
}

// ── OAuth provider ──────────────────────────────────────────────────────────

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
};

async function tokenRequest(fields: Record<string, string>) {
  return http("/api/oauth/token", {
    method: "POST",
    signedIn: false,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function testOAuth(page: Page) {
  const area = "oauth";
  const appName = `E2E app ${RUN}`;
  const redirectUri = `${BASE_URL}/e2e-callback`;
  const scope = "profile:read codes:read";
  let app: { id: string; clientId: string; clientSecret: string } | null = null;
  let deleted = false;

  const authorizeQuery = (challenge: string, state: string) =>
    new URLSearchParams({
      response_type: "code",
      client_id: app?.clientId ?? "",
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }).toString();

  const exchange = (code: string, verifier: string) =>
    tokenRequest({
      grant_type: "authorization_code",
      client_id: app?.clientId ?? "",
      client_secret: app?.clientSecret ?? "",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });

  const refresh = (refreshToken: string) =>
    tokenRequest({
      grant_type: "refresh_token",
      client_id: app?.clientId ?? "",
      client_secret: app?.clientSecret ?? "",
      refresh_token: refreshToken,
    });

  try {
    app =
      (await step(
        area,
        "create an OAuth app in Settings → Developers",
        async () => {
          await open(page, "/settings/developers/new");
          await fill(page, { label: "name" }, appName);
          await fill(
            page,
            { label: "description" },
            "Created by the QRdx e2e suite; deleted when it finishes.",
          );
          await fill(page, { label: "redirect uris" }, redirectUri);
          for (const label of ["profile", "read codes"]) {
            const checked = await until<string>(
              page,
              `(label) => { const el = __e2e.byLabel(label); return el ? el.getAttribute("aria-checked") || String(el.checked) : ""; }`,
              { args: [label], what: `scope "${label}"` },
            );
            if (checked !== "true") await click(page, { label });
          }
          await click(page, {
            role: "button",
            name: "create app",
            exact: true,
          });
          await waitText(page, "app created", 60_000);
          const credentials = await ev<{
            clientId: string;
            clientSecret: string;
          } | null>(
            page,
            `() => {
            const id = __e2e.byLabel("client id");
            const secret = __e2e.byLabel("client secret");
            return id && secret && id.value && secret.value ? { clientId: id.value, clientSecret: secret.value } : null;
          }`,
          );
          if (!credentials) throw new Error("No client credentials shown");
          await click(page, {
            role: "button",
            name: "i've saved it",
            exact: true,
            dialog: true,
          });
          const path = await until<string>(
            page,
            `() => /^\\/settings\\/developers\\/(?!new$)[^/]+$/.test(location.pathname) && location.pathname`,
            { what: "the app's settings page" },
          );
          return {
            id: decodeURIComponent(path.split("/").pop() ?? ""),
            ...credentials,
          };
        },
      )) ?? null;
    if (!app) return;
    const clientId = app.clientId;

    await step(
      area,
      "authorize redirects a new grant to the consent page",
      async () => {
        const { challenge } = pkce();
        const res = await http(
          `/api/oauth/authorize?${authorizeQuery(challenge, "s0")}`,
        );
        const location = res.location ? new URL(res.location, BASE_URL) : null;
        return check(
          res.status === 302 &&
            location?.pathname === "/oauth/authorize" &&
            location.searchParams.get("client_id") === clientId,
          `${res.status} → ${location?.pathname}`,
        );
      },
    );

    await step(
      area,
      "unregistered redirect_uri is refused without a redirect",
      async () => {
        const { challenge } = pkce();
        const query = new URLSearchParams(authorizeQuery(challenge, "s0"));
        query.set("redirect_uri", "https://evil.example/cb");
        const res = await http(`/api/oauth/authorize?${query}`);
        return check(
          res.status === 400 &&
            !res.location &&
            res.json?.error === "invalid_request",
          `${res.status} ${JSON.stringify(res.json)}`,
        );
      },
    );

    await step(area, "cross-site consent posts are refused", async () => {
      const { challenge } = pkce();
      const form = new URLSearchParams(authorizeQuery(challenge, "s0"));
      form.set("decision", "allow");
      const res = await http("/api/oauth/authorize", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
      return check(res.status === 403 && !res.location, String(res.status));
    });

    // 1. Consent in the UI, code exchange with PKCE.
    const first = pkce();
    const code = await step(
      area,
      "consent screen → Authorize returns a code",
      async () => {
        await open(
          page,
          `/api/oauth/authorize?${authorizeQuery(first.challenge, "state-1")}`,
        );
        await waitText(page, appName);
        await waitText(page, "read your profile");
        await click(page, { role: "button", name: "authorize", exact: true });
        const landed = await until<string>(
          page,
          `(uri) => location.href.startsWith(uri) && location.href`,
          { args: [redirectUri], what: "the redirect back to the app" },
        );
        const url = new URL(landed);
        if (url.searchParams.get("state") !== "state-1") {
          throw new Error(`state not returned: ${landed}`);
        }
        const value = url.searchParams.get("code");
        if (!value) throw new Error(`no code: ${landed}`);
        return value;
      },
    );
    if (!code) return;

    const pairA = await step(
      area,
      "token exchange (authorization_code + PKCE)",
      async () => {
        const res = await exchange(code, first.verifier);
        const body = res.json ?? {};
        const ok =
          res.status === 200 &&
          typeof body.access_token === "string" &&
          typeof body.refresh_token === "string" &&
          body.token_type === "Bearer" &&
          body.expires_in === 3600 &&
          body.scope === scope &&
          (res.headers.get("cache-control") ?? "").includes("no-store");
        if (!ok) {
          return check(
            false,
            `${res.status} ${JSON.stringify({ ...body, access_token: undefined, refresh_token: undefined })}`,
          );
        }
        return {
          ok: true,
          access: body.access_token as string,
          refresh: body.refresh_token as string,
        };
      },
    );
    if (!pairA) return;
    const a = pairA as unknown as { access: string; refresh: string };

    await step(area, "a code can't be exchanged twice", async () => {
      const res = await exchange(code, first.verifier);
      return check(
        res.status === 400 && res.json?.error === "invalid_grant",
        `${res.status} ${res.json?.error}`,
      );
    });

    await step(area, "GET /v1/me on the api.qrdx.dev host", async () => {
      const res = await httpWithHost(
        "/v1/me",
        "api.qrdx.dev",
        bearer(a.access),
      );
      const data = (res.json?.data ?? {}) as Record<string, unknown>;
      return check(
        res.status === 200 && data.email === "qrdx-e2e-test@example.com",
        `${res.status} ${data.email ?? JSON.stringify(res.json)}`,
      );
    });

    await step(area, "GET /api/v1/me", async () => {
      const res = await http("/api/v1/me", {
        signedIn: false,
        headers: bearer(a.access),
      });
      const data = (res.json?.data ?? {}) as Record<string, unknown>;
      return check(
        res.status === 200 && data.email === "qrdx-e2e-test@example.com",
        String(res.status),
      );
    });

    await step(
      area,
      "api.qrdx.dev outside /v1 goes to the API docs",
      async () => {
        const url = new URL("/codes", BASE_URL);
        const status = await new Promise<{ status: number; location?: string }>(
          (resolve, reject) => {
            const req = httpRequest(
              {
                hostname: url.hostname,
                port: url.port || 80,
                path: url.pathname,
                headers: { host: "api.qrdx.dev" },
              },
              (res) => {
                res.resume();
                resolve({
                  status: res.statusCode ?? 0,
                  location: res.headers.location,
                });
              },
            );
            req.on("error", reject);
            req.end();
          },
        );
        return check(
          status.status >= 300 &&
            status.status < 400 &&
            status.location === "https://qrdx.dev/docs/developers/rest-api",
          `${status.status} → ${status.location}`,
        );
      },
    );

    await step(area, "codes:read token can list codes", async () => {
      const res = await http("/api/v1/codes", {
        signedIn: false,
        headers: bearer(a.access),
      });
      return check(
        res.status === 200 && Array.isArray(res.json?.data),
        String(res.status),
      );
    });

    await step(area, "codes:read token can't create codes", async () => {
      const res = await http("/api/v1/codes", {
        method: "POST",
        signedIn: false,
        headers: { ...bearer(a.access), "content-type": "application/json" },
        body: JSON.stringify({
          destinationUrl: "https://example.com/e2e-scope",
          title: `E2E scope ${RUN}`,
        }),
      });
      return check(
        res.status === 403 && res.json?.code === "INSUFFICIENT_SCOPE",
        `${res.status} ${res.json?.code}`,
      );
    });

    const pairB = await step(area, "refresh rotates the tokens", async () => {
      const res = await refresh(a.refresh);
      const body = res.json ?? {};
      if (res.status !== 200 || typeof body.access_token !== "string") {
        return check(false, `${res.status} ${body.error}`);
      }
      const again = await refresh(a.refresh);
      if (!(again.status === 400 && again.json?.error === "invalid_grant")) {
        return check(false, `old refresh token still works: ${again.status}`);
      }
      const me = await http("/api/v1/me", {
        signedIn: false,
        headers: bearer(body.access_token as string),
      });
      if (me.status !== 200)
        return check(false, `new access token: ${me.status}`);
      return {
        ok: true,
        access: body.access_token as string,
        refresh: body.refresh_token as string,
      };
    });
    const b = pairB as unknown as
      | { access: string; refresh: string }
      | undefined;

    if (b) {
      await step(area, "revoke endpoint signs the token out", async () => {
        const res = await http("/api/oauth/revoke", {
          method: "POST",
          signedIn: false,
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: b.access }),
        });
        const me = await http("/api/v1/me", {
          signedIn: false,
          headers: bearer(b.access),
        });
        const refreshed = await refresh(b.refresh);
        return check(
          res.status === 200 &&
            me.status === 401 &&
            me.json?.error === "invalid_token" &&
            refreshed.json?.error === "invalid_grant",
          `revoke ${res.status}, me ${me.status} ${me.json?.error}, refresh ${refreshed.json?.error}`,
        );
      });
    }

    // 2. Consent over HTTP (the consent form's own same-origin POST).
    const second = pkce();
    const pairC = await step(
      area,
      "same-origin consent POST + exchange",
      async () => {
        const form = new URLSearchParams(
          authorizeQuery(second.challenge, "state-2"),
        );
        form.set("decision", "allow");
        const res = await http("/api/oauth/authorize", {
          method: "POST",
          headers: {
            origin: BASE_URL,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: form,
        });
        const location = res.location ? new URL(res.location) : null;
        const value = location?.searchParams.get("code");
        if (
          !(
            res.status === 303 &&
            value &&
            location?.searchParams.get("state") === "state-2"
          )
        ) {
          return check(false, `${res.status} → ${res.location}`);
        }
        const token = await exchange(value, second.verifier);
        if (token.status !== 200)
          return check(false, `token ${token.status} ${token.json?.error}`);
        return {
          ok: true,
          access: token.json?.access_token as string,
          refresh: token.json?.refresh_token as string,
        };
      },
    );
    const c = pairC as unknown as
      | { access: string; refresh: string }
      | undefined;

    if (c) {
      await step(
        area,
        "a repeat authorization skips the consent screen",
        async () => {
          const { challenge } = pkce();
          const res = await http(
            `/api/oauth/authorize?${authorizeQuery(challenge, "state-3")}`,
          );
          const location = res.location
            ? new URL(res.location, BASE_URL)
            : null;
          return check(
            res.status === 302 &&
              location?.href.startsWith(redirectUri) === true &&
              Boolean(location?.searchParams.get("code")),
            `${res.status} → ${location?.pathname}`,
          );
        },
      );

      const revoked = await step(
        area,
        "Authorized apps lists the app and revokes it",
        async () => {
          await open(page, "/settings/authorized-apps");
          await waitText(page, appName);
          await click(page, {
            role: "button",
            name: "revoke access",
            within: appName,
          });
          await click(page, {
            role: "button",
            name: "revoke access",
            exact: true,
            dialog: true,
          });
          await until(
            page,
            `(name) => !__e2e.all("dialog").length && !__app.hasText(name)`,
            { args: [appName], what: "the app to leave the list" },
          );
          return true;
        },
      );

      if (revoked) {
        await step(
          area,
          "revoked tokens fail (invalid_token / invalid_grant)",
          async () => {
            const me = await http("/api/v1/me", {
              signedIn: false,
              headers: bearer(c.access),
            });
            const refreshed = await refresh(c.refresh);
            return check(
              me.status === 401 &&
                me.json?.error === "invalid_token" &&
                refreshed.status === 400 &&
                refreshed.json?.error === "invalid_grant",
              `me ${me.status} ${me.json?.error}, refresh ${refreshed.status} ${refreshed.json?.error}`,
            );
          },
        );
      }
    }

    deleted = Boolean(
      await step(area, "delete the OAuth app", async () => {
        await deleteOAuthApp(page, app as { id: string }, appName);
        const res = await refresh("not-a-real-token");
        return check(
          res.status === 401 && res.json?.error === "invalid_client",
          `token endpoint after delete: ${res.status} ${res.json?.error}`,
        );
      }),
    );
  } finally {
    if (app && !deleted) {
      try {
        await deleteOAuthApp(page, app, appName);
      } catch (error) {
        console.log(
          `    cleanup: couldn't delete ${appName}: ${errorMessage(error)}`,
        );
      }
    }
  }
}

async function deleteOAuthApp(page: Page, app: { id: string }, name: string) {
  await open(page, `/settings/developers/${encodeURIComponent(app.id)}`);
  await click(page, { role: "button", name: "delete app", exact: true });
  await click(page, {
    role: "button",
    name: "delete app",
    exact: true,
    dialog: true,
  });
  await until(
    page,
    `(name) => location.pathname === "/settings/developers" && !__app.hasText(name)`,
    { args: [name], what: "the app to be deleted" },
  );
}

// ── Webhooks ────────────────────────────────────────────────────────────────

async function testWebhooks(page: Page) {
  const area = "webhooks";
  const url = `https://example.com/hook?e2e=${RUN}`;
  await open(page, "/dashboard/webhooks");
  await until(page, `() => !!document.querySelector("h1")`, {
    what: "the webhooks page",
  });

  if (await hasText(page, "webhooks are part of business")) {
    await step(
      area,
      "plan gate explains Business and offers the upgrade",
      async () =>
        check(
          Boolean(
            await ev(
              page,
              `() => !!__e2e.byRole("button", "upgrade to business") && !__e2e.byRole("button", "add endpoint")`,
            ),
          ),
        ),
    );
    skip(
      area,
      "add and delete an endpoint",
      "the test account isn't on Business",
    );
    return;
  }

  let added = false;
  try {
    added = Boolean(
      await step(area, "add an endpoint", async () => {
        await click(page, {
          role: "button",
          name: "add endpoint",
          exact: true,
        });
        await fill(page, { label: "endpoint url", dialog: true }, url);
        await click(page, {
          role: "button",
          name: "add endpoint",
          exact: true,
          dialog: true,
        });
        await waitText(page, "endpoint added");
        await click(page, {
          role: "button",
          name: "done",
          exact: true,
          dialog: true,
        });
        await waitText(page, url);
        return true;
      }),
    );
  } finally {
    if (added) {
      await step(area, "delete the endpoint", async () => {
        await click(page, {
          role: "button",
          name: "endpoint actions",
          within: url,
        });
        await click(page, { role: "menuitem", name: "delete" });
        await click(page, {
          role: "button",
          name: "delete endpoint",
          exact: true,
          dialog: true,
        });
        await waitNoText(page, url);
        return true;
      });
    }
  }
}

// ── Settings pages ──────────────────────────────────────────────────────────

const SETTINGS_PAGES = [
  "/settings/general",
  "/settings/account",
  "/settings/usage",
  "/settings/notifications",
  "/settings/integrations",
  "/settings/authorized-apps",
  "/settings/developers",
  "/settings/developers/new",
];

/** Settings URLs that intentionally send people elsewhere. */
const SETTINGS_REDIRECTS: Record<string, string> = {
  "/settings": "/settings/general",
  // Saved themes moved to the workspace.
  "/settings/themes": "/dashboard/themes",
};

async function testSettings(page: Page) {
  const area = "settings";

  for (const [from, to] of Object.entries(SETTINGS_REDIRECTS)) {
    await step(area, `${from} redirects to ${to}`, async () => {
      const res = await http(from);
      return check(
        res.status >= 300 &&
          res.status < 400 &&
          localPath(res.location ?? "") === to,
        `${res.status} → ${res.location}`,
      );
    });
  }

  // One integration's own page too (the first one listed).
  await open(page, "/settings/integrations");
  const integration = await until<string>(
    page,
    `() => { const a = [...document.querySelectorAll('a[href^="/settings/integrations/"]')].find((el) => __e2e.visible(el)); return a ? a.getAttribute("href") : null; }`,
    { what: "an integration link" },
  ).catch(() => null);

  for (const path of [
    ...SETTINGS_PAGES,
    ...(integration ? [integration] : []),
  ]) {
    await step(area, `${path} renders`, async () => {
      const res = await http(path);
      if (res.status !== 200) return check(false, `HTTP ${res.status}`);
      const errorsBefore = page.consoleErrors.length;
      await open(page, path);
      const heading = await until<string>(
        page,
        `() => { const h = [...document.querySelectorAll("h1, h2")].find((el) => __e2e.visible(el) && el.textContent.trim()); return h ? h.textContent.trim() : null; }`,
        { what: "a heading" },
      );
      await sleep(800);
      const errors = page.consoleErrors.slice(errorsBefore);
      const landed = localPath(await currentUrl(page));
      return check(
        errors.length === 0 && landed === path,
        errors.length
          ? `page error: ${errors[0]?.split("\n")[0]}`
          : landed !== path
            ? `landed on ${landed}`
            : heading,
      );
    });
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!COOKIE) {
    console.log(
      "SKIP: no session cookie (set E2E_COOKIE_FILE or E2E_SESSION_COOKIE to the test account's better-auth.session_token pair)",
    );
    return 0;
  }
  if (!(await serverIsUp(`${BASE_URL}/`))) {
    console.log(
      `SKIP: no dev server at ${BASE_URL} (start it, or set E2E_BASE_URL)`,
    );
    return 0;
  }
  if (!findChrome()) {
    console.log("SKIP: Chrome not found (set CHROME_PATH)");
    return 0;
  }

  const session = await http("/api/auth/get-session");
  const email = (session.json?.user as { email?: string } | undefined)?.email;
  if (!email) {
    console.log(
      `FAIL: the session cookie isn't signed in (HTTP ${session.status}); refresh it`,
    );
    return 1;
  }
  console.log(`Signed in as ${email} · run ${RUN}`);

  const page = await launch({});
  await page.cdp.send("Network.enable");
  const origin = new URL(BASE_URL);
  await page.cdp.send("Network.setCookie", {
    name: COOKIE.name,
    value: COOKIE.value,
    domain: origin.hostname,
    path: "/",
    httpOnly: true,
    secure: origin.protocol === "https:",
  });

  const suites: [string, (page: Page) => Promise<void>][] = [
    ["codes", testCodes],
    ["organize", testOrganize],
    ["pages", testPages],
    ["oauth", testOAuth],
    ["webhooks", testWebhooks],
    ["settings", testSettings],
  ];
  try {
    for (const [name, run] of suites) {
      if (SUITES && !SUITES.includes(name)) continue;
      console.log(`\n${name}`);
      try {
        await run(page);
      } catch (error) {
        record(name, "suite", false, errorMessage(error));
      }
      await pressEscape(page).catch(() => {});
    }
    // A code left by "codes" when "organize" didn't run.
    if (sharedCode) await deleteCodeForever(page, sharedCode);
  } finally {
    await page.close();
  }

  const failed = results.filter((r) => !(r.ok || r.known));
  const known = results.filter((r) => r.known);
  const skipped = results.filter((r) => r.skipped);
  console.log(
    `\n${results.length - failed.length - known.length - skipped.length} passed, ${failed.length} failed, ${known.length} known bugs, ${skipped.length} skipped (${results.length} checks)`,
  );
  return failed.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
