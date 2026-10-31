"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptInvitation, rejectInvitation } from "@/actions/organizations";
import { useRefreshTeams } from "@/components/org-switcher";

export function InviteActions({ invitationId }: { invitationId: string }) {
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
      toast.success("You joined the team");
      // Accepting makes the team the active workspace.
      refresh();
      router.push("/dashboard/team");
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
          You declined this invitation.
        </p>
        <Button asChild variant="outline">
          <Link href="/playground">Go to the playground</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button className="flex-1" disabled={isPending} onClick={accept}>
        {isPending ? "Working..." : "Accept invitation"}
      </Button>
      <Button
        className="flex-1"
        disabled={isPending}
        onClick={decline}
        variant="outline"
      >
        Decline
      </Button>
    </div>
  );
}

export function SignOutButton() {
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
      Sign out
    </Button>
  );
}
