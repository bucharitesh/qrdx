"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { acceptInvitation, rejectInvitation } from "@/actions/organizations";
import { useRefreshTeams } from "@/components/org-switcher";
import { playgroundHref } from "@/lib/playground-links";
import { workspaceHref } from "@/lib/workspace-paths";

export function InviteActions({ invitationId }: { invitationId: string }) {
  const t = useTranslations("app.invite.inviteActions");
  const router = useRouter();
  const refresh = useRefreshTeams();
  const [declined, setDeclined] = useState(false);
  const [isPending, startTransition] = useTransition();

  const accept = () =>
    startTransition(async () => {
      const result = await acceptInvitation({ invitationId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("youJoinedTheWorkspace"));
      // Accepting makes it the active workspace.
      refresh();
      router.push(
        result.data.slug ? workspaceHref(result.data.slug) : "/dashboard",
      );
    });

  const decline = () =>
    startTransition(async () => {
      const result = await rejectInvitation({ invitationId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDeclined(true);
    });

  if (declined) {
    return (
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm">
          {t("youDeclinedThisInvitation")}
        </p>
        <Button asChild variant="outline">
          <Link href={playgroundHref()}>{t("goToThePlayground")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button className="flex-1" disabled={isPending} onClick={accept}>
        {isPending ? t("working") : t("acceptInvitation")}
      </Button>
      <Button
        className="flex-1"
        disabled={isPending}
        onClick={decline}
        variant="outline"
      >
        {t("decline")}
      </Button>
    </div>
  );
}

export function SignOutButton() {
  const t = useTranslations("app.invite.inviteActions");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await authClient.signOut();
          router.refresh();
        })
      }
      variant="outline"
    >
      {t("signOut")}
    </Button>
  );
}
