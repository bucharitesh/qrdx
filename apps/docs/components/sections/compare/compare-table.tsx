import { cn } from "@repo/design-system/lib/utils";
import { Check, Minus, X } from "lucide-react";
import Image from "next/image";
import { QrdxLogo } from "@/components/qrdx-logo";
import { SectionHeader } from "@/components/sections/section-header";

export interface TableRow {
  feature: string;
  tooltip?: string;
  qrdx: string | boolean;
  competitor: string | boolean;
}

interface CompareTableProps {
  competitor: string;
  qrdxPlan: string;
  competitorPlan: string;
  competitorLogo: string;
  rows: TableRow[];
}

function HeaderLogo({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const isSvg = src.endsWith(".svg") || src.includes(".svg?");
  if (isSvg) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn("size-6 object-contain", className)}
        width={24}
        height={24}
      />
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={24}
      height={24}
      className={cn("size-6 object-contain", className)}
    />
  );
}

function CellValue({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <div className="size-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
        <Check className="size-3.5 text-primary" strokeWidth={2.5} />
      </div>
    ) : (
      <div className="size-6 rounded-full bg-muted border border-border flex items-center justify-center">
        <X className="size-3.5 text-muted-foreground" strokeWidth={2.5} />
      </div>
    );
  }

  if (value === "—") {
    return (
      <div className="size-6 flex items-center justify-center">
        <Minus className="size-3.5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <span className="text-sm font-medium text-secondary-foreground">
      {value}
    </span>
  );
}

export function CompareTable({
  competitor,
  qrdxPlan,
  competitorPlan,
  competitorLogo,
  rows,
}: CompareTableProps) {
  return (
    <section className="flex flex-col items-center justify-center w-full">
      <SectionHeader>
        <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
          QRdx vs {competitor}
          <br />
          at a glance
        </h2>
        <p className="text-muted-foreground text-center text-balance font-medium">
          QRdx is a free, open-source QR code library — everything {competitor}{" "}
          charges for, included at no cost.
        </p>
      </SectionHeader>

      <div className="w-full max-w-5xl mx-auto px-6 py-10">
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_120px_120px] md:grid-cols-[1fr_200px_200px] bg-muted/50">
            <div className="p-4 text-sm font-medium text-muted-foreground">
              Compare
            </div>
            <div className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <span className="size-6 flex items-center justify-center text-primary shrink-0">
                  <QrdxLogo className="size-5" />
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{qrdxPlan}</p>
            </div>
            <div className="p-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <HeaderLogo
                  src={competitorLogo}
                  alt={`${competitor} logo`}
                  className="shrink-0"
                />
              </div>
              <p className="text-xs text-muted-foreground">{competitorPlan}</p>
            </div>
          </div>

          {/* Rows */}
          {rows.map((row, i) => (
            <div
              key={row.feature}
              className={cn(
                "grid grid-cols-[1fr_120px_120px] md:grid-cols-[1fr_200px_200px] border-t border-border",
                i % 2 === 0 ? "bg-background" : "bg-muted/20",
              )}
            >
              <div className="p-4 flex items-center">
                <span className="text-sm text-secondary-foreground">
                  {row.feature}
                </span>
              </div>
              <div className="p-4 flex items-center justify-center">
                <CellValue value={row.qrdx} />
              </div>
              <div className="p-4 flex items-center justify-center">
                <CellValue value={row.competitor} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
