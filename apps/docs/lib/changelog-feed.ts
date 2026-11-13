// "What's new" in the app shell: the newest changelog entries (the same
// content/changelog/*.mdx as /changelogs) and which of them the signed-in
// person hasn't seen. Pure and client-safe; lib/changelog-feed-server.ts
// reads the entries and the stored "seen up to" day.
//
// "Seen up to" is one UTC day (YYYY-MM-DD): every entry dated on or before
// it counts as seen. It lives in user.settings.changelogSeenAt, mirrored in
// this browser's localStorage for an instant dot.

export interface ChangelogItem {
  /** The entry's file name, also its anchor on /changelogs */
  slug: string;
  title: string;
  description: string;
  /** Release day, YYYY-MM-DD */
  date: string;
  version?: string;
  tags: string[];
  /** /changelogs#<slug> */
  href: string;
  /** 16:9 picture's URL (light theme); entries with one become feature cards */
  image?: string;
  /** The picture in the dark theme */
  imageDark?: string;
  /** What the picture shows */
  imageAlt?: string;
  /** A muted, looping clip's URL (lib/media.ts), shown in the entry's modal */
  video?: string;
  /** "Try it" in the entry's modal: an in-app link */
  cta?: { label?: string; href: string };
  /** Opens the entry's modal once by itself (pickAnnouncement) */
  announce?: boolean;
}

/** An entry's id on /changelogs, so "Read more" lands on it. */
export function changelogAnchor(slugs: readonly string[]): string {
  return slugs.join("-");
}

/** How many entries the panel lists. */
export const WHATS_NEW_LIMIT = 5;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A day as YYYY-MM-DD (UTC), from a day, an ISO timestamp or a Date. */
export function toDay(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && DAY_PATTERN.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** The later of two days; null only when both are. */
export function laterDay(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null {
  const first = toDay(a);
  const second = toDay(b);
  if (!first) return second;
  if (!second) return first;
  // YYYY-MM-DD strings sort as dates (Math.max would make them NaN).
  return first.localeCompare(second) >= 0 ? first : second;
}

/** "0.1.0" > "0.0.6", for entries released on the same day. */
function compareVersions(a = "0", b = "0"): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** Newest first; same-day entries by version, highest first (as /changelogs). */
export function sortChangelog<
  T extends Pick<ChangelogItem, "date" | "version">,
>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      (toDay(b.date) ?? "").localeCompare(toDay(a.date) ?? "") ||
      compareVersions(b.version, a.version),
  );
}

/** The newest entry's day, null for an empty feed. */
export function newestDay(
  items: readonly Pick<ChangelogItem, "date">[],
): string | null {
  let newest: string | null = null;
  for (const item of items) newest = laterDay(newest, item.date);
  return newest;
}

/** Released after the day the person has seen up to (all, with none yet). */
export function isUnread(
  item: Pick<ChangelogItem, "date">,
  seenAt: string | null,
): boolean {
  const day = toDay(item.date);
  if (!day) return false;
  const seen = toDay(seenAt);
  return seen === null || day > seen;
}

export function unreadCount(
  items: readonly Pick<ChangelogItem, "date">[],
  seenAt: string | null,
): number {
  return items.filter((item) => isUnread(item, seenAt)).length;
}

/**
 * The day to count from: the later of what the account stored and what this
 * browser remembers (a write that failed, or one still on its way). Someone
 * who has never opened the panel counts from the day they signed up, so a
 * new account doesn't start with every past release marked new.
 */
export function effectiveSeenAt({
  stored,
  local,
  signedUpAt,
}: {
  stored: string | null | undefined;
  local: string | null | undefined;
  signedUpAt: string | Date | null | undefined;
}): string | null {
  return laterDay(stored, local) ?? toDay(signedUpAt);
}

/** The count on the badge: "3", or "9+" past nine. */
export function unreadLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}

/** This browser's copy of the day, per person. */
export function seenStorageKey(userId: string): string {
  return `qrdx:changelog-seen:${userId}`;
}

// Feature cards and announcements. Entries the person is done with (a
// dismissed card, a closed announcement) are a list of slugs in
// user.settings.whatsNewDismissed, mirrored in localStorage.

/** Cards show entries released in this many days. */
export const FEATURE_CARD_DAYS = 60;
/** Cards stacked in the sidebar at most. */
export const FEATURE_CARD_LIMIT = 3;
/** Dismissed entries an account remembers (the newest ones). */
export const DISMISSED_LIMIT = 50;

/** A UTC day moved by `days` (negative goes back). */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The sidebar's cards: the newest entries from the last FEATURE_CARD_DAYS
 * that have a picture and weren't dismissed, at most FEATURE_CARD_LIMIT.
 */
export function featureCards<
  T extends Pick<ChangelogItem, "slug" | "date" | "version" | "image">,
>(
  items: readonly T[],
  { dismissed, today }: { dismissed: readonly string[]; today: string },
): T[] {
  const from = addDays(today, -FEATURE_CARD_DAYS);
  const hidden = new Set(dismissed);
  return sortChangelog(items)
    .filter((item) => {
      const day = toDay(item.date);
      return Boolean(item.image) && day !== null && day >= from;
    })
    .filter((item) => !hidden.has(item.slug))
    .slice(0, FEATURE_CARD_LIMIT);
}

/**
 * The entry whose modal opens by itself, or null. Only the newest entry
 * marked `announce` counts (an older one never shows later), and only for
 * someone who joined before it came out, isn't on their sign-up day, hasn't
 * seen it (opened What's new or the entry since) and hasn't closed it.
 */
export function pickAnnouncement<
  T extends Pick<ChangelogItem, "slug" | "date" | "version" | "announce">,
>(
  items: readonly T[],
  {
    today,
    signedUpAt,
    seenAt,
    dismissed,
  }: {
    today: string;
    signedUpAt: string | Date | null | undefined;
    seenAt: string | null;
    dismissed: readonly string[];
  },
): T | null {
  const entry = sortChangelog(items).find((item) => item.announce);
  const joined = toDay(signedUpAt);
  const day = entry && toDay(entry.date);
  if (!(entry && joined && day)) return null;
  if (joined >= today || day <= joined) return null;
  if (!isUnread(entry, seenAt) || dismissed.includes(entry.slug)) return null;
  return entry;
}

/**
 * `added` moved to the end of `list` (newest last), keeping the last
 * `limit`. The same merge the server actions run in SQL.
 */
export function appendRecent(
  list: readonly string[],
  added: readonly string[],
  limit = DISMISSED_LIMIT,
): string[] {
  const fresh = new Set(added);
  return [...list.filter((value) => !fresh.has(value)), ...fresh].slice(-limit);
}

/**
 * The ids a caller sent that are in `known`: strings only, each once, at
 * most `max`. Anything else is dropped, so a request can't store values
 * the app doesn't have.
 */
export function knownIds(
  input: unknown,
  known: ReadonlySet<string>,
  max = 10,
): string[] {
  const values: unknown[] = Array.isArray(input) ? input : [input];
  const ids: string[] = [];
  for (const value of values) {
    if (ids.length >= max) break;
    if (typeof value === "string" && known.has(value) && !ids.includes(value)) {
      ids.push(value);
    }
  }
  return ids;
}

/** A stored list read back: its strings, or empty for anything else. */
export function storedList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** This browser's dismissed entries, per person ("anyone" when signed out). */
export function dismissedStorageKey(userId: string | null): string {
  return `qrdx:whats-new-dismissed:${userId ?? "anyone"}`;
}
