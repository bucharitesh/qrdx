// pnpm --filter docs i18n:translate --locale es   (or --all)
//
// Machine-translates the strings a locale lacks, and those whose English
// changed since they were translated (stale), through Vercel AI Gateway.
// Strings a native reviewer has signed off are never touched unless their
// English changed. Each request carries the glossary (messages/glossary.json),
// the key path and its namespace, the English and a length budget for short
// labels. Every answer is checked (same ICU arguments and tags, every number
// kept) and retried once; what still fails stays English and is listed.
//
// Writes messages/<locale>.json and records each string's source hash and
// status ("machine") in messages/review/<locale>.json.
//
//   --locale <l>  one locale (repeatable)    --all     every translated locale
//   --keys <glob> only keys starting with it --force   redo machine strings too
//   --dry-run     list what would be sent
//
// Needs AI_GATEWAY_API_KEY in the environment. This is the only AI spend in
// the i18n workflow; the token count is printed at the end.
import { readFileSync, writeFileSync } from "node:fs";
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
import { shapeMismatch } from "@/lib/i18n/icu";

const MESSAGES = path.join(__dirname, "../messages");
const MODELS = ["anthropic/claude-sonnet-5.5", "anthropic/claude-haiku-5.5"];
const CHUNK = 30;

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
const DRY = flag("--dry-run");
const FORCE = flag("--force");

const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(MESSAGES, file), "utf8")) as T;
const writeJson = (file: string, value: unknown) =>
  writeFileSync(
    path.join(MESSAGES, file),
    `${JSON.stringify(value, null, 2)}\n`,
  );

interface Glossary {
  keep: string[];
  fixed: Record<string, Partial<Record<TranslatedLocale, string>>>;
  register: Partial<Record<TranslatedLocale, string>>;
  rules: string[];
}

const english = readJson<Catalog>("en.json");
const source = flatten(english);
const glossary = readJson<Glossary>("glossary.json");

/** Where each namespace appears, for the translator. */
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
};

/** Short strings (labels, buttons) get a length budget. */
function budget(message: string): number | undefined {
  const words = message.trim().split(/\s+/).length;
  if (message.length > 48 || words > 6) return undefined;
  return Math.max(10, Math.round(message.length * 1.5));
}

function systemPrompt(locale: TranslatedLocale): string {
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
    `Never translate these terms (keep them exactly): ${glossary.keep.join(", ")}.`,
    `Use these fixed translations:\n${fixed}`,
    "Return one translation per key, for every key you are given, with the key unchanged.",
  ].join("\n\n");
}

function userPrompt(
  keys: string[],
  notes: Map<string, string> = new Map(),
): string {
  const namespace = keys[0]?.split(".")[0] ?? "";
  const lines = keys.map((key) => {
    const message = source.get(key) ?? "";
    const limit = budget(message);
    const note = notes.get(key);
    return JSON.stringify({
      key,
      english: message,
      ...(limit && { maxLength: limit }),
      ...(note && { previousAttemptRejected: note }),
    });
  });
  return [
    `Surface: ${SURFACES[namespace] ?? namespace}.`,
    "Strings (one JSON object per line; maxLength is a soft budget in characters for short labels):",
    ...lines,
  ].join("\n");
}

const schema = z.object({
  translations: z.array(z.object({ key: z.string(), text: z.string() })),
});

let gateway: ReturnType<typeof createGateway> | undefined;
let model = "";
const usage = { input: 0, output: 0, requests: 0 };

async function setup() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error("AI_GATEWAY_API_KEY is not set.");
  gateway = createGateway({ apiKey });
  // Listing the gateway's models is free; pick the strongest text model on it.
  const { models } = await gateway.getAvailableModels();
  const ids = new Set(models.map((entry) => entry.id));
  model = MODELS.find((id) => ids.has(id)) ?? (MODELS.at(-1) as string);
  console.log(`model: ${model}`);
}

