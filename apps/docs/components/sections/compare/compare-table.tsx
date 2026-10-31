import { Close, Tick } from "@repo/design-system/components/icons";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { Minus } from "iconsax-reactjs";
import { QrdxLogo } from "@/components/qrdx-logo";
import { CompetitorLogo } from "@/components/sections/compare/competitor-logo";

export interface TableRow {
  feature: string;
  tooltip?: string;
  qrdx: string | boolean;
  competitor: string | boolean;
}

interface CompareTableProps {
  slug: string;
  competitor: string;
  qrdxPlan: string;
  competitorPlan: string;
  rows: TableRow[];
}

function CellValue({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <>
        <Tick aria-hidden className="size-4 text-foreground" strokeWidth={2} />
        <span className="sr-only">Yes</span>
      </>
    ) : (
      <>
        <Close aria-hidden className="size-4 text-muted-foreground/70" />
        <span className="sr-only">No</span>
      </>
    );
  }

  if (value === "—") {
    return (
      <>
        <Minus aria-hidden className="size-4 text-muted-foreground/60" />
        <span className="sr-only">Not applicable</span>
      </>
    );
  }

  return <span className="text-sm text-foreground/90">{value}</span>;
}

const GRID =
  "grid grid-cols-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]";

export function CompareTable({
  slug,
  competitor,
  qrdxPlan,
  competitorPlan,
  rows,
}: CompareTableProps) {
  return (
    <section
      aria-labelledby="at-a-glance"
      className="w-full scroll-mt-20 px-6 py-14 md:py-16"
      id="at-a-glance"
    >
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          QRdx vs {competitor} at a glance
        </h2>
        <p className="text-pretty text-muted-foreground">
          Pricing, design options and developer tooling side by side. Where{" "}
          {competitor} is ahead, the table says so.
        </p>
      </div>

      <Card className="mx-auto mt-10 max-w-4xl gap-0 overflow-hidden py-0 shadow-xs">
        <div className={cn(GRID, "items-end bg-muted/40")}>
          <div className="p-4 text-sm font-medium text-muted-foreground max-md:hidden">
            Feature
          </div>
          <div className="flex flex-col items-start gap-2 p-4">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-8 place-items-center rounded-full bg-white p-1.5 text-neutral-950 ring-1 ring-black/5 dark:ring-white/10">
                <QrdxLogo className="size-full" />
              </span>
              QRdx
            </span>
            <span className="text-xs text-muted-foreground">{qrdxPlan}</span>
          </div>
          <div className="flex flex-col items-start gap-2 p-4">
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
              <CompetitorLogo name={competitor} size="sm" slug={slug} />
              <span className="truncate">{competitor}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {competitorPlan}
            </span>
          </div>
        </div>

        {rows.map((row) => (
          <div className={cn(GRID, "border-t")} key={row.feature}>
            <div className="p-4 text-sm font-medium max-md:col-span-2 max-md:pb-0">
              {row.feature}
            </div>
            <div className="flex items-start p-4">
              <CellValue value={row.qrdx} />
            </div>
            <div className="flex items-start p-4">
              <CellValue value={row.competitor} />
            </div>
          </div>
        ))}
      </Card>
    </section>
  );
}
