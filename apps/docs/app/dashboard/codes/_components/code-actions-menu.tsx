"use client";

import { toast } from "@repo/design-system";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import {
  Archive,
  ArchiveRestore,
  ChartNoAxesCombined,
  Download,
  MoreHorizontal,
  Palette,
  Pencil,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteQrCode, setQrCodeArchived } from "@/actions/qr-codes";
import type { QrCodeView } from "@/app/dashboard/codes/_lib/qr-codes";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { CodeDialog } from "./code-dialog";
import { downloadCodeQr } from "./code-qr";
import { useOpenInPlayground } from "./use-open-in-playground";

export function CodeActionsMenu({
  code,
  showAnalyticsLink = true,
  afterDelete,
}: {
  code: QrCodeView;
  showAnalyticsLink?: boolean;
  /** Where to go once the code is deleted (default: stay and refresh) */
  afterDelete?: string;
}) {
  const router = useRouter();
  const openInPlayground = useOpenInPlayground();
  const openGetProDialog = useGetProDialogStore(
    (state) => state.openGetProDialog,
  );
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const archived = code.archivedAt !== null;

  const toggleArchived = () => {
    startTransition(async () => {
      const result = await setQrCodeArchived({
        id: code.id,
        archived: !archived,
      });
      if (!result.success) {
        if (result.error.code === "LIMIT_REACHED") {
          toast.error(result.error.message, {
            action: { label: "Upgrade", onClick: openGetProDialog },
          });
        } else {
          toast.error(result.error.message);
        }
        return;
      }
      toast.success(
        archived ? "Code restored" : "Code archived",
        archived
          ? { description: "Scans redirect again." }
          : {
              description:
                "Scans show a 'no longer active' page until you restore it.",
            },
      );
      router.refresh();
    });
  };

  const remove = () => {
    startTransition(async () => {
      const result = await deleteQrCode({ id: code.id });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setDeleteOpen(false);
      toast.success("Code deleted");
      if (afterDelete) router.push(afterDelete);
      else router.refresh();
    });
  };

  const download = (format: "png" | "svg") => {
    downloadCodeQr(code, format).catch(() =>
      toast.error("Download failed. Please try again."),
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Code actions"
            disabled={isPending}
            size="icon-sm"
            variant="ghost"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil /> Edit link
          </DropdownMenuItem>
          {showAnalyticsLink && (
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/codes/${encodeURIComponent(code.id)}`}>
                <ChartNoAxesCombined /> View analytics
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => openInPlayground(code)}>
            <Palette /> Edit design in playground
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => download("png")}>
            <Download /> Download PNG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => download("svg")}>
            <Download /> Download SVG
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={toggleArchived}>
            {archived ? (
              <>
                <ArchiveRestore /> Restore
              </>
            ) : (
              <>
                <Archive /> Archive
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setDeleteOpen(true)}
            variant="destructive"
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CodeDialog code={code} onOpenChange={setEditOpen} open={editOpen} />

      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this QR code?</AlertDialogTitle>
            <AlertDialogDescription>
              Printed copies will lead to a "not found" page and its scan
              history is deleted. This can't be undone. To pause a code instead,
              archive it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <Button disabled={isPending} onClick={remove} variant="destructive">
              {isPending ? "Deleting..." : "Delete code"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
