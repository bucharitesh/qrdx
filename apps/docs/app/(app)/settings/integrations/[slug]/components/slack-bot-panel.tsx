"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { unlinkSlackIdentityAction } from "../../slack-bot-actions";

/** What Settings shows about the QRdx bot for this user (no tokens). */
export interface SlackBotSettings {
  installs: { teamId: string; teamName: string | null; installedAt: Date }[];
  links: {
    id: string;
    teamName: string | null;
    teamId: string;
    slackUserId: string;
    workspaceName: string | null;
    linkedAt: Date;
  }[];
  /** The tables aren't there yet (manual SQL not applied). */
  unavailable?: boolean;
}

const date = (value: Date) =>
  value.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

/**
 * Settings → Integrations → Slack, "QRdx bot": add the bot to a Slack
 * workspace, the workspaces this user added it to, and the Slack accounts
 * linked to them for tracked codes (with Unlink). Shown only where the bot
 * is set up on this server.
 */
export function SlackBotPanel({
  installs,
  links,
  unavailable,
}: SlackBotSettings) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const unlink = async (id: string) => {
    setBusy(id);
    try {
      const result = await unlinkSlackIdentityAction(id);
      if (result.ok) {
        toast.success("Slack account unlinked");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Couldn't unlink. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">QRdx bot</h2>
          <p className="max-w-prose text-sm text-muted-foreground text-pretty">
            Everyone in the Slack workspace can make QR codes with{" "}
            <code>/qr</code>, by mentioning the bot or in a direct message.
            People who link their QRdx account with <code>/qr link</code> can
            also make tracked codes with <code>/qr track</code>.
          </p>
        </div>
        {!unavailable && (
          <Button asChild size="sm">
            <a href="/api/integrations/slack/bot/install">
              Add the bot to Slack
            </a>
          </Button>
        )}
      </div>

      {unavailable ? (
        <p className="text-sm text-muted-foreground">
          The bot isn't available yet. Try again later.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Added by you</h3>
            {installs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You haven't added the bot to a Slack workspace.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {installs.map((install) => (
                  <li
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                    key={install.teamId}
                  >
                    <span className="font-medium">
                      {install.teamName ?? install.teamId}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Added {date(install.installedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-medium">Linked Slack accounts</h3>
            {links.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Slack account is linked to you. Run <code>/qr link</code> in
                Slack to link one.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {links.map((link) => (
                  <li
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                    key={link.id}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-medium truncate">
                        {link.teamName ?? link.teamId}
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          · {link.slackUserId}
                        </span>
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Tracked codes go to{" "}
                        {link.workspaceName ?? "your QRdx workspace"}. Linked{" "}
                        {date(link.linkedAt)}.
                      </p>
                    </div>
                    <Button
                      disabled={busy !== null}
                      onClick={() => unlink(link.id)}
                      size="sm"
                      variant="outline"
                    >
                      {busy === link.id && <Spinner className="size-3.5" />}
                      Unlink
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
