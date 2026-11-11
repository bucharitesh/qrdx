// bun run --filter docs i18n:docs --locale es   (or --all)
//
// Machine-translates the docs (content/docs) into the languages with docs
// (lib/i18n/config.ts `docs: true`) through Vercel AI Gateway: each page to
// <page>.<locale>.mdx beside the English one, and each folder's sidebar
// labels to meta.<locale>.json. Pages that are missing or stale (the English
// changed since) are translated; pages a native reviewer signed off are left
// alone unless their English changed.
//
// The model sees prose only: code blocks, imports, comments and JSX
// expression props are swapped for slots first (lib/i18n/mdx.ts). Every
// answer is checked (slots, inline code, URLs, {facts.x} tokens, tags and
// their props, headings, lists, tables, numbers, valid MDX) and retried once
// with the problems listed (twice); a page that still fails stays English, and the
// docs show it in English with a note. Headings keep their English anchors
// ([#id]), so links to #section work in every language.
//
// Records each file's English hash and status ("machine") in
// messages/review/docs/<locale>.json; i18n:check reports stale pages.
//
//   --locale <l>   one locale (repeatable)   --all       every docs language
//   --page <path>  only files starting with it, e.g. help/ (repeatable)
//   --force        redo machine translations too
//   --dry-run      list what would be sent
//   --record       no AI: record hand-made translations as they are
//
// Needs AI_GATEWAY_API_KEY (your own Vercel AI Gateway key). I18N_MODEL picks
// another gateway model. Token counts are printed per language.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createGateway, generateText } from "ai";
import { remarkHeading } from "fumadocs-core/mdx-plugins";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import { visit } from "unist-util-visit";
import { DEFAULT_LOCALE, LOCALE_INFO, type Locale } from "@/lib/i18n/config";
import {
  DOCS_LOCALES,
  translatedFile,
  translationLocale,
} from "@/lib/i18n/docs";
import { UNTRANSLATED_DOCS } from "@/lib/i18n/docs-check";
import {
  fileHash,
  frontmatterValue,
  maskMdx,
  mdxShape,
  pinIfAvailableIds,
  proseBraces,
  shapeProblems,
  splitChunks,
  splitFrontmatter,
  unmaskMdx,
  withFrontmatter,
} from "@/lib/i18n/mdx";

const DOCS = path.join(__dirname, "../content/docs");
const MESSAGES = path.join(__dirname, "../messages");
const REVIEW_DIR = path.join(MESSAGES, "review/docs");

/**
 * Not translated: the API reference is generated from the OpenAPI document
 * (bun run openapi:generate) and its operations render from it in English.
 */
const SKIP = UNTRANSLATED_DOCS;

const MODELS = process.env.I18N_MODEL
  ? [process.env.I18N_MODEL]
  : ["anthropic/claude-sonnet-5.5", "anthropic/claude-haiku-5.5"];
/** Words per request: long pages go in pieces, split before ## headings. */
const CHUNK_WORDS = 1400;
const CONCURRENCY = 6;
/** Tries per piece: the first answer, then retries told what was wrong. */
const ATTEMPTS = 3;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const values = (name: string) =>
  args.flatMap((arg, i) => (arg === name ? [args[i + 1] ?? ""] : []));

const TARGETS = DOCS_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);
const locales: Locale[] = flag("--all")
  ? [...TARGETS]
  : values("--locale").map((value) => {
      const locale = TARGETS.find((l) => l === value);
      if (!locale) {
        throw new Error(
          `"${value}" has no docs. One of: ${TARGETS.join(", ")} (lib/i18n/config.ts, docs: true)`,
        );
      }
      return locale;
    });
if (locales.length === 0) {
  console.error("Pass --locale <locale> or --all.");
  process.exit(1);
}
const pagePrefixes = values("--page");
const DRY = flag("--dry-run");
const FORCE = flag("--force");
const RECORD = flag("--record");

type Status = "machine" | "reviewed";
type ReviewFile = Record<string, { source: string; status: Status }>;

interface Glossary {
  keep: string[];
  fixed: Record<string, Partial<Record<Locale, string>>>;
  register: Partial<Record<Locale, string>>;
}
const glossary = JSON.parse(
  readFileSync(path.join(MESSAGES, "glossary.json"), "utf8"),
) as Glossary;

