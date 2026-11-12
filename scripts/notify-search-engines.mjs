#!/usr/bin/env node
// Tells search engines which qrdx.dev pages changed. Node 22, no packages.
//
// IndexNow always: Bing, Yandex, Seznam, Naver and the other IndexNow engines
// share what one of them receives. The Bing Webmaster API too, when
// BING_WEBMASTER_API_KEY is set: it resubmits the sitemap, then submits the
// URLs, up to the site's daily quota.
//
//   node scripts/notify-search-engines.mjs --all           every sitemap URL
//   node scripts/notify-search-engines.mjs --important     the main pages
//   node scripts/notify-search-engines.mjs --urls <file>   paths or URLs, one per line
//   node scripts/notify-search-engines.mjs --snapshot <file>
//       saves the live sitemap, before a deploy
//   node scripts/notify-search-engines.mjs --changed-since <file>
//       the URLs that are new or have a new lastmod since that saved sitemap
//   node scripts/notify-search-engines.mjs --check
//       reads only: is the IndexNow key file live, does the Bing key work,
//       is qrdx.dev verified for it and what's today's quota
//
// Add --dry-run to print what would be sent without sending anything. Only
// URLs in the live sitemap are sent. A search engine error is a warning and
// never fails a run that sends; bad arguments exit with 2, and --check with
// 1 when Bing rejects the key or the site.
// .github/workflows/notify-search-engines.yml runs it after every
// production deploy, from the Actions tab, and with --check on pull requests
// that change it.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const SITE = "https://qrdx.dev";
export const SITEMAP_URL = `${SITE}/sitemap.xml`;

/**
 * The IndexNow key. apps/docs/public/<key>.txt serves it, which proves the
 * submissions come from the site's owner (tests/repo checks the two match).
 */
export const INDEXNOW_KEY = "16c804a6f4ac077e1778c4c29c898228";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** IndexNow takes up to 10,000 URLs per request. */
export const INDEXNOW_MAX = 10_000;

const BING_API = "https://ssl.bing.com/webmaster/api.svc/json";
/** SubmitUrlBatch takes up to 500 URLs, and no more than the daily quota. */
export const BING_BATCH_MAX = 500;

/** Sent to Bing when the changed pages can't be worked out. */
export const IMPORTANT_PATHS = [
  "/",
  "/playground",
  "/pricing",
  "/qr-code-api",
  "/mcp",
  "/barcode-generator",
  "/qr-code-generator",
  "/compare",
];

const TIMEOUT_MS = 30_000;
const inActions = process.env.GITHUB_ACTIONS === "true";

function warn(message) {
  console.log(inActions ? `::warning::${message}` : `Warning: ${message}`);
}

function notice(message) {
  console.log(inActions ? `::notice::${message}` : message);
}

