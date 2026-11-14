"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { TickCircle } from "iconsax-reactjs";
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useConfirmation } from "@/components/confirm-identity/provider";
import { linkSlackAccount } from "./actions";

export interface LinkWorkspaceOption {
  id: string;
  name: string;
}

/** Sign in with Slack: done, or the button (and why the last try didn't count). */
function SlackSignInStep({
  href,
  slackName,
  verified,
  error,
}: {
  href: string;
  slackName: string;
  verified: boolean;
  error: string | null;
}) {
  if (verified) {
    return (
      <p className="flex items-center gap-2 text-sm">
        <TickCircle
          aria-hidden
          className="size-4 shrink-0 text-foreground/80"
        />
        <span>
          You signed in with Slack as{" "}
          <span className="font-medium">{slackName}</span>.
        </span>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm text-pretty">
        First, sign in with Slack as{" "}
        <span className="font-medium text-foreground">{slackName}</span>, so
        QRdx knows this Slack account is yours.
      </p>
      {error && (
        <p className="text-destructive text-sm text-pretty" role="alert">
          {error}
        </p>
      )}
      <Button asChild className="self-start">
        <a href={href}>Sign in with Slack</a>
      </Button>
    </div>
  );
}

/**
 * Sign in with Slack, then the workspace picker and Confirm/Cancel. Confirm
 * works once the Slack sign-in proved the Slack account; it reads "Replace
 * the link" when that Slack account is linked already. It asks "Confirm
 * it's you" when the session hasn't recently (the action answers so), then
 * links.
 */
export function SlackLinkForm({
  token,
  workspaces,
  defaultWorkspaceId,
  cancelHref,
  signIn,
  replacing,
}: {
  token: string;
  workspaces: LinkWorkspaceOption[];
  defaultWorkspaceId: string;
  cancelHref: string;
  signIn: {
    href: string;
    slackName: string;
    verified: boolean;
    error: string | null;
  };
  /** The link this one would replace */
  replacing: { workspaceName: string; otherAccount: boolean } | null;
}) {
  const id = useId();
  const { withConfirmation } = useConfirmation();
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const [error, setError] = useState<string | null>(null);
  const [signInAgain, setSignInAgain] = useState(false);
  const [linked, setLinked] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const verified = signIn.verified && !signInAgain;

  if (linked) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <TickCircle aria-hidden className="size-6 text-foreground/80" />
        <p className="text-sm text-pretty">
          Linked. Go back to Slack: <code>/qr track</code> with a link now makes
          a tracked code in{" "}
          <span className="font-medium text-foreground">{linked}</span>.
        </p>
        <Button asChild variant="outline">
          <Link href="/settings/integrations/slack">Slack settings</Link>
        </Button>
      </div>
    );
  }

  const confirm = () =>
    startTransition(async () => {
      setError(null);
      const result = await withConfirmation(
        () =>
          linkSlackAccount({
            token,
            organizationId: workspaceId,
            replace: replacing !== null,
          }),
        "link-slack-account",
      );
      // Cancelled, or still not confirmed (the dialog said so).
      if (!result) return;
      if (result.ok) {
        setLinked(result.workspaceName);
        return;
      }
      setError(result.error);
      if ("signIn" in result && result.signIn) setSignInAgain(true);
    });

  return (
    <div className="flex w-full flex-col gap-5 text-left">
      <SlackSignInStep
        error={signInAgain ? null : signIn.error}
        href={signIn.href}
        slackName={signIn.slackName}
        verified={verified}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-workspace`}>QRdx workspace</Label>
        <Select onValueChange={setWorkspaceId} value={workspaceId}>
          <SelectTrigger className="w-full" id={`${id}-workspace`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {replacing && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-pretty">
          This Slack account is linked to{" "}
          <span className="font-medium">{replacing.workspaceName}</span>
          {replacing.otherAccount ? " in another QRdx account" : ""}. Replacing
          the link sends its <code>/qr track</code> codes to the workspace you
          pick, as you.
        </p>
      )}
      {error && (
        <p className="text-destructive text-sm text-pretty" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button disabled={pending || !verified} onClick={confirm} type="button">
          {pending && <Spinner aria-hidden className="animate-spin" />}
          {replacing ? "Replace the link" : "Confirm"}
        </Button>
      </div>
    </div>
  );
}
