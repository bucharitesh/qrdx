import { cn } from "@repo/design-system/lib/utils";
import { Check, Minus } from "lucide-react";
import { SectionHeader } from "@/components/sections/section-header";
import { PLAN_NAMES, type Plan } from "@/lib/pricing";
import type { CellValue, ComparisonGroup } from "./plan-content";

const COLUMNS: readonly Plan[] = ["free", "pro", "business"];

function Cell({ value }: { value: CellValue }) {
  if (value === true) {
    return (
      <>
        <Check aria-hidden className="size-4 text-primary" strokeWidth={2.5} />
        <span className="sr-only">Included</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus aria-hidden className="size-4 text-muted-foreground/60" />
        <span className="sr-only">Not included</span>
      </>
    );
  }
  return (
    <span
      className={cn(
        "text-sm text-secondary-foreground",
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
      className="flex w-full flex-col items-center"
    >
      <SectionHeader>
        <h2
          id="compare-plans"
          className="text-2xl md:text-3xl font-medium tracking-tighter text-center text-balance"
        >
          Compare plans
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          Every limit, side by side. Scans are unlimited on every plan.
        </p>
      </SectionHeader>

      <div className="w-full max-w-5xl px-6 py-10">
        {/* Scrolls sideways on narrow screens instead of the whole page. */}
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <caption className="sr-only">QRdx plans compared</caption>
            <thead className="bg-muted/50">
              <tr>
                <th
                  className="p-4 text-sm font-medium text-muted-foreground"
                  scope="col"
                >
                  Feature
                </th>
                {COLUMNS.map((plan) => (
                  <th
                    className={cn(
                      "w-[24%] p-4 text-sm font-semibold text-secondary-foreground",
                      plan === "pro" && "bg-primary/5",
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
                <tr className="border-t border-border bg-muted/30">
                  <th
                    className="px-4 pt-5 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    colSpan={COLUMNS.length + 1}
                    scope="colgroup"
                  >
                    {group.title}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr className="border-t border-border" key={row.feature}>
                    <th className="p-4 align-top font-normal" scope="row">
                      <span className="block text-sm text-secondary-foreground">
                        {row.feature}
                      </span>
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
                          plan === "pro" && "bg-primary/5",
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
        </div>
      </div>
    </section>
  );
}
