import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { baseUrl } from "@/lib/metadata";
import { oauthError } from "@/lib/oauth";
import {
  authorizeParamEntries,
  checkAuthorizeRequest,
  hasPriorConsent,
  issueAuthorizationCode,
  readAuthorizeParams,
  redirectWith,
} from "@/lib/oauth-apps/authorize";

// GET: the URL apps send people to. Invalid requests get a JSON error and never
// a redirect (the redirect_uri can't be trusted until it has been checked).
// People who are signed out, or haven't approved this app for these scopes
// yet, continue on the consent page (/oauth/authorize), which POSTs back here.

function consentPage(req: NextRequest, entries: [string, string][]) {
  const url = new URL("/oauth/authorize", req.nextUrl.origin);
  for (const [key, value] of entries) url.searchParams.set(key, value);
  return url;
}

export async function GET(req: NextRequest) {
  const params = readAuthorizeParams((key) =>
    req.nextUrl.searchParams.get(key),
  );
  const check = await checkAuthorizeRequest(params);
  if (!check.ok) return oauthError(check.error, check.description);

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (
    userId &&
    params.prompt !== "consent" &&
    (await hasPriorConsent(check.app.id, userId, check.scopes))
  ) {
    const location = await issueAuthorizationCode(
      check.app.id,
      userId,
      params,
      check.scopes,
    );
    return Response.redirect(location, 302);
  }

  return Response.redirect(
    consentPage(req, authorizeParamEntries(params)).toString(),
    302,
  );
}

/**
 * Same-origin form posts only: the consent page's own form. Session cookies
 * are SameSite=Lax as well, so a cross-site post would arrive signed out.
 */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (origin && origin !== "null") {
    // The public origin too, for proxies that terminate TLS in front of Next.
    return origin === req.nextUrl.origin || origin === baseUrl.origin;
  }
  return req.headers.get("sec-fetch-site") === "same-origin";
}

// POST: the consent page's Allow / Deny buttons.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return oauthError(
      "invalid_request",
      "Authorization must be approved on the QRdx consent page",
      403,
    );
  }
  const form = await req.formData().catch(() => null);
  if (!form) {
    return oauthError("invalid_request", "Request body must be form-encoded");
  }
  const field = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : null;
  };

  const params = readAuthorizeParams(field);
  const check = await checkAuthorizeRequest(params);
  if (!check.ok) return oauthError(check.error, check.description);

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  if (!userId) {
    // Signed out in another tab: sign in again on the consent page.
    return Response.redirect(
      consentPage(req, authorizeParamEntries(params)).toString(),
      303,
    );
  }

  if (field("decision") !== "allow") {
    // RFC 6749 §4.1.2.1
    return Response.redirect(
      redirectWith(params, {
        error: "access_denied",
        error_description: "The user denied the request",
      }),
      303,
    );
  }

  const location = await issueAuthorizationCode(
    check.app.id,
    userId,
    params,
    check.scopes,
  );
  return Response.redirect(location, 303);
}