/** English content files, relative to content/docs. */
function englishFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const rel = path.relative(DOCS, full).split(path.sep).join("/");
        if (/\.(mdx|json)$/.test(rel) && !translationLocale(rel)) out.push(rel);
      }
    }
  };
  walk(DOCS);
  return out
    .filter(
      (file) =>
        file.endsWith(".mdx") ||
        // Sidebar files with labels; the root one only lists folders.
        (path.basename(file) === "meta.json" &&
          metaStrings(
            JSON.parse(readFileSync(path.join(DOCS, file), "utf8")) as Meta,
          ).size > 0),
    )
    .filter((file) => !SKIP.some((pattern) => pattern.test(file)))
    .filter(
      (file) =>
        pagePrefixes.length === 0 ||
        pagePrefixes.some((prefix) => file.startsWith(prefix)),
    )
    .sort();
}

const readReview = (locale: Locale): ReviewFile => {
  const file = path.join(REVIEW_DIR, `${locale}.json`);
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as ReviewFile)
    : {};
};
const writeReview = (locale: Locale, review: ReviewFile) => {
  mkdirSync(REVIEW_DIR, { recursive: true });
  const ordered = Object.fromEntries(
    Object.entries(review).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(
    path.join(REVIEW_DIR, `${locale}.json`),
    `${JSON.stringify(ordered, null, 2)}\n`,
  );
};

// ---------------------------------------------------------------- prompts

function systemPrompt(locale: Locale): string {
  const info = LOCALE_INFO[locale];
  const fixed = Object.entries(glossary.fixed)
    .flatMap(([term, byLocale]) =>
      byLocale[locale] ? [`- "${term}" → "${byLocale[locale]}"`] : [],
    )
    .join("\n");
  return [
    `You translate the documentation of QRdx (qrdx.dev), an open-source QR code platform, from English into ${info.englishName} (${locale}). The text is MDX (Markdown with JSX components).`,
    `Register: ${glossary.register[locale] ?? "natural, friendly, professional."} Write like a native technical writer: clear, plain and direct, the way good developer docs read in ${info.englishName}. Keep the meaning exact. Never add or drop a fact, step, number, feature, promise or caveat.`,
    [
      "Keep exactly as they are, character for character:",
      "- Slots like ⟦C3⟧, ⟦M0⟧, ⟦X1⟧ and {⟦E2⟧}: same slots, same order, each on the same line position (a slot alone on its line stays alone on its line).",
      "- Inline code in backticks, `like this`.",
      "- Link URLs: [translated text](/docs/unchanged-url). Translate the link text, page titles included.",
      "- Tokens like {facts.bodyPatterns}.",
      "- JSX and HTML tags and their attributes, in the same order. Translate only the values of title, description, label and alt attributes. Never translate value, href, name, feature, path, integration, type or any other attribute.",
      "- The Markdown structure: the same headings at the same levels, the same list items, table rows and columns, blank lines and indentation. Translate table cells and table headers (unless they're code).",
      "- Numbers, in Western digits, with the same values, times and dates in examples included (keep 7:00 PM as 7:00 PM). You may write thousands the way the language does (10,000 → 10.000 in Spanish).",
      "- Keyboard keys (Enter, Tab, ⌘K), file names, HTTP methods and headers, JSON keys, environment variables and command-line flags.",
    ].join("\n"),
    `Never translate these names (keep them exactly): ${glossary.keep.join(", ")}. Also keep other product, company and brand names, and code identifiers.`,
    `Use these fixed translations:\n${fixed}`,
    "Translate the names of buttons, menus and settings in the QRdx app naturally; the app is being translated into the same language.",
    "Never write a bare { or } or < in prose: in MDX they start code. Use words instead.",
    "Answer with the translation only, in exactly this format:\n<title>translated title</title>\n<description>translated description</description>\n<body>\ntranslated MDX\n</body>\nLeave <title> and <description> out when you are given none.",
  ].join("\n\n");
}

function userPrompt({
  file,
  title,
  description,
  chunk,
  part,
  notes,
}: {
  file: string;
  title?: string;
  description?: string;
  chunk: string;
  part: string;
  notes?: string[];
}): string {
  return [
    `Page: content/docs/${file}${part}.`,
    ...(title !== undefined ? [`<title>${title}</title>`] : []),
    ...(description !== undefined
      ? [`<description>${description}</description>`]
      : []),
    `<body>\n${chunk}\n</body>`,
    ...(notes?.length
      ? [
          `Your previous translation of this text was rejected:\n${notes.map((note) => `- ${note}`).join("\n")}\nTranslate it again and keep everything listed above exactly.`,
        ]
      : []),
  ].join("\n\n");
}

const tag = (text: string, name: string) => {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text);
  return match?.[1];
};

// ---------------------------------------------------------------- model

let gateway: ReturnType<typeof createGateway> | undefined;
let model = "";
const usage = new Map<
  Locale,
  { input: number; output: number; reasoning: number; requests: number }
