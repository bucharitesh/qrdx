import "server-only";

import {
  communityItem,
  communityProfile,
  communitySave,
  database as db,
  user as userTable,
} from "@repo/database";
import { and, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import { COLLECTION_MAX_ITEMS } from "./payloads";
import {
  cleanDetails,
  type ItemDetails,
  insertItem,
  PublishError,
  type PublishOptions,
} from "./publish";
import { guardedRead } from "./store";
import type { BundleSource, CommunityItemType } from "./types";
import { authorNotBanned } from "./visibility";

// Collections and kits: items that only point at other published items.
//
// - A collection is any 2 to 48 published frames, themes and page
//   templates, in order (anyone's: they're CC0).
// - A kit is a look and a page used together: a page template plus a theme
//   and/or a frame. "Use kit" copies both into the workspace.
//
// Both only reference items that are already public and checked, so they
// go live at once (post-moderation). Their entries are kept in
// community_collection_entry, in order, so the reads can show them; an
// entry whose item is later removed simply stops showing.

export const COLLECTION_MIN_ITEMS = 2;

/** Types a collection or kit may point at. */
const BUNDLED: CommunityItemType[] = ["frame", "theme", "page-template"];

const visibleRow = () =>
  and(
    eq(communityItem.status, "published"),
    eq(communityProfile.status, "active"),
    authorNotBanned(),
  ) as SQL;

/** Published items by id, of the bundled types, as the reads see them. */
async function publishedItems(ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({
      id: communityItem.id,
      type: communityItem.type,
      slug: communityItem.slug,
      name: communityItem.name,
    })
    .from(communityItem)
    .innerJoin(
      communityProfile,
      eq(communityProfile.id, communityItem.profileId),
    )
    .leftJoin(userTable, eq(userTable.id, communityProfile.userId))
    .where(and(visibleRow(), inArray(communityItem.id, ids)));
}

/**
 * What `userId` can put in a collection or kit: items they saved and items
 * they published, newest first.
 */
export async function bundleSources(userId: string): Promise<BundleSource[]> {
  return guardedRead(async () => {
    const rows = await db
      .select({
        id: communityItem.id,
        type: communityItem.type,
        slug: communityItem.slug,
        name: communityItem.name,
        handle: communityProfile.handle,
        displayName: communityProfile.displayName,
        createdBy: communityItem.createdBy,
      })
      .from(communityItem)
      .innerJoin(
        communityProfile,
        eq(communityProfile.id, communityItem.profileId),
      )
      .leftJoin(userTable, eq(userTable.id, communityProfile.userId))
      .where(
        and(
          visibleRow(),
          inArray(communityItem.type, BUNDLED),
          or(
            eq(communityItem.createdBy, userId),
            inArray(
              communityItem.id,
              db
                .select({ id: communitySave.itemId })
                .from(communitySave)
                .where(eq(communitySave.userId, userId)),
            ),
          ),
        ),
      )
      .orderBy(desc(communityItem.publishedAt))
      .limit(200);
    return rows.map((row) => ({
      id: row.id,
      type: row.type as CommunityItemType,
      slug: row.slug,
      name: row.name,
      creator: row.handle ? `@${row.handle}` : row.displayName,
      mine: row.createdBy === userId,
    }));
  }, []);
}

async function insertBundle(
  input: {
    userId: string;
    type: "collection" | "kit";
    details: ItemDetails;
    itemIds: string[];
    payload: Record<string, unknown>;
    vocabulary: readonly string[];
  } & PublishOptions,
) {
  const details = cleanDetails(input.details, input.vocabulary);
  // The entries, in order, for the reads (the payload stays the record),
  // written in the same batch as the item.
  return insertItem({
    userId: input.userId,
    type: input.type,
    ...details,
    payload: input.payload,
    gate: null,
    entries: input.itemIds,
    beforeWrite: input.beforeWrite,
  });
}

/** A collection of published frames, themes and page templates. */
export async function publishCollection(
  input: {
    userId: string;
    itemIds: string[];
    details: ItemDetails;
  } & PublishOptions,
) {
  const ids = [...new Set(input.itemIds)];
  if (ids.length < COLLECTION_MIN_ITEMS || ids.length > COLLECTION_MAX_ITEMS) {
    throw new PublishError(
      "VALIDATION_ERROR",
      `A collection holds ${COLLECTION_MIN_ITEMS} to ${COLLECTION_MAX_ITEMS} items.`,
    );
  }
  const found = await publishedItems(ids);
  const byId = new Map(found.map((row) => [row.id, row]));
  if (
    ids.some((id) => {
      const row = byId.get(id);
      return !row || !BUNDLED.includes(row.type as CommunityItemType);
    })
  ) {
    throw new PublishError(
      "VALIDATION_ERROR",
      "Some of these items aren't in the community any more. Pick again.",
    );
  }
  return insertBundle({
    userId: input.userId,
    type: "collection",
    details: input.details,
    itemIds: ids,
    payload: { items: ids },
    vocabulary: [],
    beforeWrite: input.beforeWrite,
  });
}

/** A kit: a page template with the theme and/or frame it's used with. */
export async function publishKit(
  input: {
    userId: string;
    parts: { theme?: string | null; frame?: string | null; page: string };
    details: ItemDetails;
  } & PublishOptions,
) {
  const wanted: [keyof typeof input.parts, CommunityItemType][] = [
    ["theme", "theme"],
    ["frame", "frame"],
    ["page", "page-template"],
  ];
  const ids = wanted
    .map(([key]) => input.parts[key])
    .filter((id): id is string => Boolean(id));
  if (!input.parts.page || ids.length < 2) {
    throw new PublishError(
      "VALIDATION_ERROR",
      "A kit is a page template with a theme, a frame or both.",
    );
  }
  const found = new Map(
    (await publishedItems(ids)).map((row) => [row.id, row]),
  );
  for (const [key, type] of wanted) {
    const id = input.parts[key];
    if (!id) continue;
    if (found.get(id)?.type !== type) {
      throw new PublishError(
        "VALIDATION_ERROR",
        "Some of these items aren't in the community any more. Pick again.",
      );
    }
  }
  const kit = {
    ...(input.parts.theme ? { theme: input.parts.theme } : {}),
    ...(input.parts.frame ? { frame: input.parts.frame } : {}),
    page: input.parts.page,
  };
  return insertBundle({
    userId: input.userId,
    type: "kit",
    details: input.details,
    itemIds: ids,
    payload: { kit },
    vocabulary: [],
    beforeWrite: input.beforeWrite,
  });
}