/** A URL without a trailing slash (the root keeps its "/"), for comparing. */
export function normalizeUrl(value) {
  const url = new URL(value);
  const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path}${url.search}`;
}

const XML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};
const decodeXml = (text) =>
  text.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]);

/** The `{ url, lastmod }` of every <url> in a sitemap. */
export function parseSitemap(xml) {
  const entries = [];
  for (const [, block] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(block)?.[1];
    if (!loc) continue;
    const lastmod = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(block)?.[1];
    entries.push({ url: decodeXml(loc), lastmod });
  }
  return entries;
}

/** URLs in `after` that `before` doesn't have, or whose lastmod changed. */
export function changedUrls(before, after) {
  const old = new Map(before.map((e) => [normalizeUrl(e.url), e.lastmod]));
  return after
    .filter((e) => {
      const key = normalizeUrl(e.url);
      return !old.has(key) || old.get(key) !== e.lastmod;
    })
    .map((e) => e.url);
}

/**
 * Paths or URLs as the sitemap writes them, in the order given and without
 * repeats. Anything not in the sitemap is returned as `dropped`.
 */
export function inSitemap(items, sitemapUrls, site = SITE) {
  const live = new Map(sitemapUrls.map((url) => [normalizeUrl(url), url]));
  const kept = new Set();
  const dropped = [];
  for (const raw of items) {
    const item = raw.trim();
    if (!item) continue;
    let url;
    try {
      url = live.get(normalizeUrl(new URL(item, site).toString()));
    } catch {
      url = undefined;
    }
    if (url) kept.add(url);
    else dropped.push(item);
  }
  return { kept: [...kept], dropped };
}

/** The site's URL as Bing Webmaster Tools registered it, if it's verified. */
export function pickBingSite(sites, site = SITE) {
  const host = new URL(site).hostname;
  const matches = (sites ?? []).filter((s) => {
    try {
      return new URL(s.Url).hostname === host;
    } catch {
      return false;
    }
  });
  const verified = matches.filter((s) => s.IsVerified);
  const https = verified.find((s) => s.Url.startsWith("https:"));
  return (https ?? verified[0])?.Url;
}

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return {
    status: response.status,
    ok: response.ok,
    text: await response.text(),
  };
}

async function loadSitemap() {
  const { ok, status, text } = await request(SITEMAP_URL);
  if (!ok) throw new Error(`${SITEMAP_URL} answered HTTP ${status}`);
  return text;
}

/** A short, key-free description of an error response. */
function errorText(text, secret) {
  let message = text;
  try {
    const json = JSON.parse(text);
    message = json.Message ?? json.message ?? text;
  } catch {
    // Not JSON: keep the text.
  }
  const short = String(message).replace(/\s+/g, " ").trim().slice(0, 200);
  return secret ? short.replaceAll(secret, "***") : short;
}

const KEY_LOCATION = `${SITE}/${INDEXNOW_KEY}.txt`;

/** Whether the site serves the IndexNow key file (IndexNow rejects us if not). */
async function keyFileServed() {
  const keyFile = await request(KEY_LOCATION).catch((error) => ({
    ok: false,
    status: error.name,
    text: "",
  }));
  return {
    served: keyFile.ok && keyFile.text.trim() === INDEXNOW_KEY,
    status: keyFile.status,
  };
}

async function sendIndexNow(urls, results) {
  if (urls.length === 0) {
    results.push(["IndexNow", "0 URLs", "nothing to send"]);
    return;
  }
  const keyFile = await keyFileServed();
  if (!keyFile.served) {
    warn(
      `IndexNow: ${KEY_LOCATION} doesn't serve the key (HTTP ${keyFile.status}); skipped.`
    );
    results.push(["IndexNow", `${urls.length} URLs`, "skipped: key file"]);
    return;
  }
  const urlList = urls.slice(0, INDEXNOW_MAX);
  const response = await request(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(SITE).host,
      key: INDEXNOW_KEY,
      keyLocation: KEY_LOCATION,
      urlList,
    }),
  });
  // 200: accepted. 202: accepted, key check pending.
  if (!response.ok) {
    warn(
      `IndexNow answered HTTP ${response.status}: ${errorText(response.text)}`
    );
  }
  results.push([
    "IndexNow",
    `${urlList.length} URLs`,
    `HTTP ${response.status}`,
  ]);
}

async function callBing(method, key, { query = {}, body } = {}) {
  const url = new URL(`${BING_API}/${method}`);
  for (const [name, value] of Object.entries(query)) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set("apikey", key);
  const response = await request(url, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = JSON.parse(response.text)?.d;
  } catch {
    data = undefined;
  }
  return { ...response, data, error: errorText(response.text, key) };
}

