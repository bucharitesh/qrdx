"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Card as CreditCard,
  ExportSquare as ExternalLink,
} from "iconsax-reactjs";
import { useSubscription } from "@/lib/hooks/use-subscription";

/** Opens the Polar customer portal; only subscribers have one. */
export function ManageBillingLink() {
  const { subscriptionStatus } = useSubscription();

  if (!subscriptionStatus?.isSubscribed) return null;

  return (
    <Button asChild variant="outline">
      {/* A route handler that redirects off-site, so no client-side <Link>. */}
      <a href="/settings/portal">
        <CreditCard aria-hidden />
        Manage subscription
        <ExternalLink aria-hidden className="text-muted-foreground" />
      </a>
    </Button>
  );
}
