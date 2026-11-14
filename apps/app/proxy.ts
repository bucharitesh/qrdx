import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { routeCustomDomain } from "@/app/(app)/dashboard/domains/_lib/host-routing";
import { sessionCheckPath } from "@/lib/account/session-origin";
import {
  getSessionAllowingHold,
  isSessionHeld,
} from "@/lib/account/session-origin-server";
import { signInPath } from "@/lib/safe-redirect";
import {
  appCsp,
  createNonce,
  cspHeaderName,
  cspOptionsFromEnv,
  NONCE_ROUTE,
  reportingEndpoints,
} from "@/lib/security/csp";
import { WORKSPACE_HEADER, workspaceSlugFromPath } from "@/lib/workspace-paths";
import { API_AUTH_PREFIX } from "./routes";

/** Signed-in pages: signed-out visitors are sent to sign in (and back). */
const APP_PATHS =
  /^\/(?:editor\/theme\/[^/]+|dashboard(?:\/.*)?|settings(?:\/.*)?|success)$/;
/** Admin pages check who's signed in themselves (app/(app)/admin/_lib/guard.ts). */
const ADMIN_PATHS = /^\/admin(?:\/.*)?$/;

// Enforced in production builds; `next dev` keeps only the frame rules from
// next.config.ts unless CSP_DEV=1 (lib/security/csp.ts).
const CSP_ENABLED =
  process.env.NODE_ENV === "production" || process.env.CSP_DEV === "1";
const cspOptions = cspOptionsFromEnv();
const CSP_HEADER = cspHeaderName();
const REPORTING_ENDPOINTS = reportingEndpoints(cspOptions);

/**
 * Continues the request. Pages under /dashboard/<slug> get the slug as a
 * request header (lib/scope.ts reads it, and so do the server actions they
 * post, which go to the page's own URL); any copy the browser sent is
 * dropped first. Nonce routes also get a fresh CSP nonce, which Next reads
 * from the request's policy and puts on every script it renders.
 */
function next(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const slug = workspaceSlugFromPath(pathname);
  const nonce = CSP_ENABLED && NONCE_ROUTE.test(pathname);
  if (!(slug || nonce || request.headers.has(WORKSPACE_HEADER))) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(WORKSPACE_HEADER);
  if (slug) requestHeaders.set(WORKSPACE_HEADER, slug);
  if (!nonce) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const policy = appCsp(cspOptions, {
    nonce: createNonce(),
    oauth: pathname.startsWith("/oauth/"),
  });
  requestHeaders.set(CSP_HEADER.toLowerCase(), policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CSP_HEADER, policy);
  if (REPORTING_ENDPOINTS) {
    response.headers.set("Reporting-Endpoints", REPORTING_ENDPOINTS);
  }
  return response;
}

export default async function proxy(request: NextRequest) {
  // Customers' domains only serve their short links (null on QRdx's own hosts).
  const customDomainResponse = await routeCustomDomain(request);
  if (customDomainResponse) {
    return customDomainResponse;
  }
  // The catch-all matcher also reaches here on hosts that aren't custom domains.
  const appPath = APP_PATHS.test(request.nextUrl.pathname);
  if (!(appPath || ADMIN_PATHS.test(request.nextUrl.pathname))) {
    return next(request);
  }

  // Held or not (lib/account/session-origin.ts): a held session isn't
  // signed out, it's asked to confirm it's you.
  const requestHeaders = await headers();
  const session = await getSessionAllowingHold(requestHeaders);

  const pathname = request.nextUrl.pathname;

  const isApiAuth = pathname.startsWith(API_AUTH_PREFIX);

  if (isApiAuth) {
    return next(request);
  }

  if (!session) {
    if (!appPath) return next(request);
    // Sign in, then come back to the page they asked for.
    return NextResponse.redirect(
      new URL(signInPath(pathname + request.nextUrl.search), request.url),
    );
  }

  // Used from a different country and browser than where it signed in: the
  // check page asks "Confirm it's you" before any page here renders. Server
  // actions posted here go on: their own session reads see no session (and
  // the gated ones answer CONFIRMATION_REQUIRED).
  if (
    !request.headers.has("next-action") &&
    (await isSessionHeld(session.session, requestHeaders))
  ) {
    return NextResponse.redirect(
      new URL(sessionCheckPath(pathname + request.nextUrl.search), request.url),
    );
  }

  if (session) {
    // Redirect logged-in users from /settings (root) to /settings/general
    if (pathname === "/settings") {
      return NextResponse.redirect(new URL("/settings/general", request.url));
    }
  }

  return next(request);
}

export const config = {
  matcher: [
    "/editor/theme/:themeId",
    "/dashboard",
    "/dashboard/:path*",
    "/settings/:path*",
    "/success",
    // Nonce routes without a sign-in redirect (lib/security/csp.ts NONCE_ROUTE).
    "/admin",
    "/admin/:path*",
    "/oauth/:path*",
    "/invite/:path*",
    "/join/:path*",
    // Custom domains: every path except build assets, on hosts that aren't
    // QRdx's own (self-hosted hosts are told apart at runtime instead).
    {
      source: "/((?!_next/).*)",
      missing: [
        {
          type: "host",
          value:
            "(?:(?:.+\\.)?(?:qrdx\\.dev|vercel\\.app)|localhost|127\\.0\\.0\\.1)",
        },
      ],
    },
  ],
};
