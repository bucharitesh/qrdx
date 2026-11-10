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
import { Link2 } from "iconsax-reactjs";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ConfirmIdentityProvider } from "@/components/confirm-identity/provider";
import { can } from "@/lib/permissions";
import { getClientIp } from "@/lib/request-guards";
import { signInPath } from "@/lib/safe-redirect";
import {
  isSlackBotEnabled,
  LINK_PAGE_PATH,
  linkTokenSecret,
  SETTINGS_PATH,
} from "@/lib/slack-bot/config";
import { verifyLinkToken } from "@/lib/slack-bot/link-token";
import {
  findInstallation,
  findUserLink,
  SlackBotStoreUnavailableError,
} from "@/lib/slack-bot/store";
import { listWorkspaces, shutsOut } from "@/lib/workspaces";
import { SlackLinkForm } from "./link-form";

// /integrations/slack/link?t=<token>: where /qr link's button leads. Signed
// out, sign in first and come back. Shows who in Slack is asking and lets
// the person pick one of their workspaces where they may create codes; the
// link is made only by Confirm (a server action that checks everything
// again), never on page load.

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

export default async function SlackLinkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isSlackBotEnabled()) notFound();
  const { t } = await searchParams;
  const token = typeof t === "string" ? t.slice(0, 2048) : "";
  if (!token) return EXPIRED;

  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
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
  if (!claims) return EXPIRED;

  const userId = session.user.id;
  let teamName: string;
  let linkedHere: { organizationId: string } | null;
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
    const existing = await findUserLink(claims.teamId, claims.slackUserId);
    linkedHere = existing?.userId === userId ? existing : null;
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
  const defaultWorkspaceId =
    workspaces.find((w) => w.id === linkedHere?.organizationId)?.id ??
    workspaces[0]?.id ??
    "";

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
            <span className="font-medium text-foreground">
              {session.user.email}
            </span>
            ? Their <code>/qr track</code> codes go to the workspace you pick,
            under your role and plan.
          </>
        }
        title="Link your Slack account"
      >
        <SlackLinkForm
          cancelHref={SETTINGS_PATH}
          defaultWorkspaceId={defaultWorkspaceId}
          token={token}
          workspaces={workspaces}
        />
        {linkedHere && (
          <p className="text-xs text-muted-foreground text-pretty">
            This Slack account is linked to you already; confirming replaces the
            workspace.
          </p>
        )}
      </LinkCard>
    </ConfirmIdentityProvider>
  );
}
