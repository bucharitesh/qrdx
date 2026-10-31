// End-to-end checks of the playground against the running dev server, driven
// over the Chrome DevTools Protocol (no Playwright). For every QR type it
// picks the type in the UI, fills the form, decodes the live preview with jsQR
// and compares it with what the encoder produces for the same input. It also
// walks every Design picker option and every preset, downloads PNG/SVG/PDF/EPS,
// and checks copy, undo/redo and the type picker's search.
//
//   pnpm --filter docs test:e2e            (E2E_BASE_URL defaults to :3000)
//
// Skips (exit 0) when no server is running or Chrome isn't installed.
// Elements are found by role, label or text only.
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import qrcodegen from "../../../packages/qrdx/src/codegen";
import { decodePng } from "../../../packages/qrdx/src/utils/png";
import {
  createImage,
  decodeQR,
  rasterizeSvg,
  simulateCamera,
} from "../../../packages/qrdx/tests/support/raster";
import { xmlProblems } from "../../../packages/qrdx/tests/support/xml";
import {
  CONTENT_TYPES_METADATA,
  type QRContentConfig,
} from "../types/qr-content";
import { encodeQRContent } from "../utils/qr-content-encoder";
import { findChrome, launch, PAGE_HELPERS, serverIsUp, sleep } from "./cdp.mjs";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const ONLY = process.env.E2E_ONLY?.split(",").map((s) => s.trim());

type Result = { area: string; name: string; ok: boolean; detail?: string };
const results: Result[] = [];
const record = (area: string, name: string, ok: boolean, detail?: string) => {
  results.push({ area, name, ok, detail });
  console.log(
    `${ok ? "  ✓" : "  ✗"} ${area} › ${name}${detail ? ` — ${detail}` : ""}`,
  );
};

// ── Per-type form input (label text → value) and the matching config ─────────

interface TypeCase {
  label: string;
  fields: Record<string, string>;
  switches?: string[];
  config: QRContentConfig;
}

