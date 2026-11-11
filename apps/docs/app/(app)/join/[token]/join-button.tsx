"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { joinWorkspaceWithLink } from "@/actions/workspace-join";
import { useRefreshTeams } from "@/components/org-switcher";
import { workspaceHref } from "@/lib/workspace-paths";

export function JoinButton({ token, name }: { token: string; name: string }) {
  const router = useRouter();
  const refresh = useRefreshTeams();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const join = () =>
    startTransition(async () => {
      setError(null);
      const result = await joinWorkspaceWithLink({ token });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(
        result.data.status === "already"
          ? `You're already a member of ${name}`
          : `You joined ${name}`,
      );
      refresh();
      router.push(workspaceHref(result.data.slug));
    });

  return (
    <div className="space-y-3">
      <Button className="w-full" disabled={isPending} onClick={join}>
        {isPending && <Spinner aria-hidden className="animate-spin" />}
        Join workspace
      </Button>
      {error && (
        <p className="text-destructive text-sm text-pretty" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
