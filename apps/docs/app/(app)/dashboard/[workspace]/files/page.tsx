import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import { CpuSetting as ServerCog } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/app/(app)/dashboard/_components/page-header";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import {
  type FileRow,
  FilesManager,
} from "@/app/(app)/dashboard/files/_components/files-manager";
import {
  getFileUsage,
  getStorageOverview,
  listFiles,
} from "@/lib/files/service";
import { isOwnWorkspaceScope } from "@/lib/own-workspace";
import { can } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Files",
  robots: { index: false, follow: false },
};

const DOCS_HREF = "/docs/files";

export default async function FilesPage() {
  const scope = await requireDashboardScope();
  const overview = await getStorageOverview(scope);

  const header = (
    <PageHeader
      description="PDFs, images, audio and video for your hosted pages. Every file keeps its link, even when you replace it."
      title="Files"
    >
      <Badge variant={overview.plan !== "free" ? "default" : "secondary"}>
        {overview.planName}
      </Badge>
    </PageHeader>
  );

  if (!overview.configured) {
    return (
      <div className="space-y-6">
        {header}
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ServerCog />
            </EmptyMedia>
            <EmptyTitle>File uploads aren't available yet</EmptyTitle>
            <EmptyDescription>
              Until they are, your pages can still link to files hosted
              elsewhere. Self-hosting? Uploads need a Cloudflare R2 bucket.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href={DOCS_HREF}>Set up file storage</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  const files = await listFiles(scope);
  const usage = await getFileUsage(
    scope,
    files.map((file) => file.id),
  );
  const rows: FileRow[] = files.map((file) => ({
    ...file,
    pages: usage.get(file.id)?.pages ?? [],
    codeCount: usage.get(file.id)?.codeCount ?? 0,
  }));

  return (
    <div className="space-y-6">
      {header}
      <FilesManager
        canManageAll={can(scope.role, "content.manageAll")}
        canUpgrade={isOwnWorkspaceScope(scope) && overview.plan !== "business"}
        files={rows}
        isTeam={!isOwnWorkspaceScope(scope)}
        overview={overview}
      />
    </div>
  );
}
