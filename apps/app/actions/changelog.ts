"use server";

import { auth } from "@repo/auth/server";
import { database as db } from "@repo/database";
import { user as userTable } from "@repo/database/schema";
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { DISMISSED_LIMIT, knownIds, newestDay } from "@/lib/changelog-feed";
import { changelogSlugs, getChangelogFeed } from "@/lib/changelog-feed-server";
import { settingsWithAppended } from "@/lib/settings-list";
import { logError } from "@/lib/shared";

export type MarkChangelogSeenResult =
  | { ok: true; seenAt: string }
  | { ok: false };

export type DismissWhatsNewResult =
  | { ok: true; dismissed: string[] }
  | { ok: false };

async function signedInUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

/**
 * Stores `day` as seen in one statement that merges into user.settings and
 * never moves the day back (another tab may have stored a later one).
 */
async function storeSeenDay(
  userId: string,
  day: string,
): Promise<MarkChangelogSeenResult> {
  try {
    await db
      .update(userTable)
      .set({
        settings: sql`(coalesce(${userTable.settings}::jsonb, '{}'::jsonb) || jsonb_build_object('changelogSeenAt', greatest(coalesce(${userTable.settings}::jsonb ->> 'changelogSeenAt', ''), ${day}::text)))::json`,
      })
      .where(eq(userTable.id, userId));
    return { ok: true, seenAt: day };
  } catch (error) {
    logError(error as Error, { action: "changelog.markSeen" });
    return { ok: false };
  }
}

/**
 * "What's new" was opened: everything released so far counts as seen. The
 * day comes from the built-in changelog, never from the caller, so a
 * request can't hide entries that aren't out yet.
 */
export async function markChangelogSeen(): Promise<MarkChangelogSeenResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false };

  const day = newestDay(getChangelogFeed(Number.POSITIVE_INFINITY));
  if (!day) return { ok: false };
  return storeSeenDay(userId, day);
}

/**
 * One entry's modal was opened: it counts as seen, and so does everything
 * released before it. The day is the entry's own, looked up in the built-in
 * changelog; an unknown slug stores nothing.
 */
export async function markChangelogEntrySeen(
  slug: unknown,
): Promise<MarkChangelogSeenResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false };

  const entry = getChangelogFeed(Number.POSITIVE_INFINITY).find(
    (item) => item.slug === slug,
  );
  if (!entry) return { ok: false };
  return storeSeenDay(userId, entry.date);
}

/**
 * The person is done with these entries (dismissed a card, closed an
 * announcement): they join user.settings.whatsNewDismissed, which keeps the
 * last DISMISSED_LIMIT. Only slugs of built-in entries are stored; the rest
 * of what the caller sends is dropped.
 */
export async function dismissWhatsNew(
  slugs: unknown,
): Promise<DismissWhatsNewResult> {
  const userId = await signedInUserId();
  if (!userId) return { ok: false };

  const dismissed = knownIds(slugs, changelogSlugs());
  if (dismissed.length === 0) return { ok: false };

  try {
    await db
      .update(userTable)
      .set({
        settings: settingsWithAppended(
          "whatsNewDismissed",
          dismissed,
          DISMISSED_LIMIT,
        ),
      })
      .where(eq(userTable.id, userId));
    return { ok: true, dismissed };
  } catch (error) {
    logError(error as Error, { action: "changelog.dismiss" });
    return { ok: false };
  }
}