const TYPE_CASES: Record<string, TypeCase> = {
  url: {
    label: "URL",
    fields: { "Website address": "qrdx.dev/pricing?plan=pro#faq" },
    config: { type: "url", url: "qrdx.dev/pricing?plan=pro#faq" },
  },
  text: {
    label: "Plain Text",
    fields: { "Text Content": "Hello from QRdx 👋 ; , : \\" },
    config: { type: "text", text: "Hello from QRdx 👋 ; , : \\" },
  },
  email: {
    label: "Email",
    fields: {
      "Recipient Email": "hello@qrdx.dev",
      Subject: "Q&A? 50% off",
      Message: "line one\nline two",
    },
    config: {
      type: "email",
      recipient: "hello@qrdx.dev",
      subject: "Q&A? 50% off",
      body: "line one\nline two",
    },
  },
  phone: {
    label: "Phone",
    fields: { "Phone Number": "+1 (415) 555-0132" },
    config: { type: "phone", phoneNumber: "+1 (415) 555-0132" },
  },
  sms: {
    label: "SMS",
    fields: {
      "Phone Number": "+14155550132",
      Message: "See you at 5: bring snacks",
    },
    config: {
      type: "sms",
      phoneNumber: "+14155550132",
      message: "See you at 5: bring snacks",
    },
  },
  whatsapp: {
    label: "WhatsApp",
    fields: { "Phone Number": "+91 98765 43210", Message: "Hi & welcome 😀" },
    config: {
      type: "whatsapp",
      phoneNumber: "+91 98765 43210",
      message: "Hi & welcome 😀",
    },
  },
  wifi: {
    label: "WiFi",
    fields: { "Network Name": 'Café;Guest,"5G"', Password: "p;a:ss\\word" },
    switches: ["Hidden Network"],
    config: {
      type: "wifi",
      ssid: 'Café;Guest,"5G"',
      password: "p;a:ss\\word",
      encryption: "WPA",
      hidden: true,
    },
  },
  vcard: {
    label: "Contact",
    fields: {
      "First Name": "Zoë",
      "Last Name": "O'Brien; Jr",
      Organization: "Acme, Inc",
      Phone: "+441234567890",
      Email: "zoe@example.com",
      Website: "https://example.com",
      Address: "1 Main St, Springfield",
      Note: "Met at the conference",
    },
    config: {
      type: "vcard",
      firstName: "Zoë",
      lastName: "O'Brien; Jr",
      organization: "Acme, Inc",
      phone: "+441234567890",
      email: "zoe@example.com",
      url: "https://example.com",
      address: "1 Main St, Springfield",
      note: "Met at the conference",
    },
  },
  maps: {
    label: "Location",
    fields: { Location: "48.8584, 2.2945" },
    config: { type: "maps", location: "48.8584, 2.2945" },
  },
  facebook: {
    label: "Facebook",
    fields: { "Facebook Profile URL": "https://www.facebook.com/qrdx" },
    config: { type: "facebook", profileUrl: "https://www.facebook.com/qrdx" },
  },
  instagram: {
    label: "Instagram",
    fields: { "Instagram Username": "@qrdx" },
    config: { type: "instagram", username: "@qrdx" },
  },
  reddit: {
    label: "Reddit",
    fields: { Subreddit: "r/qrcodes" },
    config: { type: "reddit", subreddit: "r/qrcodes" },
  },
  tiktok: {
    label: "TikTok",
    fields: { "TikTok Username": "@qrdx" },
    config: { type: "tiktok", username: "@qrdx" },
  },
  twitter: {
    label: "Twitter / X",
    fields: { "Twitter / X Username": "@qrdx" },
    config: { type: "twitter", username: "@qrdx" },
  },
  linkedin: {
    label: "LinkedIn",
    fields: { "LinkedIn Profile URL": "https://www.linkedin.com/in/qrdx" },
    config: {
      type: "linkedin",
      profileUrl: "https://www.linkedin.com/in/qrdx",
    },
  },
  youtube: {
    label: "YouTube",
    fields: { "Video URL": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    config: {
      type: "youtube",
      videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
  },
  pinterest: {
    label: "Pinterest",
    fields: { "Pinterest Username": "qrdx" },
    config: { type: "pinterest", username: "qrdx" },
  },
  snapchat: {
    label: "Snapchat",
    fields: { "Snapchat Username": "qrdx" },
    config: { type: "snapchat", username: "qrdx" },
  },
  threads: {
    label: "Threads",
    fields: { "Threads Username": "@qrdx" },
    config: { type: "threads", username: "@qrdx" },
  },
  upi: {
    label: "UPI Payment",
    fields: {
      "UPI ID": "shop@okaxis",
      "Payee Name": "Chai Shop",
      "Amount (₹)": "49.50",
      Note: "Order 12",
    },
    config: {
      type: "upi",
      upiId: "shop@okaxis",
      name: "Chai Shop",
      amount: "49.50",
      note: "Order 12",
    },
  },
  paypal: {
    label: "PayPal",
    fields: { "PayPal.Me URL": "https://paypal.me/qrdx" },
    config: { type: "paypal", paypalUrl: "https://paypal.me/qrdx" },
  },
  "google-review": {
    label: "Google Review",
    fields: { "Google Place ID": "ChIJN1t_tDeuEmsRUsoyG83frY4" },
    config: { type: "google-review", placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4" },
  },
  venmo: {
    label: "Venmo",
    fields: {
      "Venmo Username": "@qrdx",
      "Amount ($)": "5",
      Note: "Coffee & cake",
    },
    config: {
      type: "venmo",
      username: "@qrdx",
      amount: "5",
      note: "Coffee & cake",
    },
  },
  spotify: {
    label: "Spotify",
    fields: { "Spotify URI or URL": "spotify:track:4uLU6hMCjMI75M1A2tKUQC" },
    config: { type: "spotify", uri: "spotify:track:4uLU6hMCjMI75M1A2tKUQC" },
  },
  bitcoin: {
    label: "Bitcoin",
    fields: {
      "Bitcoin Address": "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      "Amount (BTC)": "0.001",
      Label: "Luke Jr",
      Message: "Donation",
    },
    config: {
      type: "bitcoin",
      address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
      amount: "0.001",
      label: "Luke Jr",
      message: "Donation",
    },
  },
  ethereum: {
    label: "Ethereum",
    fields: {
      "Ethereum Address": "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7",
      "Amount (ETH)": "0.5",
    },
    config: {
      type: "ethereum",
      address: "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7",
      amount: "0.5",
    },
  },
  etsy: {
    label: "Etsy",
    fields: { "Etsy Shop URL": "https://www.etsy.com/shop/qrdx" },
    config: { type: "etsy", shopUrl: "https://www.etsy.com/shop/qrdx" },
  },
  dubsh: {
    label: "Dub",
    fields: { "Dub short link": "https://dub.sh/qrdx" },
    config: { type: "dubsh", shortUrl: "https://dub.sh/qrdx" },
  },
  attendance: {
    label: "Attendance",
    fields: { "Google Form URL": "https://forms.gle/abc123" },
    config: { type: "attendance", formUrl: "https://forms.gle/abc123" },
  },
  amazon: {
    label: "Amazon",
    fields: { "Amazon Product URL": "https://www.amazon.com/dp/B08N5WRWNW" },
    config: {
      type: "amazon",
      productUrl: "https://www.amazon.com/dp/B08N5WRWNW",
    },
  },
  flipkart: {
    label: "Flipkart",
    fields: { "Flipkart Product URL": "https://www.flipkart.com/p/itm123" },
    config: {
      type: "flipkart",
      productUrl: "https://www.flipkart.com/p/itm123",
    },
  },
  calcom: {
    label: "Cal.com",
    fields: { "Cal.com Booking URL": "https://cal.com/qrdx/30min" },
    config: { type: "calcom", bookingUrl: "https://cal.com/qrdx/30min" },
  },
  "google-drive": {
    label: "Google Drive",
    fields: { "Google Drive URL": "https://drive.google.com/file/d/abc/view" },
    config: {
      type: "google-drive",
      url: "https://drive.google.com/file/d/abc/view",
    },
  },
};

/** What the playground should put in the code for a URL typed into the URL form. */
function expectedPayload(config: QRContentConfig): string {
  return encodeQRContent(config);
}

// ── Page helpers ────────────────────────────────────────────────────────────

type Page = Awaited<ReturnType<typeof launch>>;

async function install(page: Page) {
  await page.evaluate(`() => ${PAGE_HELPERS}`);
}

async function openPlayground(page: Page) {
  await page.goto(`${BASE_URL}/playground`, { wait: 3000 });
  await install(page);
  await page.waitFor(
    `() => !!(window.__e2e && __e2e.byRole("tab", "content"))`,
    { timeout: 30_000 },
  );
  // Cookie banner: decline, so nothing else loads.
  await page.evaluate(
    `() => { const b = __e2e.byRole("button", "reject all", { exact: true }); if (b) __e2e.click(b); return true; }`,
  );
  await sleep(300);
}

/** RGBA pixels of the live preview SVG, rendered by Chrome at `size` px wide. */
async function previewPixels(
  page: Page,
  size = 640,
): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  const result = (await page.evaluate(
    `async (size) => {
    const svgs = [...document.querySelectorAll("main svg, svg")].filter((s) => {
      if (s.parentElement && s.parentElement.closest("svg")) return false;
      const r = s.getBoundingClientRect();
      return r.width >= 160 && r.height >= 160 && __e2e.visible(s);
    });
    if (!svgs.length) return null;
    const svg = svgs.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
    const box = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(box.width));
    clone.setAttribute("height", String(box.height));
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
    const scale = size / Math.max(box.width, box.height);
    const pad = Math.round(size / 12);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(box.width * scale) + 2 * pad;
    canvas.height = Math.round(box.height * scale) + 2 * pad;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, pad, pad, canvas.width - 2 * pad, canvas.height - 2 * pad);
    URL.revokeObjectURL(url);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let binary = "";
    for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return { width: canvas.width, height: canvas.height, b64: btoa(binary) };
  }`,
    size,
  )) as { width: number; height: number; b64: string } | null;
  if (!result) return null;
  return {
    width: result.width,
    height: result.height,
    data: new Uint8ClampedArray(Buffer.from(result.b64, "base64")),
  };
}

/**
 * Reads the preview like a phone does: Chrome renders it so each module is
 * about 6 or 9 px, then the camera model (contrast loss + ¼-module blur, as in
 * scan-score) is applied before jsQR. The module count is estimated from the
 * expected payload at the playground's default level (Q).
 */
async function readPreview(
  page: Page,
  expected: string,
): Promise<string | null> {
  let modules = 33;
  try {
    modules = qrcodegen.QrCode.encodeText(
      expected,
      qrcodegen.QrCode.Ecc.QUARTILE,
    ).size;
  } catch {}
  let last: string | null = null;
  // Templates draw the code at about half the artwork's width, hence 2× sizes.
  for (const [width, modulePx] of [
    [6, 6],
    [9, 9],
    [12, 6],
    [18, 9],
  ] as const) {
    const pixels = await previewPixels(page, modules * width).catch(() => null);
    last = pixels ? decodeQR(simulateCamera(pixels, modulePx)) : null;
    if (last === expected) return last;
  }
  return last;
}

/**
 * Decodes an exported image as a phone would see it: the camera model at the
 * image's own module size (estimated from the payload at level Q).
 */
function decodeLikePhone(
  image: { data: Uint8ClampedArray; width: number; height: number },
  expected: string,
): string | null {
  let modules = 33;
  try {
    modules = qrcodegen.QrCode.encodeText(
      expected,
      qrcodegen.QrCode.Ecc.QUARTILE,
    ).size;
  } catch {}
  return decodeQR(simulateCamera(image, image.width / (modules + 2)));
}

/** Polls the preview until it decodes to `expected`; returns the last decode. */
async function waitForDecode(
  page: Page,
  expected: string,
  timeout = 12_000,
): Promise<string | null> {
  const started = Date.now();
  let last: string | null = null;
  while (Date.now() - started < timeout) {
    last = await readPreview(page, expected);
    if (last === expected) return last;
    await sleep(400);
  }
  if (process.env.E2E_SHOTS) await screenshot(page, `fail-${Date.now()}`);
  return last;
}

async function screenshot(page: Page, name: string) {
  const { data } = (await page.cdp.send("Page.captureScreenshot", {
    format: "png",
  })) as { data: string };
  const file = join(process.env.E2E_SHOTS as string, `${name}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  console.log(`    screenshot: ${file}`);
}

async function clickByRole(
  page: Page,
  role: string,
  name: string,
  exact = false,
) {
  const ok = await page.evaluate(
    `(role, name, exact) => { const el = __e2e.byRole(role, name, { exact }); if (!el) return false; __e2e.click(el); return true; }`,
    role,
    name,
    exact,
  );
  if (!ok) throw new Error(`No ${role} named "${name}"`);
}

async function pressEscape(page: Page) {
  await page.cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await page.cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await sleep(400);
}

async function openTab(page: Page, name: string) {
  await clickByRole(page, "tab", name, true);
  await sleep(500);
}

/** Opens the QR type picker and chooses the type whose label starts with `label`. */
async function chooseType(page: Page, label: string) {
  await openTab(page, "content");
  await page.waitFor(
    `() => !!__e2e.all("button").find((b) => __e2e.name(b).startsWith("qr code type"))`,
  );
  await page.evaluate(
    `() => { const card = __e2e.all("button").find((b) => __e2e.name(b).startsWith("qr code type")); __e2e.click(card); return true; }`,
  );
  await page.waitFor(
    `() => !!__e2e.all("dialog").find((d) => /choose a qr code type/i.test(d.textContent))`,
  );
  const picked = await page.evaluate(
    `(label) => {
      const dialog = __e2e.all("dialog").find((d) => /choose a qr code type/i.test(d.textContent));
      const target = __e2e.norm(label);
      const button = __e2e.all("button", dialog).find((b) => __e2e.name(b).startsWith(target) && !__e2e.name(b).startsWith(target + " "));
      if (!button) return false;
      __e2e.click(button);
      return true;
    }`,
    label,
  );
  if (!picked) throw new Error(`Type "${label}" not in the picker`);
  await sleep(700);
}

/** Types `value` into the field labelled `label`, one character at a time. */
async function fill(page: Page, label: string, value: string) {
  const ok = await page.evaluate(
    `(label) => { const el = __e2e.byLabel(label); if (!el) return false; el.scrollIntoView({ block: "center" }); el.focus(); el.select?.(); return document.activeElement === el; }`,
    label,
  );
  if (!ok) throw new Error(`No field labelled "${label}"`);
  // Clear, then type like a user (each character is its own input event).
  await page.cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
  });
  await page.cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
  });
  for (const char of value) {
    if (char === "\n") {
      await page.cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        text: "\r",
      });
      await page.cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
    } else {
      await page.cdp.send("Input.insertText", { text: char });
    }
    await sleep(15);
  }
  await page.evaluate(`() => { document.activeElement?.blur(); return true; }`);
  await sleep(150);
}

/** The error boundary's message, when the page has crashed. */
async function crashed(page: Page): Promise<boolean> {
  return (await page
    .evaluate(
      `() => /something went wrong/i.test(document.body.innerText) && !__e2e.byRole("tab", "content")`,
    )
    .catch(() => true)) as boolean;
}

function firstError(page: Page): string {
  const error = page.consoleErrors.find((e) => !/hydrat/i.test(e)) ?? "";
  return /Error: [^\n]*/.exec(error)?.[0]?.slice(0, 160) ?? error.slice(0, 160);
}

async function toggle(page: Page, label: string) {
  const ok = await page.evaluate(
    `(label) => { const el = __e2e.byLabel(label); if (!el) return false; __e2e.click(el); return true; }`,
    label,
  );
  if (!ok) throw new Error(`No switch labelled "${label}"`);
  await sleep(200);
}

// ── Suites ──────────────────────────────────────────────────────────────────

async function testContentTypes(page: Page) {
  const types = CONTENT_TYPES_METADATA.map((meta) => meta.type).filter(
    (type) => !ONLY || ONLY.includes(type),
  );
  for (const type of types) {
    const testCase = TYPE_CASES[type];
    if (!testCase) {
      record("types", type, false, "no e2e case for this type");
      continue;
    }
    try {
      await chooseType(page, testCase.label);
      for (const [label, value] of Object.entries(testCase.fields)) {
        await fill(page, label, value);
      }
      for (const label of testCase.switches ?? []) await toggle(page, label);
      if (await crashed(page))
        throw new Error(`page crashed: ${firstError(page)}`);
      const expected = expectedPayload(testCase.config);
      const decoded = await waitForDecode(page, expected);
      record(
        "types",
        type,
        decoded === expected,
        decoded === expected
          ? undefined
          : `decoded ${JSON.stringify(decoded)}, expected ${JSON.stringify(expected)}`,
      );
    } catch (error) {
      record(
        "types",
        type,
        false,
        String(error instanceof Error ? error.message : error),
      );
    }
    if (await crashed(page)) {
      page.consoleErrors.length = 0;
      await openPlayground(page);
    }
  }
}

const URL_VALUE = "https://qrdx.dev/q/Ab3dE9x";

/** URL content in the default style, so earlier suites don't leak a preset. */
async function setUrlContent(page: Page, { resetStyle = true } = {}) {
  await chooseType(page, "URL");
  await fill(page, "Website address", URL_VALUE);
  if (resetStyle) {
    await openPresetPicker(page).catch(() => undefined);
    await page.evaluate(
      `() => { const o = [...document.querySelectorAll('[role=option]')].filter(__e2e.visible).find((x) => __e2e.name(x) === "default"); if (o) __e2e.click(o); return true; }`,
    );
    await sleep(500);
    await pressEscape(page);
  }
  await waitForDecode(page, URL_VALUE);
}

async function pressedIn(page: Page, group: string): Promise<string | null> {
  return (await page.evaluate(
    `(group) => {
      const box = [...document.querySelectorAll('[role=group],[role=radiogroup],[aria-label]')].find((el) => __e2e.norm(el.getAttribute("aria-label")) === __e2e.norm(group));
      const on = box && [...box.querySelectorAll('[aria-pressed="true"]')].find(__e2e.visible);
      return on ? __e2e.name(on) : null;
    }`,
    group,
  )) as string | null;
}

async function optionsIn(page: Page, group: string): Promise<string[]> {
  return (await page.evaluate(
    `(group) => {
      const box = [...document.querySelectorAll('[role=group],[role=radiogroup],[aria-label]')].find((el) => __e2e.norm(el.getAttribute("aria-label")) === __e2e.norm(group));
      return box ? [...box.querySelectorAll('[aria-pressed]')].map((b) => __e2e.name(b)) : [];
    }`,
    group,
  )) as string[];
}

async function pick(page: Page, group: string, option: string) {
  const ok = await page.evaluate(
    `(group, option) => {
      const box = [...document.querySelectorAll('[role=group],[role=radiogroup],[aria-label]')].find((el) => __e2e.norm(el.getAttribute("aria-label")) === __e2e.norm(group));
      const button = box && [...box.querySelectorAll('[aria-pressed]')].find((b) => __e2e.name(b) === option);
      if (!button) return false;
      __e2e.click(button);
      return true;
    }`,
    group,
    option,
  );
  if (!ok) throw new Error(`No option "${option}" in "${group}"`);
  await sleep(250);
}

const DESIGN_GROUPS = [
  "Dot shape",
  "Eye style",
  "Outer eye shape",
  "Inner eye shape",
  "Border",
  "Call-to-action frame",
  "Error correction",
];

// The Design tab shows a few common shapes per group; the full list (the
// group's aria-label) appears after opening its section, then "More …"
// (and, for the separate eye shapes, "Customise outer and centre").
const GROUP_OPENERS: Record<string, { section: string; buttons: string[] }> = {
  "Dot shape": { section: "dots", buttons: ["more dot shapes"] },
  "Eye style": { section: "eyes", buttons: ["more eye styles"] },
  "Outer eye shape": {
    section: "eyes",
    buttons: ["customise outer and centre", "more outer shapes"],
  },
  "Inner eye shape": {
    section: "eyes",
    buttons: ["customise outer and centre", "more centre shapes"],
  },
  Border: { section: "frame", buttons: [] },
  "Call-to-action frame": { section: "frame", buttons: ["more frames"] },
  "Error correction": { section: "error correction", buttons: [] },
};

async function revealGroup(page: Page, group: string) {
  const opener = GROUP_OPENERS[group];
  if (!opener) return;
  await page.evaluate(
    `(section) => { const b = [...document.querySelectorAll('h3 > button[aria-expanded="false"]')].find((el) => { const n = __e2e.name(el); return n === section || n.startsWith(section + " "); }); if (b) __e2e.click(b); return true; }`,
    opener.section,
  );
  await sleep(300);
  for (const label of opener.buttons) {
    await page.evaluate(
      `(label) => { const b = [...document.querySelectorAll('button[aria-expanded="false"]')].find((el) => __e2e.name(el).startsWith(label)); if (b) __e2e.click(b); return true; }`,
      label,
    );
    await sleep(300);
  }
}

async function testDesignPickers(page: Page) {
  await setUrlContent(page);
  await openTab(page, "design");
  for (const group of DESIGN_GROUPS) {
    await revealGroup(page, group);
    const options = await optionsIn(page, group);
    if (options.length === 0) {
      record("design", group, false, "group not found in the Design tab");
      continue;
    }
    const original = await pressedIn(page, group);
    for (const option of options) {
      try {
        await pick(page, group, option);
        const decoded = await waitForDecode(page, URL_VALUE, 8000);
        record(
          "design",
          `${group}: ${option}`,
          decoded === URL_VALUE,
          decoded === URL_VALUE
            ? undefined
            : `decoded ${JSON.stringify(decoded)}`,
        );
      } catch (error) {
        record(
          "design",
          `${group}: ${option}`,
          false,
          String(error instanceof Error ? error.message : error),
        );
      }
    }
    if (original) await pick(page, group, original).catch(() => undefined);
  }
}

async function testUndoRedo(page: Page) {
  await openTab(page, "design");
  await revealGroup(page, "Dot shape");
  const before = await pressedIn(page, "Dot shape");
  const target = (await optionsIn(page, "Dot shape")).find(
    (option) => option !== before,
  );
  if (!(before && target)) {
    record("history", "undo/redo", false, "Dot shape group not found");
    return;
  }
  await pick(page, "Dot shape", target);
  const changed = await pressedIn(page, "Dot shape");
  await clickByRole(page, "button", "undo", true);
  await sleep(500);
  const undone = await pressedIn(page, "Dot shape");
  await clickByRole(page, "button", "redo", true);
  await sleep(500);
  const redone = await pressedIn(page, "Dot shape");
  record(
    "history",
    "undo restores the previous dot shape",
    changed === target && undone === before,
    `${before} → ${changed} → undo ${undone}`,
  );
  record("history", "redo re-applies it", redone === target, `redo ${redone}`);
  await pick(page, "Dot shape", before).catch(() => undefined);
}

/** Opens the preset picker: the dialog trigger next to "Previous theme". */
async function openPresetPicker(page: Page) {
  const ok = await page.evaluate(`() => {
    let box = __e2e.byRole("button", "previous theme", { exact: true });
    for (let i = 0; i < 4 && box; i++) {
      box = box.parentElement;
      const trigger = box && [...box.querySelectorAll('button[aria-haspopup="dialog"]')].find(__e2e.visible);
      if (trigger) { __e2e.click(trigger); return true; }
    }
    return false;
  }`);
  if (!ok) throw new Error("preset picker trigger not found");
  await page.waitFor(
    `() => [...document.querySelectorAll('[role=option]')].some(__e2e.visible)`,
    { timeout: 5000 },
  );
}

async function testPresets(page: Page) {
  await setUrlContent(page);
  await openPresetPicker(page);
  const presets = (await page.evaluate(
    `() => [...document.querySelectorAll('[role=option]')].filter(__e2e.visible).map((o) => __e2e.name(o))`,
  )) as string[];
  await pressEscape(page);
  if (presets.length === 0) {
    record("presets", "preset list", false, "no presets found");
    return;
  }
  for (const preset of presets) {
    try {
      // A dev-server reload (other edits hot-reloading) resets the content.
      if (!(await previewPixels(page).catch(() => null))) {
        await setUrlContent(page);
      }
      await openPresetPicker(page);
      const ok = await page.evaluate(
        `(name) => { const o = [...document.querySelectorAll('[role=option]')].filter(__e2e.visible).find((x) => __e2e.name(x) === name); if (!o) return false; __e2e.click(o); return true; }`,
        preset,
      );
      if (!ok) throw new Error("option not clickable");
      await sleep(600);
      await pressEscape(page);
      const decoded = await waitForDecode(page, URL_VALUE, 8000);
      record(
        "presets",
        preset,
        decoded === URL_VALUE,
        decoded === URL_VALUE
          ? undefined
          : `decoded ${JSON.stringify(decoded)}`,
      );
    } catch (error) {
      record(
        "presets",
        preset,
        false,
        String(error instanceof Error ? error.message : error),
      );
      await pressEscape(page);
    }
  }
}

async function testTypeSearch(page: Page) {
  await openTab(page, "content");
  await page.evaluate(
    `() => { const card = __e2e.all("button").find((b) => __e2e.name(b).startsWith("qr code type")); __e2e.click(card); return true; }`,
  );
  await page.waitFor(
    `() => !!__e2e.all("dialog").find((d) => /choose a qr code type/i.test(d.textContent))`,
  );
  const search = async (query: string) => {
    await page.evaluate(
      `(query) => { const input = __e2e.byLabel("Search QR code types"); __e2e.setValue(input, query); return true; }`,
      query,
    );
    await sleep(500);
    return (await page.evaluate(
      `() => { const d = __e2e.all("dialog").find((x) => /choose a qr code type/i.test(x.textContent)); return __e2e.all("button", d).map((b) => __e2e.name(b)).filter((n) => n && n !== "close"); }`,
    )) as string[];
  };
  const cases: [string, string][] = [
    ["wi-fi", "wifi"],
    ["gpay", "upi payment"],
    ["business card", "contact"],
    ["mailto", "email"],
    ["CALENDLY", "cal.com"],
  ];
  for (const [query, expected] of cases) {
    const names = await search(query);
    record(
      "type search",
      `"${query}" finds ${expected}`,
      names.some((name) => name.startsWith(expected)),
      names.slice(0, 4).join(" | "),
    );
  }
  const none = await search("zzzz-no-such-type");
  record(
    "type search",
    "nonsense query shows no types",
    !none.some((name) => name.startsWith("url")),
    none.slice(0, 3).join(" | "),
  );
  await pressEscape(page);
}

async function readClipboard(page: Page): Promise<string> {
  return (await page.evaluate(
    `async () => { try { return await navigator.clipboard.readText(); } catch (e) { return "ERROR " + e; } }`,
  )) as string;
}

async function testCopy(page: Page) {
  await setUrlContent(page);
  await page.cdp.send("Browser.grantPermissions", {
    origin: new URL(BASE_URL).origin,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
  await page.evaluate(
    `async () => { await navigator.clipboard.writeText(""); return true; }`,
  );
  await clickByRole(page, "button", "copy svg", true);
  await sleep(1500);
  const svg = await readClipboard(page);
  const svgOk =
    svg.trimStart().startsWith("<svg") && xmlProblems(svg).length === 0;
  const decoded = svgOk
    ? decodeLikePhone(rasterizeSvg(svg, { width: 240, pad: 20 }), URL_VALUE)
    : null;
  record(
    "copy",
    "Copy SVG puts well-formed SVG on the clipboard",
    svgOk,
    svgOk ? undefined : svg.slice(0, 120),
  );
  record(
    "copy",
    "copied SVG decodes to the content",
    decoded === URL_VALUE,
    `decoded ${JSON.stringify(decoded)}`,
  );

  await clickByRole(page, "button", "code", true);
  await sleep(800);
  await clickByRole(page, "button", "copy code", true);
  await sleep(800);
  const code = await readClipboard(page);
  record(
    "copy",
    "Copy code puts a qrdx React snippet on the clipboard",
    /from ["']qrdx["']/.test(code) && code.includes(URL_VALUE),
    code.slice(0, 120),
  );
  await pressEscape(page);
}

async function testDownloads(page: Page, downloadDir: string) {
  await setUrlContent(page);
  const formats = ["png", "svg", "pdf", "eps"];
  for (const format of formats) {
    try {
      for (const file of readdirSync(downloadDir))
        rmSync(join(downloadDir, file), { force: true });
      await clickByRole(page, "button", "download", true);
      await page.waitFor(
        `() => !!__e2e.all("dialog").find((d) => /download qr code/i.test(d.textContent))`,
      );
      await page.evaluate(
        `(format) => { const d = __e2e.all("dialog").find((x) => /download qr code/i.test(x.textContent)); const tab = __e2e.byRole("tab", "image file", { root: d }); if (tab) __e2e.click(tab); const r = __e2e.all("option", d).find((o) => __e2e.name(o) === format); __e2e.click(r); return true; }`,
        format,
      );
      await sleep(400);
      await page.evaluate(
        `() => { const d = __e2e.all("dialog").find((x) => /download qr code/i.test(x.textContent)); const b = __e2e.all("button", d).find((x) => __e2e.name(x).startsWith("download")); __e2e.click(b); return true; }`,
      );
      let file: string | undefined;
      for (let i = 0; i < 60 && !file; i++) {
        await sleep(250);
        file = readdirSync(downloadDir).find(
          (name) => !name.endsWith(".crdownload"),
        );
      }
      await pressEscape(page);
      if (!file) {
        record("download", format, false, "no file was downloaded");
        continue;
      }
      const bytes = readFileSync(join(downloadDir, file));
      let ok = false;
      let detail = file;
      if (format === "png") {
        const image = await decodePng(new Uint8Array(bytes));
        if (image) {
          // Place the PNG on white paper with a quiet zone, as when printed.
          const pad = Math.round(image.width / 8);
          const page = createImage(
            image.width + 2 * pad,
            image.height + 2 * pad,
          );
          for (let y = 0; y < image.height; y++) {
            for (let x = 0; x < image.width; x++) {
              const from = (y * image.width + x) * 4;
              const to = ((y + pad) * page.width + x + pad) * 4;
              const alpha = (image.data[from + 3] as number) / 255;
              for (let c = 0; c < 3; c++) {
                page.data[to + c] =
                  (image.data[from + c] as number) * alpha + 255 * (1 - alpha);
              }
            }
          }
          ok = decodeLikePhone(page, URL_VALUE) === URL_VALUE;
          detail += ` ${image.width}×${image.height}, sharp decode ${decodeQR(page) === URL_VALUE ? "ok" : "fails"}`;
        } else {
          detail += " not a PNG";
        }
      } else if (format === "svg") {
        const text = bytes.toString("utf8");
        const problems = xmlProblems(text);
        ok =
          problems.length === 0 &&
          decodeLikePhone(
            rasterizeSvg(text, { width: 240, pad: 20 }),
            URL_VALUE,
          ) === URL_VALUE;
        detail += problems.length ? ` ${problems.join("; ")}` : "";
      } else if (format === "pdf") {
        ok =
          bytes.subarray(0, 5).toString("latin1") === "%PDF-" &&
          bytes.toString("latin1").trimEnd().endsWith("%%EOF");
      } else {
        const text = bytes.toString("latin1");
        ok =
          text.startsWith("%!PS-Adobe-3.0 EPSF-3.0") &&
          /%%BoundingBox: 0 0 \d+ \d+/.test(text) &&
          text.trimEnd().endsWith("%%EOF");
      }
      record("download", format, ok, detail);
    } catch (error) {
      record(
        "download",
        format,
        false,
        String(error instanceof Error ? error.message : error),
      );
      await pressEscape(page);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!(await serverIsUp(`${BASE_URL}/playground`))) {
    console.log(
      `SKIP: no dev server at ${BASE_URL} (start it, or set E2E_BASE_URL)`,
    );
    return 0;
  }
  if (!findChrome()) {
    console.log("SKIP: Chrome not found (set CHROME_PATH)");
    return 0;
  }
  const downloadDir = mkdtempSync(join(tmpdir(), "qrdx-e2e-downloads-"));
  const page = await launch({ downloadDir });
  const suites: [string, (page: Page) => Promise<void>][] = [
    ["content types", testContentTypes],
    ["type picker search", testTypeSearch],
    ["design pickers", testDesignPickers],
    ["undo / redo", testUndoRedo],
    ["presets", testPresets],
    ["copy", testCopy],
    ["downloads", (p) => testDownloads(p, downloadDir)],
  ];
  const selected = process.env.E2E_SUITES?.split(",").map((s) => s.trim());
  try {
    await openPlayground(page);
    for (const [name, run] of suites) {
      if (selected && !selected.includes(name)) continue;
      console.log(`\n${name}`);
      try {
        await run(page);
      } catch (error) {
        record(
          name,
          "suite",
          false,
          String(error instanceof Error ? error.message : error),
        );
        await openPlayground(page);
      }
    }
  } finally {
    await page.close();
    rmSync(downloadDir, { recursive: true, force: true });
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length} passed, ${failed.length} failed (${results.length} checks)`,
  );
  if (page.consoleErrors.length) {
    console.log(
      `page errors seen: ${page.consoleErrors.length} (first: ${page.consoleErrors[0]?.split("\n")[0]})`,
    );
  }
  return failed.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
