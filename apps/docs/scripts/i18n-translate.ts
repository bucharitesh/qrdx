// bun run --filter docs i18n:translate --locale es   (or --all)
//
// Machine-translates the strings a locale lacks, and those whose English
// changed since they were translated (stale), through Vercel AI Gateway.
// Strings a native reviewer has signed off are never touched unless their
// English changed. Each request carries the glossary (messages/glossary.json),
// the key path and its namespace, the English and a length budget for short
// labels. Every answer is checked (same ICU arguments and tags, every number
// kept) and retried once; what still fails stays English and is listed.
//
// Two catalogs:
// - the UI (JSX copy, next-intl): messages/<locale>.json, with each string's
//   source hash and status ("machine") in messages/review/<locale>.json;
// - content (copy in TypeScript data, lib/i18n/content.ts): the sources in
//   lib/i18n/content-sources.ts, into messages/content/<locale>.json, a
//   translation memory keyed by each English string's hash.
// Both are saved after every request, so an interrupted run keeps its work.
//
//   --locale <l>     one locale (repeatable)   --all       every translated locale
//   --only ui|content  one catalog (default: both)
//   --keys <prefix>  only keys (or content paths) starting with it
//   --force          redo machine strings too  --dry-run   list what would be sent
//   --concurrency <n> requests at a time per locale (default 3)
//   --prune          drop content entries no source uses any more
//   --record         no AI: record the UI strings already in the catalog
//                    (after translating by hand), so i18n:check can tell
//                    when the English changes later
//
// Translating needs AI_GATEWAY_API_KEY in the environment: your own Vercel
// AI Gateway key (QRdx's isn't shared). I18N_MODEL picks another gateway
// model. The token count is printed at the end.
import "./i18n-env";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createGateway, generateText, Output } from "ai";
import { z } from "zod";
import {
  type Catalog,
  flatten,
  type ReviewFile,
  sourceHash,
  unflatten,
} from "@/lib/i18n/catalog";
import {
  LOCALE_INFO,
  TRANSLATED_LOCALES,
  type TranslatedLocale,
} from "@/lib/i18n/config";
import { hasDocs } from "@/lib/i18n/docs";
import type { TranslationMemory } from "@/lib/i18n/content";
import {
  CONTENT_SOURCES,
  type ContentString,
  contentEnglish,
} from "@/lib/i18n/content-sources";
import { numberMismatch, shapeMismatch } from "@/lib/i18n/icu";

const MESSAGES = path.join(__dirname, "../messages");
const MODELS = process.env.I18N_MODEL
  ? [process.env.I18N_MODEL]
  : ["anthropic/claude-sonnet-5.5", "anthropic/claude-haiku-5.5"];
const CHUNK = 30;
/** Characters of English per request, so long FAQ answers share a request with few others. */
const CHUNK_CHARS = 7000;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const values = (name: string) =>
  args.flatMap((arg, i) => (arg === name ? [args[i + 1] ?? ""] : []));

const locales: TranslatedLocale[] = flag("--all")
  ? [...TRANSLATED_LOCALES]
  : values("--locale").map((value) => {
      const locale = TRANSLATED_LOCALES.find((l) => l === value);
      if (!locale) {
        throw new Error(
          `Unknown locale "${value}". One of: ${TRANSLATED_LOCALES.join(", ")}`,
        );
      }
      return locale;
    });
if (locales.length === 0) {
  console.error("Pass --locale <locale> or --all.");
  process.exit(1);
}
const keyPrefixes = values("--keys");
const only = values("--only")[0];
if (only && only !== "ui" && only !== "content") {
  console.error('--only takes "ui" or "content".');
  process.exit(1);
}
const DRY = flag("--dry-run");
const FORCE = flag("--force");
const RECORD = flag("--record");
const PRUNE = flag("--prune");
const CONCURRENCY = Math.max(1, Number(values("--concurrency")[0] ?? 3) || 3);

/** A catalog or review file; a new locale starts from none. */
const readJson = <T>(file: string): T =>
  existsSync(path.join(MESSAGES, file))
    ? (JSON.parse(readFileSync(path.join(MESSAGES, file), "utf8")) as T)
    : ({} as T);
