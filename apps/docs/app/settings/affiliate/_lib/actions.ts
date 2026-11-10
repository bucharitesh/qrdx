"use server";

import { auth } from "@repo/auth/server";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import {
  currentSession,
  requireRecentConfirmation,
} from "@/lib/account/confirmation-server";
import { MAX_EMAIL_LENGTH } from "@/lib/account/email-change";
import { isMissingTableError } from "@/lib/affiliates/missing-table";
import {
  applyForAffiliate,
  getAffiliateForUser,
  setPaypalEmail,
} from "@/lib/affiliates/program";
import type { AffiliateStatus } from "@/lib/affiliates/rules";
import { HttpError } from "@/lib/error-response";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { logError } from "@/lib/log-error";
import { enforceRateLimits } from "@/lib/request-guards";

// The signed-in side of the affiliate program: applying (/affiliates) and the
// PayPal address (Settings → Affiliate program).

export type AffiliateActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const NOT_READY = "The affiliate program isn't available yet.";
const SIGNED_OUT = "Sign in to continue.";

const applyLimiter = createRateLimiter({ limiter: slidingWindow(5, "1 h") });
const paypalLimiter = createRateLimiter({ limiter: slidingWindow(10, "1 h") });

function failure(error: unknown, action: string): AffiliateActionResult<never> {
  if (isMissingTableError(error)) return { ok: false, error: NOT_READY };
  if (error instanceof HttpError) return { ok: false, error: error.message };
  logError(error as Error, { action });
  return { ok: false, error: "Something went wrong. Please try again." };
}

export interface ApplyState {
  signedIn: boolean;
  /** The tables exist (the SQL was applied). */
  ready: boolean;
  status: AffiliateStatus | null;
}

/** What the apply form on /affiliates should show this visitor. */
export async function getAffiliateApplyState(): Promise<ApplyState> {
  const session = await auth.api
    .getSession({ headers: await headers() })
    .catch(() => null);
  if (!session?.user) return { signedIn: false, ready: true, status: null };
  if (!isFeatureAvailable("affiliates")) {
    return { signedIn: true, ready: false, status: null };
  }
  try {
    const row = await getAffiliateForUser(session.user.id);
    return {
      signedIn: true,
      ready: true,
      status: (row?.status as AffiliateStatus | undefined) ?? null,
    };
  } catch (error) {
    if (!isMissingTableError(error)) {
      logError(error as Error, { action: "affiliates.apply_state" });
    }
    return { signedIn: true, ready: false, status: null };
  }
}

const applySchema = z.object({
  website: z
    .string()
    .trim()
    .max(200, "Keep the website or profile under 200 characters.")
    .default(""),
  promotion: z
    .string()
    .trim()
    .min(20, "Tell us a little more (at least 20 characters).")
    .max(1000, "Keep it under 1,000 characters."),
  agree: z.literal(true, {
    error: "Read and accept the affiliate terms to apply.",
  }),
});

export async function applyForAffiliateAction(
  input: z.input<typeof applySchema>,
): Promise<AffiliateActionResult<{ status: AffiliateStatus }>> {
  if (!isFeatureAvailable("affiliates")) return { ok: false, error: NOT_READY };
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the form.",
    };
  }
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { ok: false, error: SIGNED_OUT };
    await enforceRateLimits([
      { limiter: applyLimiter, key: `affiliates:apply:${session.user.id}` },
    ]);
    const row = await applyForAffiliate({
      userId: session.user.id,
      name: session.user.name,
      application: {
        website: parsed.data.website,
        promotion: parsed.data.promotion,
      },
    });
    revalidatePath("/settings/affiliate");
    return { ok: true, data: { status: row.status as AffiliateStatus } };
  } catch (error) {
    return failure(error, "affiliates.apply");
  }
}

const paypalSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(MAX_EMAIL_LENGTH)
    .email("Enter the email address of your PayPal account."),
});

/**
 * Where payouts go. It changes where money is sent, so it asks "Confirm
 * it's you" first, and only an approved affiliate can set it.
 */
export async function savePaypalEmailAction(
  input: z.input<typeof paypalSchema>,
): Promise<AffiliateActionResult> {
  if (!isFeatureAvailable("affiliates")) return { ok: false, error: NOT_READY };
  const parsed = paypalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Enter an email address.",
    };
  }
  try {
    const session = await currentSession();
    if (!session) return { ok: false, error: SIGNED_OUT };
    // Before the limit, so the round trip that asks doesn't use one up.
    const needed = await requireRecentConfirmation(session);
    if (needed) return needed;
    await enforceRateLimits([
      { limiter: paypalLimiter, key: `affiliates:paypal:${session.userId}` },
    ]);
    const saved = await setPaypalEmail({
      userId: session.userId,
      email: parsed.data.email,
    });
    if (saved === "not_approved") {
      return {
        ok: false,
        error: "You can add a PayPal email once your application is approved.",
      };
    }
    revalidatePath("/settings/affiliate");
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "affiliates.paypal");
  }
}
