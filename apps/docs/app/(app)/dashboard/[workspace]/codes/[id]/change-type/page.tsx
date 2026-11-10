import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { displayUrl } from "@/app/(app)/dashboard/codes/_components/format";
import { carryOverContent } from "@/app/(app)/dashboard/codes/_lib/code-kind-shared";
import {
  getCode,
  requireDashboardScope,
} from "@/app/(app)/dashboard/codes/_lib/qr-codes";
import { getScopedPageContent } from "@/app/(app)/dashboard/pages/_lib/landing-pages";
import { getSavedThemePalettes } from "@/app/(app)/dashboard/pages/_lib/saved-themes";
import { PageEditor } from "@/components/landing/editor/page-editor";
import { HttpError } from "@/lib/error-response";
import { buildTemplateContent, getTemplate } from "@/lib/landing/templates";
import { can } from "@/lib/permissions";
import { getPlanForScope, getPlanLimits } from "@/lib/plans";
import { isStorageConfigured } from "@/lib/storage/r2";
import { workspaceHref } from "@/lib/workspace-paths";

export const metadata: Metadata = {
  title: "Change type",
  robots: { index: false, follow: false },
};

/**
 * The page editor for a code changing type (the code page's "Change type"
 * dialog sends people here with ?type=&variant=): the chosen template, with
 * the blocks, settings and logo of the page the code opens now carried
 * over. Nothing is saved until Publish, which makes the page and points the
 * code at it (actions/code-kind publishCodeSwitchPage).
 */
export default async function ChangeCodeTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scope = await requireDashboardScope();
  const [{ workspace, id }, query] = await Promise.all([params, searchParams]);
  const template = getTemplate(
    typeof query.type === "string" ? query.type : "",
  );
  if (!template) notFound();
  const variantId =
    typeof query.variant === "string" &&
    template.variants.some((variant) => variant.id === query.variant)
      ? query.variant
      : null;

  const code = await getCode(scope, id).catch((error: unknown) => {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  });
  const codeHref = workspaceHref(workspace, `/codes/${encodeURIComponent(id)}`);
  if (!can(scope.role, "content.write")) redirect(codeHref);

  const [plan, savedThemes, current] = await Promise.all([
    getPlanForScope(scope),
    getSavedThemePalettes(scope),
    code.kind === "page" && code.pageId
      ? getScopedPageContent(scope, code.pageId)
      : null,
  ]);
  const fresh = buildTemplateContent(template.type, variantId);
  const limits = getPlanLimits(plan);

  return (
    <PageEditor
      branding={{
        badge: limits.landingPageBadge,
        whiteLabel: limits.whiteLabel,
      }}
      canUseCustomCss={limits.customCss}
      code={null}
      initialContent={
        current ? carryOverContent(current.content, fresh) : fresh
      }
      page={{
        // Not saved yet: the id only keys this browser's unpublished draft.
        id: `switch-${code.id}-${template.type}`,
        title: current?.title ?? code.title,
        version: 0,
        typeLabel: template.label,
      }}
      savedThemes={savedThemes}
      storageEnabled={isStorageConfigured}
      switchCode={{
        codeId: code.id,
        codeLabel: code.title || displayUrl(code.shortLink),
        opensNow:
          code.kind !== "page"
            ? displayUrl(code.destinationUrl)
            : current
              ? `the current page${current.title ? ` (${current.title})` : ""}`
              : 'a "not found" page',
        type: template.type,
        variantId,
      }}
    />
  );
}
