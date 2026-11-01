import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { isBillingConfigured, polar } from "@/lib/polar";
import { getCurrentUserId } from "@/lib/shared";
import { PORTAL_RETURN_PATH, resolvePortalRedirect } from "./_lib/portal";

// Opens the Polar customer portal. Every failure ends on a page of this site
// (pricing, or the usage page with a notice), never a raw error response.
export async function GET(request: NextRequest) {
  const destination = await resolvePortalRedirect({
    client: isBillingConfigured ? polar : null,
    getUserId: () => getCurrentUserId(request),
    returnUrl: new URL(PORTAL_RETURN_PATH, request.nextUrl.origin).toString(),
    onFailure: (failure) =>
      console.error("[settings/portal] Billing portal unavailable", {
        ...failure,
        server: env.NODE_ENV === "production" ? "production" : "sandbox",
      }),
  });

  return NextResponse.redirect(new URL(destination, request.url));
}
