import { CustomerPortal } from "@polar-sh/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { BILLING_NOT_CONFIGURED_MESSAGE, polar } from "@/lib/polar";
import { getCurrentUserId } from "@/lib/shared";

const handlePortal = env.POLAR_ACCESS_TOKEN
  ? CustomerPortal({
      accessToken: env.POLAR_ACCESS_TOKEN,
      server: process.env.NODE_ENV === "production" ? "production" : "sandbox",
      getCustomerId: async (req) => {
        const userId = await getCurrentUserId(req);
        const customer = await polar.customers.getExternal({
          externalId: userId,
        });
        return customer.id;
      },
    })
  : null;

export async function GET(request: NextRequest) {
  if (!handlePortal) {
    return NextResponse.json(
      { error: BILLING_NOT_CONFIGURED_MESSAGE },
      { status: 503 },
    );
  }

  return handlePortal(request);
}