>();

async function setup() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "AI_GATEWAY_API_KEY is not set. Use your own Vercel AI Gateway key, " +
        "or translate by hand and run this with --record. See CONTRIBUTING.md, Translating QRdx.",
    );
  }
  gateway = createGateway({ apiKey });
  const { models } = await gateway.getAvailableModels();
  const ids = new Set(models.map((entry) => entry.id));
  model = MODELS.find((id) => ids.has(id)) ?? (MODELS.at(-1) as string);
  console.log(`model: ${model}`);
}

async function ask(locale: Locale, prompt: string): Promise<string> {
  if (!gateway) throw new Error("setup() first");
  const result = await generateText({
    model: gateway(model),
    system: systemPrompt(locale),
    prompt,
    // Translation needs little deliberation; it keeps the bill to the words.
    reasoning: "low",
    maxOutputTokens: 32_000,
    // Anthropic only, as in lib/ai/models.ts (the subprocessors page names it).
    providerOptions: { gateway: { only: ["anthropic"] } },
  });
  const entry = usage.get(locale) ?? {
    input: 0,
    output: 0,
    reasoning: 0,
    requests: 0,
  };
  entry.requests++;
  entry.input += result.usage.inputTokens ?? 0;
  entry.output += result.usage.outputTokens ?? 0;
  entry.reasoning += result.usage.outputTokenDetails?.reasoningTokens ?? 0;
  usage.set(locale, entry);
  return result.text;
}

// ---------------------------------------------------------------- checks

const mdx = () => remark().use(remarkMdx).use(remarkGfm);

/** Parses as MDX, or says why not. */
function mdxError(text: string): string | null {
  try {
    mdx().parse(text);
    return null;
  } catch (error) {
    return (error as Error).message.split("\n")[0] ?? "invalid MDX";
  }
}

interface HeadingInfo {
  id: string;
  /** Offset just after the heading's text. */
  end: number;
  custom: boolean;
}

