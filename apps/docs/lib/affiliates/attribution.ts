import "server-only";

import { REFERRAL_HEADER } from "@repo/auth/referral-keys";
import { affiliate, affiliateReferral, database as db } from "@repo/database";
import cuid from "cuid";
import { eq, or } from "drizzle-orm";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { logError } from "@/lib/log-error";
import { noteMissingTables } from "./missing-table";
import { type AttributionVia, parseReferralCode } from "./rules";
import { isSelfReferral } from "./self-referral";

// Attributes a NEW account to an affiliate, once, at sign-up. packages/auth
// (referral.ts) hands over the new account and what its sign-up request
// carried; nothing here trusts the code:
//
// - only an approved affiliate's code counts (pending, rejected and
//   suspended ones are ignored); an affiliate's code from before they chose
//   their own still counts (affiliate.previous_code);
// - same visit only: the code comes with the sign-up request itself (the
//   header an email-code sign-up sends, or the OAuth state of a Google or
//   GitHub one). No cookie or other stored value is ever read;
// - the first valid referral wins: an account that already has a referral
//   keeps it (affiliate_referral.referred_user_id is unique);
// - it's never self-referral (./self-referral.ts);
// - an existing account is never attributed: this only runs from the user
//   create hook, never for a sign-in.
//
// Best effort: a failure, including the tables not existing yet, is logged
// and never reaches the sign-up.

export interface ReferralCandidate {
  code: string;
  via: AttributionVia;
}

export type AttributionResult =
  | { status: "attributed"; affiliateId: string; via: AttributionVia }
  | {
      status: "skipped";
      reason:
        | "unavailable"
        | "no_code"
        | "not_approved"
        | "self_referral"
        | "already_referred"
        | "missing_tables"
        | "error";
    };

/**
 * The codes a sign-up carried, in the order they're tried: the header an
 * email-code sign-up sends, then the OAuth state of a Google or GitHub one.
 * Malformed codes are dropped; repeats are tried once.
 */
export function referralCandidatesFrom(source: {
  headers?: Pick<Headers, "get"> | null;
  oauthReferralCode?: unknown;
}): ReferralCandidate[] {
  const headers = source.headers ?? null;
  const found: ReferralCandidate[] = [];
  const add = (value: unknown, via: AttributionVia) => {
    const code = parseReferralCode(value);
    if (code && !found.some((candidate) => candidate.code === code)) {
      found.push({ code, via });
    }
  };
  add(headers?.get(REFERRAL_HEADER), "link");
  add(source.oauthReferralCode, "link");
  return found;
}

/**
 * Tries each candidate in order and records the first valid one for the new
 * account. Never throws.
 */
export async function attributeNewUser(input: {
  userId: string;
  email: string;
  candidates: readonly ReferralCandidate[];
  now?: Date;
}): Promise<AttributionResult> {
  if (!isFeatureAvailable("affiliates")) {
    return { status: "skipped", reason: "unavailable" };
  }
  if (input.candidates.length === 0) {
    return { status: "skipped", reason: "no_code" };
  }
  let reason: "not_approved" | "self_referral" = "not_approved";
  try {
    for (const candidate of input.candidates) {
      const [found] = await db
        .select({
          id: affiliate.id,
          userId: affiliate.userId,
          status: affiliate.status,
        })
        .from(affiliate)
        .where(
          or(
            eq(affiliate.code, candidate.code),
            eq(affiliate.previousCode, candidate.code),
          ),
        )
        .limit(1);
      if (found?.status !== "approved") continue;
      if (
        await isSelfReferral({
          affiliateUserId: found.userId,
          customerUserId: input.userId,
          customerEmails: [input.email],
        })
      ) {
        reason = "self_referral";
        continue;
      }
      const inserted = await db
        .insert(affiliateReferral)
        .values({
          id: cuid(),
          affiliateId: found.id,
          referredUserId: input.userId,
          attributedVia: candidate.via,
          createdAt: input.now ?? new Date(),
        })
        .onConflictDoNothing({ target: affiliateReferral.referredUserId })
        .returning({ id: affiliateReferral.id });
      if (inserted.length === 0) {
        return { status: "skipped", reason: "already_referred" };
      }
      console.info(
        JSON.stringify({
          event: "affiliates.referral_attributed",
          via: candidate.via,
        }),
      );
      return {
        status: "attributed",
        affiliateId: found.id,
        via: candidate.via,
      };
    }
    return { status: "skipped", reason };
  } catch (error) {
    if (noteMissingTables(error)) {
      return { status: "skipped", reason: "missing_tables" };
    }
    logError(error as Error, { action: "affiliates.attribute" });
    return { status: "skipped", reason: "error" };
  }
}
