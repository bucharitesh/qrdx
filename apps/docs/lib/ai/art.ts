import "server-only";

import { aiUsage, database as db, member } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import {
  type AIArtCredits,
  ART_REFERENCE_MAX_BYTES,
} from "@/components/sections/ai-art/config";
import { isArtAvailable } from "@/lib/ai/art-availability";
import { HttpError } from "@/lib/error-response";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";
import { logError } from "@/lib/shared";
import { SubscriptionRequiredError } from "@/types/errors";
import { ART_USAGE_MODEL_IDS } from "./art-models";

// AI QR art: credits, limits and configuration. The image pipeline (Gemini,
// scan check, Image QR blend) is in ./art-image.ts.

export { ART_MODEL_ID, ART_USAGE_MODEL_IDS } from "./art-models";

/** JSON body: prompts plus an optional downsized reference image. */
export const MAX_ART_REQUEST_BODY_BYTES =
  16 * 1024 + ART_REFERENCE_MAX_BYTES * 2;

/** AI art runs on Gemini with the same key as AI themes (see art-availability). */
export const isArtConfigured = isArtAvailable;

/** Safety cap per user per UTC day, on top of the monthly allowance. */
export const AI_ART_DAILY_LIMIT = 25;

/** Rejects AI art requests with a 503 when no Google AI key is set. */
export function assertArtConfigured(): void {
  if (!isArtConfigured) {
    throw new HttpError(
      503,
      "AI_NOT_CONFIGURED",
      "AI QR art is not configured on this server",
    );
  }
}

// Each request is one paid image, so these are tighter than the text AI
// limits. A run of four variations sends four requests.
const artUserRateLimiter = createRateLimiter({
  limiter: slidingWindow(12, "60 s"),
});
const artIpRateLimiter = createRateLimiter({
  limiter: slidingWindow(30, "60 s"),
});

export function enforceArtRateLimit(
  req: Request,
  userId: string,
): Promise<void> {
  return enforceRateLimits([
    { limiter: artUserRateLimiter, key: `ai-art:user:${userId}` },
    { limiter: artIpRateLimiter, key: `ai-art:ip:${getClientIp(req)}` },
  ]);
}

// ── Monthly credits ────────────────────────────────────────────────────────

export interface ArtScope {
  userId: string;
  organizationId: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const daysSinceEpoch = (now: Date) => Math.floor(now.getTime() / DAY_MS);

/** Calendar month (UTC) that `now` falls in. */
export function artCreditWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const resetsAt = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return { start, resetsAt };
}

async function poolUserIds(scope: ArtScope, pooled: boolean) {
  if (!(pooled && scope.organizationId)) return [scope.userId];
  const members = await db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, scope.organizationId));
  const ids = new Set(members.map((m) => m.userId));
  ids.add(scope.userId);
  return [...ids];
}

/**
 * This month's AI art allowance for a scope: the plan's `aiArtPerMonth`, per
 * user, or shared by the whole team when the plan pools it (Business).
 */
export async function getArtCredits(
  scope: ArtScope,
  now = new Date(),
): Promise<AIArtCredits> {
  const plan = await getPlanForScope(scope);
  const limits = getPlanLimits(plan);
  const pooled = Boolean(scope.organizationId && limits.aiArtPooled);
  const userIds = await poolUserIds(scope, pooled);
  const { start, resetsAt } = artCreditWindow(now);
  const [row] = await db
    .select({ count: count() })
    .from(aiUsage)
    .where(
      and(
        inArray(aiUsage.userId, userIds),
        inArray(aiUsage.modelId, ART_USAGE_MODEL_IDS),
        gte(aiUsage.createdAt, start),
      ),
    );
  const used = row?.count ?? 0;
  const limit = Number.isFinite(limits.aiArtPerMonth)
    ? limits.aiArtPerMonth
    : null;
  return {
    plan,
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
    pooled,
    resetsAt: resetsAt.toISOString(),
  };
}

/** Refunds reserved images (failed or cancelled runs). */
export async function releaseArtCredits(usageIds: string[]): Promise<void> {
  if (usageIds.length === 0) return;
  await db.delete(aiUsage).where(inArray(aiUsage.id, usageIds));
}

function exhaustedError(credits: AIArtCredits, requested: number) {
  const resets = new Date(credits.resetsAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const left =
    credits.remaining && credits.remaining > 0
      ? `Only ${credits.remaining} left, but this run needs ${requested}.`
      : `You've used all ${credits.limit} AI art images for this month${credits.pooled ? " (shared by your team)" : ""}.`;
  const message = `${left} Your allowance resets on ${resets}.`;
  // Business is the top tier: nothing to upgrade to.
  return credits.plan === "business"
    ? new HttpError(429, "AI_ART_CREDITS_EXHAUSTED", message)
    : new SubscriptionRequiredError(`${message} Upgrade for more.`, {
        creditsRemaining: credits.remaining,
      });
}

/**
 * Records `quantity` images up front and returns their usage row ids. The
 * rows are counted *after* the insert, so parallel requests can never exceed
 * the allowance (the losers are rolled back and rejected).
 */
export async function reserveArtCredits(
  scope: ArtScope,
  quantity: number,
  modelId: string,
): Promise<{ usageIds: string[]; credits: AIArtCredits }> {
  const now = new Date();
  const usageIds = Array.from({ length: quantity }, () => cuid());
  await db.insert(aiUsage).values(
    usageIds.map((id) => ({
      id,
      userId: scope.userId,
      modelId,
      daysSinceEpoch: daysSinceEpoch(now).toString(),
      createdAt: now,
    })),
  );

  try {
    const credits = await getArtCredits(scope, now);
    if (credits.limit !== null && credits.used > credits.limit) {
      // What was left before this request, for the message.
      const before = Math.max(0, credits.limit - (credits.used - quantity));
      throw exhaustedError({ ...credits, remaining: before }, quantity);
    }
    const [today] = await db
      .select({ count: count() })
      .from(aiUsage)
      .where(
        and(
          eq(aiUsage.userId, scope.userId),
          inArray(aiUsage.modelId, ART_USAGE_MODEL_IDS),
          eq(aiUsage.daysSinceEpoch, daysSinceEpoch(now).toString()),
        ),
      );
    if ((today?.count ?? 0) > AI_ART_DAILY_LIMIT) {
      throw new HttpError(
        429,
        "AI_ART_DAILY_LIMIT",
        `You've reached today's limit of ${AI_ART_DAILY_LIMIT} AI art images. Try again tomorrow.`,
      );
    }
    return { usageIds, credits };
  } catch (error) {
    await releaseArtCredits(usageIds).catch((releaseError) =>
      logError(releaseError as Error, { action: "releaseArtCredits" }),
    );
    throw error;
  }
}
