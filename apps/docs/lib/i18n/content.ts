// Translations of copy that lives in TypeScript data rather than in JSX: the
// generator and SEO landing pages (lib/qr-types-content.ts, lib/seo-content)
// and other page data. The English stays in those files, as the source.
//
// These translations are a translation memory: messages/content/<locale>.json
// maps the hash of each English string to its translation, with the English
// beside it for reviewers. Lookup by the English itself (not by where it
// sits) survives reordering, and the variants a deployment's settings make
// (lib/seo-content/availability.ts drops sentences about custom domains).
// When the English changes, its hash does too: that string shows in English
// until it's translated again, so a stale translation never states an
// outdated fact.
//
// lib/i18n/content-sources.ts lists the data (and its variants) that
// scripts/i18n-translate.ts translates; pages render it with
// localizeContent() (lib/i18n/content-server.ts), client components with
// useContentText() (components/i18n/content-text.tsx). Client-safe: no
// Node imports here.

/** Keys that hold identifiers, links or numbers, never copy. */
const NEVER_COPY = new Set([
  "id",
  "key",
  "slug",
  "type",
  "kind",
  "page",
  "group",
  "image",
  "icon",
  "href",
  "url",
  "path",
  "basePath",
  "related",
  "meters",
  "value",
  "logo",
  "color",
  "variant",
]);

export interface ContentRules {
  /** More keys to leave in English wherever they appear ("example"). */
  skip?: readonly string[];
}

/** One translated string: its English, the translation and its review state. */
export interface MemoryEntry {
  source: string;
  text: string;
  status: "machine" | "reviewed";
  /** Where the English first appears (lib/i18n/content-sources.ts), for context. */
  context: string;
}

/** messages/content/<locale>.json: sourceHash(english) → entry. */
export type TranslationMemory = Record<string, MemoryEntry>;

type Visit = (path: string, english: string) => string | undefined;

/** True for a string with words to translate (not a number, symbol or bare link). */
export function isCopy(text: string): boolean {
  return (
    /\p{L}/u.test(text) && !/^(?:https?:|mailto:|\/)\S*$/.test(text.trim())
  );
}

/**
 * An array element's key in a path: its slug, id, key or type when every
 * element has a distinct one, else its index. Paths are context for
 * translators; lookups don't depend on them.
 */
function elementKeys(items: readonly unknown[]): string[] {
  for (const field of ["slug", "id", "key", "type"]) {
    const keys = items.map((item) =>
      item && typeof item === "object" && field in item
        ? (item as Record<string, unknown>)[field]
        : undefined,
    );
    if (
      keys.every((key) => typeof key === "string" && /^[\w-]+$/.test(key)) &&
      new Set(keys).size === keys.length
    ) {
      return keys as string[];
    }
  }
  return items.map((_, index) => String(index));
}

const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

function walk(
  value: unknown,
  path: string,
  visit: Visit,
  skip: ReadonlySet<string>,
): unknown {
  if (typeof value === "string") {
    return isCopy(value) ? (visit(path, value) ?? value) : value;
  }
  if (Array.isArray(value)) {
    const keys = elementKeys(value);
    let changed = false;
    const out = value.map((item, index) => {
      const next = walk(item, join(path, keys[index] as string), visit, skip);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? out : value;
  }
  // Plain data only: class instances, functions, React components and
  // elements (icons) pass through untouched.
  if (
    value === null ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    "$$typeof" in value
  ) {
    return value;
  }
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (NEVER_COPY.has(key) || skip.has(key)) {
      out[key] = item;
      continue;
    }
    const next = walk(item, join(path, key), visit, skip);
    if (next !== item) changed = true;
    out[key] = next;
  }
  return changed ? out : value;
}

/**
 * Every translatable string in `data` with the path it first appears at
 * (under `namespace`), in order.
 */
export function contentStrings(
  namespace: string,
  data: unknown,
  rules: ContentRules = {},
): Map<string, string> {
  const out = new Map<string, string>();
  walk(
    data,
    namespace,
    (path, english) => {
      if (!out.has(english)) out.set(english, path);
      return undefined;
    },
    new Set(rules.skip),
  );
  return out;
}

/**
 * `data` with every string `translate` returns a translation for replaced.
 * Structure, identifiers and untranslated strings are kept; branches with
 * nothing translated keep their identity.
 */
export function overlayContent<T>(
  data: T,
  translate: (english: string) => string | undefined,
  rules: ContentRules = {},
): T {
  return walk(
    data,
    "",
    (_path, english) => translate(english),
    new Set(rules.skip),
  ) as T;
}
