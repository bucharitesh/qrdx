import { ArrowLeft2 } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { canManageOAuthApps } from "@/lib/oauth-apps/access";
import { getOAuthAppsOverview } from "@/lib/oauth-apps/service";
import { isStorageConfigured } from "@/lib/storage/r2";
import { SettingsHeader } from "../../components/settings-header";
import { NewOAuthApp } from "../_components/new-app";

export const metadata: Metadata = {
  title: "New OAuth app",
  robots: { index: false, follow: false },
};

export default async function NewOAuthAppPage() {
  const scope = await requireDashboardScope();
  if (!canManageOAuthApps(scope)) redirect("/settings/developers");
  const { apps, limit, isTeam, workspaceName } =
    await getOAuthAppsOverview(scope);
  if (apps.length >= limit) redirect("/settings/developers");

  return (
    <div className="space-y-6">
      <Link
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
        href="/settings/developers"
      >
        <ArrowLeft2 aria-hidden className="size-3.5" />
        Developers
      </Link>
      <SettingsHeader
        description={`The app belongs to ${isTeam ? workspaceName : "your personal workspace"}, and its consent screen says it's built by ${isTeam ? workspaceName : "you (your account name)"}. You'll see its client secret once, right after creating it.`}
        title="New OAuth app"
      />
      <NewOAuthApp canUpgrade={!isTeam} storageEnabled={isStorageConfigured} />
    </div>
  );
}
