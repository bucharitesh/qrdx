import "server-only";

import {
  createFalClient,
  ApiError as FalApiError,
  type FalClient,
} from "@fal-ai/client";
import type {
  esrganInput,
  IllusionDiffusionInput,
} from "@fal-ai/client/endpoints";
import { aiUsage, database as db, member } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import { and, count, eq, gte, inArray } from "drizzle-orm";
import { getQRAsSVG } from "qrdx";
import {
  Children,
  cloneElement,
  createElement,
  Fragment,
  isValidElement,
} from "react";
import {
  type AIArtCredits,
  type AIArtVariant,
  ART_MAX_VARIATIONS,
  ART_REFERENCE_MAX_BYTES,
  creativityToGuidanceScale,
  isFalResultUrl,
  visibilityToConditioningScale,
} from "@/components/sections/ai-art/config";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/error-response";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";
import { logError } from "@/lib/shared";
import { SubscriptionRequiredError } from "@/types/errors";

/**
 * fal.ai Illusion Diffusion: Stable Diffusion 1.5 (Realistic Vision) guided by
 * the QR Code Monster ControlNet, so the control QR code survives as the
 * light/dark structure of the artwork. One image per call (no num_images), so
 * variations run as parallel calls with consecutive seeds.
 * Input schema: https://fal.ai/models/fal-ai/illusion-diffusion/api
 */
export const ART_MODEL_ID = "fal-ai/illusion-diffusion";

/**
 * Real-ESRGAN on fal.ai, used for the 2× print upscale (`scale: 2` with the
 * x2plus weights). Schema: https://fal.ai/models/fal-ai/esrgan/api
 */
export const ART_UPSCALE_MODEL_ID = "fal-ai/esrgan";

/** ai_usage model ids that draw on the monthly AI art allowance. */
export const ART_USAGE_MODEL_IDS = [ART_MODEL_ID, ART_UPSCALE_MODEL_ID];

/** Fixed model inputs; prompt, scales, seed and image vary per request. */
export const ART_MODEL_PARAMS = {
  control_guidance_start: 0,
  control_guidance_end: 1,
  num_inference_steps: 40,
  scheduler: "Euler",
  image_size: "square_hd",
} satisfies Partial<IllusionDiffusionInput>;

export const ART_UPSCALE_PARAMS = {
  model: "RealESRGAN_x2plus",
  scale: 2,
  output_format: "png",
} satisfies Partial<esrganInput>;

/** Always avoided; a user's negative prompt is appended. */
export const ART_BASE_NEGATIVE_PROMPT =
  "ugly, disfigured, deformed, low quality, blurry, lowres, jpeg artifacts, watermark, signature, text, nsfw";

const CONTROL_IMAGE_SIZE = 1024;
/** Light border around the control code, in modules (the spec minimum is 4). */
const CONTROL_QUIET_ZONE_MODULES = 6;
/** How strongly a reference image's light/dark shapes join the QR guide. */
const REFERENCE_WEIGHT = 0.3;

/** Stays under the route's maxDuration so a slow run is cancelled and refunded. */
const ART_TIMEOUT_MS = 50_000;
const ART_QUEUE_START_TIMEOUT_SECONDS = 30;

/** JSON body: prompts plus an optional downsized reference image. */
export const MAX_ART_REQUEST_BODY_BYTES =
  16 * 1024 + ART_REFERENCE_MAX_BYTES * 2;
export const MAX_ART_UPSCALE_BODY_BYTES = 4 * 1024;

export const isArtConfigured = Boolean(env.FAL_KEY);

/** Safety cap per user per UTC day, on top of the monthly allowance. */
export const AI_ART_DAILY_LIMIT = 25;

/** Rejects AI art requests with a 503 when no fal.ai key is set. */
export function assertArtConfigured(): void {
  if (!isArtConfigured) {
    throw new HttpError(
      503,
      "AI_NOT_CONFIGURED",
      "AI QR art is not configured on this server",
    );
  }
}

