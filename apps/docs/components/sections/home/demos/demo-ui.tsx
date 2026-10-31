"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";
import { AsciiField, type AsciiVariant } from "@/components/fx";

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

/** Toggle chip used by the demos: the core pill Button with aria-pressed. */
export function Chip({
  selected,
  onClick,
  children,
  className,
  label,
}: ChipProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant={selected ? "secondary" : "ghost"}
      aria-pressed={selected}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 text-xs",
        selected
          ? "ring-1 ring-foreground/15"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </Button>
  );
}

/** White paper the demos draw their QR code on. */
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
        "flex aspect-square items-center justify-center rounded-2xl bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_14px_30px_-14px_rgba(0,0,0,0.3)] ring-1 ring-black/5 [&_svg]:size-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The area a demo plays in: a quiet ASCII surface that answers the pointer.
 * Each demo picks its own pattern so neighbouring cards differ.
 */
export function DemoStage({
  children,
  className,
  pattern = "noise",
}: {
  children: ReactNode;
  className?: string;
  pattern?: AsciiVariant;
}) {
  return (
    <div className={cn("relative isolate overflow-hidden", className)}>
      <AsciiField
        variant={pattern}
        radius={110}
        seed={5}
        className="-z-10 opacity-80 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_85%)]"
      />
      {children}
    </div>
  );
}

/** Small caption in mono, for readouts inside demos. */
export function Readout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[11px] text-muted-foreground tabular-nums",
        className,
      )}
    >
      {children}
    </span>
  );
}
