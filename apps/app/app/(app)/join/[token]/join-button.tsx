"use client";

import { toast } from "@repo/design-system";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
import { Button } from "@repo/design-system/components/ui/button";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { joinWorkspaceWithLink } from "@/actions/workspace-join";
import { useRefreshTeams } from "@/components/org-switcher";
import { workspaceHref } from "@/lib/workspace-paths";

export function JoinButton({ token, name }: { token: string; name: string }) {
  const t = useTranslations("app.join.joinButton");
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
          ? t("youreAlreadyAMemberOf", { name })
          : t("youJoinedName", { name }),
      );
      refresh();
      router.push(workspaceHref(result.data.slug));
    });

  return (
    <div className="space-y-3">
      <Button className="w-full" disabled={isPending} onClick={join}>
        {isPending && <ModuleOrbit aria-hidden />}
        {t("joinWorkspace")}
      </Button>
      {error && (
        <p className="text-destructive text-sm text-pretty" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