const writeJson = (file: string, value: unknown) => {
  mkdirSync(path.dirname(path.join(MESSAGES, file)), { recursive: true });
  writeFileSync(
    path.join(MESSAGES, file),
    `${JSON.stringify(value, null, 2)}\n`,
  );
};

interface Glossary {
  keep: string[];
  fixed: Record<string, Partial<Record<TranslatedLocale, string>>>;
  register: Partial<Record<TranslatedLocale, string>>;
  rules: string[];
}

const english = readJson<Catalog>("en.json");
const source = flatten(english);
const glossary = readJson<Glossary>("glossary.json");

/** Where each UI namespace appears, for the translator. */
const SURFACES: Record<string, string> = {
  meta: "the page <title> and meta description of the home page (search results)",
  nav: "the site header: menu names, dropdown links with one-line descriptions, buttons",
  footer: "the site footer: link columns and the copyright line",
  localeSwitcher: "the language menu in the footer",
  cta: "the closing call-to-action band shown above the footer on marketing pages",
  consent: "the cookie banner and the cookie settings dialog",
  home: "the home page of qrdx.dev, a free QR code generator",
  pricing:
    "the pricing page: plan cards, the comparison table, the guarantee and FAQ",
  docs: "the documentation site's interface: search, table of contents, page buttons, the language menu, the help center's boxes, the 404 page and a note on pages not translated yet",
  // i18n-site lane (marketing pages), kept in one block.
  common:
    "labels shared by many marketing pages: breadcrumbs, FAQ headings, 'see all' links, card badges",
  toolHero: "the hero at the top of the tools and landing pages",
  guarantee:
    "the Never-Hostage Guarantee page: what happens to QR codes when a plan ends",
  tools:
    "the free tools hub and its tools: bulk CSV generator, print size calculator, scan checker",
  scan: "the free online QR code and barcode scanner (camera and image upload)",
  barcodeGenerator:
    "the free barcode generator page (EAN, UPC, Code 128 and more)",
  qrGenerator:
    "the free QR code generator pages, one per content type, and their hub",
  seoTopics:
    "the 'QR codes for <industry>' and 'QR codes on <placement>' landing pages and their hubs",
  pageCodes:
    "sample QR codes shown on landing pages, each opening in the editor",
  templates: "the hosted page templates gallery",
  integrations: "the integrations directory and each integration's page",
  plugins: "the plugins page: Chrome, Figma, Raycast and Canva",
  mcp: "the MCP server page: connect QRdx to AI assistants",
  ai: "the AI QR code theme designer and the AI QR art page",
  compare: "the pages comparing QRdx with other QR code tools",
};

/** Short strings (labels, buttons) get a length budget. */
function budget(message: string): number | undefined {
  const words = message.trim().split(/\s+/).length;
  if (message.length > 48 || words > 6) return undefined;
  return Math.max(10, Math.round(message.length * 1.5));
}

function systemPrompt(locale: TranslatedLocale, plain: boolean): string {
  const info = LOCALE_INFO[locale];
  const fixed = Object.entries(glossary.fixed)
    .flatMap(([term, byLocale]) =>
      byLocale[locale] ? [`- "${term}" → "${byLocale[locale]}"`] : [],
    )
    .join("\n");
  return [
    `You translate the UI and marketing copy of QRdx (qrdx.dev), an open-source QR code generator, from English into ${info.englishName} (${locale}).`,
    `Register: ${glossary.register[locale] ?? "natural, friendly, professional."}`,
    `Rules:\n${glossary.rules.map((rule) => `- ${rule}`).join("\n")}`,
    "- Write numbers with Western digits (0-9), exactly as many and the same values as the English.",
    "- Plan names: Pro and Business stay in English; the Free plan uses the fixed translation below.",
    ...(plain
      ? []
      : [
          "- In these ICU messages an ASCII apostrophe (') right before {, }, # or < starts a quoted literal and breaks the message: for elisions and possessives use the typographic apostrophe (’), as in “l’<link>éditeur</link>”.",
          "- Every tag in the English (<link>…</link>, <code>…</code>) appears exactly once in the translation, around the words that mean the same thing; never merge, drop or nest them differently.",
        ]),
    ...(plain
      ? [
          "- These strings are plain text, not ICU messages: braces, quotes, URLs, file names, field names in single quotes and example values stay exactly as written.",
          "- Text in single quotes that names a button or setting in the QRdx editor ('Make it dynamic') is translated like a UI label, keeping the quotes.",
        ]
      : []),
    `Never translate these terms (keep them exactly): ${glossary.keep.join(", ")}.`,
    `Use these fixed translations:\n${fixed}`,
    "Return one translation per key, for every key you are given, with the key unchanged.",
  ].join("\n\n");
}

