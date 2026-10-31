import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireDashboardScope } from "@/app/dashboard/codes/_lib/qr-codes";
import { PageEditor } from "@/components/landing/editor/page-editor";
import { HttpError } from "@/lib/error-response";
import { getTemplate } from "@/lib/landing/templates";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { isStorageConfigured } from "@/lib/storage/r2";
import { getPageForEdit } from "../_lib/landing-pages";
import { getSavedThemePalettes } from "../_lib/saved-themes";

export const metadata: Metadata = {
  title: "Edit page",
  robots: { index: false, follow: false },
};

export default async function EditLandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const scope = await requireDashboardScope();
  const { id } = await params;
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
          ? { id: code.id, pageUrl: code.pageUrl, shortLink: code.shortLink }
          : null
      }
      initialContent={page.content}
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
