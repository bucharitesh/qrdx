import { database as db, landingPage, qrCode } from "@repo/database";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { and, eq } from "drizzle-orm";
import { ExportSquare as ExternalLink, Edit2 as Pencil } from "iconsax-reactjs";
import Link from "next/link";
import {
  requireDashboardScope,
  scopeWhere,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { getTemplate } from "@/lib/landing/templates";
import { can } from "@/lib/permissions";
import { requestWorkspaceSlug } from "@/lib/scope";
import { SHORT_LINK_BASE } from "@/lib/short-links";
import { workspaceLink } from "@/lib/workspace-paths";

/** For codes that open a hosted page (kind 'page'): what it shows + edit link. */
export async function LandingPagePanel({ codeId }: { codeId: string }) {
  const t = await getAppTranslations("app.dashboard.codes.landingPagePanel");
  const [scope, slug] = await Promise.all([
    requireDashboardScope(),
    requestWorkspaceSlug(),
  ]);
  const [row] = await db
    .select({
      slug: qrCode.slug,
      kind: qrCode.kind,
      pageId: landingPage.id,
      title: landingPage.title,
      type: landingPage.type,
    })
    .from(qrCode)
    .leftJoin(landingPage, eq(landingPage.id, qrCode.pageId))
    .where(and(eq(qrCode.id, codeId), scopeWhere(scope)))
    .limit(1);
  if (row?.kind !== "page") return null;

  if (!row.pageId) {
    return (
      <Card className="gap-2 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-base">{t("hostedPage")}</CardTitle>
          <CardDescription>{t("thePageThisCodeOpened")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const label = getTemplate(row.type ?? "")?.label ?? "Page";
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">{t("hostedPage")}</CardTitle>
          <CardDescription className="sm:truncate">
            {t("scansOpen")} {row.title ? `"${row.title}"` : t("yourPage")} (
            {label}).{" "}
            {can(scope.role, "content.write")
              ? t("editItAnytimeThePrinted")
              : t("thePrintedCodeAlwaysOpens")}
          </CardDescription>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild size="sm" variant="outline">
            <a
              href={`${SHORT_LINK_BASE}/p/${encodeURIComponent(row.slug)}`}
              rel="noopener"
              target="_blank"
            >
              <ExternalLink />
              {t("view")}
            </a>
          </Button>
          <Button asChild size="sm">
            <Link
              href={workspaceLink(
                slug,
                `/pages/${encodeURIComponent(row.pageId)}`,
              )}
            >
              <Pencil />
              {can(scope.role, "content.write") ? t("editPage") : t("openPage")}
            </Link>
          </Button>
        </div>
      </CardHeader>
    </Card>
  );
}
