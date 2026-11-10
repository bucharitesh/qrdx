import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import type { ApiKeysState } from "@/app/(app)/settings/developers/_components/api-keys-section";
import { DevelopersView } from "@/app/(app)/settings/developers/_components/developers-view";
import { requestOrigin } from "@/app/(app)/settings/developers/_lib/origin";
import { ApiKeysUnavailableError, listApiKeys } from "@/lib/api-keys/service";
import { apiBaseFor } from "@/lib/api-keys/shared";
import { baseUrl } from "@/lib/metadata";
import { getOAuthAppsOverview } from "@/lib/oauth-apps/service";
import type { ActiveScope } from "@/lib/scope";
import { loadWorkspaceSlackLinks } from "@/lib/slack-bot/admin";
import { workspaceHref } from "@/lib/workspace-paths";

export const metadata: Metadata = {
  title: "API keys & apps",
  robots: { index: false, follow: false },
};

/** The workspace's keys; "unavailable" until manual-sql/0011 is applied. */
async function loadKeys(scope: ActiveScope): Promise<ApiKeysState> {
  try {
    return { available: true, keys: await listApiKeys(scope) };
  } catch (error) {
    if (error instanceof ApiKeysUnavailableError) return { available: false };
    throw error;
  }
}

export default async function DevelopersPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ?new=1 (the quickstart's "Create an API key") opens the form, also when
  // the person had to sign in first.
  const [{ workspace }, query] = await Promise.all([params, searchParams]);
  const openCreate = query.new === "1";
  const scope = await requireDashboardScope();
  const [overview, keys, slackLinks, requestHeaders] = await Promise.all([
    getOAuthAppsOverview(scope),
    loadKeys(scope),
    // Owners and admins, where the Slack bot is set up; else no query.
    loadWorkspaceSlackLinks(scope),
    headers(),
  ]);

  return (
    <DevelopersView
      apiBase={apiBaseFor(requestOrigin(requestHeaders, baseUrl))}
      base={workspaceHref(workspace, "/settings/developers")}
      keys={keys}
      openCreate={openCreate}
      overview={overview}
      slackLinks={slackLinks}
    />
  );
}
