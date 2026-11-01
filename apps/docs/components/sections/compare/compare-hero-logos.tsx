import { Badge } from "@repo/design-system/components/ui/badge";
import { cn } from "@repo/design-system/lib/utils";
import { EASE_CLASS } from "@/components/mockups/motion";
import { QrdxLogo } from "@/components/qrdx-logo";
import { CompetitorLogo } from "@/components/sections/compare/competitor-logo";

interface CompareHeroLogosProps {
  slug: string;
  competitor: string;
}

/** Rises in on load, in CSS (no script, nothing hidden before hydration). */
const ENTER = cn(
  "animate-in fade-in-0 slide-in-from-bottom-3 fill-mode-both duration-450 motion-reduce:animate-none",
  EASE_CLASS,
);

/** QRdx and the competitor on matching white tiles, with a "vs" between. */
export function CompareHeroLogos({ slug, competitor }: CompareHeroLogosProps) {
  return (
    <div className="flex items-center gap-4 md:gap-6">
      <div className={ENTER}>
        <span className="grid size-20 place-items-center rounded-full bg-white p-5 text-neutral-950 shadow-lg ring-1 shadow-black/5 ring-black/5 md:size-24 md:p-6 dark:shadow-black/40 dark:ring-white/10">
          <QrdxLogo className="size-full" />
          <span className="sr-only">QRdx</span>
        </span>
      </div>
      <div className={cn(ENTER, "delay-80")}>
        <Badge
          className="bg-background text-muted-foreground"
          variant="outline"
        >
          vs
        </Badge>
      </div>
      <div className={cn(ENTER, "delay-160")}>
        <CompetitorLogo
          className="shadow-lg shadow-black/5 dark:shadow-black/40"
          name={competitor}
          size="lg"
          slug={slug}
        />
      </div>
    </div>
  );
}
