import type { Metadata } from "next";
import { getHomeData } from "@/app/(app)/dashboard/_components/home/home-data";
import { HomeView } from "@/app/(app)/dashboard/_components/home/home-view";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";

export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

/** A workspace's Home: counts, newest codes and the setup checklist. */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const [scope, { workspace }] = await Promise.all([
    requireDashboardScope(),
    params,
  ]);
  return <HomeView data={await getHomeData(scope)} slug={workspace} />;
}
