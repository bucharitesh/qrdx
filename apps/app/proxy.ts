import { withoutAuthCookies } from "@repo/auth/auth-cookies";
import { workspaceSlugFromPath } from "@repo/availability/workspace-pattern";
import {
  CONSOLE_KEY_HEADER,
  hasDotSegment,
  isConsolePath,
  lowerCasedZonePrefix,
} from "@repo/next-config/console-zone";
import {
  appCsp,
  createNonce,
  cspHeaderName,
  NONCE_ROUTE,
  reportingEndpoints,
} from "@repo/next-config/csp";
import {
  hostMatcher,
  platformHostsPattern,
} from "@repo/next-config/platform-hosts";
import {
  isSitePath,
  lowerCasedSitePrefix,
  SITE_KEY_HEADER,
  siteZoneGroups,
} from "@repo/next-config/site-zone";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { routeCustomDomain } from "@/app/(app)/dashboard/domains/_lib/host-routing";
import { env } from "@/env";
import { sessionCheckPath } from "@/lib/account/session-origin";
import {
  getSessionAllowingHold,
  isSessionHeld,
} from "@/lib/account/session-origin-server";
import { signInPath } from "@/lib/safe-redirect";
import { cspOptionsFromEnv } from "@/lib/security/csp";
import { WORKSPACE_HEADER } from "@/lib/workspace-paths";
import { API_AUTH_PREFIX } from "./routes";

/** Signed-in pages: signed-out visitors are sent to sign in (and back). */
const APP_PATHS =
  /^\/(?:editor\/theme\/[^/]+|dashboard(?:\/.*)?|settings(?:\/.*)?|success)$/;
/** Admin pages check who's signed in themselves (app/(app)/admin/_lib/guard.ts). */
const ADMIN_PATHS = /^\/admin(?:\/.*)?$/;

// Enforced in production builds; `next dev` keeps only the frame rules from
// next.config.ts unless CSP_DEV=1 (@repo/next-config/csp).
const CSP_ENABLED =
  process.env.NODE_ENV === "production" || process.env.CSP_DEV === "1";
const cspOptions = cspOptionsFromEnv();
const CSP_HEADER = cspHeaderName();
const REPORTING_ENDPOINTS = reportingEndpoints(cspOptions);

// The back-office console serves some /admin sections once CONSOLE_ORIGIN is
// set: next.config.ts proxies them there, on QRdx's own hosts only
// (@repo/next-config/console-zone). Unset, every /admin page is this app's
// own and nothing below changes.
const CONSOLE_ON = Boolean(env.CONSOLE_ORIGIN);
const onPlatformHost = hostMatcher(
  platformHostsPattern(env.NEXT_PUBLIC_APP_URL),
);

/** Whether next.config.ts sends this request on to the console. */
const forConsole = (request: NextRequest) =>
  CONSOLE_ON &&
  isConsolePath(request.nextUrl.pathname) &&
  onPlatformHost(request.headers.get("host"));

/**
 * A console page: it sets its own policy with its own nonce, so this app
 * adds none (one policy per page), and it gets the zone key, so it can tell
 * requests that came through this app. Any copy the browser sent is dropped.
 * `signedOut`: passed on without the session (Better Auth's cookies), so the
 * console sees no one signed in.
 */
