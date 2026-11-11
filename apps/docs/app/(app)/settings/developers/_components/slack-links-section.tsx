"use client";

import { toast } from "@repo/design-system";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { WorkspaceSlackLinksState } from "@/lib/slack-bot/admin";
import type { WorkspaceSlackLink } from "@/lib/slack-bot/store";
import { revokeSlackLinkAction } from "../_lib/slack-link-actions";
import { formatDate } from "./format";

const SLACK_DOCS_HREF = "/docs/slack-bot";

const member = (link: WorkspaceSlackLink) =>
  link.memberName || link.memberEmail || "a former member";

/**
 * Settings → API keys & apps, for owners and admins: the Slack accounts
 * linked to this workspace with /qr link, each making tracked codes as one
 * member, and Revoke.
 */
export function SlackLinksSection({
  state,
  workspaceName,
}: {
  state: WorkspaceSlackLinksState;
  workspaceName: string;
}) {
  const router = useRouter();
  const [revoking, setRevoking] = useState<WorkspaceSlackLink | null>(null);
  const [pending, startTransition] = useTransition();
  const links = state.available ? state.links : [];

  const revoke = (link: WorkspaceSlackLink) =>
    startTransition(async () => {
      const result = await revokeSlackLinkAction({ id: link.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRevoking(null);
      toast.success("Slack link revoked");
      router.refresh();
    });

  return (
    <section aria-labelledby="slack-links-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold" id="slack-links-heading">
          Slack accounts
        </h2>
        <p className="text-muted-foreground text-sm">
          People who linked a Slack account with <code>/qr link</code> make
          tracked codes in{" "}
          <span className="text-foreground font-medium">{workspaceName}</span>{" "}
          from Slack, as the member named here.{" "}
          <Link
            className="text-foreground underline underline-offset-4"
            href={SLACK_DOCS_HREF}
          >
            Slack bot
          </Link>
        </p>
      </div>

      {!state.available ? (
        <p className="text-muted-foreground rounded-xl border p-4 text-sm">
          Slack links aren't available on this deployment yet.
        </p>
      ) : links.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border p-4 text-sm">
          No Slack account is linked to this workspace.
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {links.map((link) => (
            <li className="flex items-center gap-4 p-4" key={link.id}>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-sm font-medium">
                  {link.teamName ?? link.teamId}
                  <span className="text-muted-foreground font-normal">
                    {" "}
                    · {link.slackUserId}
                  </span>
                </p>
                <p className="text-muted-foreground text-xs">
                  As {member(link)} · Linked {formatDate(link.linkedAt)}
                  {link.teamName ? ` · Slack workspace ${link.teamId}` : ""}
                </p>
              </div>
              <Button
                onClick={() => setRevoking(link)}
                size="sm"
                variant="ghost"
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        onOpenChange={(open) => !open && setRevoking(null)}
        open={revoking !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke the Slack link of {revoking?.slackUserId}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <code>/qr track</code> from that Slack account stops making codes
              in {workspaceName}. Codes it made stay. They can link again with{" "}
              <code>/qr link</code> if they're still a member.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={() => revoking && revoke(revoking)}
              variant="destructive"
            >
              Revoke link
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
