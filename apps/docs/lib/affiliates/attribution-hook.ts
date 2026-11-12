import "server-only";

import type { NewUserSignUp } from "@repo/auth/referral";
import { after } from "next/server";
import { isFeatureAvailable } from "@/lib/feature-availability";
import {
  type AttributionResult,
  attributeNewUser,
  referralCandidatesFrom,
} from "./attribution";

// The affiliate side of the new-user recorder (lib/analytics/sign-up-hook.ts,
// which packages/auth/referral.ts calls when an account is created).

/**
 * Reads the sign-up's codes now (the request's headers don't outlive it) and
 * returns the task that records the referral, to run after the response.
 * Null where there's nothing to do: no code, or the program is off (a
 * self-hosted copy), which then makes no lookup at all.
 */
export function signUpReferralTask(
  signUp: NewUserSignUp,
): (() => Promise<AttributionResult>) | null {
  if (!isFeatureAvailable("affiliates")) return null;
  const candidates = referralCandidatesFrom(signUp);
  if (candidates.length === 0) return null;
  return () =>
    attributeNewUser({
      userId: signUp.userId,
      email: signUp.email,
      candidates,
    });
}

/** The referral alone, after the response (the sign-up never waits on it). */
export function recordSignUpReferral(signUp: NewUserSignUp): void {
  const task = signUpReferralTask(signUp);
  if (!task) return;
  try {
    after(task);
  } catch {
    // No request to wait for (scripts, tests): record now.
    void task();
  }
}