async function translate(
  locale: TranslatedLocale,
  keys: string[],
  notes?: Map<string, string>,
): Promise<Map<string, string>> {
  if (!gateway) throw new Error("setup() first");
  const result = await generateText({
    model: gateway(model),
    system: systemPrompt(locale),
    prompt: userPrompt(keys, notes),
    output: Output.object({ schema }),
    // Anthropic only, as in lib/ai/models.ts (the subprocessors page names it).
    providerOptions: { gateway: { only: ["anthropic"] } },
  });
  usage.requests++;
  usage.input += result.usage.inputTokens ?? 0;
  usage.output += result.usage.outputTokens ?? 0;
  const out = new Map<string, string>();
  for (const { key, text } of result.output.translations) {
    if (keys.includes(key)) out.set(key, text);
  }
  return out;
}

/** Why a translation can't be used, or null. */
function problem(key: string, text: string | undefined): string | null {
  if (text === undefined || text.trim() === "") return "no translation";
  return shapeMismatch(source.get(key) ?? "", text);
}

async function run(locale: TranslatedLocale) {
  const catalog = flatten(readJson<Catalog>(`${locale}.json`));
  const review = readJson<ReviewFile>(`review/${locale}.json`);

  const todo = [...source.keys()].filter((key) => {
    if (keyPrefixes.length && !keyPrefixes.some((p) => key.startsWith(p))) {
      return false;
    }
    const entry = review[key];
    const fresh = entry?.source === sourceHash(source.get(key) ?? "");
    if (!(catalog.has(key) && entry)) return true;
    if (!fresh) return true;
    return FORCE && entry.status === "machine";
  });
  console.log(
    `${locale}: ${todo.length} of ${source.size} strings to translate`,
  );
  if (DRY || todo.length === 0) return { locale, failed: [] as string[] };

  // Chunks stay within one surface (the top-level namespace), in catalog
  // order, so neighbouring strings give each other context.
  const groups = new Map<string, string[]>();
  for (const key of todo) {
    const group = key.split(".")[0] as string;
    groups.set(group, [...(groups.get(group) ?? []), key]);
  }
  const chunks = [...groups.values()].flatMap((keys) =>
    Array.from({ length: Math.ceil(keys.length / CHUNK) }, (_, i) =>
      keys.slice(i * CHUNK, (i + 1) * CHUNK),
    ),
  );

  const failed: string[] = [];
  const accept = (key: string, text: string) => {
    catalog.set(key, text);
    review[key] = {
      source: sourceHash(source.get(key) ?? ""),
      status: "machine",
    };
  };

  // A few requests at a time.
  const queue = [...chunks];
  const worker = async () => {
    for (;;) {
      const keys = queue.shift();
      if (!keys) return;
      const first = await translate(locale, keys);
      const notes = new Map<string, string>();
      for (const key of keys) {
        const reason = problem(key, first.get(key));
        if (reason) notes.set(key, reason);
        else accept(key, first.get(key) as string);
      }
      if (notes.size === 0) continue;
      const retry = await translate(locale, [...notes.keys()], notes);
      for (const key of notes.keys()) {
        const reason = problem(key, retry.get(key));
        if (reason) failed.push(`${key}: ${reason}`);
        else accept(key, retry.get(key) as string);
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  writeJson(`${locale}.json`, unflatten(catalog, english));
  const ordered: ReviewFile = {};
  for (const key of source.keys()) {
    const entry = review[key];
    if (entry) ordered[key] = entry;
  }
  writeJson(`review/${locale}.json`, ordered);
  return { locale, failed };
}

async function main() {
  if (!DRY) await setup();
  const results = [];
  for (const locale of locales) results.push(await run(locale));
  for (const { locale, failed } of results) {
    for (const line of failed) {
      console.warn(`${locale}: kept English for ${line}`);
    }
  }
  console.log(
    `\n${usage.requests} requests, ${usage.input.toLocaleString("en-US")} input + ${usage.output.toLocaleString("en-US")} output tokens (${model || "none"})`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
