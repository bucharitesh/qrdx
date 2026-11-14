import { auth } from "@repo/auth/server";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { Profile2User } from "iconsax-reactjs";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isTeamMember } from "@/app/(app)/dashboard/team/_lib/queries";
import { WorkspaceAvatar } from "@/components/workspaces/workspace-avatar";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { getClientIp } from "@/lib/request-guards";
import { signInPath } from "@/lib/safe-redirect";
import { logError } from "@/lib/shared";
import {
  findJoinTarget,
  JOIN_TOKEN_PATTERN,
  JoinLinksUnavailableError,
  type JoinTarget,
  joinLinkPath,
} from "@/lib/workspace-join";
import { workspaceHref } from "@/lib/workspace-paths";
import { JoinButton } from "./join-button";

// /join/<token>: a workspace's join link (Settings → Team). Signed-out
// visitors sign in first and come back here; members are told they already
// are; everyone else joins with one click (a POST, never on page load).

const lookupLimiter = createRateLimiter({
  limiter: slidingWindow(60, "60 s"),
});

function JoinCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <div className="mx-auto mb-2">
          {icon ?? (
            <div className="grid size-12 place-items-center rounded-full border bg-muted/40">
              <Profile2User aria-hidden className="size-5 text-foreground/80" />
            </div>
          )}
        </div>
        <CardTitle className="text-xl text-balance">{title}</CardTitle>
        {description && (
          <CardDescription className="text-pretty">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      {children && (
        <CardContent className="flex flex-col items-center gap-3 text-center">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

const dashboardButton = (
  <Button asChild variant="outline">
    <Link href="/dashboard">Go to dashboard</Link>
  </Button>
);

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const t = await getAppTranslations("app.join.page");
  const { token } = await params;
  const valid = JOIN_TOKEN_PATTERN.test(token);
  if (!valid) {
    return (
      <JoinCard
        description={t("checkThatYouCopiedThe")}
        title={t("thisJoinLinkIsntComplete")}
      >
        {dashboardButton}
      </JoinCard>
    );
  }

  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) redirect(signInPath(joinLinkPath(token)));

  const { success } = await lookupLimiter.limit(
    `join:lookup:${getClientIp({ headers: requestHeaders })}`,
  );
  if (!success) {
    return (
      <JoinCard
        description={t("waitAMinuteThenReload")}
        title={t("tooManyRequests")}
      />
    );
  }

  let target: JoinTarget | null;
  try {
    target = await findJoinTarget(token);
  } catch (error) {
    if (!(error instanceof JoinLinksUnavailableError)) {
      logError(error as Error, { action: "join.page" });
    }
    return (
      <JoinCard
        description={
          error instanceof JoinLinksUnavailableError
            ? t("joinLinksArentSetUp")
            : t("somethingWentWrongReloadThe")
        }
        title={t("thisJoinLinkCantBe")}
      >
        {dashboardButton}
      </JoinCard>
    );
  }

  if (!target) {
    return (
      <JoinCard
        description={t("itWasResetOrTurned")}
        title={t("thisJoinLinkDoesntWork")}
      >
        {dashboardButton}
      </JoinCard>
    );
  }

  const avatar = (
    <WorkspaceAvatar logo={target.logo} name={target.name} size="lg" />
  );

  if (await isTeamMember(target.organizationId, session.user.id)) {
    return (
      <JoinCard
        description={t("youreAlreadyAMemberOf", { name: target.name })}
        icon={avatar}
        title={t("youreAlreadyIn")}
      >
        <Button asChild>
          <Link href={workspaceHref(target.slug)}>
            {t("openName", { name: target.name })}
          </Link>
        </Button>
      </JoinCard>
    );
  }

  return (
    <JoinCard
      description={t.rich("youreSignedInAsEmail", {
        email: session.user.email,
        role: target.role,
        span: (chunks) => (
          <span className="text-foreground font-medium">{chunks}</span>
        ),
      })}
      icon={avatar}
      title={t("joinName", { name: target.name })}
    >
      <div className="w-full">
        <JoinButton name={target.name} token={token} />
      </div>
    </JoinCard>
  );
}
