import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { use } from "react";
import bar from "@/components/header-bar.module.css";
import { QrdxLogo } from "@/components/qrdx-logo";
import { UserProfileDropdown } from "@/components/user-profile-dropdown";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { workspaceHref } from "@/lib/workspace-paths";
import { TurnOnTwoFactorLink } from "./two-factor-required-link";
import { WorkspaceAvatar } from "./workspace-avatar";

const HELP_HREF = "/docs/help/teams/require-two-step-verification";

interface WorkspaceRef {
  name: string;
  slug: string;
  logo: string | null;
}

/**
 * What a member sees instead of a workspace that requires two-step
 * verification they haven't turned on (the [workspace] layout). Nothing of
 * the workspace is loaded: no app shell, only its name and logo. Their
 * other workspaces stay a click away.
 */
export function TwoFactorRequiredScreen({
  workspace,
  other,
}: {
  workspace: WorkspaceRef;
  /** A workspace they can open, if they have one */
  other: WorkspaceRef | null;
}) {
  const t = use(getAppTranslations("app.workspaces.twoFactorRequired"));
  return (
    <div className="flex min-h-svh flex-col">
      <header className={cn(bar.bar, bar.surface, "relative z-40 border-b")}>
        <div className="flex h-12 items-center gap-2 px-3 md:px-4">
          <Link
            aria-label={t("qrdxDashboard")}
            className="flex shrink-0 items-center rounded-md p-1"
            href="/dashboard"
          >
            <QrdxLogo className="fill-secondary-foreground size-5" />
          </Link>
          <div className="ml-auto flex shrink-0 items-center">
            <UserProfileDropdown signedIn />
          </div>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-12 md:py-20">
        <Card className="w-full max-w-md">
          <CardHeader className="items-center text-center">
            <div className="mx-auto mb-2">
              <WorkspaceAvatar
                logo={workspace.logo}
                name={workspace.name}
                size="lg"
              />
            </div>
            <CardTitle className="text-xl text-balance">
              {t("nameRequiresTwoStepVerification", { name: workspace.name })}
            </CardTitle>
            <CardDescription className="text-pretty">
              {t("turnOnTwoStepVerification")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <TurnOnTwoFactorLink />
            {other && (
              <Button asChild className="w-full" variant="outline">
                <Link href={workspaceHref(other.slug)}>
                  {t("openName", { name: other.name })}
                </Link>
              </Button>
            )}
            <Link
              className="text-muted-foreground hover:text-foreground py-2 text-sm underline decoration-foreground/30 underline-offset-4 transition-colors"
              href={HELP_HREF}
            >
              {t("whyAmISeeingThis")}
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
