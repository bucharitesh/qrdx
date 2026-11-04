"use server";

import { auth } from "@repo/auth/server";
import { database as db } from "@repo/database";
import { user as userTable } from "@repo/database/schema";
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { newestDay } from "@/lib/changelog-feed";
import { getChangelogFeed } from "@/lib/changelog-feed-server";
import { logError } from "@/lib/shared";

export type MarkChangelogSeenResult =
  | { ok: true; seenAt: string }
  | { ok: false };

/**
 * "What's new" was opened: everything released so far counts as seen. The
 * day comes from the built-in changelog, never from the caller, so a
 * request can't hide entries that aren't out yet. One statement that merges
 * into user.settings and never moves the day back (another tab may have
 * stored a later one).
 */
export async function markChangelogSeen(): Promise<MarkChangelogSeenResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) return { ok: false };

  const day = newestDay(getChangelogFeed(Number.POSITIVE_INFINITY));
  if (!day) return { ok: false };

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
