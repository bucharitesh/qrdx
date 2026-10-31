import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { UsageStats } from "@/app/settings/components/usage-stats";
import { ManageBillingLink } from "@/components/app-shell/manage-billing-link";
import { SettingsHeader } from "../components/settings-header";

export default async function UsagePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/playground");

  return (
    <div>
      <SettingsHeader
        title="Usage & billing"
        description="Your AI request usage and subscription"
      >
        <ManageBillingLink />
      </SettingsHeader>
      <UsageStats />
    </div>
  );
}
