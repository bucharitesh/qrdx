import { getSessionCookie } from "better-auth/cookies";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function authMiddleware(
  middlewareFn?: (
    _auth: { req: NextRequest; authorized: boolean },
    request: NextRequest,
    event: NextFetchEvent
  ) => Promise<Response> | Response
) {
  return async function middleware(
    request: NextRequest,
    event: NextFetchEvent
  ) {
    const sessionCookie = getSessionCookie(request);
    const authorized = Boolean(sessionCookie);
    if (middlewareFn) {
      const response = await middlewareFn(
        { req: request, authorized },
        request,
        event
      );
      if (response?.headers.get("Location")) {
        return response;
      }
    }
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }
    return NextResponse.next();
  };
}
