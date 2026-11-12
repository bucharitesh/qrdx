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
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Translator } from "@/lib/i18n/translator";
import type { WorkspaceSlackLinksState } from "@/lib/slack-bot/admin";
import type { WorkspaceSlackLink } from "@/lib/slack-bot/store";
import { revokeSlackLinkAction } from "../_lib/slack-link-actions";
import { formatDate } from "./format";

const SLACK_DOCS_HREF = "/docs/slack-bot";

const member = (
  link: WorkspaceSlackLink,
  t: Translator<"app.settings.developers.slackLinksSection">,
) => link.memberName || link.memberEmail || t("aFormerMember");

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
  const t = useTranslations("app.settings.developers.slackLinksSection");
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
      toast.success(t("slackLinkRevoked"));
      router.refresh();
    });

  return (
    <section aria-labelledby="slack-links-heading" className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold" id="slack-links-heading">
          {t("slackAccounts")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t.rich("peopleWhoLinkedASlack", {
            workspaceName,
            code: (chunks) => <code>{chunks}</code>,
            span: (chunks) => (
              <span className="text-foreground font-medium">{chunks}</span>
            ),
            link: (chunks) => (
              <Link
                className="text-foreground underline underline-offset-4"
                href={SLACK_DOCS_HREF}
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>

      {!state.available ? (
        <p className="text-muted-foreground rounded-xl border p-4 text-sm">
          {t("slackLinksArentAvailableOn")}
        </p>
      ) : links.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border p-4 text-sm">
          {t("noSlackAccountIsLinked")}
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
                  {t("as")} {member(link, t)} {t("linked")}{" "}
                  {formatDate(link.linkedAt)}
                  {link.teamName
                    ? t("slackWorkspaceTeamid", { teamId: link.teamId })
                    : ""}
                </p>
              </div>
              <Button
                onClick={() => setRevoking(link)}
                size="sm"
                variant="ghost"
              >
                {t("revoke")}
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
              {t("revokeTheSlackLinkOf", {
                slackUserId: revoking?.slackUserId ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.rich("qrTrackFromThatSlack", {
                workspaceName,
                code: (chunks) => <code>{chunks}</code>,
                code2: (chunks) => <code>{chunks}</code>,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={() => revoking && revoke(revoking)}
              variant="destructive"
            >
              {t("revokeLink")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
