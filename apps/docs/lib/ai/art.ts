import "server-only";

import {
  createFalClient,
  ApiError as FalApiError,
  type FalClient,
} from "@fal-ai/client";
import type { IllusionDiffusionInput } from "@fal-ai/client/endpoints";
import { aiUsage, database as db } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { and, count, eq } from "drizzle-orm";
import { getQRAsSVG } from "qrdx";
import {
  Children,
  cloneElement,
  createElement,
  Fragment,
  isValidElement,
} from "react";
import { z } from "zod";
import {
  ART_CREATIVITY,
  ART_PROMPT_MAX_LENGTH,
  ART_PROMPT_MIN_LENGTH,
  ART_TEXT_MAX_LENGTH,
} from "@/components/sections/ai-art/config";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/error-response";
import { enforceRateLimits, getClientIp } from "@/lib/request-guards";
import { logError } from "@/lib/shared";

/**
 * fal.ai Illusion Diffusion: Stable Diffusion 1.5 (Realistic Vision) guided by
 * the QR Code Monster ControlNet, so the control QR code survives as the
 * light/dark structure of the artwork.
 * Input schema: https://fal.ai/models/fal-ai/illusion-diffusion/api
 */
export const ART_MODEL_ID = "fal-ai/illusion-diffusion";

/** Fixed model inputs; image_url, prompt, conditioning scale and seed vary per request. */
export const ART_MODEL_PARAMS = {
  negative_prompt:
    "ugly, disfigured, deformed, low quality, blurry, lowres, jpeg artifacts, watermark, signature, text, nsfw",
  guidance_scale: 7.5,
  control_guidance_start: 0,
  control_guidance_end: 1,
  num_inference_steps: 40,
  scheduler: "Euler",
  image_size: "square_hd",
} satisfies Partial<IllusionDiffusionInput>;

/** controlnet_conditioning_scale at creativity 0 (most scannable) and 100 (most artistic). */
const CONDITIONING_SCALE_RANGE = { scannable: 2, artistic: 0.8 } as const;

const CONTROL_IMAGE_SIZE = 1024;
/** Light border around the control code, in modules (the spec minimum is 4). */
const CONTROL_QUIET_ZONE_MODULES = 6;

/** Stays under the route's maxDuration so a slow run is cancelled and refunded. */
const ART_TIMEOUT_MS = 50_000;
const ART_QUEUE_START_TIMEOUT_SECONDS = 30;

export const MAX_ART_REQUEST_BODY_BYTES = 8 * 1024;

export const isArtConfigured = Boolean(env.FAL_KEY);

// Each image is a paid GPU job; Pro has unlimited AI credits, so cap per user per UTC day.
export const AI_ART_DAILY_LIMIT = 25;

/** Call after reserveAIRequest: the reserved row is already counted. */
export async function assertArtDailyLimit(userId: string): Promise<void> {
  const today = Math.floor(Date.now() / (24 * 60 * 60 * 1000)).toString();
  const [row] = await db
    .select({ count: count() })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.modelId, ART_MODEL_ID),
        eq(aiUsage.daysSinceEpoch, today),
      ),
    );
  if ((row?.count ?? 0) > AI_ART_DAILY_LIMIT) {
    throw new HttpError(
      429,
      "AI_ART_DAILY_LIMIT",
      `You've reached today's limit of ${AI_ART_DAILY_LIMIT} AI art images. Try again tomorrow.`,
    );
  }
}

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

export const aiArtRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Enter a link or text to encode")
    .max(ART_TEXT_MAX_LENGTH),
  prompt: z
    .string()
    .trim()
    .min(ART_PROMPT_MIN_LENGTH, "Describe the artwork you want")
    .max(ART_PROMPT_MAX_LENGTH),
  creativity: z
    .number()
    .int()
    .min(ART_CREATIVITY.min)
    .max(ART_CREATIVITY.max)
    .default(ART_CREATIVITY.default),
  seed: z.number().int().min(0).max(4_294_967_295).optional(),
});

// Each generation is a paid GPU job, so these are tighter than the text AI limits.
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

export function creativityToConditioningScale(creativity: number): number {
  const clamped = Math.min(
    Math.max(creativity, ART_CREATIVITY.min),
    ART_CREATIVITY.max,
  );
  const t =
    (clamped - ART_CREATIVITY.min) / (ART_CREATIVITY.max - ART_CREATIVITY.min);
  const { scannable, artistic } = CONDITIONING_SCALE_RANGE;
  return Math.round((scannable - t * (scannable - artistic)) * 100) / 100;
}

/**
 * Renders the ControlNet input on the server: a plain black-on-white qrdx code
 * (error correction H, square modules, wide quiet zone) as a PNG data URI.
 * Nothing user-supplied is fetched, only `text` is encoded.
 */
export async function renderControlImage(text: string): Promise<string> {
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

  const image = new ImageResponse(
    createElement(
      "div",
      {
        style: {
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: "#FFFFFF",
        },
      },
      cloneElement(qr, undefined, ...paths),
    ),
    { width: CONTROL_IMAGE_SIZE, height: CONTROL_IMAGE_SIZE },
  );
  const png = Buffer.from(await image.arrayBuffer());
  return `data:image/png;base64,${png.toString("base64")}`;
}

let falClient: FalClient | null = null;

function getFalClient(): FalClient {
  falClient ??= createFalClient({ credentials: env.FAL_KEY });
  return falClient;
}

export interface QRArtImage {
  url: string;
  width: number | null;
  height: number | null;
  seed: number;
}

/**
 * Runs the model and returns the hosted result image. Throws an HttpError
 * (502/504) on failure; rethrows as-is when `signal` (the client) aborted.
 */
export async function runArtModel({
  controlImage,
  prompt,
  creativity,
  seed,
  signal,
}: {
  controlImage: string;
  prompt: string;
  creativity: number;
  seed?: number;
  signal: AbortSignal;
}): Promise<QRArtImage> {
  const fal = getFalClient();
  const deadline = AbortSignal.timeout(ART_TIMEOUT_MS);
  const abortSignal = AbortSignal.any([signal, deadline]);
  let requestId: string | undefined;

  try {
    const { data } = await fal.subscribe(ART_MODEL_ID, {
      input: {
        ...ART_MODEL_PARAMS,
        image_url: controlImage,
        prompt,
        controlnet_conditioning_scale:
          creativityToConditioningScale(creativity),
        ...(seed !== undefined && { seed }),
      },
      abortSignal,
      startTimeout: ART_QUEUE_START_TIMEOUT_SECONDS,
      onEnqueue: (id) => {
        requestId = id;
      },
    });

    const url = data.image?.url;
    if (typeof url !== "string" || !url.startsWith("https://")) {
      throw new Error("fal.ai returned no image URL");
    }

    return {
      url,
      width: data.image.width ?? null,
      height: data.image.height ?? null,
      seed: data.seed,
    };
  } catch (error) {
    if (requestId && abortSignal.aborted) {
      // Stop the GPU job so an abandoned request doesn't keep billing.
      fal.queue.cancel(ART_MODEL_ID, { requestId }).catch(() => {});
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
      action: "runArtModel",
      model: ART_MODEL_ID,
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