async function sendBing(urls, results) {
  const key = process.env.BING_WEBMASTER_API_KEY?.trim();
  if (!key) {
    notice(
      "Bing: BING_WEBMASTER_API_KEY isn't set; skipped the Bing Webmaster API."
    );
    results.push(["Bing", "-", "skipped: no API key"]);
    return;
  }

  const sites = await callBing("GetUserSites", key);
  const siteUrl = sites.ok ? pickBingSite(sites.data) : undefined;
  if (!siteUrl) {
    warn(
      sites.ok
        ? `Bing: ${SITE} isn't a verified site for this API key; skipped.`
        : `Bing GetUserSites answered HTTP ${sites.status}: ${sites.error}`
    );
    results.push(["Bing", "-", `skipped: GetUserSites HTTP ${sites.status}`]);
    return;
  }

  const feed = await callBing("SubmitFeed", key, {
    body: { siteUrl, feedUrl: SITEMAP_URL },
  });
  if (!feed.ok) {
    warn(`Bing SubmitFeed answered HTTP ${feed.status}: ${feed.error}`);
  }
  results.push(["Bing", "sitemap", `HTTP ${feed.status}`]);

  if (urls.length === 0) {
    results.push(["Bing", "0 URLs", "nothing to send"]);
    return;
  }
  const quota = await callBing("GetUrlSubmissionQuota", key, {
    query: { siteUrl },
  });
  const daily = quota.ok ? Number(quota.data?.DailyQuota) : Number.NaN;
  if (!Number.isFinite(daily)) {
    warn(
      `Bing GetUrlSubmissionQuota answered HTTP ${quota.status}: ${quota.error}`
    );
    results.push(["Bing", `${urls.length} URLs`, "skipped: quota unknown"]);
    return;
  }
  const urlList = urls.slice(0, Math.min(daily, BING_BATCH_MAX));
  if (urlList.length === 0) {
    warn(
      "Bing: today's URL submission quota is used up; sent the sitemap only."
    );
    results.push(["Bing", `${urls.length} URLs`, "skipped: quota 0"]);
    return;
  }
  const batch = await callBing("SubmitUrlBatch", key, {
    body: { siteUrl, urlList },
  });
  if (!batch.ok) {
    warn(`Bing SubmitUrlBatch answered HTTP ${batch.status}: ${batch.error}`);
  }
  results.push([
    "Bing",
    `${urlList.length} of ${urls.length} URLs (quota ${daily})`,
    `HTTP ${batch.status}`,
  ]);
}

/**
 * --check. Reads only, never submits: the IndexNow key file, then the Bing
 * key, the site's verification and today's quota. False when Bing rejects
 * the key or the site; a missing key or an undeployed key file is fine.
 */
async function checkSetup(results) {
  const keyFile = await keyFileServed();
  results.push([
    "IndexNow",
    "key file",
    keyFile.served
      ? `served at ${KEY_LOCATION}`
      : `not served yet (HTTP ${keyFile.status}); it goes live with the deploy`,
  ]);

  const key = process.env.BING_WEBMASTER_API_KEY?.trim();
  if (!key) {
    notice("Bing: BING_WEBMASTER_API_KEY isn't set; nothing to check.");
    results.push(["Bing", "API key", "not set"]);
    return true;
  }

  const sites = await callBing("GetUserSites", key);
  if (!sites.ok) {
    warn(`Bing GetUserSites answered HTTP ${sites.status}: ${sites.error}`);
    results.push(["Bing", "API key", `HTTP ${sites.status}: ${sites.error}`]);
    return false;
  }
  results.push(["Bing", "API key", "accepted"]);
  const siteUrl = pickBingSite(sites.data);
  const listed = (sites.data ?? []).find((s) => {
    try {
      return new URL(s.Url).hostname === new URL(SITE).hostname;
    } catch {
      return false;
    }
  });
  results.push([
    "Bing",
    "site",
    siteUrl
      ? `${siteUrl} verified`
      : listed
        ? `${listed.Url} added but not verified`
        : `${SITE} not added to Bing Webmaster Tools`,
  ]);

  const quota = await callBing("GetUrlSubmissionQuota", key, {
    query: { siteUrl: siteUrl ?? `${SITE}/` },
  });
  if (!quota.ok) {
    warn(
      `Bing GetUrlSubmissionQuota answered HTTP ${quota.status}: ${quota.error}`
    );
    results.push(["Bing", "quota", `HTTP ${quota.status}: ${quota.error}`]);
    return false;
  }
  results.push([
    "Bing",
    "quota",
    `${quota.data?.DailyQuota} URLs today, ${quota.data?.MonthlyQuota} this month`,
  ]);
  return Boolean(siteUrl);
}

function report(results, { title = "Search engines", column = "Sent" } = {}) {
  const width = Math.max(...results.map(([, sent]) => sent.length));
  for (const [engine, sent, outcome] of results) {
    console.log(`${engine.padEnd(9)} ${sent.padEnd(width)}  ${outcome}`);
  }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    const rows = results.map((row) => `| ${row.join(" | ")} |`).join("\n");
    writeFileSync(
      summary,
      `### ${title}\n\n| Engine | ${column} | Result |\n| --- | --- | --- |\n${rows}\n`,
      { flag: "a" }
    );
  }
}

