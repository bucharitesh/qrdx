import type { Metadata } from "next";
import { BarcodesListView } from "@/app/(app)/dashboard/barcodes/_components/barcodes-list-view";

export const metadata: Metadata = {
  title: "Barcodes",
  robots: { index: false, follow: false },
};

export default async function BarcodesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ workspace }, query] = await Promise.all([params, searchParams]);
  return <BarcodesListView searchParams={query} slug={workspace} />;
}
