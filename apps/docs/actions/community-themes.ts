/** biome-ignore-all lint/suspicious/noExplicitAny: fasle positive */

"use server";

import { auth } from "@repo/auth/server";
import {
  communityItem,
  communityItemTag,
  communityTheme,
  communityThemeTag,
  database as db,
  themeLike,
  qrPreset as themeTable,
  user as userTable,
} from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidateTag, unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { findThemeById } from "@/app/dashboard/themes/_lib/queries";
import { publicStyleFromSaved } from "@/lib/community/public-style-server";
import { PublishError, publishSavedTheme } from "@/lib/community/publish";
import { themePublishAccess } from "@/lib/community/publish-access";
import {
  myPublishedThemeSources,
  themeItemsFeed,
  themeItemTagCounts,
} from "@/lib/community/queries";
import { toggleItemLike } from "@/lib/community/reactions";
import { checkScanGate, gateFailureMessage } from "@/lib/community/scan-gate";
import { COMMUNITY_TAG, communityState } from "@/lib/community/store";
import { authorNotBanned } from "@/lib/community/visibility";
import {
  COMMUNITY_THEME_TAGS,
  COMMUNITY_THEMES_PAGE_SIZE,
  MAX_TAGS_PER_THEME,
} from "@/lib/constants";
import { getCurrentUserId } from "@/lib/shared";
import type {
  CommunityFilterOption,
  CommunitySortOption,
  CommunityTheme,
  CommunityThemesResponse,
  CommunityTimeRange,
} from "@/types/community";
import {
  type ActionResult,
  actionError,
  actionSuccess,
  ErrorCode,
  QRCodeThemeNotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/types/errors";
import type { ThemeStyles } from "@/types/theme";

async function getOptionalUserId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function logError(error: Error, context: Record<string, unknown>) {
  if (error.name === "UnauthorizedError" || error.name === "ValidationError") {
    console.warn("Expected error:", { error: error.message, context });
  } else {
    console.error("Unexpected error:", {
      error: error.message,
      stack: error.stack,
      context,
    });
  }
}

const getCommunityThemesSchema = z.object({
  sort: z.enum(["popular", "newest", "oldest"]).default("popular"),
  cursor: z.union([z.string(), z.number()]).optional(),
  limit: z.number().min(1).max(50).default(COMMUNITY_THEMES_PAGE_SIZE),
  filter: z.enum(["all", "mine", "liked"]).default("all"),
  tags: z.array(z.string()).default([]),
  timeRange: z.enum(["weekly", "monthly", "all"]).default("all"),
});

async function fetchCommunityThemesCore(
  sort: string,
  cursor: string | number | null,
  limit: number,
  filter: string,
  tags: string[],
  userId: string | null,
  timeRange: string = "all",
): Promise<CommunityThemesResponse> {
  const fetchLimit = limit + 1;
  // Banned accounts' themes are hidden everywhere in the community.
  const conditions = [authorNotBanned()];

  if (filter === "mine") {
    if (!userId) throw new UnauthorizedError();
    conditions.push(eq(communityTheme.userId, userId));
  }

  if (filter === "liked") {
    if (!userId) throw new UnauthorizedError();
    conditions.push(
      sql`exists(select 1 from theme_like where theme_like.theme_id = ${communityTheme.id} and theme_like.user_id = ${userId})`,
    );
  }

  if (tags.length > 0) {
    conditions.push(
      sql`exists(select 1 from community_theme_tag where community_theme_tag.community_theme_id = ${communityTheme.id} and community_theme_tag.tag in (${sql.join(
        tags.map((t) => sql`${t}`),
        sql`, `,
      )}))`,
    );
  }

  if (sort === "popular" && timeRange !== "all") {
    const intervalSql =
      timeRange === "weekly" ? sql`interval '7 days'` : sql`interval '30 days'`;
    conditions.push(
      sql`${communityTheme.publishedAt} > now() - ${intervalSql}`,
    );
  }

  const baseQuery = db
    .select({
      id: communityTheme.id,
      themeId: communityTheme.themeId,
      publishedAt: communityTheme.publishedAt,
      themeName: themeTable.name,
      themeStyles: themeTable.style,
      authorId: userTable.id,
      authorName: userTable.name,
      authorImage: userTable.image,
      likeCount: communityTheme.likeCount,
      ...(userId
        ? {
            isLikedByMe: sql<boolean>`exists(
              select 1 from theme_like
              where theme_like.theme_id = ${communityTheme.id}
              and theme_like.user_id = ${userId}
            )`.as("is_liked_by_me"),
          }
        : {}),
    })
    .from(communityTheme)
    .innerJoin(themeTable, eq(communityTheme.themeId, themeTable.id))
    .innerJoin(userTable, eq(communityTheme.userId, userTable.id));

  let results: any;

  if (sort === "popular") {
    const offset = typeof cursor === "number" ? cursor : 0;
    results = await baseQuery
      .where(and(...conditions))
      .orderBy(desc(communityTheme.likeCount), desc(communityTheme.publishedAt))
      .limit(fetchLimit)
      .offset(offset);
  } else if (sort === "newest") {
    if (cursor && typeof cursor === "string") {
      conditions.push(sql`${communityTheme.publishedAt} < ${cursor}`);
    }
    results = await baseQuery
      .where(and(...conditions))
      .orderBy(desc(communityTheme.publishedAt))
      .limit(fetchLimit);
  } else {
    if (cursor && typeof cursor === "string") {
      conditions.push(sql`${communityTheme.publishedAt} > ${cursor}`);
    }
    results = await baseQuery
      .where(and(...conditions))
      .orderBy(asc(communityTheme.publishedAt))
      .limit(fetchLimit);
  }

  const hasMore = results.length > limit;
  const themes = results.slice(0, limit);

  let nextCursor: string | number | null = null;
  if (hasMore) {
    if (sort === "popular") {
      nextCursor = (typeof cursor === "number" ? cursor : 0) + limit;
    } else {
      const lastTheme = themes[themes.length - 1];
      nextCursor = lastTheme.publishedAt.toISOString();
    }
  }

  const communityThemeIds = themes.map((t: any) => t.id);
  const tagsRows =
    communityThemeIds.length > 0
      ? await db
          .select({
            communityThemeId: communityThemeTag.communityThemeId,
            tag: communityThemeTag.tag,
          })
          .from(communityThemeTag)
          .where(inArray(communityThemeTag.communityThemeId, communityThemeIds))
      : [];

  const tagsMap = new Map<string, string[]>();
  for (const row of tagsRows) {
    const existing = tagsMap.get(row.communityThemeId) ?? [];
    existing.push(row.tag);
    tagsMap.set(row.communityThemeId, existing);
  }

  const mappedThemes: CommunityTheme[] = themes.map((row: any) => ({
    id: row.id,
    // Never the saved theme's id: /playground/<id> serves the whole saved
    // theme (uploaded logo included) to anyone who has it.
    themeId: row.id,
    name: row.themeName,
    // The saved theme is a live pointer: clean it on every read (no uploaded
    // logo or image art ever leaves the account).
    styles: publicStyleFromSaved(row.themeStyles as ThemeStyles),
    author: {
      id: row.authorId,
      name: row.authorName,
      image: row.authorImage,
    },
    likeCount: Number(row.likeCount),
    isLikedByMe: "isLikedByMe" in row ? Boolean(row.isLikedByMe) : false,
    publishedAt: row.publishedAt.toISOString(),
    tags: tagsMap.get(row.id) ?? [],
  }));

  return { themes: mappedThemes, nextCursor };
}

const getCachedCommunityThemes = unstable_cache(
  fetchCommunityThemesCore,
  ["community-themes"],
  { revalidate: 60, tags: ["community-themes"] },
);

const getCachedThemeItems = unstable_cache(
  themeItemsFeed,
  ["community-theme-items"],
  { revalidate: 60, tags: ["community-themes", COMMUNITY_TAG] },
);

export async function getCommunityThemes(
  sort: CommunitySortOption = "popular",
  cursor?: string | number,
  limit: number = COMMUNITY_THEMES_PAGE_SIZE,
  filter: CommunityFilterOption = "all",
  tags: string[] = [],
  timeRange: CommunityTimeRange = "all",
): Promise<CommunityThemesResponse> {
  try {
    const validation = getCommunityThemesSchema.safeParse({
      sort,
      cursor,
      limit,
      filter,
      tags,
      timeRange,
    });
    if (!validation.success) {
      throw new ValidationError("Invalid input", validation.error.format());
    }

    const userId = await getOptionalUserId();

    // community_item once the backfill has copied the themes; until then
    // (and before manual-sql/0012) the gallery reads community_theme.
    if ((await communityState()).themes === "items") {
      if ((filter === "mine" || filter === "liked") && !userId) {
        throw new UnauthorizedError();
      }
      return getCachedThemeItems({
        sort,
        cursor: cursor ?? null,
        limit,
        filter,
        tags,
        userId,
        timeRange,
      });
    }

    return getCachedCommunityThemes(
      sort,
      cursor ?? null,
      limit,
      filter,
      tags,
      userId,
      timeRange,
    );
  } catch (error) {
    logError(error as Error, { action: "getCommunityThemes", sort, cursor });
    throw error;
  }
}

const itemPublishLimiter = createRateLimiter({
  limiter: slidingWindow(10, "1 d"),
});

/** Publishes a saved theme as a community_item snapshot (version 1). */
async function publishThemeAsItem(
  userId: string,
  theme: { id: string; name: string; style: unknown },
  tags: string[],
): Promise<ActionResult<{ id: string }>> {
  if ((await myPublishedThemeSources(userId)).includes(theme.id)) {
    return actionError(
      ErrorCode.ALREADY_PUBLISHED,
      "This theme is already published to the community.",
    );
  }
  if (process.env.NODE_ENV !== "development") {
    const { success } = await itemPublishLimiter.limit(
      `community-publish:${userId}`,
    );
    if (!success) {
      return actionError(
        ErrorCode.RATE_LIMITED,
        "You've published a lot today. Try again tomorrow.",
      );
    }
  }
  try {
    const item = await publishSavedTheme({
      userId,
      theme: {
        id: theme.id,
        name: theme.name,
        style: theme.style as ThemeStyles,
      },
      tags,
    });
    return actionSuccess({ id: item.id });
  } catch (error) {
    if (error instanceof PublishError) {
      return actionError(ErrorCode[error.code], error.message);
    }
    throw error;
  }
}

export async function publishTheme(
  themeId: string,
  tags: string[] = [],
  options: { acceptLicense?: boolean } = {},
): Promise<ActionResult<{ id: string }>> {
  try {
    const userId = await getCurrentUserId();

    // Everything shared in the community is CC0 1.0: the creator says so.
    if (options.acceptLicense !== true) {
      return actionError(
        ErrorCode.LICENSE_REQUIRED,
        "Confirm the CC0 licence to publish.",
      );
    }

    const rateLimiter = createRateLimiter({
      limiter: slidingWindow(10, "10 s"),
    });

    if (!themeId) {
      throw new ValidationError("Theme ID required");
    }

    // Validate tags
    if (tags.length > MAX_TAGS_PER_THEME) {
      throw new ValidationError(
        `You can select at most ${MAX_TAGS_PER_THEME} tags`,
      );
    }
    const validTags = tags.filter((t): t is string =>
      (COMMUNITY_THEME_TAGS as readonly string[]).includes(t),
    );

    // Your own themes, or a workspace theme you can edit there (an owner or
    // admin of the open workspace, as for editing it). Either way the item
    // is a snapshot credited to your profile; the theme stays the workspace's.
    const existingTheme = await findThemeById(themeId);
    const access = existingTheme
      ? await themePublishAccess(userId, existingTheme)
      : "none";
    if (!existingTheme || access === "none") {
      throw new QRCodeThemeNotFoundError(
        "Theme not found or not owned by user",
      );
    }
    if (access === "view") {
      return actionError(
        ErrorCode.THEME_NOT_FOUND,
        "Only owners and admins of this workspace can publish its themes.",
      );
    }

    if ((await communityState()).themes === "items") {
      return await publishThemeAsItem(userId, existingTheme, validTags);
    }

    // The legacy gallery shows the live theme row, not a snapshot, so a
    // workspace's theme would change under its publisher's name.
    if (access === "workspace") {
      return actionError(
        ErrorCode.COMMUNITY_UNAVAILABLE,
        "Publishing workspace themes isn't available on this deployment yet.",
      );
    }

    // Check not already published
    const [existing] = await db
      .select()
      .from(communityTheme)
      .where(eq(communityTheme.themeId, themeId))
      .limit(1);

    if (existing) {
      return actionError(
        ErrorCode.ALREADY_PUBLISHED,
        "This theme is already published to the community.",
      );
    }

    // Rate limit
    if (process.env.NODE_ENV !== "development") {
      const { success } = await rateLimiter.limit(`publish:${userId}`);
      if (!success) {
        return actionError(
          ErrorCode.RATE_LIMITED,
          "You're publishing too fast. Please try again later.",
        );
      }
    }

    // Only designs that scan Great go public, scored here on the server with
    // the design as the gallery shows it (no uploaded logo or image art).
    const gate = await checkScanGate(
      publicStyleFromSaved(existingTheme.style as ThemeStyles),
    );
    if (!gate.passed) {
      return actionError(ErrorCode.SCAN_GATE, gateFailureMessage(gate));
    }

    const id = cuid();
    await db.insert(communityTheme).values({
      id,
      themeId,
      userId,
      publishedAt: new Date(),
    });

    if (validTags.length > 0) {
      try {
        await db.insert(communityThemeTag).values(
          validTags.map((tag) => ({
            communityThemeId: id,
            tag,
          })),
        );
      } catch (tagError) {
        // Roll back the community theme row if tags insert fails
        await db.delete(communityTheme).where(eq(communityTheme.id, id));
        throw tagError;
      }
    }

    revalidateTag("community-themes", "max");
    revalidateTag("community-tag-counts", "max");

    return actionSuccess({ id });
  } catch (error) {
    logError(error as Error, { action: "publishTheme", themeId });
    throw error;
  }
}

export async function unpublishTheme(
  themeId: string,
): Promise<ActionResult<{ success: boolean }>> {
  try {
    const userId = await getCurrentUserId();

    if (!themeId) {
      throw new ValidationError("Theme ID required");
    }

    // Both places a theme can be published: the item (soft-removed, its
    // page answers "removed") and the legacy row (deleted, as before).
    const removedItems = (await communityState()).tables
      ? await db
          .update(communityItem)
          .set({
            status: "removed",
            removedAt: new Date(),
            removedReason: "creator",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(communityItem.type, "theme"),
              eq(communityItem.sourceKind, "qr_preset"),
              eq(communityItem.sourceId, themeId),
              eq(communityItem.createdBy, userId),
              ne(communityItem.status, "removed"),
            ),
          )
          .returning({ id: communityItem.id })
      : [];

    const [deleted] = await db
      .delete(communityTheme)
      .where(
        and(
          eq(communityTheme.themeId, themeId),
          eq(communityTheme.userId, userId),
        ),
      )
      .returning({ id: communityTheme.id });

    if (removedItems.length > 0) revalidateTag(COMMUNITY_TAG, "max");

    if (!(deleted || removedItems.length > 0)) {
      throw new QRCodeThemeNotFoundError(
        "Published theme not found or not owned by user",
      );
    }

    revalidateTag("community-themes", "max");
    revalidateTag("community-tag-counts", "max");

    return actionSuccess({ success: true });
  } catch (error) {
    logError(error as Error, { action: "unpublishTheme", themeId });
    throw error;
  }
}

export async function toggleLikeTheme(
  communityThemeId: string,
): Promise<ActionResult<{ liked: boolean; likeCount: number }>> {
  try {
    const userId = await getCurrentUserId();

    if (!communityThemeId) {
      throw new ValidationError("Community theme ID required");
    }

    // The gallery lists items once the backfill has run: their ids are
    // community_item ids, liked through community_like.
    if ((await communityState()).themes === "items") {
      return actionSuccess(await toggleItemLike(userId, communityThemeId));
    }

    // Check if already liked
    const [existingLike] = await db
      .select()
      .from(themeLike)
      .where(
        and(
          eq(themeLike.userId, userId),
          eq(themeLike.themeId, communityThemeId),
        ),
      )
      .limit(1);

    if (existingLike) {
      await db
        .delete(themeLike)
        .where(
          and(
            eq(themeLike.userId, userId),
            eq(themeLike.themeId, communityThemeId),
          ),
        );
      const [updated] = await db
        .update(communityTheme)
        .set({
          likeCount: sql`GREATEST(${communityTheme.likeCount} - 1, 0)`,
        })
        .where(eq(communityTheme.id, communityThemeId))
        .returning({ likeCount: communityTheme.likeCount });

      revalidateTag("community-themes", "max");

      return actionSuccess({
        liked: false,
        likeCount: updated.likeCount,
      });
    }

    await db.insert(themeLike).values({
      userId,
      themeId: communityThemeId,
      createdAt: new Date(),
    });
    const [updated] = await db
      .update(communityTheme)
      .set({ likeCount: sql`${communityTheme.likeCount} + 1` })
      .where(eq(communityTheme.id, communityThemeId))
      .returning({ likeCount: communityTheme.likeCount });

    revalidateTag("community-themes", "max");

    return actionSuccess({
      liked: true,
      likeCount: updated.likeCount,
    });
  } catch (error) {
    logError(error as Error, {
      action: "toggleLikeTheme",
      communityThemeId,
    });
    throw error;
  }
}

async function fetchCommunityDataForThemeCore(
  themeId: string,
  userId: string | null,
): Promise<{
  communityThemeId: string;
  author: { id: string; name: string; image: string | null };
  likeCount: number;
  isLikedByMe: boolean;
  publishedAt: string;
  tags: string[];
} | null> {
  const [result] = await db
    .select({
      id: communityTheme.id,
      publishedAt: communityTheme.publishedAt,
      authorId: userTable.id,
      authorName: userTable.name,
      authorImage: userTable.image,
      likeCount: communityTheme.likeCount,
      ...(userId
        ? {
            isLikedByMe: sql<boolean>`exists(
              select 1 from theme_like
              where theme_like.theme_id = ${communityTheme.id}
              and theme_like.user_id = ${userId}
            )`.as("is_liked_by_me"),
          }
        : {}),
    })
    .from(communityTheme)
    .innerJoin(userTable, eq(communityTheme.userId, userTable.id))
    .where(and(eq(communityTheme.themeId, themeId), authorNotBanned()))
    .limit(1);

  if (!result) return null;

  const tagRows = await db
    .select({ tag: communityThemeTag.tag })
    .from(communityThemeTag)
    .where(eq(communityThemeTag.communityThemeId, result.id));

  return {
    communityThemeId: result.id,
    author: {
      id: result.authorId,
      name: result.authorName,
      image: result.authorImage,
    },
    likeCount: Number(result.likeCount),
    isLikedByMe: "isLikedByMe" in result ? Boolean(result.isLikedByMe) : false,
    publishedAt: result.publishedAt.toISOString(),
    tags: tagRows.map((r) => r.tag),
  };
}

const getCachedCommunityDataForTheme = unstable_cache(
  fetchCommunityDataForThemeCore,
  ["community-theme-data"],
  { revalidate: 60, tags: ["community-themes"] },
);

export async function getCommunityDataForTheme(themeId: string): Promise<{
  communityThemeId: string;
  author: { id: string; name: string; image: string | null };
  likeCount: number;
  isLikedByMe: boolean;
  publishedAt: string;
  tags: string[];
} | null> {
  try {
    const userId = await getOptionalUserId();
    return getCachedCommunityDataForTheme(themeId, userId);
  } catch (error) {
    logError(error as Error, {
      action: "getCommunityDataForTheme",
      themeId,
    });
    return null;
  }
}

export async function getMyPublishedThemeIds(): Promise<string[]> {
  try {
    const userId = await getCurrentUserId();

    if ((await communityState()).themes === "items") {
      return await myPublishedThemeSources(userId);
    }

    const published = await db
      .select({ themeId: communityTheme.themeId })
      .from(communityTheme)
      .where(eq(communityTheme.userId, userId));

    return published.map((p) => p.themeId);
  } catch (error) {
    logError(error as Error, { action: "getMyPublishedThemeIds" });
    throw error;
  }
}

export async function updateCommunityThemeTags(
  themeId: string,
  tags: string[],
): Promise<ActionResult<{ tags: string[] }>> {
  try {
    const userId = await getCurrentUserId();

    if (!themeId) {
      throw new ValidationError("Theme ID required");
    }

    if (tags.length > MAX_TAGS_PER_THEME) {
      throw new ValidationError(
        `You can select at most ${MAX_TAGS_PER_THEME} tags`,
      );
    }

    const validTags = tags.filter((t): t is string =>
      (COMMUNITY_THEME_TAGS as readonly string[]).includes(t),
    );

    if ((await communityState()).themes === "items") {
      // Tags are details, not design: changing them makes no new version.
      const [item] = await db
        .select({ id: communityItem.id })
        .from(communityItem)
        .where(
          and(
            eq(communityItem.type, "theme"),
            eq(communityItem.sourceKind, "qr_preset"),
            eq(communityItem.sourceId, themeId),
            eq(communityItem.createdBy, userId),
            ne(communityItem.status, "removed"),
          ),
        )
        .limit(1);
      if (!item) {
        throw new QRCodeThemeNotFoundError(
          "Published theme not found or not owned by user",
        );
      }
      const clear = db
        .delete(communityItemTag)
        .where(eq(communityItemTag.itemId, item.id));
      if (validTags.length > 0) {
        await db.batch([
          clear,
          db
            .insert(communityItemTag)
            .values(validTags.map((tag) => ({ itemId: item.id, tag }))),
        ]);
      } else {
        await clear;
      }
      revalidateTag(COMMUNITY_TAG, "max");
      revalidateTag("community-themes", "max");
      revalidateTag("community-tag-counts", "max");
      return actionSuccess({ tags: validTags });
    }

    // Verify ownership via the community_theme row
    const [ct] = await db
      .select({ id: communityTheme.id })
      .from(communityTheme)
      .where(
        and(
          eq(communityTheme.themeId, themeId),
          eq(communityTheme.userId, userId),
        ),
      )
      .limit(1);

    if (!ct) {
      throw new QRCodeThemeNotFoundError(
        "Published theme not found or not owned by user",
      );
    }

    // Delete existing tags and insert new ones
    await db
      .delete(communityThemeTag)
      .where(eq(communityThemeTag.communityThemeId, ct.id));

    if (validTags.length > 0) {
      await db.insert(communityThemeTag).values(
        validTags.map((tag) => ({
          communityThemeId: ct.id,
          tag,
        })),
      );
    }

    revalidateTag("community-themes", "max");
    revalidateTag("community-tag-counts", "max");

    return actionSuccess({ tags: validTags });
  } catch (error) {
    logError(error as Error, {
      action: "updateCommunityThemeTags",
      themeId,
    });
    throw error;
  }
}

const getCachedTagCounts = unstable_cache(
  async () => {
    const rows = await db
      .select({
        tag: communityThemeTag.tag,
        count: count().as("tag_count"),
      })
      .from(communityThemeTag)
      .innerJoin(
        communityTheme,
        eq(communityTheme.id, communityThemeTag.communityThemeId),
      )
      .innerJoin(userTable, eq(userTable.id, communityTheme.userId))
      .where(authorNotBanned())
      .groupBy(communityThemeTag.tag)
      .orderBy(sql`tag_count desc`);

    return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
  },
  ["community-tag-counts"],
  { revalidate: 300, tags: ["community-tag-counts"] },
);

const getCachedItemTagCounts = unstable_cache(
  themeItemTagCounts,
  ["community-item-tag-counts"],
  { revalidate: 300, tags: ["community-tag-counts", COMMUNITY_TAG] },
);

export async function getCommunityTagCounts(): Promise<
  { tag: string; count: number }[]
> {
  try {
    if ((await communityState()).themes === "items") {
      return await getCachedItemTagCounts();
    }
    return await getCachedTagCounts();
  } catch (error) {
    logError(error as Error, { action: "getCommunityTagCounts" });
    return [];
  }
}