const USAGE =
  "Usage: notify-search-engines.mjs (--all | --important | --urls <file> | --changed-since <file> | --snapshot <file> | --check) [--dry-run]";

export async function main(argv = process.argv.slice(2)) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        all: { type: "boolean" },
        important: { type: "boolean" },
        urls: { type: "string" },
        "changed-since": { type: "string" },
        snapshot: { type: "string" },
        check: { type: "boolean" },
        "dry-run": { type: "boolean" },
      },
    }));
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`);
    return 2;
  }
  const modes = [
    "all",
    "important",
    "urls",
    "changed-since",
    "snapshot",
    "check",
  ].filter((mode) => values[mode] !== undefined);
  if (modes.length !== 1) {
    console.error(USAGE);
    return 2;
  }

  if (values.check) {
    const results = [];
    let ok = false;
    try {
      ok = await checkSetup(results);
    } catch (error) {
      warn(`Check failed: ${error.message}`);
    }
    report(results, { title: "Search engine setup", column: "Checked" });
    return ok ? 0 : 1;
  }

  let xml;
  try {
    xml = await loadSitemap();
  } catch (error) {
    warn(`Couldn't read the sitemap: ${error.message}. Nothing sent.`);
    return 0;
  }

  if (values.snapshot) {
    writeFileSync(values.snapshot, xml);
    console.log(
      `Saved ${parseSitemap(xml).length} sitemap URLs to ${values.snapshot}.`
    );
    return 0;
  }

  const sitemap = parseSitemap(xml);
  const all = sitemap.map((entry) => entry.url);
  const important = inSitemap(IMPORTANT_PATHS, all).kept;
  // What each engine gets. IndexNow has no quota; Bing's is small.
  let plan;
  if (values.all) {
    plan = { indexNow: all, bing: all, source: "every sitemap URL" };
  } else if (values.important) {
    plan = { indexNow: important, bing: important, source: "the main pages" };
  } else if (values.urls) {
    let lines;
    try {
      lines = readFileSync(values.urls, "utf8").split(/\s+/);
    } catch (error) {
      console.error(`Couldn't read ${values.urls}: ${error.message}`);
      return 2;
    }
    const { kept, dropped } = inSitemap(lines, all);
    if (dropped.length > 0) {
      warn(`Not in the sitemap, so not sent: ${dropped.join(", ")}`);
    }
    plan = { indexNow: kept, bing: kept, source: values.urls };
  } else {
    let before = [];
    try {
      before = parseSitemap(readFileSync(values["changed-since"], "utf8"));
    } catch {
      before = [];
    }
    if (before.length === 0) {
      warn(
        "No saved sitemap to compare with: sending every URL to IndexNow and the main pages to Bing."
      );
      plan = { indexNow: all, bing: important, source: "fallback" };
    } else {
      const changed = changedUrls(before, sitemap);
      plan = {
        indexNow: changed,
        bing: changed,
        source: "changed since the last deploy",
      };
    }
  }

  console.log(
    `${plan.indexNow.length} URLs (${plan.source}) of ${all.length} in the sitemap.`
  );
  for (const url of plan.indexNow.slice(0, 50)) console.log(`  ${url}`);
  if (plan.indexNow.length > 50) {
    console.log(`  … and ${plan.indexNow.length - 50} more`);
  }
  if (values["dry-run"]) {
    console.log("Dry run: nothing sent.");
    return 0;
  }

  const results = [];
  try {
    await sendIndexNow(plan.indexNow, results);
  } catch (error) {
    warn(`IndexNow failed: ${error.message}`);
    results.push(["IndexNow", `${plan.indexNow.length} URLs`, "failed"]);
  }
  try {
    await sendBing(plan.bing, results);
  } catch (error) {
    warn(`Bing failed: ${error.message}`);
    results.push(["Bing", `${plan.bing.length} URLs`, "failed"]);
  }
  report(results);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main();
}