/** Headings in document order with the ids fumadocs gives them. */
function headings(text: string): HeadingInfo[] {
  const positions: { end: number; custom: boolean }[] = [];
  visit(mdx().parse(text), "heading", (node) => {
    const last = node.children.at(-1);
    positions.push({
      end: last?.position?.end.offset ?? node.position?.end.offset ?? 0,
      custom: last?.type === "text" && /\s*\[#[^\]]+]\s*$/.test(last.value),
    });
  });
  const tree = mdx().parse(text);
  // With generateToc off the transformer never reads the file.
  remarkHeading({ generateToc: false })(tree, { data: {} } as never, () => {});
  const ids: string[] = [];
  visit(tree, "heading", (node) => {
    ids.push(String(node.data?.hProperties?.id ?? ""));
  });
  return positions.map((position, i) => ({ ...position, id: ids[i] ?? "" }));
}

/** Gives every translated heading its English anchor: "## Título [#title]". */
function pinHeadingIds(english: string, translated: string): string {
  const source = headings(english);
  const target = headings(translated);
  if (source.length !== target.length) {
    throw new Error(
      `headings: ${source.length} in English, ${target.length} translated`,
    );
  }
  let out = translated;
  for (let i = target.length - 1; i >= 0; i--) {
    const want = source[i]?.id as string;
    const have = target[i] as HeadingInfo;
    // Every heading, even one whose own slug matches: anchors then never
    // depend on how the slugger numbers repeated headings.
    if (have.custom) continue;
    out = `${out.slice(0, have.end)} [#${want}]${out.slice(have.end)}`;
  }
  return out;
}

// ---------------------------------------------------------------- pages

async function translatePage(
  locale: Locale,
  file: string,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const english = readFileSync(path.join(DOCS, file), "utf8");
  const { frontmatter, body } = splitFrontmatter(english);
  const title = frontmatterValue(frontmatter, "title");
  const description = frontmatterValue(frontmatter, "description");
  const masked = maskMdx(body);
  const chunks = splitChunks(masked.text, CHUNK_WORDS);

  const translatedChunks: string[] = [];
  let translatedTitle: string | undefined;
  let translatedDescription: string | undefined;
  for (const [i, chunk] of chunks.entries()) {
    const first = i === 0;
    const part =
      chunks.length > 1 ? ` (part ${i + 1} of ${chunks.length})` : "";
    let notes: string[] | undefined;
    let accepted: string | undefined;
    for (
      let attempt = 0;
      attempt < ATTEMPTS && accepted === undefined;
      attempt++
    ) {
      const answer = await ask(
        locale,
        userPrompt({
          file,
          part,
          chunk,
          notes,
          ...(first && { title, description }),
        }),
      );
      const out = tag(answer, "body")?.replace(/^\n/, "").replace(/\n$/, "");
      const problems: string[] = [];
      if (out === undefined) problems.push("no <body> in the answer");
      else {
        problems.push(...shapeProblems(mdxShape(chunk), mdxShape(out)));
        if (proseBraces(out) > proseBraces(chunk)) {
          problems.push("a { or } in prose (MDX reads it as code)");
        }
      }
      if (first) {
        const t = tag(answer, "title")?.trim();
        const d = tag(answer, "description")?.trim();
        if (title !== undefined && !t) problems.push("no <title>");
        if (description !== undefined && !d) problems.push("no <description>");
        for (const [english, translated] of [
          [title, t],
          [description, d],
        ] as const) {
          const facts = (s?: string) =>
            (s?.match(/\{facts\.\w+\}/g) ?? []).sort().join();
          if (english !== undefined && facts(english) !== facts(translated)) {
            problems.push("title or description lost a {facts.x} token");
          }
        }
        translatedTitle = t;
        translatedDescription = d;
      }
      if (problems.length === 0) accepted = out;
      else {
        notes = problems;
        console.warn(
          `  ${locale}: ${attempt < ATTEMPTS - 1 ? "retrying" : "giving up on"} ${file}${part}: ${problems.join("; ").slice(0, 300)}`,
        );
      }
    }
    if (accepted === undefined) {
      return {
        ok: false,
        reason: `${file}${part}: ${(notes ?? []).join("; ")}`,
      };
    }
    translatedChunks.push(accepted);
  }

  let translatedBody = unmaskMdx(translatedChunks.join("\n"), masked.slots);
  translatedBody = pinIfAvailableIds(body, translatedBody);
  try {
    translatedBody = pinHeadingIds(body, translatedBody);
  } catch (error) {
    return { ok: false, reason: `${file}: ${(error as Error).message}` };
  }
  const values: Record<string, string> = {};
  if (translatedTitle) values.title = translatedTitle;
  if (translatedDescription) values.description = translatedDescription;
  const text = `---\n${withFrontmatter(frontmatter, values).join("\n")}\n---\n${
    body.startsWith("\n") ? "" : "\n"
  }${translatedBody}`;
  const invalid = mdxError(text.replace(/^---[\s\S]*?\n---\n/, ""));
  if (invalid) return { ok: false, reason: `${file}: invalid MDX: ${invalid}` };
  return { ok: true, text };
}

// ---------------------------------------------------------------- sidebar labels

interface Meta {
  title?: string;
  description?: string;
  pages?: string[];
  [key: string]: unknown;
}

/** The translatable strings in a meta.json: title, description, separators, link labels. */
function metaStrings(meta: Meta): Map<string, string> {
  const out = new Map<string, string>();
  if (meta.title) out.set("title", meta.title);
  if (meta.description) out.set("description", meta.description);
  meta.pages?.forEach((entry, i) => {
    const separator = /^---(?:\[[^\]]+])?(.+)---$/.exec(entry);
    const link = /^(?:external:)?(?:\[[^\]]+])?\[([^\]]+)]\(([^)]+)\)$/.exec(
      entry,
    );
    if (separator) out.set(`pages.${i}`, separator[1] as string);
    else if (link) out.set(`pages.${i}`, link[1] as string);
  });
  return out;
}

function applyMeta(meta: Meta, translations: Map<string, string>): Meta {
  const out: Meta = { ...meta };
  if (translations.has("title")) out.title = translations.get("title");
  if (translations.has("description")) {
    out.description = translations.get("description");
  }
  out.pages = meta.pages?.map((entry, i) => {
    const text = translations.get(`pages.${i}`);
    if (text === undefined) return entry;
    const separator = /^(---(?:\[[^\]]+])?)(.+)(---)$/.exec(entry);
    if (separator) return `${separator[1]}${text}${separator[3]}`;
    return entry.replace(/\[([^\]]+)]\(([^)]+)\)$/, `[${text}]($2)`);
  });
  return out;
}

