import "server-only";

import {
  communityItem,
  communityLike,
  communitySave,
  database as db,
} from "@repo/database";
import { and, eq, gt, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { COMMUNITY_TAG, guarded } from "./store";

// Likes (public appreciation) and saves (private bookmarks) on items. Each
// toggle checks the item is published, flips the row and moves the count.

export class ItemNotFoundError extends Error {
  constructor() {
    super("This item isn't in the community.");
    this.name = "ItemNotFoundError";
  }
}

async function publishedItem(itemId: string) {
  const [item] = await db
    .select({ id: communityItem.id, type: communityItem.type })
    .from(communityItem)
    .where(
      and(eq(communityItem.id, itemId), eq(communityItem.status, "published")),
    )
    .limit(1);
  if (!item) throw new ItemNotFoundError();
  return item;
}

export async function toggleItemLike(
  userId: string,
  itemId: string,
): Promise<{ liked: boolean; likeCount: number }> {
  return guarded(async () => {
    const item = await publishedItem(itemId);
    const removed = await db
      .delete(communityLike)
      .where(
        and(eq(communityLike.userId, userId), eq(communityLike.itemId, itemId)),
      )
      .returning({ itemId: communityLike.itemId });
    let liked: boolean;
    if (removed.length > 0) {
      liked = false;
      await db
        .update(communityItem)
        .set({ likeCount: sql`${communityItem.likeCount} - 1` })
        .where(
          and(eq(communityItem.id, itemId), gt(communityItem.likeCount, 0)),
        );
    } else {
      const added = await db
        .insert(communityLike)
        .values({ userId, itemId, createdAt: new Date() })
        .onConflictDoNothing()
        .returning({ itemId: communityLike.itemId });
      liked = true;
      if (added.length > 0) {
        await db
          .update(communityItem)
          .set({ likeCount: sql`${communityItem.likeCount} + 1` })
          .where(eq(communityItem.id, itemId));
      }
    }
    const [row] = await db
      .select({ likeCount: communityItem.likeCount })
      .from(communityItem)
      .where(eq(communityItem.id, itemId))
      .limit(1);
    revalidateTag(COMMUNITY_TAG, "max");
    if (item.type === "theme") revalidateTag("community-themes", "max");
    return { liked, likeCount: Number(row?.likeCount ?? 0) };
  });
}

export async function toggleItemSave(
  userId: string,
  itemId: string,
): Promise<{ saved: boolean }> {
  return guarded(async () => {
    await publishedItem(itemId);
    const removed = await db
      .delete(communitySave)
      .where(
        and(eq(communitySave.userId, userId), eq(communitySave.itemId, itemId)),
      )
      .returning({ itemId: communitySave.itemId });
    if (removed.length > 0) {
      await db
        .update(communityItem)
        .set({ saveCount: sql`${communityItem.saveCount} - 1` })
        .where(
          and(eq(communityItem.id, itemId), gt(communityItem.saveCount, 0)),
        );
      revalidateTag(COMMUNITY_TAG, "max");
      return { saved: false };
    }
    const added = await db
      .insert(communitySave)
      .values({ userId, itemId, createdAt: new Date() })
      .onConflictDoNothing()
      .returning({ itemId: communitySave.itemId });
    if (added.length > 0) {
      await db
        .update(communityItem)
        .set({ saveCount: sql`${communityItem.saveCount} + 1` })
        .where(eq(communityItem.id, itemId));
    }
    revalidateTag(COMMUNITY_TAG, "max");
    return { saved: true };
  });
}
