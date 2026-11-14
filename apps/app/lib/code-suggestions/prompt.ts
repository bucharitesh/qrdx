// "Suggest" in the code builder: the prompt, the reply format and the
// clean-up of what the model sends back. Pure, so the tests cover it
// without a model. Kept short on purpose: one small call, a two-line reply.

export const SLUG_SUGGESTIONS = 3;
export const TAG_SUGGESTIONS = 3;
/** Asked for more than shown, since some may be taken or not allowed. */
export const SLUG_CANDIDATES = 6;
/** Longest suggested back-half (custom ones may be longer when typed). */
export const SUGGESTED_SLUG_MAX = 32;
const TAG_MAX = 32;
const MAX_EXISTING_TAGS = 20;
const MAX_TITLE = 100;
const MAX_PATH = 80;

export const SUGGEST_INSTRUCTIONS = `You name QR code short links. Reply with exactly two lines and nothing else:
s: ${SLUG_CANDIDATES} back-halves, lowercase a-z 0-9 and hyphens, 3-24 characters, short and readable, separated by |
t: up to ${TAG_SUGGESTIONS} tags of 1-2 words, separated by |; reuse an existing tag when one fits`;

export interface SuggestInput {
  url: URL;
  title: string | null;
  existingTags: readonly string[];
}

const squash = (value: string) => value.replace(/\s+/g, " ").trim();

/** "example.com/menu/spring": host and path, no query, hash or "www.". */
export function describeDestination(url: URL): string {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // Keep it encoded.
  }
  path = path.replace(/\/+$/, "");
  if (path.length > MAX_PATH) path = path.slice(0, MAX_PATH);
  return `${host}${path}`;
}

/** The user message: a few short lines. Query strings never go in it. */
export function suggestPrompt({ url, title, existingTags }: SuggestInput) {
  const lines = [`url: ${describeDestination(url)}`];
  const cleanTitle = title ? squash(title).slice(0, MAX_TITLE) : "";
  if (cleanTitle) lines.push(`title: ${cleanTitle}`);
  const tags = existingTags
    .map((tag) => squash(tag).slice(0, TAG_MAX))
    .filter(Boolean)
    .slice(0, MAX_EXISTING_TAGS);
  if (tags.length > 0) lines.push(`existing tags: ${tags.join(", ")}`);
  return lines.join("\n");
}

/** A model's back-half made valid-looking: "Spring Menu!" → "spring-menu". */
export function toSlugCandidate(raw: string): string | null {
  let slug = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^[\s"'`/.-]+|[\s"'`.]+$/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > SUGGESTED_SLUG_MAX) {
    const cut = slug.slice(0, SUGGESTED_SLUG_MAX);
    const dash = cut.lastIndexOf("-");
    slug = (dash >= 3 ? cut.slice(0, dash) : cut).replace(/-+$/, "");
  }
  return slug.length >= 3 ? slug : null;
}

/** A tag as shown: one or two words, no list markers or quotes. */
export function cleanTag(raw: string): string | null {
  const tag = squash(squash(raw).replace(/^[#*•\-"'`\s]+|["'`.\s]+$/g, ""))
    .split(" ")
    .slice(0, 3)
    .join(" ")
    .slice(0, TAG_MAX)
    .trim();
  return tag.length > 0 ? tag : null;
}

const listAfter = (line: string) =>
  line
    .slice(line.indexOf(":") + 1)
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);

/** Reads "s: a|b|c" and "t: x|y" from the reply (tolerant of extra text). */
export function parseSuggestReply(text: string): {
  slugs: string[];
  tags: string[];
} {
  const slugs: string[] = [];
  const tags: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^[-*•]\s*/, "");
    if (/^s(lugs?)?\s*:/i.test(trimmed)) {
      for (const item of listAfter(trimmed)) {
        const slug = toSlugCandidate(item);
        if (slug && !slugs.includes(slug)) slugs.push(slug);
      }
    } else if (/^t(ags?)?\s*:/i.test(trimmed)) {
      for (const item of listAfter(trimmed)) {
        const tag = cleanTag(item);
        if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) {
          tags.push(tag);
        }
      }
    }
  }
  return { slugs: slugs.slice(0, SLUG_CANDIDATES), tags };
}

/**
 * Up to TAG_SUGGESTIONS tags: an existing tag's own spelling when the model
 * names one, never one the code already has.
 */
export function pickTags(
  suggested: readonly string[],
  existing: readonly string[],
  current: readonly string[] = [],
): string[] {
  const byLower = new Map(existing.map((tag) => [tag.toLowerCase(), tag]));
  const skip = new Set(current.map((tag) => tag.toLowerCase()));
  const picked: string[] = [];
  for (const tag of suggested) {
    const name = byLower.get(tag.toLowerCase()) ?? tag;
    const key = name.toLowerCase();
    if (skip.has(key)) continue;
    skip.add(key);
    picked.push(name);
    if (picked.length >= TAG_SUGGESTIONS) break;
  }
  return picked;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  middot: "·",
  rsquo: "’",
  lsquo: "‘",
  hellip: "…",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const name = String(entity);
    if (name[0] === "#") {
      const code =
        name[1]?.toLowerCase() === "x"
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

/** og:title, else <title>, from the start of an HTML page; null when none. */
export function extractPageTitle(html: string): string | null {
  const head = html.slice(0, 64 * 1024);
  const og =
    head.match(
      /<meta\s[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']*)["']/i,
    )?.[1] ??
    head.match(
      /<meta\s[^>]*content\s*=\s*["']([^"']*)["'][^>]*property\s*=\s*["']og:title["']/i,
    )?.[1];
  const title = og ?? head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!title) return null;
  const clean = squash(decodeEntities(title)).slice(0, MAX_TITLE);
  return clean.length > 0 ? clean : null;
}
