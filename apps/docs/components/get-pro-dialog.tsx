"use client";

import { Tick } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { cn } from "@repo/design-system/lib/utils";
import { ShieldTick } from "iconsax-reactjs";
import Link from "next/link";
import { QRCodeSVG } from "qrdx";
import { GridLines } from "@/components/fx";
import { track } from "@/lib/analytics";
import { easterEggUrl } from "@/lib/easter-eggs";
import { PAID_PLANS, type PaidPlan, PLAN_NAMES } from "@/lib/pricing";

// Headline features; the pricing page lists every limit (from lib/plans).
const PLAN_FEATURES: Record<PaidPlan, string[]> = {
  pro: [
    "Unlimited dynamic codes and landing pages",
    "3 years of analytics history",
    "5 custom domains and teams of up to 3",
    "Unlimited saved themes, shared with your team",
    "Smart routing, A/B tests, UTM tags and pixels",
  ],
  business: [
    "Everything in Pro",
    "White-label pages with custom CSS",
    "25 custom domains and unlimited team members",
    "Conversion tracking and webhooks",
  ],
};

interface GetProDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The plan the locked feature needs; it's highlighted. */
  plan?: PaidPlan;
}

export function GetProDialog({
  isOpen,
  onClose,
  plan = "pro",
}: GetProDialogProps) {
  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onClose}>
      <ResponsiveDialogContent
        closeButtonClassName="backdrop-blur-md bg-muted/15"
        className="gap-0 overflow-hidden sm:max-w-lg md:w-[calc(100vw-2rem)] md:max-w-4xl"
      >
        <div className="flex flex-col md:flex-row">
          <section className="w-full space-y-6 border-r md:w-3/5">
            <ResponsiveDialogHeader className="sm:p-6 sm:pb-0">
              <ResponsiveDialogTitle>
                Upgrade to {PLAN_NAMES[plan]}
              </ResponsiveDialogTitle>
              <ResponsiveDialogDescription>
                {plan === "business"
                  ? "This feature is part of the Business plan."
                  : "This feature is part of Pro and Business."}
              </ResponsiveDialogDescription>
            </ResponsiveDialogHeader>

            <div className="grid gap-3 px-6 sm:grid-cols-2">
              {PAID_PLANS.map((tier) => {
                const highlighted = tier === plan;
                return (
                  <Card
                    className={cn(
                      "relative gap-3 p-5",
                      highlighted
                        ? "border-foreground/20 dark:border-white/20 dark:bg-accent/60"
                        : "bg-muted/40 shadow-none dark:bg-card",
                    )}
                    key={tier}
                  >
                    {highlighted && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-foreground/60 to-transparent"
                      />
                    )}
                    <p className="flex items-center justify-between gap-2 font-semibold tracking-tight">
                      {PLAN_NAMES[tier]}
                      {highlighted && (
                        <Badge
                          className="text-muted-foreground"
                          variant="outline"
                        >
                          Unlocks this
                        </Badge>
                      )}
                    </p>
                    <ul className="space-y-2">
                      {PLAN_FEATURES[tier].map((feature) => (
                        <li className="flex items-start gap-2" key={feature}>
                          <Tick
                            aria-hidden
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            strokeWidth={2}
                          />
                          <span className="text-sm text-foreground/90">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>

            <p className="flex items-start gap-2 px-6 text-sm text-muted-foreground">
              <ShieldTick
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                variant="Bold"
              />
              <span>
                Static QR codes stay free, and your codes keep working if you
                ever cancel.{" "}
                <Link
                  className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
                  href="/guarantee"
                  onNavigate={onClose}
                >
                  Our guarantee
                </Link>
              </span>
            </p>

            <ResponsiveDialogFooter className="bg-muted/30 relative flex-col border-t p-6">
              <Button asChild className="grow">
                <Link
                  href="/pricing"
                  onClick={() =>
                    track("upgrade_clicked", { source: "dialog", plan })
                  }
                  onNavigate={onClose}
                >
                  Compare plans and prices
                </Link>
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Maybe later
              </Button>
            </ResponsiveDialogFooter>
          </section>

          {/* Decorative, md+ only */}
          <section className="bg-muted/30 relative isolate hidden shrink-0 overflow-hidden md:block md:w-2/5">
            <GridLines cell={32} />
            <div className="absolute inset-0 grid place-items-center p-8">
              <div className="rounded-2xl border bg-white p-4 shadow-lg shadow-black/10 dark:shadow-black/50">
                <QRCodeSVG
                  bodyPattern="circle"
                  cornerEyeDotPattern="circle"
                  cornerEyePattern="rounded"
                  size={176}
                  value={easterEggUrl("pro")}
                />
              </div>
            </div>
          </section>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
