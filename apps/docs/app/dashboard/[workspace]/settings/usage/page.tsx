import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Card as CreditCard, Warning2 } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { UsageMeters } from "@/app/settings/usage/_components/usage-meters";
import { renewalLine, upgradeAction } from "@/app/settings/usage/_lib/meters";
import { getPlanUsage } from "@/app/settings/usage/_lib/plan-usage";
import { PLAN_NAMES } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Plan & usage",
  robots: { index: false, follow: false },
};

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string | string[] }>;
}) {
  const scope = await requireDashboardScope();
  const usage = await getPlanUsage(scope);

  // Set by /settings/portal when the Polar customer portal can't be opened.
  const { billing } = await searchParams;
  const portalUnavailable = billing === "unavailable";

  const planName = PLAN_NAMES[usage.plan];
  // Only plans checkout can sell here are offered.
  const upgrade = upgradeAction(
    usage.plan,
    usage.canChangePlan,
    usage.checkoutOpen,
  );
  const subscription = usage.subscription;
  // The person's own subscription sets this workspace's plan when it is
  // their own, or when they own it and their plan is the one in force.
  const ownPlanApplies =
    subscription !== null &&
    (!usage.workspace.isTeam ||
      (usage.canChangePlan && subscription.plan === usage.plan));

  const planLine = ownPlanApplies
    ? renewalLine(subscription)
    : usage.workspace.isTeam && usage.plan !== "free"
      ? "This workspace's plan comes from its owner's subscription."
      : usage.workspace.isTeam && !usage.canChangePlan
        ? "Ask a workspace owner to upgrade."
        : "Your static codes are free and never expire.";

  return (
    <div className="space-y-6">
      <SettingsHeader
        description={`Limits and billing for ${usage.workspace.name}.`}
        title="Plan & usage"
      />

      {portalUnavailable && (
        <Alert>
          <Warning2 aria-hidden />
          <AlertTitle>Billing portal is unavailable right now</AlertTitle>
          <AlertDescription>
            Your plan is unchanged. Try again in a few minutes, or email
            support@qrdx.dev if it keeps happening.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="gap-4 sm:flex sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              {planName} plan
            </CardTitle>
            <CardDescription>{planLine}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {usage.hasBillingHistory && (
              <Button
                asChild
                variant={subscription && !upgrade ? "default" : "outline"}
              >
                {/* A route handler that redirects to Polar, so no <Link>. */}
                <a href="/settings/portal">
                  <CreditCard aria-hidden />
                  Manage billing
                </a>
              </Button>
            )}
            {upgrade && (
              <Button asChild variant={subscription ? "outline" : "default"}>
                <Link href={upgrade.href}>{upgrade.label}</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="text-muted-foreground border-t pt-4 text-sm">
          Limits only stop new things. Codes you already have keep working on
          every plan.{" "}
          <Link
            className="text-foreground underline underline-offset-4"
            href="/guarantee"
          >
            Our guarantee
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usage</CardTitle>
          <CardDescription>
            {`Counted for ${usage.workspace.name}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <UsageMeters
            context={{
              plan: usage.plan,
              canUpgrade: usage.canChangePlan,
              checkoutOpen: usage.checkoutOpen,
              caps: usage.caps,
            }}
            meters={usage.meters}
          />
        </CardContent>
      </Card>
    </div>
  );
}
