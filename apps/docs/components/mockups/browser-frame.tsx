import { cn } from "@repo/design-system/lib/utils";
import { Lock } from "iconsax-reactjs";
import type { ReactNode } from "react";

interface BrowserFrameProps {
  /** Address shown in the URL bar, without the protocol, e.g. "qrdx.dev/playground". */
  url: string;
  children: ReactNode;
  className?: string;
}

/** macOS-style browser window around a screenshot. The chrome is decorative. */
export function BrowserFrame({ url, children, className }: BrowserFrameProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-background shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-24px_rgba(0,0,0,0.25)] dark:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.7)]",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-8 items-center gap-3 border-b border-border bg-muted/50 px-3 md:h-10 md:px-4"
      >
        <div className="flex w-10 shrink-0 gap-1.5 md:w-12">
          <span className="size-2 rounded-full bg-foreground/15 md:size-2.5" />
          <span className="size-2 rounded-full bg-foreground/15 md:size-2.5" />
          <span className="size-2 rounded-full bg-foreground/15 md:size-2.5" />
        </div>
        <div className="mx-auto flex h-5 min-w-0 max-w-xs flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-background px-2 font-mono text-[10px] text-muted-foreground md:h-6 md:text-[11px]">
          <Lock className="size-2.5 shrink-0 md:size-3" />
          <span className="truncate">{url}</span>
        </div>
        <div className="w-10 shrink-0 md:w-12" />
      </div>
      {children}
    </div>
  );
}
