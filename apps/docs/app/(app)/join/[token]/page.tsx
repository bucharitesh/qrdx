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
import { inviteRolePhrase } from "@/lib/email/templates/team-invite";
import { WORKSPACE_ROLE_DESCRIPTIONS } from "@/lib/permissions";
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
  const { token } = await params;
  const valid = JOIN_TOKEN_PATTERN.test(token);
  if (!valid) {
    return (
      <JoinCard
        description="Check that you copied the whole link, or ask the workspace for a new one."
        title="This join link isn't complete"
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
        description="Wait a minute, then reload this page."
        title="Too many requests"
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
            ? "Join links aren't set up on this server yet. Ask the workspace to invite you by email instead."
            : "Something went wrong. Reload the page to try again."
        }
        title="This join link can't be used right now"
      >
        {dashboardButton}
      </JoinCard>
    );
  }

  if (!target) {
    return (
      <JoinCard
        description="It was reset or turned off. Ask the workspace for a new link, or for an invitation by email."
        title="This join link doesn't work anymore"
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
        description={`You're already a member of ${target.name}.`}
        icon={avatar}
        title="You're already in"
      >
        <Button asChild>
          <Link href={workspaceHref(target.slug)}>Open {target.name}</Link>
        </Button>
      </JoinCard>
    );
  }

  return (
    <JoinCard
      description={
        <>
          You're signed in as{" "}
          <span className="text-foreground font-medium">
            {session.user.email}
          </span>
          . You'll join as {inviteRolePhrase(target.role)}:{" "}
          {WORKSPACE_ROLE_DESCRIPTIONS[target.role].toLowerCase()}.
        </>
      }
      icon={avatar}
      title={`Join ${target.name}`}
    >
      <div className="w-full">
        <JoinButton name={target.name} token={token} />
      </div>
    </JoinCard>
  );
}
