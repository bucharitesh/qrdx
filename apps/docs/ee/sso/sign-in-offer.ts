"use server";

import { ssoSignInOffered } from "@repo/auth/sso";
import { ssoRequiredForDomain } from "@repo/auth/sso-required";
import { emailDomain, looksLikeEmail } from "@repo/auth/sso-rules";
import { createMemoryLimiter } from "@repo/rate-limit";
import { headers } from "next/headers";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { getClientIp } from "@/lib/request-guards";
import { logError } from "@/lib/shared";

// The sign-in panel asks this before it emails a code: when the address's
// domain signs in with SSO, it offers that first, with the code one click
// away (app/(app)/(auth)/components/email-code-sign-in.tsx). The answer depends on
// the domain only (packages/auth/ee/sso.ts ssoSignInOffered), never on
// whether an account exists, and says no more than starting "Sign in with
// SSO" already does. When the workspace requires SSO for the domain, it says
// that too (`required`), so the panel can say so; the workspace's owners can
// still ask for a code, so the code stays one click away.

// Per IP and in this instance's memory, like Better Auth's limits on the
// other sign-in endpoints, and as loose as starting an SSO sign-in (60 a
// minute): a whole office can sign in from one address. In memory, so the
// email step waits on no extra network hop. Over the limit, the panel just
// sends the code. (A "use server" file exports async functions only, so the
// numbers stay here; the tests count to them.)
const limiter = createMemoryLimiter({ tokens: 60, windowMs: 60_000 });

/** Whether to offer single sign-on for the address typed in. */
export interface SsoSignInOffer {
  sso: boolean;
  /** Present (true) when the domain requires single sign-on. */
  required?: true;
}

const NO_OFFER: SsoSignInOffer = { sso: false };

export async function ssoSignInOffer(email: unknown): Promise<SsoSignInOffer> {
  // Without a licence key there's no SSO to offer, and nothing is looked up.
  if (!isFeatureAvailable("sso")) return NO_OFFER;
  const ip = getClientIp({ headers: await headers() });
  if (!limiter.limit(`sso-offer:ip:${ip}`).success) return NO_OFFER;
  if (!looksLikeEmail(email)) return NO_OFFER;
  const domain = emailDomain(email as string);
  if (!domain) return NO_OFFER;
  try {
    if (!(await ssoSignInOffered(domain))) return NO_OFFER;
    return (await ssoRequiredForDomain(domain))
      ? { sso: true, required: true }
      : { sso: true };
  } catch (error) {
    // The panel sends the code instead; no address in the log.
    logError(error as Error, { action: "ssoSignInOffer" });
    return NO_OFFER;
  }
}
