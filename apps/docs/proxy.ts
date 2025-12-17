import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "./lib/auth";
import { API_AUTH_PREFIX, DEFAULT_LOGIN_REDIRECT } from "./routes";

const { rewrite: rewriteLLM } = rewritePath("/docs/*path", "/llms.mdx/*path");

export default async function proxy(request: NextRequest) {
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
    // Redirect logged-in users from /dashboard or /settings (root) to /settings/general
    if (pathname === "/dashboard" || pathname === "/settings") {
      return NextResponse.redirect(new URL("/settings/general", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/editor/theme/:themeId",
    "/dashboard",
    "/settings/:path*",
    "/success",
  ],
};
