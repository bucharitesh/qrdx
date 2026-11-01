"use server";

import type { Plan } from "@/lib/plans";
import { getPlan } from "@/lib/plans";
import { getCurrentUserId } from "@/lib/shared";

/**
 * The signed-in user's plan, for PostHog's person properties. Only asked
 * for after the visitor allowed analytics; null when signed out.
 */
export async function getAnalyticsPlan(): Promise<Plan | null> {
  try {
    return await getPlan(await getCurrentUserId());
  } catch {
    return null;
  }
}