// Each image is a paid GPU job, so these are tighter than the text AI limits.
const artUserRateLimiter = createRateLimiter({
  limiter: slidingWindow(5, "60 s"),
});
const artIpRateLimiter = createRateLimiter({
  limiter: slidingWindow(15, "60 s"),
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

// ── Control image ──────────────────────────────────────────────────────────

/**
 * Renders the ControlNet input on the server: a plain black-on-white qrdx code
 * (error correction H, square modules, wide quiet zone) as a PNG data URI.
 * An optional reference image (an uploaded data: URL, never a remote URL) is
 * blended in at low opacity so its light and dark shapes guide composition.
 */
export async function renderControlImage(
  text: string,
  reference?: string,
): Promise<string> {
  const { ImageResponse } = await import("next/og");
  const qr = await getQRAsSVG({
    value: text,
    level: "H",
    size: CONTROL_IMAGE_SIZE,
    margin: CONTROL_QUIET_ZONE_MODULES,
    fgColor: "#000000",
    bgColor: "#FFFFFF",
  });
  // getQRAsSVG leaves an empty fragment in the logo slot; satori can't render fragments.
  const paths = Children.toArray(qr.props.children).filter(
    (child) => isValidElement(child) && child.type !== Fragment,
  );
  const fill = {
    position: "absolute",
    top: 0,
    left: 0,
    width: CONTROL_IMAGE_SIZE,
    height: CONTROL_IMAGE_SIZE,
  } as const;

  const image = new ImageResponse(
    createElement(
      "div",
      {
        style: {
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          backgroundColor: "#FFFFFF",
        },
      },
      cloneElement(qr, { style: fill }, ...paths),
      reference
        ? createElement("img", {
            alt: "",
            src: reference,
            width: CONTROL_IMAGE_SIZE,
            height: CONTROL_IMAGE_SIZE,
            style: { ...fill, objectFit: "cover", opacity: REFERENCE_WEIGHT },
          })
        : null,
    ),
    { width: CONTROL_IMAGE_SIZE, height: CONTROL_IMAGE_SIZE },
  );
  const png = Buffer.from(await image.arrayBuffer());
  return `data:image/png;base64,${png.toString("base64")}`;
}

// ── fal.ai calls ───────────────────────────────────────────────────────────

/** The parts of the fal client these calls use (tests pass a fake). */
export type ArtFalClient = Pick<FalClient, "subscribe"> & {
  queue: Pick<FalClient["queue"], "cancel">;
};

let falClient: FalClient | null = null;

function getFalClient(): ArtFalClient {
  falClient ??= createFalClient({ credentials: env.FAL_KEY });
  return falClient;
}

async function runFalJob<T>(
  fal: ArtFalClient,
  modelId: string,
  input: Record<string, unknown>,
  signal: AbortSignal,
  action: string,
): Promise<T> {
  const deadline = AbortSignal.timeout(ART_TIMEOUT_MS);
  const abortSignal = AbortSignal.any([signal, deadline]);
  let requestId: string | undefined;
  try {
    const { data } = await fal.subscribe(modelId, {
      input,
      abortSignal,
      startTimeout: ART_QUEUE_START_TIMEOUT_SECONDS,
      onEnqueue: (id: string) => {
        requestId = id;
      },
    } as Parameters<FalClient["subscribe"]>[1]);
    return data as T;
  } catch (error) {
    if (requestId && abortSignal.aborted) {
      // Stop the GPU job so an abandoned request doesn't keep billing.
      fal.queue.cancel(modelId, { requestId }).catch(() => {});
    }
    if (signal.aborted) {
      throw error;
    }
    if (deadline.aborted) {
      throw new HttpError(
        504,
        "AI_ART_TIMEOUT",
        "The image model took too long. No AI credit was used, please try again.",
      );
    }
    // No error.body: validation errors echo the input (prompt + control image).
    logError(error as Error, {
      action,
      model: modelId,
      falRequestId: requestId,
      ...(error instanceof FalApiError && { status: error.status }),
    });
    throw new HttpError(
      502,
      "AI_ART_FAILED",
      "The image model couldn't create this artwork. No AI credit was used, please try again.",
    );
  }
}

interface FalImageOutput {
  image?: { url?: unknown; width?: number; height?: number };
  seed?: number;
}

function readImage(data: FalImageOutput) {
  const url = data.image?.url;
  if (typeof url !== "string" || !url.startsWith("https://")) {
    throw new HttpError(
      502,
      "AI_ART_FAILED",
      "The image model returned no image. No AI credit was used, please try again.",
    );
  }
  return {
    imageUrl: url,
    width: data.image?.width ?? null,
    height: data.image?.height ?? null,
  };
}

/** Model input for one variant (exported for tests). */
export function buildArtInput({
  controlImage,
  prompt,
  negativePrompt,
  visibility,
  creativity,
  seed,
}: {
  controlImage: string;
  prompt: string;
  negativePrompt?: string;
  visibility: number;
  creativity: number;
  seed: number;
}): IllusionDiffusionInput {
  return {
    ...ART_MODEL_PARAMS,
    image_url: controlImage,
    prompt,
    negative_prompt: negativePrompt
      ? `${ART_BASE_NEGATIVE_PROMPT}, ${negativePrompt}`
      : ART_BASE_NEGATIVE_PROMPT,
    controlnet_conditioning_scale: visibilityToConditioningScale(visibility),
    guidance_scale: creativityToGuidanceScale(creativity),
    seed,
  };
}

export type ArtVariantOutcome =
  | { ok: true; variant: AIArtVariant }
  | { ok: false; error: unknown };

/**
 * Runs one model call per seed in parallel. Each outcome is reported
 * separately so the caller can refund exactly the failed variants.
 */
export async function runArtVariants({
  seeds,
  signal,
  fal = getFalClient(),
  ...input
}: {
  controlImage: string;
  prompt: string;
  negativePrompt?: string;
  visibility: number;
  creativity: number;
  seeds: number[];
  signal: AbortSignal;
  fal?: ArtFalClient;
}): Promise<ArtVariantOutcome[]> {
  if (seeds.length < 1 || seeds.length > ART_MAX_VARIATIONS) {
    throw new RangeError(`Between 1 and ${ART_MAX_VARIATIONS} variations`);
  }
  return await Promise.all(
    seeds.map(async (seed): Promise<ArtVariantOutcome> => {
      try {
        const data = await runFalJob<FalImageOutput>(
          fal,
          ART_MODEL_ID,
          buildArtInput({ ...input, seed }),
          signal,
          "runArtVariants",
        );
        return {
          ok: true,
          variant: { ...readImage(data), seed: data.seed ?? seed },
        };
      } catch (error) {
        return { ok: false, error };
      }
    }),
  );
}

/** 2× Real-ESRGAN upscale of an image this app generated on fal.ai. */
export async function upscaleArtImage({
  imageUrl,
  signal,
  fal = getFalClient(),
}: {
  imageUrl: string;
  signal: AbortSignal;
  fal?: ArtFalClient;
}) {
  if (!isFalResultUrl(imageUrl)) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Only images generated here can be upscaled",
    );
  }
  const data = await runFalJob<FalImageOutput>(
    fal,
    ART_UPSCALE_MODEL_ID,
    { ...ART_UPSCALE_PARAMS, image_url: imageUrl },
    signal,
    "upscaleArtImage",
  );
  return readImage(data);
}
