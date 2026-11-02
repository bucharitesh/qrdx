import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getHomeData } from "@/app/dashboard/_components/home/home-data";
import { HomeView } from "@/app/dashboard/_components/home/home-view";
import { legacyCodesUrl } from "@/app/dashboard/_components/home/legacy-codes-url";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Home. The codes list moved to /dashboard/codes; old /dashboard links that
 * carry its filters (or the import dialog's ?import=) still open it there.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const codesUrl = legacyCodesUrl(await searchParams);
  if (codesUrl) redirect(codesUrl);

  const scope = await requireDashboardScope("/dashboard");
  return <HomeView data={await getHomeData(scope)} />;
}
