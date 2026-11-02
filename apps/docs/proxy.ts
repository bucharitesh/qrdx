import { auth } from "@repo/auth/server";
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { legacyCodesRedirect } from "@/app/dashboard/_components/home/legacy-codes-url";
import { routeCustomDomain } from "@/app/dashboard/domains/_lib/host-routing";
import { signInPath } from "@/lib/safe-redirect";
import {
  appCsp,
  createNonce,
  cspHeaderName,
  cspOptionsFromEnv,
  NONCE_ROUTE,
  reportingEndpoints,
} from "@/lib/security/csp";
import { API_AUTH_PREFIX } from "./routes";

const { rewrite: rewriteLLM } = rewritePath("/docs/*path", "/llms.mdx/*path");

/** Signed-in pages: signed-out visitors are sent to sign in (and back). */
const APP_PATHS =
  /^\/(?:editor\/theme\/[^/]+|dashboard(?:\/.*)?|settings(?:\/.*)?|success)$/;

// Enforced in production builds; `next dev` keeps only the frame rules from
// next.config.ts unless CSP_DEV=1 (lib/security/csp.ts).
const CSP_ENABLED =
  process.env.NODE_ENV === "production" || process.env.CSP_DEV === "1";
const cspOptions = cspOptionsFromEnv();
const CSP_HEADER = cspHeaderName();
const REPORTING_ENDPOINTS = reportingEndpoints(cspOptions);

/**
 * Continues the request; on nonce routes with a fresh CSP nonce, which Next
 * reads from the request's policy and puts on every script it renders.
 */
function next(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (!(CSP_ENABLED && NONCE_ROUTE.test(pathname))) return NextResponse.next();

  const policy = appCsp(cspOptions, {
    nonce: createNonce(),
    oauth: pathname.startsWith("/oauth/"),
  });
  const requestHeaders = new Headers(request.headers);
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
  if (!APP_PATHS.test(request.nextUrl.pathname)) {
    return next(request);
  }

  // /dashboard is Home now: old links with codes-list filters (?q=, ?folder=,
  // ?import=…) go to the list at /dashboard/codes, query kept, before sign-in.
  const codesList = legacyCodesRedirect(
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  if (codesList) {
    return NextResponse.redirect(new URL(codesList, request.url), 307);
  }

  if (isMarkdownPreferred(request)) {
    const result = rewriteLLM(request.nextUrl.pathname);

    if (result) {
      return NextResponse.rewrite(new URL(result, request.nextUrl));
    }
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const pathname = request.nextUrl.pathname;

  const isApiAuth = pathname.startsWith(API_AUTH_PREFIX);

  if (isApiAuth) {
    return next(request);
  }

  if (!session) {
    // Sign in, then come back to the page they asked for.
    return NextResponse.redirect(
      new URL(signInPath(pathname + request.nextUrl.search), request.url),
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
