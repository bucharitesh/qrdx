import { auth } from "@repo/auth/server";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Warning2 } from "iconsax-reactjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { UsageStats } from "@/app/settings/components/usage-stats";
import { ManageBillingLink } from "@/components/app-shell/manage-billing-link";
import { SettingsHeader } from "../components/settings-header";

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string | string[] }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/playground");

  // Set by /settings/portal when the Polar customer portal can't be opened.
  const { billing } = await searchParams;
  const portalUnavailable = billing === "unavailable";

  return (
    <div>
      <SettingsHeader
        title="Usage & billing"
        description="Your AI request usage and subscription"
      >
        <ManageBillingLink />
      </SettingsHeader>
      {portalUnavailable && (
        <Alert className="mb-6">
          <Warning2 aria-hidden />
          <AlertTitle>Billing portal is unavailable right now</AlertTitle>
          <AlertDescription>
            Your plan is unchanged. Try again in a few minutes, or email
            support@qrdx.dev if it keeps happening.
          </AlertDescription>
        </Alert>
      )}
      <UsageStats />
    </div>
  );
}