async function translateMetas(
  locale: Locale,
  files: string[],
): Promise<Map<string, string>> {
  const entries = files.flatMap((file) => {
    const meta = JSON.parse(
      readFileSync(path.join(DOCS, file), "utf8"),
    ) as Meta;
    return [...metaStrings(meta)].map(([key, value]) => ({
      id: `${file}#${key}`,
      value,
    }));
  });
  if (entries.length === 0) return new Map();
  const answer = await ask(
    locale,
    [
      "These are the docs sidebar's labels: tab names, folder names, short tab descriptions and section separators. Keep them short, like the English. One per line, as id<TAB>text.",
      "<body>",
      ...entries.map((entry) => `${entry.id}\t${entry.value}`),
      "</body>",
    ].join("\n"),
  );
  const out = new Map<string, string>();
  for (const line of (tag(answer, "body") ?? "").split("\n")) {
    const [id, ...rest] = line.split("\t");
    const text = rest.join("\t").trim();
    if (id && text && entries.some((entry) => entry.id === id.trim())) {
      out.set(id.trim(), text);
    }
  }
  return out;
}

// ---------------------------------------------------------------- run

async function run(locale: Locale) {
  const review = readReview(locale);
  const files = englishFiles();
  const todo = files.filter((file) => {
    const target = path.join(DOCS, translatedFile(file, locale));
    const entry = review[file];
    const hash = fileHash(readFileSync(path.join(DOCS, file), "utf8"));
    if (!(existsSync(target) && entry)) return true;
    if (entry.source !== hash) return true;
    return FORCE && entry.status === "machine";
  });
  const pages = todo.filter((file) => file.endsWith(".mdx"));
  const metas = todo.filter((file) => file.endsWith("meta.json"));
  console.log(
    `${locale}: ${pages.length} page(s) and ${metas.length} sidebar file(s) to translate (of ${files.length})`,
  );
  if (DRY) {
    for (const file of todo) console.log(`  ${file}`);
    return { locale, failed: [] as string[] };
  }

  const failed: string[] = [];
  const record = (file: string) => {
    review[file] = {
      source: fileHash(readFileSync(path.join(DOCS, file), "utf8")),
      status: "machine",
    };
  };

  // Sidebar labels, in one request.
  if (metas.length > 0) {
    const translations = await translateMetas(locale, metas);
    for (const file of metas) {
      const meta = JSON.parse(
        readFileSync(path.join(DOCS, file), "utf8"),
      ) as Meta;
      const keys = [...metaStrings(meta).keys()];
      if (keys.length === 0) continue;
      const mine = new Map(
        keys.flatMap((key) => {
          const text = translations.get(`${file}#${key}`);
          return text ? [[key, text] as const] : [];
        }),
      );
      if (mine.size !== keys.length) {
        failed.push(`${file}: some sidebar labels weren't translated`);
        continue;
      }
      const translated = applyMeta(meta, mine);
      // The $schema path stays relative to the folder, as in meta.json.
      writeFileSync(
        path.join(DOCS, translatedFile(file, locale)),
        `${JSON.stringify(translated, null, 2)}\n`,
      );
      record(file);
    }
    writeReview(locale, review);
  }

  const queue = [...pages];
  let done = 0;
  const worker = async () => {
    for (;;) {
      const file = queue.shift();
      if (!file) return;
      try {
        const result = await translatePage(locale, file);
        if (result.ok) {
          writeFileSync(
            path.join(DOCS, translatedFile(file, locale)),
            result.text,
          );
          record(file);
          writeReview(locale, review);
        } else {
          failed.push(result.reason);
        }
      } catch (error) {
        failed.push(`${file}: ${(error as Error).message}`);
      }
      done++;
      if (done % 10 === 0 || done === pages.length) {
        console.log(`  ${locale}: ${done}/${pages.length}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  writeReview(locale, review);
  return { locale, failed };
}

/** --record: hand-made translations get a review entry for their English. */
function recordAll(locale: Locale) {
  const review = readReview(locale);
  let added = 0;
  for (const file of englishFiles()) {
    if (!existsSync(path.join(DOCS, translatedFile(file, locale)))) continue;
    const hash = fileHash(readFileSync(path.join(DOCS, file), "utf8"));
    if (review[file]?.source === hash) continue;
    review[file] = { source: hash, status: "machine" };
    added++;
  }
  writeReview(locale, review);
  console.log(`${locale}: recorded ${added} file(s)`);
}

async function main() {
  if (RECORD) {
    for (const locale of locales) recordAll(locale);
    return;
  }
  if (!DRY) await setup();
  const results = [];
  for (const locale of locales) results.push(await run(locale));
  for (const { locale, failed } of results) {
    for (const line of failed)
      console.warn(`${locale}: kept English for ${line}`);
  }
  for (const [locale, entry] of usage) {
    console.log(
      `${locale}: ${entry.requests} requests, ${entry.input.toLocaleString("en-US")} input + ${entry.output.toLocaleString("en-US")} output tokens (${entry.reasoning.toLocaleString("en-US")} of them reasoning)`,
    );
  }
  console.log(`model: ${model || "none"}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
