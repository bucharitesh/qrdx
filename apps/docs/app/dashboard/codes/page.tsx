import {
  CodesView,
  codesMetadata,
} from "@/app/dashboard/codes/_components/codes-view";

export const metadata = codesMetadata;

type SearchParams = Record<string, string | string[] | undefined>;

// /dashboard renders the same view; detail pages are /dashboard/codes/<id>.
export default function CodesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <CodesView basePath="/dashboard/codes" searchParams={searchParams} />;
}
