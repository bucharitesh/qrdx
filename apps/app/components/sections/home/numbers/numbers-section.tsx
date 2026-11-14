import { cn } from "@repo/design-system/lib/utils";
import { HOME_NUMBERS_REVALIDATE } from "@/lib/home-numbers/load";
import type { HomeNumbers } from "@/lib/home-numbers/stats";
import { NumbersTabs } from "./numbers-tabs";

// "QRdx in numbers": real counts from the database (lib/home-numbers),
// shown on the home page only when QRDX_HOME_NUMBERS=1 (home-numbers.tsx)
// and previewed by admins at /admin/numbers.

export const HOME_NUMBERS_HEADING_ID = "home-numbers-heading";

const REFRESH_HOURS = HOME_NUMBERS_REVALIDATE / 3600;

const DOT =
  "absolute size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/40";
const HATCH =
  "absolute size-6 text-foreground/10 bg-[size:6px_6px] [background-image:repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)] md:size-8";

/** Corner dots, dots where the column line meets the frame, hatched corners. */
function FrameMarks() {
  return (
    <div aria-hidden="true" className="pointer-events-none">
      <span className={cn(HATCH, "-top-6 -left-6 md:-top-8 md:-left-8")} />
      <span className={cn(HATCH, "-top-6 -right-6 md:-top-8 md:-right-8")} />
      <span
        className={cn(HATCH, "-bottom-6 -left-6 md:-bottom-8 md:-left-8")}
      />
      <span
        className={cn(HATCH, "-right-6 -bottom-6 md:-right-8 md:-bottom-8")}
      />
      <span className={cn(DOT, "top-0 left-0")} />
      <span className={cn(DOT, "top-0 left-full")} />
      <span className={cn(DOT, "top-full left-0")} />
      <span className={cn(DOT, "top-full left-full")} />
      <span className={cn(DOT, "top-0 left-1/2 hidden @3xl/numbers:block")} />
      <span
        className={cn(DOT, "top-full left-1/2 hidden @3xl/numbers:block")}
      />
    </div>
  );
}

export function NumbersSection({ numbers }: { numbers: HomeNumbers }) {
  return (
    <section
      id="numbers"
      aria-labelledby={HOME_NUMBERS_HEADING_ID}
      className="w-full px-10 py-14 md:px-16 md:py-20"
    >
      <div className="@container/numbers relative border">
        <FrameMarks />
        <NumbersTabs
          items={numbers.items}
          labelledBy={HOME_NUMBERS_HEADING_ID}
          intro={
            <div className="flex flex-col gap-2 pr-6 @3xl/numbers:pr-10">
              <h2
                id={HOME_NUMBERS_HEADING_ID}
                className="text-3xl font-medium tracking-tighter text-balance @3xl/numbers:text-4xl"
              >
                QRdx in numbers
              </h2>
              <p className="font-medium text-pretty text-muted-foreground">
                Counted from our database every {REFRESH_HOURS} hours, rounded
                down.
              </p>
            </div>
          }
        />
      </div>
    </section>
  );
}
