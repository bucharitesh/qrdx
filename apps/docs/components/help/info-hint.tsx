"use client";

import { Info } from "@repo/design-system/components/icons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { cn } from "@repo/design-system/lib/utils";
import { ArrowRight } from "iconsax-reactjs";
import Link from "next/link";
import type * as React from "react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { HINTS, type Hint, type HintId } from "@/lib/help/hints";

// The visuals (and the qrdx renderer they use) load the first time a card opens.
const HintVisual = lazy(() =>
  import("./hint-visual").then((mod) => ({ default: mod.HintVisual })),
);

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 180;

// Focus opens a card only when it came from Tab, not when a dialog or
// popover moves focus onto the (i) by itself.
let tabbing = false;
let tracking = false;
function trackTabKey() {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  document.addEventListener(
    "keydown",
    (event) => {
      tabbing = event.key === "Tab";
    },
    true,
  );
  document.addEventListener(
    "pointerdown",
    () => {
      tabbing = false;
    },
    true,
  );
}

interface InfoHintProps {
  id: HintId;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
}

/**
 * Small (i) next to a label that opens a card with a visual, a title and a
 * sentence or two from lib/help/hints.ts. Hover or Tab focus opens it on
 * desktop, a tap opens it on touch, and a click keeps it open.
 */
export function InfoHint({
  id,
  side = "top",
  align = "center",
  className,
}: InfoHintProps) {
  const hint: Hint = HINTS[id];
  const [open, setOpen] = useState(false);
  // Clicked open: stays until a second click, Esc or a click outside.
  const pinned = useRef(false);
  // Opened from the keyboard: focus moves into the card so its link is reachable.
  const focusCard = useRef(false);
  // Focus goes back to the (i) on close only when it was inside the card.
  const returnFocus = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const change = (next: boolean) => {
    clearTimer();
    if (!next) {
      returnFocus.current = Boolean(
        contentRef.current?.contains(document.activeElement),
      );
      pinned.current = false;
      focusCard.current = false;
    }
    setOpen(next);
  };

  const later = (next: boolean, delay: number) => {
    clearTimer();
    timer.current = setTimeout(() => change(next), delay);
  };

  useEffect(() => {
    trackTabKey();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onPointerEnter = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    if (open) clearTimer();
    else later(true, OPEN_DELAY_MS);
  };

  const onPointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    if (pinned.current) clearTimer();
    else later(false, CLOSE_DELAY_MS);
  };

  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Toggle here instead of in Radix, so a click after hover keeps it open.
    event.preventDefault();
    event.stopPropagation();
    const fromKeyboard = event.detail === 0;
    if (open && pinned.current) {
      change(false);
      return;
    }
    pinned.current = true;
    if (open) {
      clearTimer();
      if (fromKeyboard) contentRef.current?.focus();
      return;
    }
    focusCard.current = fromKeyboard;
    change(true);
  };

  const onFocus = () => {
    if (!open && tabbing) change(true);
  };

  const onBlur = (event: React.FocusEvent<HTMLButtonElement>) => {
    const next = event.relatedTarget as Node | null;
    if (pinned.current || (next && contentRef.current?.contains(next))) return;
    if (open) later(false, 0);
  };

  return (
    <Popover onOpenChange={change} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-label={`About ${hint.title}`}
          className={cn(
            "text-muted-foreground/70 hover:text-foreground focus-visible:text-foreground data-[state=open]:text-foreground focus-visible:ring-ring/50 relative inline-flex size-4 shrink-0 cursor-help items-center justify-center rounded-full align-middle transition-colors outline-none focus-visible:ring-[3px]",
            // A larger hit area without changing the layout.
            "after:absolute after:-inset-1.5 after:content-['']",
            className,
          )}
          data-info-hint={id}
          onBlur={onBlur}
          onClick={onClick}
          onFocus={onFocus}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          type="button"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        aria-label={hint.title}
        className="w-[18.5rem] max-w-[calc(100vw-2rem)] overflow-hidden p-0"
        collisionPadding={12}
        data-info-hint-card={id}
        onCloseAutoFocus={(event) => {
          if (!returnFocus.current) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          if (!focusCard.current) event.preventDefault();
        }}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        ref={contentRef}
        side={side}
        sideOffset={8}
      >
        <HintCard hint={hint} onNavigate={() => change(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** The card's body: visual, title, sentence and docs link. */
export function HintCard({
  hint,
  onNavigate,
}: {
  hint: Hint;
  onNavigate?: () => void;
}) {
  return (
    <>
      {hint.visual && (
        <div className="bg-muted/40 relative aspect-[16/10] w-full overflow-hidden border-b">
          <Suspense fallback={null}>
            <HintVisual visual={hint.visual} />
          </Suspense>
        </div>
      )}
      <div className="space-y-1.5 p-3.5">
        <p className="text-sm leading-snug font-medium">{hint.title}</p>
        <p className="text-muted-foreground text-xs leading-relaxed text-pretty">
          {hint.body}
        </p>
        {hint.docsHref && (
          <Link
            className="text-foreground decoration-foreground/30 hover:decoration-foreground focus-visible:decoration-foreground focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-sm pt-0.5 text-xs font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px]"
            href={hint.docsHref}
            onClick={onNavigate}
          >
            Learn more
            <ArrowRight className="size-3" />
          </Link>
        )}
      </div>
    </>
  );
}
