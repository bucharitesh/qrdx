import "server-only";

import { aiUsage, database as db } from "@repo/database";
import { subscription } from "@repo/database/schema";
import cuid from "cuid";
import { and, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import { SubscriptionRequiredError } from "@/types/errors";
import type { SubscriptionCheck } from "@/types/subscription";
import { ART_MODEL_ID, ART_UPSCALE_MODEL_ID } from "./ai/art";
import { AI_REQUEST_FREE_TIER_LIMIT } from "./constants";

// Polar keeps a subscription "active" until a cancellation takes effect at period end;
// "canceled", "past_due", "unpaid" and "incomplete*" do not grant access.
const ENTITLED_SUBSCRIPTION_STATUSES = ["active", "trialing"];

const FREE_LIMIT_REACHED_MESSAGE = `You've reached your free limit of ${AI_REQUEST_FREE_TIER_LIMIT} requests. Please upgrade to continue.`;

// AI art has its own monthly credits (lib/ai/art.ts), so its rows don't use
// up the free AI theme requests.
const freeTierUsage = (userId: string) =>
  and(
    eq(aiUsage.userId, userId),
    notInArray(aiUsage.modelId, [ART_MODEL_ID, ART_UPSCALE_MODEL_ID]),
  );

async function getAllTimeRequestCount(userId: string): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(aiUsage)
    .where(freeTierUsage(userId));
  return result[0]?.count ?? 0;
}

export async function getMyActiveSubscription(
  userId: string,
): Promise<typeof subscription.$inferSelect | null> {
  const sub = await db
    .select()
    .from(subscription)
    .where(
      and(
        eq(subscription.userId, userId),
        inArray(subscription.status, ENTITLED_SUBSCRIPTION_STATUSES),
      ),
    )
    .orderBy(desc(subscription.createdAt))
    .limit(1);
  return sub[0] ?? null;
}

export async function validateSubscriptionAndUsage(
  userId: string,
): Promise<SubscriptionCheck> {
  try {
    const [activeSubscription, requestsUsed] = await Promise.all([
      getMyActiveSubscription(userId),
      getAllTimeRequestCount(userId),
    ]);

    const isSubscribed = !!activeSubscription;

    if (isSubscribed) {
      return {
        canProceed: true,
        isSubscribed: true,
        requestsUsed,
        requestsRemaining: Infinity, // Unlimited for subscribers
      };
    }

    const requestsRemaining = Math.max(
      0,
      AI_REQUEST_FREE_TIER_LIMIT - requestsUsed,
    );
    const canProceed = requestsUsed < AI_REQUEST_FREE_TIER_LIMIT;

    if (!canProceed) {
      return {
        canProceed: false,
        isSubscribed: false,
        requestsUsed,
        requestsRemaining: 0,
        error: FREE_LIMIT_REACHED_MESSAGE,
      };
    }

    return {
      canProceed: true,
      isSubscribed: false,
      requestsUsed,
      requestsRemaining,
    };
  } catch (error) {
    console.error("Error validating subscription:", error);
    throw error;
  }
}

/**
 * Records one AI request up front and returns its usage row id.
 * Free users are counted *after* the insert, so parallel requests can never
 * exceed the free quota (the losers are rolled back and rejected).
 */
export async function reserveAIRequest(
  userId: string,
  modelId: string,
): Promise<string> {
  const activeSubscription = await getMyActiveSubscription(userId);
  const usageId = cuid();

  await db.insert(aiUsage).values({
    id: usageId,
    userId,
    modelId,
    daysSinceEpoch: Math.floor(Date.now() / (24 * 60 * 60 * 1000)).toString(),
    createdAt: new Date(),
  });

  if (activeSubscription) {
    return usageId;
  }

  const [result] = await db
    .select({ count: count() })
    .from(aiUsage)
    .where(freeTierUsage(userId));

  if ((result?.count ?? 0) > AI_REQUEST_FREE_TIER_LIMIT) {
    await releaseAIRequest(usageId);
    throw new SubscriptionRequiredError(FREE_LIMIT_REACHED_MESSAGE, {
      requestsRemaining: 0,
    });
  }

  return usageId;
}

export async function finalizeAIRequest(
  usageId: string,
  usage: { inputTokens?: number; outputTokens?: number },
): Promise<void> {
  await db
    .update(aiUsage)
    .set({
      promptTokens: String(usage.inputTokens ?? 0),
      completionTokens: String(usage.outputTokens ?? 0),
    })
    .where(eq(aiUsage.id, usageId));
}

/** Refunds a reserved request (e.g. the model call failed). */
export async function releaseAIRequest(usageId: string): Promise<void> {
  await db.delete(aiUsage).where(eq(aiUsage.id, usageId));
}
