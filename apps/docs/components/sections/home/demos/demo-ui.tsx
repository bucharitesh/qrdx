"use client";

import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";
import { EASE_CLASS } from "@/components/mockups/motion";

/** "circle-large" → "Circle large" */
export const humanize = (id: string) =>
  id.charAt(0).toUpperCase() + id.slice(1).replaceAll("-", " ");

interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  label?: string;
}

/** Toggle chip used by the demos (aria-pressed). */
export function Chip({
  selected,
  onClick,
  children,
  className,
  label,
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:active:scale-100",
        EASE_CLASS,
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** White tile the demos draw their QR code in. */
export function QrTile({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "flex aspect-square items-center justify-center rounded-xl bg-white p-2 shadow-sm ring-1 ring-black/5 [&_svg]:size-full",
        className,
      )}
    >
      {children}
    </div>
  );
}
