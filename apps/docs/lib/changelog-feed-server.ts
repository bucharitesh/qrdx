import "server-only";

import { database as db } from "@repo/database";
import { user as userTable } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import {
  type ChangelogItem,
  changelogAnchor,
  sortChangelog,
  storedList,
  toDay,
  WHATS_NEW_LIMIT,
} from "@/lib/changelog-feed";
import { changelogSource } from "@/lib/content-source";
import { hasMedia, mediaUrl } from "@/lib/media";

/** A changelog picture's URL: an uploaded media key's, else the site path. */
export const changelogPictureUrl = (path: string) =>
  hasMedia(path) ? mediaUrl(path) : path;

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
    const { image, imageDark, imageAlt, video, cta, announce } = entry.data;
    return [
      {
        slug,
        title: entry.data.title,
        description: entry.data.description ?? "",
        date,
        ...(entry.data.version ? { version: entry.data.version } : {}),
        tags: entry.data.tags ?? [],
        href: `/changelogs#${slug}`,
        ...(image ? { image: changelogPictureUrl(image) } : {}),
        ...(image && imageDark
          ? { imageDark: changelogPictureUrl(imageDark) }
          : {}),
        ...(image && imageAlt ? { imageAlt } : {}),
        // Clips are never served from public/ (lib/media.ts).
        ...(video ? { video: mediaUrl(video) } : {}),
        ...(cta ? { cta } : {}),
        ...(announce ? { announce } : {}),
      },
    ];
  });
  return sortChangelog(items).slice(0, limit);
}

/** Every entry's slug, for checking what a caller sends. */
export function changelogSlugs(): Set<string> {
  return new Set(
    getChangelogFeed(Number.POSITIVE_INFINITY).map((entry) => entry.slug),
  );
}

/**
 * What the account has seen in "What's new" (user.settings) and its sign-up
 * day: the "seen up to" day, the entries it's done with and the spotlights
 * it has dismissed.
 */
export async function getChangelogSeen(userId: string): Promise<{
  stored: string | null;
  signedUpAt: string | null;
  dismissed: string[];
  spotlights: string[];
}> {
  const [row] = await db
    .select({ settings: userTable.settings, createdAt: userTable.createdAt })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return {
    stored: toDay(row?.settings?.changelogSeenAt ?? null),
    signedUpAt: toDay(row?.createdAt ?? null),
    dismissed: storedList(row?.settings?.whatsNewDismissed),
    spotlights: storedList(row?.settings?.spotlightsSeen),
  };
}
