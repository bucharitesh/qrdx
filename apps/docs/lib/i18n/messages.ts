// Message catalogs (apps/docs/messages). English is the source; a key a
// translation lacks falls back to English, so a slip never shows a raw key.
import en from "@/messages/en.json";
import { DEFAULT_LOCALE, type Locale } from "./config";

export type Messages = typeof en;

type Catalog = Record<string, unknown>;

const isObject = (value: unknown): value is Catalog =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `base` with every string `override` has for the same key. */
export function mergeMessages<T extends Catalog>(
  base: T,
  override: unknown,
): T {
  if (!isObject(override)) return base;
  const out: Catalog = { ...base };
  for (const [key, value] of Object.entries(base)) {
    const next = override[key];
    if (isObject(value)) out[key] = mergeMessages(value, next);
    else if (typeof next === "string" && next.trim() !== "") out[key] = next;
  }
  return out as T;
}

/**
 * A locale's catalog over English. Found by path, so a new language needs
 * no code here; a missing file renders English (i18n:check reports it).
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === DEFAULT_LOCALE) return en;
  try {
    const catalog: unknown = (await import(`../../messages/${locale}.json`))
      .default;
    return mergeMessages(en, catalog);
  } catch {
    return en;
  }
}

/**
 * The parts of a catalog client components read, by dotted path
 * ("home.editor"), so the browser gets only those, not every page's copy.
 */
export function pickMessages(
  messages: Catalog,
  paths: readonly string[],
): Catalog {
  const out: Catalog = {};
  for (const path of paths) {
    const keys = path.split(".");
    let source: unknown = messages;
    for (const key of keys) source = isObject(source) ? source[key] : undefined;
    if (source === undefined) continue;
    let target = out;
    for (const key of keys.slice(0, -1)) {
      if (!isObject(target[key])) target[key] = {};
      target = target[key] as Catalog;
    }
    target[keys.at(-1) as string] = source;
  }
  return out;
}

/** What every page's client components translate: the shared chrome. */
export const CHROME_NAMESPACES = [
  "nav",
  "footer",
  "localeSwitcher",
  "consent",
] as const;
