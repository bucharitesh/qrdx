"use client";

import { Button } from "@repo/design-system/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@repo/design-system/components/ui/revola";
import { cn } from "@repo/design-system/lib/utils";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrdx";
import { Icons } from "@/components/icons";
import { PAID_PLANS, type PaidPlan, PLAN_NAMES } from "@/lib/pricing";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { NoiseEffect } from "./effects/noise-effect";

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

export function GetProDialogWrapper() {
  const { isOpen, plan, closeGetProDialog } = useGetProDialogStore();

  return (
    <GetProDialog isOpen={isOpen} onClose={closeGetProDialog} plan={plan} />
  );
}

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
              {PAID_PLANS.map((tier) => (
                <div
                  className={cn(
                    "flex flex-col gap-3 rounded-lg border p-4",
                    tier === plan
                      ? "border-primary/40 bg-primary/5 ring-1 ring-primary/30"
                      : "border-border",
                  )}
                  key={tier}
                >
                  <p className="font-medium">{PLAN_NAMES[tier]}</p>
                  <ul className="space-y-2">
                    {PLAN_FEATURES[tier].map((feature) => (
                      <li className="flex items-start gap-2" key={feature}>
                        <span className="mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-primary/15 p-0.5">
                          <Icons.Check className="size-3 stroke-2 text-primary" />
                        </span>
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <p className="flex items-start gap-2 px-6 text-sm text-muted-foreground">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                Static QR codes stay free, and your codes keep working if you
                ever cancel.{" "}
                <Link
                  className="underline"
                  href="/guarantee"
                  onNavigate={onClose}
                >
                  Our guarantee
                </Link>
              </span>
            </p>

            <ResponsiveDialogFooter className="bg-muted/30 relative flex-col border-t p-6">
              <Button asChild className="grow">
                <Link href="/pricing" onNavigate={onClose}>
                  Compare plans and prices
                </Link>
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Maybe later
              </Button>
            </ResponsiveDialogFooter>
          </section>

          {/* Decorative, md+ only */}
          <section className="bg-muted/30 relative isolate hidden shrink-0 items-center justify-center overflow-hidden md:block md:w-2/5">
            <div
              className={cn(
                "absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(from_var(--primary)_r_g_b_/_0.25)_1px,transparent_1px),linear-gradient(to_bottom,rgba(from_var(--primary)_r_g_b_/_0.25)_1px,transparent_1px)] bg-[size:2rem_2rem]",
                "mask-r-from-80% mask-b-from-80% mask-radial-from-70% mask-radial-to-85%",
              )}
            />
            <NoiseEffect />
            <div className="bg-foreground/10 absolute top-0 left-0 -z-10 size-35 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full blur-3xl" />
            <div className="bg-primary/15 absolute right-0 bottom-0 -z-10 size-70 translate-x-1/2 translate-y-1/2 rounded-full blur-3xl" />

            <div className="absolute inset-4 top-4 z-10 flex items-center justify-center overflow-hidden rounded-lg border lg:inset-6">
              <QRCodeSVG
                bodyPattern="square"
                className="rounded-md"
                cornerEyeDotPattern="square"
                cornerEyePattern="square"
                size={224}
                value="https://qrdx.dev/pricing"
              />
            </div>
          </section>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
