"use client";

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
      toast.success("Barcode duplicated");
      router.push(`${basePath}/${encodeURIComponent(result.data.id)}`);
    });

  const trash = () =>
    startTransition(async () => {
      const result = await trashSavedBarcodes({ ids: [id] });
      if (!result.success || result.data.updated === 0) {
        soundEvent("error");
        toast.error(
          result.success
            ? "Only team owners and admins can delete barcodes created by others."
            : result.error.message,
        );
        return;
      }
      toast.success("Moved to the trash", {
        description: "Restore it from Trash on the Barcodes page.",
      });
      router.push(basePath);
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="More actions" size="icon" variant="outline">
          <More aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={pending} onSelect={duplicate}>
          <Copy aria-hidden />
          Duplicate
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
              Move to trash
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
