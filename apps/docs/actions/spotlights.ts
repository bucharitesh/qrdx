"use server";

import { auth } from "@repo/auth/server";
import { database as db } from "@repo/database";
import { user as userTable } from "@repo/database/schema";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { knownIds } from "@/lib/changelog-feed";
import { settingsWithAppended } from "@/lib/settings-list";
import { logError } from "@/lib/shared";
import { SPOTLIGHT_IDS, SPOTLIGHTS_LIMIT } from "@/lib/spotlights";

export type MarkSpotlightSeenResult = { ok: true; id: string } | { ok: false };

const KNOWN = new Set<string>(SPOTLIGHT_IDS);

/**
 * A spotlight was dismissed or its control used: it joins
 * user.settings.spotlightsSeen (the last SPOTLIGHTS_LIMIT are kept) and
 * doesn't show again. Only ids from lib/spotlights.ts are stored.
 */
export async function markSpotlightSeen(
  id: unknown,
): Promise<MarkSpotlightSeenResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) return { ok: false };

  const [known] = knownIds(id, KNOWN, 1);
  if (!known) return { ok: false };

  try {
    await db
      .update(userTable)
      .set({
        settings: settingsWithAppended(
          "spotlightsSeen",
          [known],
          SPOTLIGHTS_LIMIT,
        ),
      })
      .where(eq(userTable.id, userId));
    return { ok: true, id: known };
  } catch (error) {
    logError(error as Error, { action: "spotlights.markSeen" });
    return { ok: false };
  }
}
