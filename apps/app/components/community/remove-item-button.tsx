"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { removeCommunityItemAction } from "@/app/(app)/admin/actions";

/** Admins only: take an item out of the community (post-moderation). */
export function RemoveItemButton({
  itemId,
  name,
  afterRemove = "community",
}: {
  itemId: string;
  name: string;
  /** Item pages go back to the community; the admin queue reloads */
  afterRemove?: "community" | "refresh";
}) {
  const t = useTranslations("community.removeItemButton");
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
        toast.success(t("removedNameFromTheCommunity", { name }));
        if (afterRemove === "refresh") router.refresh();
        else router.push("/community");
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Button disabled={isPending} onClick={onClick} size="sm" variant="outline">
      {afterRemove === "refresh" ? t("remove") : t("removeFromTheCommunity")}
    </Button>
  );
}
