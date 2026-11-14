"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import {
  disablePublicStats,
  enablePublicStats,
  getPublicStatsShare,
  getStatsBranding,
  type PublicStatsShare,
  resetPublicStats,
  type StatsBranding,
  setStatsBranding,
} from "@/lib/public-stats";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

export type PublicStatsResult =
  | { success: true; data: PublicStatsShare }
  | { success: false; error: { code: string; message: string } };

const KNOWN = new Set([
  "NOT_FOUND",
  "FORBIDDEN",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "VALIDATION_ERROR",
  // Client branding (agency tools)
  "PLAN_REQUIRED",
  "CONFLICT",
]);

const codeId = z.string().trim().min(1).max(64);
const writeLimiter = createRateLimiter({ limiter: slidingWindow(20, "60 s") });

async function run<T = PublicStatsShare>(
  action: string,
  id: unknown,
  fn: (scope: ActiveScope, codeId: string) => Promise<T>,
  { write = false } = {},
): Promise<
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } }
> {
  try {
    const parsed = codeId.safeParse(id);
    if (!parsed.success) {
      throw new HttpError(404, "NOT_FOUND", "QR code not found");
    }
    const scope = await getActiveScope();
    if (write) {
      await enforceRateLimits([
        {
          limiter: writeLimiter,
          key: `public-stats:write:user:${scope.userId}`,
        },
      ]);
    }
    return { success: true, data: await fn(scope, parsed.data) };
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Sign in to share analytics." },
      };
    }
    if (error instanceof HttpError && KNOWN.has(error.code)) {
      return {
        success: false,
        error: { code: error.code, message: error.message },
      };
    }
    logError(error as Error, { action });
    return {
      success: false,
      error: { code: "UNKNOWN_ERROR", message: "Something went wrong." },
    };
  }
}

export async function getPublicStatsShareAction(input: {
  codeId: string;
}): Promise<PublicStatsResult> {
  return run("getPublicStatsShare", input.codeId, getPublicStatsShare);
}

export async function setPublicStatsShareAction(input: {
  codeId: string;
  on: boolean;
}): Promise<PublicStatsResult> {
  return run(
    input.on ? "enablePublicStats" : "disablePublicStats",
    input.codeId,
    input.on ? enablePublicStats : disablePublicStats,
    { write: true },
  );
}

export async function resetPublicStatsShareAction(input: {
  codeId: string;
}): Promise<PublicStatsResult> {
  return run("resetPublicStats", input.codeId, resetPublicStats, {
    write: true,
  });
}

// ─── Client branding (agency tools) ──────────────────────────────────────────

export type StatsBrandingResult =
  | { success: true; data: StatsBranding }
  | { success: false; error: { code: string; message: string } };

export async function getStatsBrandingAction(input: {
  codeId: string;
}): Promise<StatsBrandingResult> {
  return run("getStatsBranding", input.codeId, getStatsBranding);
}

const optionalId = z.string().trim().min(1).max(64).nullable();

/** Sets the page's client brand and custom domain (null clears each). */
export async function setStatsBrandingAction(input: {
  codeId: string;
  brandId: string | null;
  domainId: string | null;
}): Promise<
  | {
      success: true;
      data: { share: PublicStatsShare; branding: StatsBranding };
    }
  | { success: false; error: { code: string; message: string } }
> {
  const brandId = optionalId.safeParse(input.brandId ?? null);
  const domainId = optionalId.safeParse(input.domainId ?? null);
  if (!(brandId.success && domainId.success)) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Choose a brand and a link.",
      },
    };
  }
  return run(
    "setStatsBranding",
    input.codeId,
    (scope, codeId) =>
      setStatsBranding(scope, codeId, {
        brandId: brandId.data,
        domainId: domainId.data,
      }),
    { write: true },
  );
}
