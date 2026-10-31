import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";
import { canManageOAuthApps } from "@/lib/oauth-apps/access";
import { getOAuthApp } from "@/lib/oauth-apps/service";
import { isStorageConfigured } from "@/lib/storage/r2";
import { OAuthAppDetailView } from "../_components/app-detail-view";

export const metadata: Metadata = {
  title: "OAuth app",
  robots: { index: false, follow: false },
};

export default async function OAuthAppPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scope = await requireDashboardScope();
  const app = await getOAuthApp(scope, id).catch((error) => {
    // Apps of other workspaces are reported as missing too.
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  });

  return (
    <OAuthAppDetailView
      app={app}
      canManage={canManageOAuthApps(scope)}
      origin={baseUrl.origin}
      storageEnabled={isStorageConfigured}
    />
  );
}
