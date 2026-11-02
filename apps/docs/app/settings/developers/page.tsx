import type { Metadata } from "next";
import { headers } from "next/headers";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { ApiKeysUnavailableError, listApiKeys } from "@/lib/api-keys/service";
import { apiBaseFor } from "@/lib/api-keys/shared";
import { baseUrl } from "@/lib/metadata";
import { getOAuthAppsOverview } from "@/lib/oauth-apps/service";
import type { ActiveScope } from "@/lib/scope";
import type { ApiKeysState } from "./_components/api-keys-section";
import { DevelopersView } from "./_components/developers-view";
import { requestOrigin } from "./_lib/origin";

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
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ?new=1 (the quickstart's "Create an API key") opens the form, also when
  // the person had to sign in first.
  const openCreate = (await searchParams).new === "1";
  const scope = await requireDashboardScope(
    openCreate ? "/settings/developers?new=1" : "/settings/developers",
  );
  const [overview, keys, requestHeaders] = await Promise.all([
    getOAuthAppsOverview(scope),
    loadKeys(scope),
    headers(),
  ]);

  return (
    <DevelopersView
      apiBase={apiBaseFor(requestOrigin(requestHeaders, baseUrl))}
      keys={keys}
      openCreate={openCreate}
      overview={overview}
    />
  );
}
