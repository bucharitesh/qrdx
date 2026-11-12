"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@repo/design-system/components/ui/sheet";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowDown2, Setting4, Shuffle } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";
import type { PartItem } from "./part-controls";
import type { PartId } from "./part-targets";

/**
 * Phones: tapping a part of the code opens this sheet with its toolbar's
 * items stacked, one open at a time. It doesn't cover the preview (no
 * overlay), so every change shows above it. Done or a tap outside keeps
 * the edit; Escape puts it back.
 */
export function PartSheet({
  part,
  items,
  extra,
  onRandom,
  onCommit,
  onCancel,
  onMoreOptions,
}: {
  part: PartId;
  items: PartItem[];
  /** Rendered with the sheet, outside its items (a file input) */
  extra?: ReactNode;
  onRandom: () => void;
  onCommit: () => void;
  onCancel: () => void;
  onMoreOptions: () => void;
}) {
  const t = useTranslations("editor.partInline");
  const baseId = useId();
  const first = items.find((item) => item.kind === "menu")?.id ?? null;
  const [open, setOpen] = useState<string | null>(first);

  return (
    <Sheet
      modal={false}
      onOpenChange={(next) => {
        if (!next) onCommit();
      }}
      open
    >
      <SheetContent
        // Stops short of the preview (the top third), so changes stay in view
        className="z-[120] max-h-[56svh] gap-0 rounded-t-xl p-0"
        data-part-inline=""
        data-part-sheet={part}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          onCancel();
        }}
        onOpenAutoFocus={(event) => {
          // Keep the keyboard down; the sheet itself takes focus
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus({
            preventScroll: true,
          });
        }}
        side="bottom"
        tabIndex={-1}
      >
        <div className="px-4 pt-4 pr-12 pb-2">
          <SheetTitle className="text-sm">{t(`parts.${part}.edit`)}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("sheet.changesShowOnTheCode")}
          </SheetDescription>
        </div>

        <div className="@container min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-3">
          {items.map((item) => {
            if (item.kind === "toggle") {
              return (
                <button
                  aria-pressed={item.pressed}
                  className={rowClass}
                  key={item.id}
                  onClick={item.onToggle}
                  type="button"
                >
                  <span className="flex items-center gap-2">
                    {item.trigger}
                    {item.label}
                  </span>
                </button>
              );
            }
            const expanded = open === item.id;
            const panelId = `${baseId}-${item.id}`;
            return (
              <div className="rounded-md border" key={item.id}>
                <button
                  aria-controls={panelId}
                  aria-expanded={expanded}
                  className={cn(rowClass, "border-0")}
                  onClick={() =>
                    setOpen((current) => (current === item.id ? null : item.id))
                  }
                  type="button"
                >
                  <span className="flex items-center gap-2">
                    {item.trigger}
                    {item.label}
                  </span>
                  <ArrowDown2
                    aria-hidden
                    className={cn(
                      "text-muted-foreground size-3.5 shrink-0 transition-transform duration-200",
                      expanded && "rotate-180",
                    )}
                  />
                </button>
                {expanded && (
                  <div className="space-y-3 border-t p-3" id={panelId}>
                    {item.content}
                  </div>
                )}
              </div>
            );
          })}
          {extra}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <div className="flex items-center gap-1">
            <Button
              aria-label={t(`parts.${part}.random`)}
              onClick={onRandom}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Shuffle aria-hidden className="size-4" />
              {t("random")}
            </Button>
            <Button
              onClick={onMoreOptions}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Setting4 aria-hidden className="size-4" />
              {t("moreOptions")}
            </Button>
          </div>
          <Button onClick={onCommit} size="sm" type="button">
            {t("sheet.done")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const rowClass =
  "bg-card hover:bg-accent/40 focus-visible:ring-ring/50 aria-pressed:bg-accent flex h-10 w-full items-center justify-between gap-2 rounded-md border px-3 text-left text-xs font-medium transition-colors outline-none focus-visible:ring-[3px]";
