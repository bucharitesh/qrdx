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
import { FilesManager } from "@/app/(app)/dashboard/files/_components/files-manager";
import { loadFileRows } from "@/app/(app)/dashboard/files/_lib/rows";
import { countFilesByKind, getStorageOverview } from "@/lib/files/service";
import { FILE_KINDS, type FileKind } from "@/lib/files/types";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { isOwnWorkspaceScope } from "@/lib/own-workspace";
import { can } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Files",
  robots: { index: false, follow: false },
};

const DOCS_HREF = "/docs/files";

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  const t = await getAppTranslations("app.dashboard.files.page");
  const scope = await requireDashboardScope();
  const overview = await getStorageOverview(scope);

  const header = (
    <PageHeader description={t("pdfsImagesAudioAndVideo")} title={t("files")}>
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
            <EmptyTitle>{t("fileUploadsArentAvailableYet")}</EmptyTitle>
            <EmptyDescription>{t("untilTheyAreYourPages")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href={DOCS_HREF}>{t("setUpFileStorage")}</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  // ?kind= narrows the list to one kind; a kind with no files shows them all.
  const { kind: rawKind } = await searchParams;
  const counts = await countFilesByKind(scope);
  const requested = FILE_KINDS.find((item) => item === rawKind);
  const kind: FileKind | null =
    requested && counts[requested] > 0 ? requested : null;
  const first = await loadFileRows(scope, { kind: kind ?? undefined });

  return (
    <div className="space-y-6">
      {header}
      <FilesManager
        canManageAll={can(scope.role, "content.manageAll")}
        canUpgrade={isOwnWorkspaceScope(scope) && overview.plan !== "business"}
        counts={counts}
        first={first}
        isTeam={!isOwnWorkspaceScope(scope)}
        kind={kind}
        overview={overview}
      />
    </div>
  );
}
