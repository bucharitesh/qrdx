import "server-only";

import {
  type NewUserSignUp,
  registerNewUserReferralRecorder,
} from "@repo/auth/referral";
import { after } from "next/server";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { attributeNewUser, referralCandidatesFrom } from "./attribution";

// Importing this module hands packages/auth the app's recorder for
// referrals at sign-up (packages/auth/referral.ts). Accounts are only created
// by the /api/auth route (email codes, Google and GitHub callbacks, single
// sign-on), which imports it. Registering twice is harmless: it's one slot
// on globalThis.

/**
 * Reads the codes now (the request's headers don't outlive it) and records
 * the referral after the response, so the sign-up never waits on it. Does
 * nothing at all while the program is off (a self-hosted copy).
 */
export function recordSignUpReferral(signUp: NewUserSignUp): void {
  if (!isFeatureAvailable("affiliates")) return;
  const candidates = referralCandidatesFrom(signUp);
  if (candidates.length === 0) return;
  const task = async () => {
    await attributeNewUser({
      userId: signUp.userId,
      email: signUp.email,
      candidates,
    });
  };
  try {
    after(task);
  } catch {
    // No request to wait for (scripts, tests): record now.
    void task();
  }
}

registerNewUserReferralRecorder(recordSignUpReferral);
