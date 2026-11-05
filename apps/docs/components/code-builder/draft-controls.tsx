"use client";

// A quiet pill says the draft is saved; with older drafts it becomes a menu
// to restore one.

import { Spinner, Tick } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2, ArrowRotateLeft, Trash } from "iconsax-reactjs";
import type { CodeDraft } from "./drafts";

export type DraftState = "idle" | "saving" | "saved" | "failed";

function draftLabel(draft: CodeDraft): string {
  const { title, destination, slug } = draft.fields;
  return (
    title.trim() ||
    destination
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "") ||
    slug.trim() ||
    "Untitled code"
  );
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function ago(timestamp: number, now: number): string {
  const minutes = Math.round((timestamp - now) / 60_000);
  if (minutes > -1) return "just now";
  if (minutes > -60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

export function DraftControls({
  state,
  drafts,
  onRestore,
  onDelete,
}: {
  state: DraftState;
  /** Other drafts of this code (or of new codes), newest first */
  drafts: CodeDraft[];
  onRestore: (draft: CodeDraft) => void;
  onDelete: (draft: CodeDraft) => void;
}) {
  // Phones keep the icon only (the title needs the room); the words stay
  // for screen readers.
  const status =
    state === "saving" ? (
      <>
        <Spinner className="size-3.5" />
        <span className="max-sm:sr-only">Saving…</span>
      </>
    ) : state === "saved" ? (
      <>
        <Tick className="size-3.5" />
        <span className="max-sm:sr-only">Draft saved</span>
      </>
    ) : state === "failed" ? (
      "Draft not saved"
    ) : null;

  if (drafts.length === 0) {
    return status ? (
      <span
        aria-live="polite"
        className={cn(
          "text-muted-foreground inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs",
          state === "failed" && "text-destructive",
        )}
        title={
          state === "failed"
            ? "This browser didn't let QRdx store the draft."
            : "Kept in this browser for 7 days."
        }
      >
        {status}
      </span>
    ) : null;
  }

  const now = Date.now();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="text-muted-foreground h-7 gap-1.5 rounded-full px-2.5 text-xs"
          size="sm"
          type="button"
          variant="outline"
        >
          <span aria-live="polite" className="inline-flex items-center gap-1.5">
            {status ?? "Drafts"}
          </span>
          <ArrowDown2 aria-hidden className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Restore a draft
        </DropdownMenuLabel>
        {drafts.map((draft) => (
          <DropdownMenuItem
            className="gap-2"
            key={draft.id}
            onSelect={() => onRestore(draft)}
          >
            <ArrowRotateLeft aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{draftLabel(draft)}</span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {ago(draft.savedAt, now)}
            </span>
            <button
              aria-label={`Delete the draft ${draftLabel(draft)}`}
              className="text-muted-foreground hover:text-foreground -mr-1 rounded p-1"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDelete(draft);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              <Trash aria-hidden className="size-3.5" />
            </button>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
