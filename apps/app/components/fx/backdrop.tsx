import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";

interface BackdropProps {
  className?: string;
  /** One ASCII field, optionally with a gradient (MeshGradient, Aurora…) under it. */
  children: ReactNode;
}

/**
 * The single decorative layer behind a section. It fills its (relative)
 * parent, clips its children and ignores the pointer; the effects inside
 * listen on the parent instead, so content on top stays interactive. Size it
 * with className (e.g. `bottom-auto h-[56rem]`) to keep canvases small on
 * tall sections.
 */
export function Backdrop({ className, children }: BackdropProps) {
  return (
    <div
      aria-hidden="true"
      data-backdrop=""
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
