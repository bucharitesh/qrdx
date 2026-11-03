import "server-only";

import { communityItem, communityTheme, database as db } from "@repo/database";
import { count, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { logError } from "@/lib/log-error";
import { COMMUNITY_TAG, isMissingSchemaError } from "./tables";

export { COMMUNITY_TAG, isMissingSchemaError } from "./tables";

// Which tables the community reads, so the code is safe on either side of
// manual-sql/0012_community.sql and the backfill:
// - before the SQL, `tables` is false: themes come from community_theme,
//   frames from the engine's official catalogue, and anything that writes
//   (publishing frames, likes on items, handles) says it isn't available;
// - after the SQL but before the backfill, themes still come from
//   community_theme (community_item holds no themes yet, community_theme
//   does), so the gallery never empties;
// - once the backfill has copied the themes, everything reads community_item.

export interface CommunityState {
  /** The community_* tables exist */
  tables: boolean;
  /** Where themes are read from and published to */
  themes: "items" | "legacy";
}

/** The community tables can't be used here yet (manual-sql/0012). */
export class CommunityUnavailableError extends Error {
  constructor() {
    super("The community update isn't available on this deployment yet.");
    this.name = "CommunityUnavailableError";
  }
}

let reported = false;
function reportMissing(error: unknown) {
  if (reported) return;
  reported = true;
  logError(error as Error, {
    action: "community",
    hint: "Apply packages/database/manual-sql/0012_community.sql",
  });
}

/** Reads the state from the database (uncached; see communityState). */
export async function probeCommunityState(): Promise<CommunityState> {
  try {
    const [[items], [legacy]] = await db.batch([
      db
        .select({ n: count() })
        .from(communityItem)
        .where(eq(communityItem.type, "theme")),
      db.select({ n: count() }).from(communityTheme),
    ]);
    const themeItems = Number(items?.n ?? 0);
    const legacyThemes = Number(legacy?.n ?? 0);
    return {
      tables: true,
      themes: themeItems > 0 || legacyThemes === 0 ? "items" : "legacy",
    };
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    reportMissing(error);
    return { tables: false, themes: "legacy" };
  }
}

const cachedState = unstable_cache(probeCommunityState, ["community-state"], {
  revalidate: 60,
  tags: [COMMUNITY_TAG],
});

export async function communityState(): Promise<CommunityState> {
  return cachedState();
}

/**
 * Runs a query on the community tables; a missing table becomes
 * CommunityUnavailableError (callers show "not available yet").
 */
export async function guarded<T>(query: () => Promise<T>): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingSchemaError(error)) {
      reportMissing(error);
      throw new CommunityUnavailableError();
    }
    throw error;
  }
}

/** Like guarded, but a missing table gives `fallback` (for reads). */
export async function guardedRead<T>(
  query: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingSchemaError(error)) {
      reportMissing(error);
      return fallback;
    }
    throw error;
  }
}
