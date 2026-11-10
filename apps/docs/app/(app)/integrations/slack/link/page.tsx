import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { Link2 } from "iconsax-reactjs";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ConfirmIdentityProvider } from "@/components/confirm-identity/provider";
import { currentSession } from "@/lib/account/confirmation-server";
import { can } from "@/lib/permissions";
import { getClientIp } from "@/lib/request-guards";
import { signInPath } from "@/lib/safe-redirect";
import {
  isSlackBotEnabled,
  LINK_PAGE_PATH,
  linkTokenSecret,
  SETTINGS_PATH,
} from "@/lib/slack-bot/config";
import {
  isSlackSignInError,
  SLACK_SIGN_IN_ERRORS,
} from "@/lib/slack-bot/link-proof";
import { hasLinkProof, signInHref } from "@/lib/slack-bot/link-sign-in";
import { verifyLinkToken } from "@/lib/slack-bot/link-token";
import {
  describeUserLink,
  findInstallation,
  SlackBotStoreUnavailableError,
} from "@/lib/slack-bot/store";
import { listWorkspaces, shutsOut } from "@/lib/workspaces";
import { SlackLinkForm } from "./link-form";

// /integrations/slack/link?t=<token>: where /qr link's button leads. Signed
// out, sign in first and come back. Shows who in Slack is asking, asks the
// person to sign in with Slack as that Slack account (lib/slack-bot/
// link-sign-in.ts; ?slack= says why a sign-in didn't count), says what an
// existing link would be replaced, and lets them pick one of their
// workspaces where they may create codes. The link is made only by Confirm
// (a server action that checks everything again, the Slack sign-in
// included), never on page load.

const lookupLimiter = createRateLimiter({
  prefix: "qrdx:slack-bot:link-page",
  limiter: slidingWindow(60, "60 s"),
});

function LinkCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full border bg-muted/40">
          <Link2 aria-hidden className="size-5 text-foreground/80" />
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

const settingsButton = (
  <Button asChild variant="outline">
    <Link href={SETTINGS_PATH}>Slack settings</Link>
  </Button>
);

const EXPIRED = (
  <LinkCard
    description="Links from /qr link work for 10 minutes. Run /qr link in Slack again for a new one."
    title="This link has expired"
  />
);

const STARTED_ELSEWHERE = (
  <LinkCard
    description="That Slack sign-in didn't start on this page, or it took too long. Run /qr link in Slack again for a new link."
    title="Nothing was linked"
  />
);

export default async function SlackLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isSlackBotEnabled()) notFound();
  const { t, slack } = await searchParams;
  const token = typeof t === "string" ? t.slice(0, 2048) : "";
  const signInError = isSlackSignInError(slack) ? slack : null;
  if (!token) return signInError ? STARTED_ELSEWHERE : EXPIRED;

  const requestHeaders = await headers();
  const session = await currentSession();
  if (!session) {
    redirect(signInPath(`${LINK_PAGE_PATH}?t=${encodeURIComponent(token)}`));
  }

  const { success } = await lookupLimiter.limit(
    getClientIp({ headers: requestHeaders }),
  );
  if (!success) {
    return (
      <LinkCard
        description="Wait a minute, then reload this page."
        title="Too many requests"
      />
    );
  }

  const secret = linkTokenSecret();
  const claims = secret ? verifyLinkToken(token, secret) : null;
  if (!(secret && claims)) return EXPIRED;

  const userId = session.userId;
  let teamName: string;
  let existing: Awaited<ReturnType<typeof describeUserLink>>;
  try {
    const installation = await findInstallation({ teamId: claims.teamId });
    if (!installation) {
      return (
        <LinkCard
          description="The QRdx bot was removed from that Slack workspace. Add it again in Settings → Integrations → Slack, then run /qr link."
          title="The bot isn't in that Slack workspace"
        >
          {settingsButton}
        </LinkCard>
      );
    }
    teamName = installation.teamName ?? claims.teamName;
    existing = await describeUserLink(claims.teamId, claims.slackUserId);
  } catch (error) {
    if (!(error instanceof SlackBotStoreUnavailableError)) throw error;
    return (
      <LinkCard
        description="Linking Slack accounts isn't available yet. Try again later."
        title="Not available yet"
      />
    );
  }

  // Workspaces where this person may create codes and isn't shut out.
  const workspaces = [];
  for (const workspace of await listWorkspaces(userId)) {
    if (!can(workspace.role, "content.write")) continue;
    if (await shutsOut(userId, workspace)) continue;
    workspaces.push({ id: workspace.id, name: workspace.name });
  }
  if (workspaces.length === 0) {
    return (
      <LinkCard
        description="Tracked codes need a workspace where your role can create codes. Ask a workspace admin for access, or use your own workspace."
        title="No workspace can take these codes"
      >
        {settingsButton}
      </LinkCard>
    );
  }
  const mine = existing?.userId === userId ? existing : null;
  const defaultWorkspaceId =
    workspaces.find((w) => w.id === mine?.organizationId)?.id ??
    workspaces[0]?.id ??
    "";
  const verified = await hasLinkProof(
    { userId, sessionId: session.sessionId, token, claims },
    secret,
  );

  const slackName = claims.userName || claims.slackUserId;
  return (
    <ConfirmIdentityProvider>
      <LinkCard
        description={
          <>
            Let Slack user{" "}
            <span className="font-medium text-foreground">{slackName}</span> in{" "}
            <span className="font-medium text-foreground">{teamName}</span>{" "}
            create tracked codes as you, signed in as{" "}
            <span className="font-medium text-foreground">{session.email}</span>
            ? Their <code>/qr track</code> codes go to the workspace you pick,
            under your role and plan.
          </>
        }
        title="Link your Slack account"
      >
        <SlackLinkForm
          cancelHref={SETTINGS_PATH}
          defaultWorkspaceId={defaultWorkspaceId}
          replacing={
            existing
              ? {
                  workspaceName: existing.workspaceName ?? "a QRdx workspace",
                  otherAccount: existing.userId !== userId,
                }
              : null
          }
          signIn={{
            href: signInHref(token),
            slackName,
            verified,
            error:
              verified || !signInError
                ? null
                : SLACK_SIGN_IN_ERRORS[signInError],
          }}
          token={token}
          workspaces={workspaces}
        />
      </LinkCard>
    </ConfirmIdentityProvider>
  );
}
