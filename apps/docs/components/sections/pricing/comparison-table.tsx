import { Tick } from "@repo/design-system/components/icons";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { Minus } from "iconsax-reactjs";
import { PLAN_NAMES, type Plan } from "@/lib/pricing";
import type { CellValue, ComparisonGroup } from "./plan-content";

const COLUMNS: readonly Plan[] = ["free", "pro", "business"];

/** Tints the highlighted plan's column without a brand color. */
const PRO_COLUMN = "bg-foreground/[0.025] dark:bg-foreground/[0.035]";

function Cell({ value }: { value: CellValue }) {
  if (value === true) {
    return (
      <>
        <Tick aria-hidden className="size-4 text-foreground" strokeWidth={2} />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus aria-hidden className="size-4 text-muted-foreground/50" />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return (
    <span
      className={cn(
        "text-sm text-foreground/90",
        value === "Coming soon" && "text-muted-foreground italic",
      )}
    >
      {value}
    </span>
  );
}

export function ComparisonTable({ groups }: { groups: ComparisonGroup[] }) {
  return (
    <section
      aria-labelledby="compare-plans"
      className="flex w-full flex-col items-center px-6 py-16 md:py-20"
    >
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
        <h2
          id="compare-plans"
          className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
        >
          Compare plans
        </h2>
        <p className="text-pretty text-muted-foreground">
          Every limit, side by side. Scans are unlimited on every plan.
        </p>
      </div>

      <div className="mt-10 w-full max-w-5xl">
        <p className="mb-3 text-center text-xs text-muted-foreground md:hidden">
          Scroll sideways to see every plan.
        </p>
        {/* Scrolls sideways on narrow screens; the feature column stays put. */}
        {/* `relative` keeps the sr-only labels (position: absolute) inside
            the scroller, so they can't widen the page on phones. */}
        <Card className="relative gap-0 overflow-x-auto py-0 shadow-xs">
          <table className="w-full min-w-[600px] border-collapse text-left">
            <caption className="sr-only">QRdx plans compared</caption>
            <thead>
              <tr>
                <th
                  className="sticky left-0 z-10 bg-card p-4 text-sm font-medium text-muted-foreground max-md:w-36"
                  scope="col"
                >
                  Feature
                </th>
                {COLUMNS.map((plan) => (
                  <th
                    className={cn(
                      "w-[24%] p-4 text-sm font-semibold",
                      plan === "pro" && PRO_COLUMN,
                    )}
                    key={plan}
                    scope="col"
                  >
                    {PLAN_NAMES[plan]}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.title}>
                <tr className="border-t bg-muted/50">
                  <th
                    className="px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground"
                    colSpan={COLUMNS.length + 1}
                    scope="colgroup"
                  >
                    <span className="sticky left-4">{group.title}</span>
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr className="border-t" key={row.feature}>
                    <th
                      className="sticky left-0 z-10 bg-card p-4 align-top font-normal max-md:w-36"
                      scope="row"
                    >
                      <span className="block text-sm">{row.feature}</span>
                      {row.hint && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {row.hint}
                        </span>
                      )}
                    </th>
                    {COLUMNS.map((plan) => (
                      <td
                        className={cn(
                          "p-4 align-top",
                          plan === "pro" && PRO_COLUMN,
                        )}
                        key={plan}
                      >
                        <Cell value={row.values[plan]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </Card>
      </div>
    </section>
  );
}
