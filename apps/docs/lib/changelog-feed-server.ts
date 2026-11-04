import "server-only";

import { database as db } from "@repo/database";
import { user as userTable } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import {
  type ChangelogItem,
  changelogAnchor,
  sortChangelog,
  toDay,
  WHATS_NEW_LIMIT,
} from "@/lib/changelog-feed";
import { changelogSource } from "@/lib/source";

/**
 * Every changelog entry, newest first, for the app's "What's new" panel.
 * Built-in content (no database, no network); `entry.url` isn't used
 * because /changelogs/<slug> has no page.
 */
export function getChangelogFeed(limit = WHATS_NEW_LIMIT): ChangelogItem[] {
  const items = changelogSource.getPages().flatMap((entry): ChangelogItem[] => {
    const date = toDay(entry.data.date);
    if (!date) return [];
    const slug = changelogAnchor(entry.slugs);
    return [
      {
        slug,
        title: entry.data.title,
        description: entry.data.description ?? "",
        date,
        ...(entry.data.version ? { version: entry.data.version } : {}),
        tags: entry.data.tags ?? [],
        href: `/changelogs#${slug}`,
      },
    ];
  });
  return sortChangelog(items).slice(0, limit);
}

/** What the account has seen (user.settings.changelogSeenAt) and its sign-up day. */
export async function getChangelogSeen(
  userId: string,
): Promise<{ stored: string | null; signedUpAt: string | null }> {
  const [row] = await db
    .select({ settings: userTable.settings, createdAt: userTable.createdAt })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return {
    stored: toDay(row?.settings?.changelogSeenAt ?? null),
    signedUpAt: toDay(row?.createdAt ?? null),
  };
}
