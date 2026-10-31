import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowRight,
  Ban,
  CalendarClock,
  Download,
  Link2,
  type LucideIcon,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

export const GUARANTEE_NAME = "Never-Hostage Guarantee";

export interface GuaranteePromise {
  icon: LucideIcon;
  title: string;
  body: string;
}

/** The guarantee's promises; app/(home)/guarantee renders the full page. */
export const GUARANTEE_PROMISES: GuaranteePromise[] = [
  {
    icon: QrCode,
    title: "Static codes are free forever",
    body: "Make, style and download static QR codes without an account. They hold your content directly, never expire and never pass through our servers.",
  },
  {
    icon: Link2,
    title: "Dynamic codes keep redirecting",
    body: "Every dynamic code keeps working on every plan, including after a downgrade, a failed payment or a cancellation.",
  },
  {
    icon: Ban,
    title: "No pausing, no ads",
    body: "We never pause your codes over billing, show ads or interstitials, or send your scanners through a QRdx page.",
  },
  {
    icon: ShieldCheck,
    title: "Limits only stop new things",
    body: "Going over a limit blocks creating more. Existing codes and pages keep working, and you can still change where your codes point.",
  },
  {
    icon: Download,
    title: "Export everything",
    body: "Download any code as SVG or PNG, export its scans as CSV, and read your codes through the REST API, on every plan.",
  },
  {
    icon: CalendarClock,
    title: "12 months' notice",
    body: "If QRdx ever shuts down, you get at least 12 months' notice and a documented path to run the open-source app yourself.",
  },
];

/** Short version for the pricing page. */
export function GuaranteeBlock({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="guarantee"
      className={cn("w-full px-6 md:px-10 py-12", className)}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8 rounded-2xl border border-primary/20 bg-primary/5 p-6 md:p-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <p className="flex items-center gap-2 text-sm font-medium text-primary">
              <ShieldCheck aria-hidden className="size-4" />
              On every plan, including Free
            </p>
            <h2
              id="guarantee"
              className="text-2xl md:text-3xl font-medium tracking-tighter text-secondary-foreground text-balance"
            >
              The {GUARANTEE_NAME}
            </h2>
            <p className="text-muted-foreground text-pretty">
              Printed codes outlive subscriptions. Whatever happens to your
              plan, the codes you printed keep working.
            </p>
          </div>
          <Link
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            href="/guarantee"
          >
            Read the full guarantee
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GUARANTEE_PROMISES.map((promise) => (
            <li
              className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4"
              key={promise.title}
            >
              <promise.icon aria-hidden className="size-5 text-primary" />
              <h3 className="font-medium text-secondary-foreground">
                {promise.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {promise.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
