import {
  CodesView,
  codesMetadata,
} from "@/app/dashboard/codes/_components/codes-view";
import { workspaceHref } from "@/lib/workspace-paths";

export const metadata = codesMetadata;

type SearchParams = Record<string, string | string[] | undefined>;

// The codes list (the workspace's root is Home); detail pages are
// /dashboard/<workspace>/codes/<id>.
export default async function CodesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { workspace } = await params;
  return (
    <CodesView
      basePath={workspaceHref(workspace, "/codes")}
      searchParams={searchParams}
    />
  );
}
