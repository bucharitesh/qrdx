import { auth } from "@repo/auth/server";
import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { routeCustomDomain } from "@/app/dashboard/domains/_lib/host-routing";
import { API_AUTH_PREFIX, DEFAULT_LOGIN_REDIRECT } from "./routes";

const { rewrite: rewriteLLM } = rewritePath("/docs/*path", "/llms.mdx/*path");

/** The string entries of `config.matcher`: the only paths the logic below handles. */
const APP_PATHS =
  /^\/(?:editor\/theme\/[^/]+|dashboard(?:\/.*)?|settings(?:\/.*)?|success)$/;

export default async function proxy(request: NextRequest) {
  // Customers' domains only serve their short links (null on QRdx's own hosts).
  const customDomainResponse = await routeCustomDomain(request);
  if (customDomainResponse) {
    return customDomainResponse;
  }
  // The catch-all matcher also reaches here on hosts that aren't custom domains.
  if (!APP_PATHS.test(request.nextUrl.pathname)) {
    return NextResponse.next();
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
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, request.url));
  }

  if (session) {
    // Redirect logged-in users from /settings (root) to /settings/general
    if (pathname === "/settings") {
      return NextResponse.redirect(new URL("/settings/general", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/editor/theme/:themeId",
    "/dashboard",
    "/dashboard/:path*",
    "/settings/:path*",
    "/success",
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
