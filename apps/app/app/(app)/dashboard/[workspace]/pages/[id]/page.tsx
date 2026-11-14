import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  BUSINESS_CARD_PAGE_TYPE,
  nfcPageHref,
} from "@/app/(app)/dashboard/codes/_lib/nfc";
import { requireDashboardScope } from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getPageForEdit } from "@/app/(app)/dashboard/pages/_lib/landing-pages";
import { getSavedThemePalettes } from "@/app/(app)/dashboard/pages/_lib/saved-themes";
import { PageEditor } from "@/components/landing/editor/page-editor";
import { HttpError } from "@/lib/error-response";
import { getTemplate } from "@/lib/landing/templates";
import { can } from "@/lib/permissions";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { isStorageConfigured } from "@/lib/storage/r2";

export const metadata: Metadata = {
  title: "Edit page",
  robots: { index: false, follow: false },
};

export default async function EditLandingPage({
  params,
}: {
  params: Promise<{ id: string; workspace: string }>;
}) {
  const scope = await requireDashboardScope();
  const { id, workspace } = await params;
  const [page, plan, savedThemes] = await Promise.all([
    getPageForEdit(scope, id).catch((error: unknown) => {
      if (error instanceof HttpError && error.status === 404) notFound();
      throw error;
    }),
    getPlanForScope(scope),
    getSavedThemePalettes(scope),
  ]);
  const limits = getPlanLimits(plan);
  const code =
    page.codes.find((item) => item.status === "active" && !item.inTrash) ??
    page.codes.find((item) => !item.inTrash) ??
    null;

  return (
    <PageEditor
      branding={{
        badge: limits.landingPageBadge,
        whiteLabel: limits.whiteLabel,
      }}
      canUseCustomCss={limits.customCss}
      code={
        code
          ? {
              id: code.id,
              pageUrl: code.pageUrl,
              shortLink: code.shortLink,
              // NFC (feat/nfc): vCard Plus pages go on NFC business cards.
              nfcHref:
                page.type === BUSINESS_CARD_PAGE_TYPE
                  ? nfcPageHref(workspace, code.id)
                  : null,
              customDomain: code.customDomain,
            }
          : null
      }
      initialContent={page.content}
      // Viewers and billing members see the page, not the editor.
      readOnly={!can(scope.role, "content.write")}
      page={{
        id: page.id,
        title: page.title,
        version: page.version,
        typeLabel: getTemplate(page.type)?.label ?? "Page",
      }}
      savedThemes={savedThemes}
      storageEnabled={isStorageConfigured}
    />
  );
}
