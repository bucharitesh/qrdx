import { cn } from "@repo/design-system/lib/utils";
import type { CSSProperties, ReactNode } from "react";
import type { LandingPageContent } from "@/types/landing";
import { LandingRender } from "./render";

/** Layout width of a preview before scaling: a typical phone. */
const PAGE_WIDTH = 390;

// Scale = box width / page width, with CSS alone: tan(atan2(a, b)) is a / b as
// a plain number, and container units give the box size. So the preview
// renders on the server, needs no script and never shifts layout.
const SCALED: CSSProperties = {
  width: PAGE_WIDTH,
  transform: `scale(tan(atan2(100cqw, ${PAGE_WIDTH}px)))`,
  height: `calc(100cqh * tan(atan2(${PAGE_WIDTH}px, 100cqw)))`,
};

/**
 * A template drawn at phone width and scaled down to fill its box (template
 * gallery and picker thumbnails). Give it a size, e.g. "aspect-[9/16] w-full".
 * Not interactive: links and fields are inert and hidden from screen readers.
 * Off-screen previews skip rendering (content-visibility) and their images
 * load lazily.
 */
export function TemplatePreview({
  content,
  className,
}: {
  content: LandingPageContent;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none relative overflow-hidden select-none [container-type:size] [content-visibility:auto]",
        className,
      )}
      inert
    >
      <div className="absolute top-0 left-0 origin-top-left" style={SCALED}>
        <LandingRender
          content={content}
          context={{
            theme: content.theme,
            mode: "live",
            demo: true,
            thumbnail: true,
            pageId: null,
            qrCodeId: null,
          }}
          fill="container"
        />
      </div>
    </div>
  );
}

/**
 * A phone around a preview: soft bezel, screen corners and a small island.
 * Purely visual; put links beside it, not inside (previews contain links).
 */
export function PhoneFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-[2.25rem] bg-foreground/[0.04] p-[7px] ring-1 ring-border dark:bg-white/[0.04]",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-[1.85rem] bg-muted ring-1 ring-black/5 dark:ring-white/5">
        {children}
        <span
          aria-hidden="true"
          className="absolute top-2.5 left-1/2 h-[1.15rem] w-[28%] -translate-x-1/2 rounded-full bg-black/90"
        />
      </div>
    </div>
  );
}
