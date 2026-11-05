import "server-only";

import {
  communityItem,
  communityProfile,
  communityUse,
  database as db,
  user as userTable,
} from "@repo/database";
import { and, desc, eq } from "drizzle-orm";
import { guardedRead } from "./store";
import { authorNotBanned } from "./visibility";

// Remix lineage. "Copy to workspace" and "Use template" record which saved
// theme or page came from which item (community_use.preset_id, one row per
// copy). When that saved theme, changed, is
// published again (as a theme or its frame), the new item is a remix: it
// keeps the original's id and version, and a credit line ("Navy by @bob")
// that survives the original's removal. Exact copies are refused anyway
// (the duplicate check), so a remix always changes something.

export interface RemixSource {
  itemId: string;
  version: number;
  /** "Navy by @bob" */
  label: string;
}

/** The item a saved theme was copied from, or null. */
export async function remixSourceOf(
  presetId: string,
): Promise<RemixSource | null> {
  return guardedRead(async () => {
    const [row] = await db
      .select({
        itemId: communityUse.itemId,
        version: communityUse.version,
        name: communityItem.name,
        handle: communityProfile.handle,
        displayName: communityProfile.displayName,
      })
      .from(communityUse)
      .innerJoin(communityItem, eq(communityItem.id, communityUse.itemId))
      .innerJoin(
        communityProfile,
        eq(communityProfile.id, communityItem.profileId),
      )
      .leftJoin(userTable, eq(userTable.id, communityProfile.userId))
      .where(
        and(
          eq(communityUse.presetId, presetId),
          // Removed or hidden originals get no credit and no count.
          eq(communityItem.status, "published"),
          eq(communityProfile.status, "active"),
          authorNotBanned(),
        ),
      )
      .orderBy(desc(communityUse.createdAt))
      .limit(1);
    if (!row) return null;
    const by = row.handle ? `@${row.handle}` : row.displayName;
    return {
      itemId: row.itemId,
      version: Number(row.version),
      label: `${row.name} by ${by}`.slice(0, 120),
    };
  }, null);
}
