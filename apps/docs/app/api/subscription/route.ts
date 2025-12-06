import { getCurrentUserId, logError } from "@/lib/shared";
import { validateSubscriptionAndUsage } from "@/lib/subscription";
import type { SubscriptionStatus } from "@/types/subscription";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId(request);
    const { isSubscribed, requestsRemaining, requestsUsed } =
      await validateSubscriptionAndUsage(userId);

    const response: SubscriptionStatus = {
      isSubscribed,
      requestsRemaining,
      requestsUsed,
    };

    return NextResponse.json(response);
  } catch (error) {
    logError(error as Error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}


