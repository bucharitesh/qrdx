"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { removeCommunityItemAction } from "@/app/admin/actions";

/** Admins only: take an item out of the community (post-moderation). */
export function RemoveItemButton({
  itemId,
  name,
}: {
  itemId: string;
  name: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    const reason = window.prompt(
      `Remove "${name}" from the community? Copies people made stay theirs. Reason (required):`,
    );
    if (!reason?.trim()) return;
    startTransition(async () => {
      const result = await removeCommunityItemAction({ itemId, reason });
      if (result.ok) {
        toast.success(`Removed "${name}" from the community`);
        router.push("/community");
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Button disabled={isPending} onClick={onClick} size="sm" variant="outline">
      Remove from the community
    </Button>
  );
}
