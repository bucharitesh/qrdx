"use client";
import { useTranslations } from "next-intl";

// The barcode page's "…" menu: duplicate, move to trash.

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Copy, More, Trash } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { duplicateSavedBarcode, trashSavedBarcodes } from "@/actions/barcodes";
import { soundEvent } from "@/lib/sound/emit";

export function BarcodeActions({
  id,
  basePath,
  canDelete,
}: {
  id: string;
  basePath: string;
  canDelete: boolean;
}) {
  const t = useTranslations("app.dashboard.barcodes.barcodeActions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const duplicate = () =>
    startTransition(async () => {
      const result = await duplicateSavedBarcode({ id });
      if (!result.success) {
        soundEvent("error");
        toast.error(result.error.message);
        return;
      }
      toast.success(t("barcodeDuplicated"));
      router.push(`${basePath}/${encodeURIComponent(result.data.id)}`);
    });

  const trash = () =>
    startTransition(async () => {
      const result = await trashSavedBarcodes({ ids: [id] });
      if (!result.success || result.data.updated === 0) {
        soundEvent("error");
        toast.error(
          result.success ? t("onlyTeamOwnersAndAdmins") : result.error.message,
        );
        return;
      }
      toast.success(t("movedToTheTrash"), {
        description: t("restoreItFromTrashOn"),
      });
      router.push(basePath);
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={t("moreActions")} size="icon" variant="outline">
          <More aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={pending} onSelect={duplicate}>
          <Copy aria-hidden />
          {t("duplicate")}
        </DropdownMenuItem>
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              disabled={pending}
              onSelect={trash}
            >
              <Trash aria-hidden />
              {t("moveToTrash")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
