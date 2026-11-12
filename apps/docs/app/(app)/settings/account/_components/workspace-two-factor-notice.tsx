import {
  twoFactorOnFor,
  workspaceRequiresTwoFactor,
} from "@repo/auth/workspace-two-factor";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { workspaceSlugFromPath } from "@/lib/workspace-paths";
import {
  TWO_FACTOR_SECTION_ID,
  WORKSPACE_NOTICE_ID,
  workspaceReturnPath,
} from "@/lib/workspace-two-factor";
import { findWorkspaceBySlug } from "@/lib/workspaces";

/**
 * Profile & security, opened from a workspace that requires two-step
 * verification (?next=/dashboard/<slug>/…): says why, and once it's on,
 * links back. It sits just above the two-step verification section, where
 * the link lands, so it stays in view while the person turns it on. Nothing
 * for a path outside a workspace, one the person isn't a member of, or one
 * that doesn't require it.
 */
export async function WorkspaceTwoFactorNotice({
  next,
  userId,
}: {
  /** The `next` query value, untrusted */
  next: string | undefined;
  userId: string;
}) {
  const t = await getAppTranslations(
    "app.settings.account.workspaceTwoFactorNotice",
  );
  const returnPath = workspaceReturnPath(next);
  const slug = returnPath ? workspaceSlugFromPath(returnPath) : null;
  if (!(returnPath && slug)) return null;
  const workspace = await findWorkspaceBySlug(userId, slug);
  if (!workspace?.twoFactorRequired) return null;
  const [requires, on] = await Promise.all([
    workspaceRequiresTwoFactor(workspace.id, true),
    twoFactorOnFor(userId),
  ]);
  if (!requires) return null;

  return (
    <div
      className="flex scroll-mt-24 flex-col gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
      id={WORKSPACE_NOTICE_ID}
      role="status"
    >
      <p className="text-muted-foreground text-pretty">
        {on ? (
          t.rich("twoStepVerificationIsOn", {
            name: workspace.name,
            span: (chunks) => (
              <span className="text-foreground font-medium">{chunks}</span>
            ),
          })
        ) : (
          <>
            <span className="text-foreground font-medium">
              {workspace.name}
            </span>
            {t.rich("requiresTwoStepVerificationTurn", {
              link: (chunks) => (
                <Link
                  className="text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
                  href={`#${TWO_FACTOR_SECTION_ID}`}
                >
                  {chunks}
                </Link>
              ),
            })}
          </>
        )}
      </p>
      {on && (
        <Button asChild className="max-sm:h-10 sm:shrink-0" size="sm">
          <Link href={returnPath}>
            {t("backToName", { name: workspace.name })}
          </Link>
        </Button>
      )}
    </div>
  );
}
