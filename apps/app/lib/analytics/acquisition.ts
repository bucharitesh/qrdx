import "server-only";

import type { NewUserSignUp } from "@repo/auth/referral";
import { LANDING_HEADER } from "@repo/auth/referral-keys";
import { database as db, userAcquisition } from "@repo/database";
import { isMissingTableError } from "@/lib/affiliates/missing-table";
import { logError } from "@/lib/log-error";
import { baseUrl } from "@/lib/metadata";
import { acquisitionChannel } from "./channel";
import {
  cleanLanding,
  decodeLandingHeader,
  type SignUpLanding,
} from "./landing";

// How a new account found QRdx (user_acquisition), written once at sign-up
// from what the sign-up request carried (lib/analytics/landing.ts): the
// header an email-code sign-up sends, or the OAuth state of a Google or
// GitHub one. Every field is cleaned again here and the channel is worked
// out here (./channel.ts); nothing the browser says is taken as it is.
//
// Best effort, like the affiliate referral it runs after
// (lib/analytics/sign-up-hook.ts): it never throws and never holds up the
// sign-up. Before packages/database/manual-sql/2026-11-13-growth-analytics.sql
// is applied the table doesn't exist: that's noted once and nothing is
// written.

/** What a new account's sign-up carried about its visit, cleaned; null when nothing. */
export function signUpLandingOf(
  signUp: Pick<NewUserSignUp, "headers" | "oauthLanding">,
): SignUpLanding | null {
  const ownHost = baseUrl.hostname;
  return (
    decodeLandingHeader(signUp.headers?.get(LANDING_HEADER), ownHost) ??
    cleanLanding(signUp.oauthLanding, ownHost)
  );
}

export type AcquisitionResult =
  | "recorded"
  | "already_recorded"
  | "nothing_carried"
  | "missing_table"
  | "error";

let warnedMissing = false;

/**
 * Records how the account found QRdx. Without a carried landing (a browser
 * sending Do Not Track, a sign-up from an older page) only an affiliate's
 * credit is worth a row; otherwise the account stays "unknown". Never throws.
 */
export async function recordAcquisition(input: {
  userId: string;
  landing: SignUpLanding | null;
  /** An affiliate was credited with this account */
  affiliate: boolean;
  now?: Date;
}): Promise<AcquisitionResult> {
  const { landing, affiliate } = input;
  if (!(landing || affiliate)) return "nothing_carried";
  const channel = acquisitionChannel(landing, { affiliate });
  try {
    const inserted = await db
      .insert(userAcquisition)
      .values({
        userId: input.userId,
        channel,
        referrerHost: landing?.referrer_host ?? null,
        utmSource: landing?.utm_source ?? null,
        utmMedium: landing?.utm_medium ?? null,
        utmCampaign: landing?.utm_campaign ?? null,
        refTag: landing?.ref ?? null,
        landingPath: landing?.landing_path ?? null,
        signupPath: landing?.signup_path ?? null,
        createdAt: input.now ?? new Date(),
      })
      .onConflictDoNothing({ target: userAcquisition.userId })
      .returning({ userId: userAcquisition.userId });
    if (inserted.length === 0) return "already_recorded";
    // The channel only: no id, host or path.
    console.info(
      JSON.stringify({ event: "analytics.acquisition_recorded", channel }),
    );
    return "recorded";
  } catch (error) {
    if (isMissingTableError(error)) {
      if (!warnedMissing) {
        warnedMissing = true;
        console.warn(
          "Growth analytics: user_acquisition doesn't exist yet (packages/database/manual-sql/2026-11-13-growth-analytics.sql). Sign-up channels aren't recorded until it does.",
        );
      }
      return "missing_table";
    }
    logError(error as Error, { action: "analytics.record_acquisition" });
    return "error";
  }
}
