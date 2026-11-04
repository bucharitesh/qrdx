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
