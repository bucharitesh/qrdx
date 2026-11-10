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

/**
 * The workspace picker and Confirm/Cancel. Confirm asks "Confirm it's you"
 * when the session hasn't recently (the action answers so), then links.
 */
export function SlackLinkForm({
  token,
  workspaces,
  defaultWorkspaceId,
  cancelHref,
}: {
  token: string;
  workspaces: LinkWorkspaceOption[];
  defaultWorkspaceId: string;
  cancelHref: string;
}) {
  const id = useId();
  const { withConfirmation } = useConfirmation();
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
        () => linkSlackAccount({ token, organizationId: workspaceId }),
        "link-slack-account",
      );
      // Cancelled, or still not confirmed (the dialog said so).
      if (!result) return;
      if (result.ok) setLinked(result.workspaceName);
      else setError(result.error);
    });

  return (
    <div className="flex w-full flex-col gap-4 text-left">
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
      {error && (
        <p className="text-destructive text-sm text-pretty" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        <Button disabled={pending} onClick={confirm} type="button">
          {pending && <Spinner aria-hidden className="animate-spin" />}
          Confirm
        </Button>
      </div>
    </div>
  );
}
