"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { type FormEvent, useEffect, useState } from "react";
import { setQrCodeNotes } from "@/actions/bulk-codes";
import { MAX_NOTES_LENGTH } from "@/app/dashboard/codes/_lib/organize-shared";
import { useOrganizeAction } from "./use-organize-action";

export function NotesDialog({
  code,
  open,
  onOpenChange,
}: {
  code: { id: string; notes: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { run, isPending } = useOrganizeAction();
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) setNotes(code.notes ?? "");
  }, [open, code.notes]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const done = await run(() => setQrCodeNotes({ id: code.id, notes }), {
      success: notes.trim() ? "Notes saved" : "Notes cleared",
    });
    if (done !== null) onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Notes</DialogTitle>
            <DialogDescription>
              Private to your workspace: where it's printed, who asked for it,
              what to change next. Notes are searchable.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Notes"
            autoFocus
            className="min-h-32"
            maxLength={MAX_NOTES_LENGTH}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Printed on 500 table tents, Oct 2026"
            value={notes}
          />
          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button disabled={isPending} type="submit">
              Save notes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