interface Item {
  key: string;
  english: string;
  /** Where it appears (content strings). */
  context?: string;
  note?: string;
}

function userPrompt(surface: string, items: Item[]): string {
  const lines = items.map(({ key, english: message, context, note }) => {
    const limit = budget(message);
    return JSON.stringify({
      key,
      ...(context && { context }),
      english: message,
      ...(limit && { maxLength: limit }),
      ...(note && { previousAttemptRejected: note }),
    });
  });
  return [
    `Surface: ${surface}.`,
    "Strings (one JSON object per line; maxLength is a soft budget in characters for short labels):",
    ...lines,
  ].join("\n");
}

const schema = z.object({
  translations: z.array(z.object({ key: z.string(), text: z.string() })),
});

let gateway: ReturnType<typeof createGateway> | undefined;
let model = "";
const usage = { input: 0, output: 0, requests: 0, errors: 0 };

async function setup() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI_GATEWAY_API_KEY is not set. Use your own Vercel AI Gateway key " +
        "(QRdx's isn't shared), or translate messages/<locale>.json by hand " +
        "and run this with --record. See CONTRIBUTING.md, Translating QRdx.",
    );
  }
  gateway = createGateway({ apiKey });
  // Listing the gateway's models is free; pick the strongest text model on it.
  const { models } = await gateway.getAvailableModels();
  const ids = new Set(models.map((entry) => entry.id));
  model = MODELS.find((id) => ids.has(id)) ?? (MODELS.at(-1) as string);
  console.log(`model: ${model}`);
}

async function request(
  locale: TranslatedLocale,
  surface: string,
  items: Item[],
  plain: boolean,
): Promise<Map<string, string>> {
  if (!gateway) throw new Error("setup() first");
  const result = await generateText({
    model: gateway(model),
    system: systemPrompt(locale, plain),
    prompt: userPrompt(surface, items),
    output: Output.object({ schema }),
    // Anthropic only, as in lib/ai/models.ts (the subprocessors page names it).
    providerOptions: { gateway: { only: ["anthropic"] } },
  });
  usage.requests++;
  usage.input += result.usage.inputTokens ?? 0;
  usage.output += result.usage.outputTokens ?? 0;
  const keys = new Set(items.map((item) => item.key));
  const out = new Map<string, string>();
  for (const { key, text } of result.output.translations) {
    if (keys.has(key)) out.set(key, text);
  }
  return out;
}

/** One request, retried once after a network or provider error. */
async function attempt(
  locale: TranslatedLocale,
  surface: string,
  items: Item[],
  plain: boolean,
): Promise<Map<string, string>> {
  try {
    return await request(locale, surface, items, plain);
  } catch (error) {
    usage.errors++;
    console.warn(
      `${locale}: request failed (${(error as Error).message}); retrying`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      return await request(locale, surface, items, plain);
    } catch (again) {
      usage.errors++;
      console.warn(
        `${locale}: request failed again: ${(again as Error).message}`,
      );
      return new Map();
    }
  }
}

interface Job {
  surface: string;
  items: Item[];
}

