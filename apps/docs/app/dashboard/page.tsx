import {
  CodesView,
  codesMetadata,
} from "@/app/dashboard/codes/_components/codes-view";

export const metadata = codesMetadata;

type SearchParams = Record<string, string | string[] | undefined>;

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <CodesView basePath="/dashboard" searchParams={searchParams} />;
}
