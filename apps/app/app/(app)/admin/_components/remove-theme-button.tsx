"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useTransition } from "react";
import { toast } from "sonner";
import { removeCommunityThemeAction } from "../actions";

export function RemoveThemeButton({
  communityThemeId,
  name,
}: {
  communityThemeId: string;
  name: string;
}) {
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    const reason = window.prompt(
      `Remove "${name}" from the community gallery? The owner keeps their saved theme. Reason (optional):`,
    );
    if (reason === null) return;
    startTransition(async () => {
      const result = await removeCommunityThemeAction({
        communityThemeId,
        reason: reason || undefined,
      });
      if (result.ok) {
        toast.success(`Removed "${name}" from the community`);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Button
      disabled={isPending}
      size="sm"
      variant="destructive"
      onClick={onClick}
    >
      Remove
    </Button>
  );
}
