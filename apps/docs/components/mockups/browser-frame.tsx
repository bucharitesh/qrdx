import { cn } from "@repo/design-system/lib/utils";
import { Lock } from "lucide-react";
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
        "overflow-hidden rounded-xl border border-border bg-background shadow-xl shadow-black/5 dark:shadow-black/40",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-8 items-center gap-3 border-b border-border bg-muted/70 px-3 md:h-10 md:px-4"
      >
        <div className="flex w-10 shrink-0 gap-1.5 md:w-12">
          <span className="size-2 rounded-full bg-[#ff5f57] md:size-2.5" />
          <span className="size-2 rounded-full bg-[#febc2e] md:size-2.5" />
          <span className="size-2 rounded-full bg-[#28c840] md:size-2.5" />
        </div>
        <div className="mx-auto flex h-5 min-w-0 max-w-xs flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 text-[10px] text-muted-foreground md:h-6 md:text-xs">
          <Lock className="size-2.5 shrink-0 md:size-3" />
          <span className="truncate">{url}</span>
        </div>
        <div className="w-10 shrink-0 md:w-12" />
      </div>
      {children}
    </div>
  );
}