function toConsole(
  request: NextRequest,
  { signedOut = false }: { signedOut?: boolean } = {},
): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(CONSOLE_KEY_HEADER);
  // Never the site's key on a console request.
  requestHeaders.delete(SITE_KEY_HEADER);
  requestHeaders.delete(WORKSPACE_HEADER);
  if (env.CONSOLE_ZONE_KEY) {
    requestHeaders.set(CONSOLE_KEY_HEADER, env.CONSOLE_ZONE_KEY);
  }
  if (signedOut) {
    const cookie = withoutAuthCookies(requestHeaders.get("cookie") ?? "");
    if (cookie) requestHeaders.set("cookie", cookie);
    else requestHeaders.delete("cookie");
    requestHeaders.delete("authorization");
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

// The marketing site serves groups of public pages (the blog first) once
// SITE_ORIGIN is set: next.config.ts proxies them there, on QRdx's own hosts
// only (@repo/next-config/site-zone). Unset, those pages are this app's own
// and nothing below changes.
const SITE_ON = Boolean(env.SITE_ORIGIN);
const SITE_GROUPS_ON = siteZoneGroups(env.SITE_ZONE_GROUPS);

/** Whether next.config.ts sends this request on to the site. */
const forSite = (request: NextRequest) =>
  SITE_ON &&
  isSitePath(request.nextUrl.pathname, SITE_GROUPS_ON) &&
  onPlatformHost(request.headers.get("host"));

/**
 * A site page or asset: public, so no session is read and no policy is
 * set here (its pages keep this app's prerendered-page rules from
 * next.config.ts, as the docs' do). It gets the site's key, so the site can
 * tell requests that came through this app; any copy the browser sent is
 * dropped, and so are the console's key header and the workspace header.
 */
function toSite(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(SITE_KEY_HEADER);
  // Never the console's key on a site request.
  requestHeaders.delete(CONSOLE_KEY_HEADER);
  requestHeaders.delete(WORKSPACE_HEADER);
  if (env.SITE_ZONE_KEY) {
    requestHeaders.set(SITE_KEY_HEADER, env.SITE_ZONE_KEY);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

/**
 * Continues the request. Pages under /dashboard/<slug> get the slug as a
 * request header (lib/scope.ts reads it, and so do the server actions they
 * post, which go to the page's own URL); any copy the browser sent is
 * dropped first. Nonce routes also get a fresh CSP nonce, which Next reads
 * from the request's policy and puts on every script it renders.
 */
function next(request: NextRequest): NextResponse {
  if (forConsole(request)) {
    return toConsole(request);
  }
  if (forSite(request)) {
    return toSite(request);
  }
  const { pathname } = request.nextUrl;
  const slug = workspaceSlugFromPath(pathname);
  const nonce = CSP_ENABLED && NONCE_ROUTE.test(pathname);
  // A site key the browser sent goes no further: only toSite() sets one.
  const forgedSiteKey = request.headers.has(SITE_KEY_HEADER);
  if (
    !(slug || nonce || forgedSiteKey || request.headers.has(WORKSPACE_HEADER))
  ) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(WORKSPACE_HEADER);
  requestHeaders.delete(SITE_KEY_HEADER);
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
  // Next's rewrites match /ADMIN/growth as /admin/growth, but this proxy's
  // matchers and the pages are case-sensitive: any other casing of /admin,
  // /console-static, or the site's prefixes (/blog, /site-static) goes to
  // the lower-case path first (it was a 404 before), so nothing reaches
  // another zone without passing through here.
  const lowerCased =
    lowerCasedZonePrefix(request.nextUrl.pathname) ??
    lowerCasedSitePrefix(request.nextUrl.pathname);
  if (lowerCased) {
    const url = request.nextUrl.clone();
    url.pathname = lowerCased;
    return NextResponse.redirect(url, 308);
  }
  // No dot segments into or out of the zones' paths (their assets come here
  // for this check alone: no session lookup).
  if (
    (isConsolePath(request.nextUrl.pathname) ||
      isSitePath(request.nextUrl.pathname)) &&
    hasDotSegment(request.nextUrl.pathname)
  ) {
    return new NextResponse("Not found", { status: 404 });
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
  // the gated ones answer CONFIRMATION_REQUIRED). The console can't tell a
  // held session (its own session lookup comes from its servers, not the
  // visitor's country), so a server action headed there is checked here and
  // sent on without the session: it sees no one signed in, as this app's
  // own actions do.
  const action = request.headers.has("next-action");
  if (
    (!action || forConsole(request)) &&
    (await isSessionHeld(session.session, requestHeaders))
  ) {
    if (action) return toConsole(request, { signedOut: true });
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
    // Nonce routes without a sign-in redirect (@repo/next-config/csp NONCE_ROUTE).
    "/admin",
    "/admin/:path*",
    // The console's prefixes in any casing (its assets too): next.config's
    // rewrites match them all, so each passes through here first.
    "/:prefix([aA][dD][mM][iI][nN])/:path*",
    "/:prefix([cC][oO][nN][sS][oO][lL][eE]-[sS][tT][aA][tT][iI][cC])/:path*",
    // The site's prefixes likewise (@repo/next-config/site-zone SITE_GROUPS
    // and its assets): one literal entry per prefix, since Next reads this
    // list without running it. tests/lib/site-zone.test.ts checks they
    // cover every prefix.
    "/:prefix([bB][lL][oO][gG])/:path*",
    "/:prefix([sS][iI][tT][eE]-[sS][tT][aA][tT][iI][cC])/:path*",
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
