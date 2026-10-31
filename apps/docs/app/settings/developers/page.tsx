import type { Metadata } from "next";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { getOAuthAppsOverview } from "@/lib/oauth-apps/service";
import { DevelopersView } from "./_components/developers-view";

export const metadata: Metadata = {
  title: "Developers",
  robots: { index: false, follow: false },
};

export default async function DevelopersPage() {
  const scope = await requireDashboardScope();
  return <DevelopersView overview={await getOAuthAppsOverview(scope)} />;
}
