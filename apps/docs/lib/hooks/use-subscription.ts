import { authClient } from "@repo/auth/client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import type { SubscriptionStatus } from "@/types/subscription";

async function fetchSubscriptionStatus(): Promise<SubscriptionStatus> {
  const res = await apiFetch("/api/subscription", { method: "GET" });

  if (!res.ok) {
    throw new Error("Failed to fetch subscription status");
  }

  return res.json();
}

export const SUBSCRIPTION_STATUS_QUERY_KEY = "subscriptionStatus";

export function useSubscription() {
  const { data: session } = authClient.useSession();
  const isLoggedIn = !!session?.user.id;

  const { data: subscriptionStatus, ...query } = useQuery({
    queryKey: [SUBSCRIPTION_STATUS_QUERY_KEY],
    queryFn: fetchSubscriptionStatus,
    enabled: isLoggedIn,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });

  return { subscriptionStatus, ...query };
}
