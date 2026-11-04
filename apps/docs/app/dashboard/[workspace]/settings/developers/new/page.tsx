import { ArrowLeft2 } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { NewOAuthApp } from "@/app/settings/developers/_components/new-app";
import { canManageOAuthApps } from "@/lib/oauth-apps/access";
import { getOAuthAppsOverview } from "@/lib/oauth-apps/service";
import { isStorageConfigured } from "@/lib/storage/r2";
import { workspaceHref } from "@/lib/workspace-paths";

export const metadata: Metadata = {
  title: "New OAuth app",
  robots: { index: false, follow: false },
};

export default async function NewOAuthAppPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const [scope, { workspace }] = await Promise.all([
    requireDashboardScope(),
    params,
  ]);
  const base = workspaceHref(workspace, "/settings/developers");
  if (!canManageOAuthApps(scope)) redirect(base);
  const { apps, limit, isTeam, workspaceName } =
    await getOAuthAppsOverview(scope);
  if (apps.length >= limit) redirect(base);

  return (
    <div className="space-y-6">
      <Link
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
        href={base}
      >
        <ArrowLeft2 aria-hidden className="size-3.5" />
        API keys & apps
      </Link>
      <SettingsHeader
        description={`The app belongs to ${isTeam ? workspaceName : "your own workspace"}, and its consent screen says it's built by ${isTeam ? workspaceName : "you (your account name)"}. You'll see its client secret once, right after creating it.`}
        title="New OAuth app"
      />
      <NewOAuthApp storageEnabled={isStorageConfigured} />
    </div>
  );
}
