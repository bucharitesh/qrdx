import "server-only";

import { unstable_cache } from "next/cache";
import { buildingWithoutDatabase } from "@/lib/build-without-database";
import { queryHomeNumberCounts } from "@/lib/home-numbers/query";
import {
  buildHomeNumbers,
  type HomeNumberCounts,
  type HomeNumbers,
} from "@/lib/home-numbers/stats";
import { logError } from "@/lib/log-error";

/**
 * Seconds between database reads (12 hours). The home page is prerendered;
 * with the section on, this also becomes its ISR period (unstable_cache
 * lowers the route's revalidate), so the counts are read at build time and
 * then in the background. A visitor's request never waits on the query.
 */
export const HOME_NUMBERS_REVALIDATE = 43_200;

export const HOME_NUMBERS_CACHE_TAG = "home-numbers";

interface CachedCounts {
  counts: HomeNumberCounts;
  countedAt: string;
}

// Errors are thrown out of the cached function, never returned: a failed
// refresh then keeps serving the last good counts (Next returns the stale
// entry when revalidating it throws), and nothing failed is ever cached.
const cachedCounts = unstable_cache(
  async (): Promise<CachedCounts> => {
    if (buildingWithoutDatabase()) {
      throw new Error("home numbers: no database in this build");
    }
    return {
      counts: await queryHomeNumberCounts(),
      countedAt: new Date().toISOString(),
    };
  },
  ["home-numbers-v1"],
  { revalidate: HOME_NUMBERS_REVALIDATE, tags: [HOME_NUMBERS_CACHE_TAG] },
);

/**
 * The numbers for the home page, or null when there are none to show: the
 * first read failed (nothing cached yet), or every count is zero. Never
 * zeros or stand-ins.
 */
export async function getHomeNumbers(): Promise<HomeNumbers | null> {
  try {
    const { counts, countedAt } = await cachedCounts();
    return buildHomeNumbers(counts, countedAt);
  } catch (error) {
    if (buildingWithoutDatabase()) {
      // Docker builds have no database: the section appears with the first
      // background refresh after deploy.
      console.warn("home numbers: skipped, no database in this build");
      return null;
    }
    logError(error instanceof Error ? error : new Error(String(error)), {
      action: "home-numbers",
    });
    return null;
  }
}
