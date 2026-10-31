import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowRight,
  CalendarTick,
  Forbidden2,
  type Icon,
  Import,
  Link2,
  ScanBarcode,
  ShieldTick,
} from "iconsax-reactjs";
import Link from "next/link";

export const GUARANTEE_NAME = "Never-Hostage Guarantee";

export interface GuaranteePromise {
  icon: Icon;
  title: string;
  body: string;
}

/** The guarantee's promises; app/(home)/guarantee renders the full page. */
export const GUARANTEE_PROMISES: GuaranteePromise[] = [
  {
    icon: ScanBarcode,
    title: "Static codes are free forever",
    body: "Make, style and download static QR codes without an account. They hold your content directly, never expire and never pass through our servers.",
  },
  {
    icon: Link2,
    title: "Dynamic codes keep redirecting",
    body: "Every dynamic code keeps working on every plan, including after a downgrade, a failed payment or a cancellation.",
  },
  {
    icon: Forbidden2,
    title: "No pausing, no ads",
    body: "We never pause your codes over billing, show ads or interstitials, or send your scanners through a QRdx page.",
  },
  {
    icon: ShieldTick,
    title: "Limits only stop new things",
    body: "Going over a limit blocks creating more. Existing codes and pages keep working, and you can still change where your codes point.",
  },
  {
    icon: Import,
    title: "Export everything",
    body: "Download any code as SVG or PNG, export its scans as CSV, and read your codes through the REST API, on every plan.",
  },
  {
    icon: CalendarTick,
    title: "12 months' notice",
    body: "If QRdx ever shuts down, you get at least 12 months' notice and a documented path to run the open-source app yourself.",
  },
];

/** Short version for the pricing page. */
export function GuaranteeBlock({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="guarantee"
      className={cn("w-full px-6 py-16 md:py-20", className)}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <ShieldTick aria-hidden className="size-4" variant="Bold" />
              On every plan, including Free
            </p>
            <h2
              id="guarantee"
              className="text-2xl font-semibold tracking-tight text-balance md:text-3xl"
            >
              The {GUARANTEE_NAME}
            </h2>
            <p className="text-pretty text-muted-foreground">
              Printed codes outlive subscriptions. Whatever happens to your
              plan, the codes you printed keep working.
            </p>
          </div>
          <Link
            className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
            href="/guarantee"
          >
            Read the full guarantee
            <ArrowRight
              aria-hidden
              className="size-4 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GUARANTEE_PROMISES.map((promise) => (
            <li key={promise.title}>
              <Card className="h-full gap-3 p-5 shadow-xs">
                <span className="grid size-9 place-items-center rounded-full border bg-muted/40">
                  <promise.icon
                    aria-hidden
                    className="size-4 text-foreground/80"
                  />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-medium tracking-tight">
                    {promise.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                    {promise.body}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
