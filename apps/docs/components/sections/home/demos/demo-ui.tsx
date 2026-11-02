"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";

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
        "flex aspect-square items-center justify-center rounded-2xl bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_10px_24px_-14px_rgba(0,0,0,0.28)] ring-1 ring-black/5 [&_svg]:size-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The area a demo plays in: a plain surface, no texture behind it. */
export function DemoStage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("relative", className)}>{children}</div>;
}

/**
 * The one control a feature card has, in a strip of fixed height along the
 * bottom of its demo, so neighbouring cards line up.
 */
export function ControlBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-12 shrink-0 items-center gap-3 border-t border-border/70 px-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Corner tag on demos whose numbers are made up. */
export function ExampleTag() {
  return (
    <Readout className="absolute top-3 right-4 rounded-full border border-border/70 bg-background/70 px-2 py-0.5">
      example data
    </Readout>
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
