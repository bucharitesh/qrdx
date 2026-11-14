"use client";
import { useTranslations } from "next-intl";
import type { Translator } from "@/lib/i18n/translator";

// A quiet pill says the draft is saved; with older drafts it becomes a menu
// to restore one.

import { Tick } from "@repo/design-system/components/icons";
import { ModuleOrbit } from "@repo/design-system/components/loaders";
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

function draftLabel(
  draft: CodeDraft,
  t: Translator<"codeBuilder.draftControls">,
): string {
  const { title, destination, slug } = draft.fields;
  return (
    title.trim() ||
    destination
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "") ||
    slug.trim() ||
    t("untitledCode")
  );
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function ago(
  timestamp: number,
  now: number,
  t: Translator<"codeBuilder.draftControls">,
): string {
  const minutes = Math.round((timestamp - now) / 60_000);
  if (minutes > -1) return t("justNow");
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
  const t = useTranslations("codeBuilder.draftControls");
  // Phones keep the icon only (the title needs the room); the words stay
  // for screen readers.
  const status =
    state === "saving" ? (
      <>
        <ModuleOrbit aria-hidden className="size-3.5" />
        <span className="max-sm:sr-only">{t("saving")}</span>
      </>
    ) : state === "saved" ? (
      <>
        <Tick className="size-3.5" />
        <span className="max-sm:sr-only">{t("draftSaved")}</span>
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
            ? t("thisBrowserDidntLetQrdx")
            : t("keptInThisBrowserFor")
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
            {status ?? t("drafts")}
          </span>
          <ArrowDown2 aria-hidden className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      {/* Above the code builder's dialog (z-[99]) */}
      <DropdownMenuContent align="end" className="z-[120] w-72">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          {t("restoreADraft")}
        </DropdownMenuLabel>
        {drafts.map((draft) => (
          <DropdownMenuItem
            className="gap-2"
            key={draft.id}
            onSelect={() => onRestore(draft)}
          >
            <ArrowRotateLeft aria-hidden className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {draftLabel(draft, t)}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs">
              {ago(draft.savedAt, now, t)}
            </span>
            <button
              aria-label={t("deleteTheDraftValue", {
                value: draftLabel(draft, t),
              })}
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
