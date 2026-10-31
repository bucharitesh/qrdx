"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useTransition } from "react";
import { toast } from "sonner";
import { setDynamicCodeActiveAction } from "./actions";

export function CodeStatusButton({
  codeId,
  slug,
  isActive,
}: {
  codeId: string;
  slug: string;
  isActive: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    let reason: string | undefined;
    if (isActive) {
      const answer = window.prompt(
        `Disable /q/${slug}? Scans will show a "no longer active" page and the owner cannot re-enable it. Reason (optional):`,
      );
      if (answer === null) return;
      reason = answer || undefined;
    } else if (!window.confirm(`Enable /q/${slug} again?`)) {
      return;
    }

    startTransition(async () => {
      const result = await setDynamicCodeActiveAction({
        codeId,
        active: !isActive,
        reason,
      });
      if (result.ok) {
        toast.success(isActive ? `Disabled /q/${slug}` : `Enabled /q/${slug}`);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Button
      disabled={isPending}
      onClick={onClick}
      size="sm"
      variant={isActive ? "destructive" : "outline"}
    >
      {isActive ? "Disable" : "Enable"}
    </Button>
  );
}
