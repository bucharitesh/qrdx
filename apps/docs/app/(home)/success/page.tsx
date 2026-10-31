import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import {
  ArrowRight,
  Global,
  type Icon,
  Profile2User,
  ScanBarcode,
  TickCircle,
} from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { AsciiField, Aurora, Backdrop } from "@/components/fx";
import { PRESSABLE } from "@/components/mockups/motion";
import { SoundCue } from "@/components/sound/sound-cue";

export const metadata: Metadata = {
  title: "Thanks for upgrading",
  robots: { index: false, follow: false },
};

const NEXT_STEPS: {
  icon: Icon;
  title: string;
  description: string;
  href: string;
}[] = [
  {
    icon: ScanBarcode,
    title: "Create dynamic codes",
    description: "Codes you can edit after printing, with scan analytics.",
    href: "/dashboard/codes",
  },
  {
    icon: Global,
    title: "Add a custom domain",
    description: "Serve your short links from your own domain.",
    href: "/dashboard/domains",
  },
  {
    icon: Profile2User,
    title: "Invite your team",
    description: "Share codes, pages and saved themes with teammates.",
    href: "/dashboard/team",
  },
];

export default function SuccessPage() {
  return (
    <main className="relative w-full overflow-hidden">
      <SoundCue name="success" />
      <Backdrop>
        <Aurora tone="neutral" />
        <AsciiField
          variant="halo"
          focus={[0.5, 0.3]}
          className="[mask-image:radial-gradient(ellipse_70%_70%_at_50%_35%,black_40%,transparent_85%)]"
        />
      </Backdrop>
      <div className="relative mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center gap-10 px-6 py-20 text-center">
        <div className="flex flex-col items-center gap-4">
          <span className="grid size-14 place-items-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <TickCircle
              aria-hidden
              className="size-7 text-emerald-600 dark:text-emerald-400"
              variant="Bold"
            />
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Thanks for upgrading
          </h1>
          <p className="max-w-md text-pretty text-muted-foreground">
            Your subscription is active. It can take a minute for your new
            limits to show up in the dashboard.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/dashboard">
                Go to the dashboard
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button asChild variant="outline">
              {/* Route handler that redirects to the billing portal. */}
              <a href="/settings/portal">Manage subscription</a>
            </Button>
          </div>
        </div>

        <ul className="grid w-full gap-4 text-left sm:grid-cols-3">
          {NEXT_STEPS.map((step) => (
            <li key={step.href}>
              <Link
                className="group block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                href={step.href}
              >
                <Card
                  className={cn(
                    "h-full gap-3 p-5 shadow-xs group-hover:border-foreground/15 group-hover:bg-accent/40",
                    PRESSABLE,
                  )}
                >
                  <span className="grid size-9 place-items-center rounded-full border bg-muted/40">
                    <step.icon
                      aria-hidden
                      className="size-4 text-foreground/80"
                    />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                      {step.title}
                      <ArrowRight
                        aria-hidden
                        className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      />
                    </h2>
                    <p className="text-sm text-pretty text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
