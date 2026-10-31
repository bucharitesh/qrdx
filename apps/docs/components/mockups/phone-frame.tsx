import { cn } from "@repo/design-system/lib/utils";
import type { ReactNode } from "react";

interface PhoneFrameProps {
  children: ReactNode;
  className?: string;
}

/**
 * Modern phone bezel (9:19.5) that scales with its width. The screen fills
 * below a status-bar strip, so pass content that covers the area, e.g. a
 * MockupImage with `className="h-full object-cover object-top"`.
 */
export function PhoneFrame({ children, className }: PhoneFrameProps) {
  return (
    <div
      className={cn(
        "relative aspect-[9/19.5] bg-neutral-900 p-[3.5%] shadow-2xl shadow-black/25 ring-1 ring-black/10 dark:bg-neutral-800 dark:ring-white/15",
        className,
      )}
      style={{ borderRadius: "15% / 7%" }}
    >
      <span
        aria-hidden="true"
        className="absolute top-[17%] -left-[1.5%] h-[5%] w-[1.5%] rounded-l-sm bg-neutral-800 dark:bg-neutral-700"
      />
      <span
        aria-hidden="true"
        className="absolute top-[24%] -left-[1.5%] h-[8%] w-[1.5%] rounded-l-sm bg-neutral-800 dark:bg-neutral-700"
      />
      <span
        aria-hidden="true"
        className="absolute top-[22%] -right-[1.5%] h-[11%] w-[1.5%] rounded-r-sm bg-neutral-800 dark:bg-neutral-700"
      />
      <div
        className="relative flex size-full flex-col overflow-hidden bg-background"
        style={{ borderRadius: "12% / 5.6%" }}
      >
        <div aria-hidden="true" className="relative h-[6%] shrink-0">
          <span className="absolute top-[30%] left-1/2 h-[52%] w-[30%] -translate-x-1/2 rounded-full bg-neutral-950" />
        </div>
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