/** Splits items (in order) into requests of at most CHUNK strings and CHUNK_CHARS characters. */
function chunk(items: Item[]): Item[][] {
  const out: Item[][] = [];
  let current: Item[] = [];
  let chars = 0;
  for (const item of items) {
    if (
      current.length > 0 &&
      (current.length >= CHUNK || chars + item.english.length > CHUNK_CHARS)
    ) {
      out.push(current);
      current = [];
      chars = 0;
    }
    current.push(item);
    chars += item.english.length;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Translates every job, CONCURRENCY requests at a time: a first pass, then
 * one retry for the answers `problem` rejects (with the reason).
 */
async function translateJobs(
  locale: TranslatedLocale,
  jobs: Job[],
  plain: boolean,
  problem: (item: Item, text: string | undefined) => string | null,
  accept: (item: Item, text: string) => void,
  save: () => void,
): Promise<string[]> {
  const failed: string[] = [];
  const queue = [...jobs];
  let done = 0;
  const worker = async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const first = await attempt(locale, job.surface, job.items, plain);
      const retry: Item[] = [];
      for (const item of job.items) {
        const reason = problem(item, first.get(item.key));
        if (reason) retry.push({ ...item, note: reason });
        else accept(item, first.get(item.key) as string);
      }
      if (retry.length > 0) {
        const second = await attempt(locale, job.surface, retry, plain);
        for (const item of retry) {
          const reason = problem(item, second.get(item.key));
          if (reason) failed.push(`${item.context ?? item.key}: ${reason}`);
          else accept(item, second.get(item.key) as string);
        }
      }
      save();
      done++;
      if (done % 10 === 0 || queue.length === 0) {
        console.log(`${locale}: ${done} of ${jobs.length} requests done`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return failed;
}

// ---- The UI catalog -------------------------------------------------------

/** Saves the catalog and its review entries, in English key order. */
function saveUi(
  locale: TranslatedLocale,
  catalog: Map<string, string>,
  review: ReviewFile,
) {
  writeJson(`${locale}.json`, unflatten(catalog, english));
  const ordered: ReviewFile = {};
  for (const key of source.keys()) {
    const entry = review[key];
    if (entry && catalog.has(key)) ordered[key] = entry;
  }
  writeJson(`review/${locale}.json`, ordered);
}

/** --record: hand translations get a review entry for their English. */
function record(locale: TranslatedLocale) {
  const catalog = flatten(readJson<Catalog>(`${locale}.json`));
  const review = readJson<ReviewFile>(`review/${locale}.json`);
  let added = 0;
  for (const key of catalog.keys()) {
    const message = source.get(key);
    if (message === undefined) continue;
    const hash = sourceHash(message);
    if (review[key]?.source === hash) continue;
    review[key] = { source: hash, status: "machine" };
    added++;
  }
  saveUi(locale, catalog, review);
  console.log(`${locale}: recorded ${added} string(s)`);
}

async function runUi(locale: TranslatedLocale): Promise<string[]> {
  const catalog = flatten(readJson<Catalog>(`${locale}.json`));
  const review = readJson<ReviewFile>(`review/${locale}.json`);

  const todo = [...source.keys()].filter((key) => {
    if (keyPrefixes.length && !keyPrefixes.some((p) => key.startsWith(p))) {
      return false;
    }
    // The docs chrome only shows in languages with docs (lib/i18n/docs.ts).
    if (key.startsWith("docs.") && !hasDocs(locale)) return false;
    const entry = review[key];
    const fresh = entry?.source === sourceHash(source.get(key) ?? "");
    if (!(catalog.has(key) && entry)) return true;
    if (!fresh) return true;
    return FORCE && entry.status === "machine";
  });
  console.log(
    `${locale}: ${todo.length} of ${source.size} UI strings to translate`,
  );
  if (DRY || todo.length === 0) return [];

  // Requests stay within one surface (the top-level namespace), in catalog
  // order, so neighbouring strings give each other context.
  const groups = new Map<string, Item[]>();
  for (const key of todo) {
    const group = key.split(".")[0] as string;
    groups.set(group, [
      ...(groups.get(group) ?? []),
      { key, english: source.get(key) ?? "" },
    ]);
  }
  const jobs = [...groups].flatMap(([group, items]) =>
    chunk(items).map((part) => ({
      surface: SURFACES[group] ?? group,
      items: part,
    })),
  );

  return translateJobs(
    locale,
    jobs,
    false,
    (item, text) => {
      if (text === undefined || text.trim() === "") return "no translation";
      return shapeMismatch(item.english, text);
    },
    (item, text) => {
      catalog.set(item.key, text);
      review[item.key] = {
        source: sourceHash(item.english),
        status: "machine",
      };
    },
    () => saveUi(locale, catalog, review),
  );
}

// ---- Content (TypeScript copy) ------------------------------------------

const contentFile = (locale: TranslatedLocale) => `content/${locale}.json`;

/** Saves the memory in source order; unused entries last (or dropped with --prune). */
function saveContent(
  locale: TranslatedLocale,
  memory: TranslationMemory,
  strings: readonly ContentString[],
) {
  const ordered: TranslationMemory = {};
  for (const { english: text } of strings) {
    const hash = sourceHash(text);
    if (memory[hash]) ordered[hash] = memory[hash];
  }
  if (!PRUNE) {
    for (const [hash, entry] of Object.entries(memory)) {
      if (!ordered[hash]) ordered[hash] = entry;
    }
  }
  writeJson(contentFile(locale), ordered);
}

async function runContent(locale: TranslatedLocale): Promise<string[]> {
  const strings = contentEnglish();
  const memory = readJson<TranslationMemory>(contentFile(locale));
  const todo = strings.filter(({ english: text, context }) => {
    if (keyPrefixes.length && !keyPrefixes.some((p) => context.startsWith(p))) {
      return false;
    }
    const entry = memory[sourceHash(text)];
    if (!entry?.text.trim() || entry.source !== text) return true;
    return FORCE && entry.status === "machine";
  });
  console.log(
    `${locale}: ${todo.length} of ${strings.length} content strings to translate`,
  );
  if (DRY || todo.length === 0) {
    if (!DRY && PRUNE) saveContent(locale, memory, strings);
    return [];
  }

  // Requests stay within one page (the first two path segments), in source
  // order, so a page's strings give each other context.
  const surfaces = new Map(
    CONTENT_SOURCES.map((entry) => [entry.namespace, entry.surface]),
  );
  const groups = new Map<string, { surface: string; items: Item[] }>();
  for (const { english: text, context, namespace } of todo) {
    const group = context.split(".").slice(0, 3).join(".");
    const entry = groups.get(group) ?? {
      surface: surfaces.get(namespace) ?? namespace,
      items: [],
    };
    entry.items.push({ key: sourceHash(text), english: text, context });
    groups.set(group, entry);
  }
  // Small pages share a request with their neighbours from the same source.
  const jobs: Job[] = [];
  for (const { surface, items } of groups.values()) {
    const last = jobs.at(-1);
    if (
      last &&
      last.surface === surface &&
      last.items.length + items.length <= CHUNK &&
      [...last.items, ...items].reduce((sum, i) => sum + i.english.length, 0) <=
        CHUNK_CHARS
    ) {
      last.items.push(...items);
      continue;
    }
    for (const part of chunk(items)) jobs.push({ surface, items: part });
  }

  return translateJobs(
    locale,
    jobs,
    true,
    (item, text) => {
      if (text === undefined || text.trim() === "") return "no translation";
      return numberMismatch(item.english, text);
    },
    (item, text) => {
      memory[item.key] = {
        source: item.english,
        text,
        status: "machine",
        context: item.context ?? "",
      };
    },
    () => saveContent(locale, memory, strings),
  );
}

async function main() {
  if (RECORD) {
    for (const locale of locales) record(locale);
    return;
  }
  if (!DRY) await setup();
  const failed: string[] = [];
  for (const locale of locales) {
    if (only !== "content") {
      for (const line of await runUi(locale)) failed.push(`${locale}: ${line}`);
    }
    if (only !== "ui") {
      for (const line of await runContent(locale)) {
        failed.push(`${locale}: ${line}`);
      }
    }
  }
  for (const line of failed) console.warn(`kept English for ${line}`);
  console.log(
    `\n${usage.requests} requests (${usage.errors} errors), ${usage.input.toLocaleString("en-US")} input + ${usage.output.toLocaleString("en-US")} output tokens (${model || "none"})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
