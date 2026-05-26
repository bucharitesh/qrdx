import { type NextRequest, NextResponse } from "next/server";
import { handleError } from "@/lib/error-response";
import { getCurrentUserId } from "@/lib/shared";
import { validateSubscriptionAndUsage } from "@/lib/subscription";
import type { SubscriptionStatus } from "@/types/subscription";

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
    return handleError(error, { route: "/api/subscription" });
  }
}
