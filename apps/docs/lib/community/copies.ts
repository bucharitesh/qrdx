import "server-only";

import { isOwnWorkspaceOf, ownWorkspaceId } from "@repo/auth/own-workspace-id";
import {
  communityItem,
  communityUse,
  database as db,
  qrPreset,
} from "@repo/database";
import cuid from "cuid";
import { eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import {
  canManageTeamThemes,
  countThemesInScope,
} from "@/app/dashboard/themes/_lib/queries";
import { getPlan, getPlanForScope, getPlanLimits } from "@/lib/plans";
import type { ActiveScope } from "@/lib/scope";
import { themeStylePropsSchema } from "@/types/theme";
import { FRAME_BASE_STYLE } from "./payloads";
import { getItem } from "./queries";
import { COMMUNITY_TAG, guardedRead } from "./store";
import type { CommunityItemType } from "./types";

// "Copy to workspace": an item becomes a saved theme the person owns (a
// frame on a plain code, or the theme itself). It's a copy: later versions
// of the item never change it. Copies count against the plan's saved-theme
// limit, and each counts as a use once per person and day.

/** A copy refused for a reason the person can act on. */
export class CopyRefusedError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "THEME_LIMIT_REACHED" | "VALIDATION_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "CopyRefusedError";
  }
}

const DAY_MS = 86_400_000;
const NAME_MAX = 50;

export interface CopyResult {
  themeId: string;
  name: string;
  /** Saved in the open workspace's shared themes, or the person's own */
  where: "own" | "team";
}

export async function copyItemToWorkspace(
  scope: ActiveScope,
  ref: { type: CommunityItemType; slug: string },
): Promise<CopyResult> {
  const item = await getItem(ref.type, ref.slug, scope.userId);
  if (!item || item.type === "collection") {
    throw new CopyRefusedError(
      "NOT_FOUND",
      "This item isn't in the community.",
    );
  }
  const style = themeStylePropsSchema.safeParse(
    item.type === "frame" ? { ...FRAME_BASE_STYLE, ...item.apply } : item.apply,
  );
  if (!style.success) {
    throw new CopyRefusedError(
      "VALIDATION_ERROR",
      "This item can't be copied.",
    );
  }

  // The open workspace's shared themes when you may add to them, else yours.
  const own = isOwnWorkspaceOf(scope.organizationId, scope.userId);
  const teamLimits =
    !own && canManageTeamThemes(scope)
      ? getPlanLimits(await getPlanForScope(scope))
      : null;
  const where: CopyResult["where"] = teamLimits?.teamThemes ? "team" : "own";
  const organizationId =
    where === "team" ? scope.organizationId : ownWorkspaceId(scope.userId);
  const limit =
    where === "team" && teamLimits
      ? teamLimits.savedThemes
      : getPlanLimits(await getPlan(scope.userId)).savedThemes;
  const target = { userId: scope.userId, organizationId };
  if (Number.isFinite(limit) && (await countThemesInScope(target)) >= limit) {
    throw new CopyRefusedError(
      "THEME_LIMIT_REACHED",
      `Your plan includes ${limit} saved themes. Delete one or upgrade to Pro to copy more.`,
    );
  }

  const themeId = cuid();
  const name = item.name.slice(0, NAME_MAX);
  const now = new Date();
  await db.insert(qrPreset).values({
    id: themeId,
    userId: scope.userId,
    organizationId,
    name,
    style: style.data,
    createdAt: now,
    updatedAt: now,
  });

  if (item.id) await recordCopy(item.id, item.version, scope, themeId, now);
  return { themeId, name, where };
}

/** One use per person, item and day; the copy's lineage is kept with it. */
async function recordCopy(
  itemId: string,
  version: number,
  scope: ActiveScope,
  presetId: string,
  now: Date,
) {
  await guardedRead(async () => {
    const counted = await db
      .insert(communityUse)
      .values({
        id: cuid(),
        itemId,
        version,
        userId: scope.userId,
        kind: "copy",
        workspaceId: scope.organizationId,
        presetId,
        day: Math.floor(now.getTime() / DAY_MS),
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: communityUse.id });
    if (counted.length > 0) {
      await db
        .update(communityItem)
        .set({ useCount: sql`${communityItem.useCount} + 1` })
        .where(eq(communityItem.id, itemId));
      revalidateTag(COMMUNITY_TAG, "max");
    }
  }, undefined);
}
