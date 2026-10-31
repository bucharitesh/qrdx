"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { Check, Github, Loader2, Server } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createCheckout } from "@/actions/checkout";
import { maxYearlySavingsPercent } from "@/components/sections/pricing/plan-content";
import { SectionHeader } from "@/components/sections/section-header";
import { siteConfig } from "@/config/site";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import {
  BILLING_INTERVALS,
  type BillingInterval,
  formatPrice,
  PAID_PLANS,
  type PaidPlan,
  PLAN_NAMES,
  type Plan,
  PRICING,
  type PricingCurrency,
} from "@/lib/pricing";
import {
  CURRENCY_COOKIE,
  CURRENCY_COOKIE_MAX_AGE,
  CURRENCY_PARAM,
  overrideForCurrency,
} from "@/lib/region";
import { useAuthStore } from "@/store/auth-store";

interface PricingSectionProps {
  /** Display currency (lib/region); checkout currency is Polar's choice. */
  currency: PricingCurrency;
  /** The signed-in user's own plan; null when signed out. */
  currentPlan: Plan | null;
  /** Card feature lists, built from lib/plans on the server. */
  highlights: Record<Plan, string[]>;
}

const PORTAL_HREF = "/settings/portal";

const INTERVAL_LABELS: Record<BillingInterval, string> = {
  month: "Monthly",
  year: "Yearly",
};

function isPaidPlan(value: unknown): value is PaidPlan {
  return PAID_PLANS.includes(value as PaidPlan);
}

function isInterval(value: unknown): value is BillingInterval {
  return BILLING_INTERVALS.includes(value as BillingInterval);
}

function BillingToggle({
  interval,
  onChange,
  savings,
}: {
  interval: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  savings: number;
}) {
  return (
    <fieldset className="flex h-10 w-fit items-center rounded-full border bg-muted p-0.5">
      <legend className="sr-only">Billing period</legend>
      {BILLING_INTERVALS.map((option) => (
        <button
          aria-pressed={interval === option}
          className="relative flex h-9 cursor-pointer items-center rounded-full px-4"
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {interval === option && (
            <motion.span
              className="absolute inset-0 rounded-full border border-border bg-white shadow-sm dark:bg-[#3F3F46]"
              layoutId="billing-interval"
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            />
          )}
          <span
            className={cn(
              "relative flex items-center gap-2 text-sm font-medium",
              interval === option
                ? "text-secondary-foreground"
                : "text-muted-foreground",
            )}
          >
            {INTERVAL_LABELS[option]}
            {option === "year" && savings > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary">
                Save up to {savings}%
              </span>
            )}
          </span>
        </button>
      ))}
    </fieldset>
  );
}

/** "Prices in ₹ for India" note with a switch; the choice is kept in a cookie. */
function CurrencyNote({ currency }: { currency: PricingCurrency }) {
  const next: PricingCurrency = currency === "INR" ? "USD" : "INR";
  const value = overrideForCurrency(next);

  const remember = () => {
    try {
      // biome-ignore lint/suspicious/noDocumentCookie: a display preference; the server reads it on the next render
      document.cookie = `${CURRENCY_COOKIE}=${value}; path=/; max-age=${CURRENCY_COOKIE_MAX_AGE}; samesite=lax`;
    } catch {
      // Blocked cookies: the ?currency param still applies.
    }
  };

  return (
    <p className="text-center text-sm text-muted-foreground">
      {currency === "INR" ? "Prices in ₹ for India." : "Prices in US$."}{" "}
      <Link
        className="font-medium text-primary underline-offset-4 hover:underline"
        href={`/pricing?${CURRENCY_PARAM}=${value}`}
        onClick={remember}
        replace
        scroll={false}
      >
        {next === "INR" ? "In India? See prices in ₹" : "Show prices in US$"}
      </Link>
    </p>
  );
}

function CheckIcon() {
  return (
    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/15">
      <Check aria-hidden className="size-3 text-primary" strokeWidth={3} />
    </span>
  );
}

function FeatureList({ items, lead }: { items: string[]; lead?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {lead && <p className="text-sm font-medium">{lead}</p>}
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li className="flex items-start gap-2 text-sm" key={item}>
            <CheckIcon />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PriceLine({
  plan,
  interval,
  currency,
}: {
  plan: Plan;
  interval: BillingInterval;
  currency: PricingCurrency;
}) {
  if (plan === "free") {
    return (
      <div className="flex flex-col gap-1">
        <p className="flex items-baseline gap-1">
          <span className="text-4xl font-semibold tracking-tight">
            {formatPrice(0, currency)}
          </span>
          <span className="text-muted-foreground">forever</span>
        </p>
        <p className="text-xs text-muted-foreground">No credit card needed</p>
      </div>
    );
  }

  const amount = PRICING[plan][interval].amounts[currency];
  const monthly = PRICING[plan].month.amounts[currency];
  const savings = Math.round((1 - amount / (monthly * 12)) * 100);

  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-baseline gap-1">
        <motion.span
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-semibold tracking-tight"
          initial={{ opacity: 0, y: 4 }}
          key={`${interval}-${currency}`}
          transition={{ duration: 0.2 }}
        >
          {formatPrice(amount, currency)}
        </motion.span>
        <span className="text-muted-foreground">
          /{interval === "year" ? "year" : "month"}
        </span>
      </p>
      <p className="text-xs text-muted-foreground">
        {interval === "year"
          ? `About ${formatPrice(Math.round(amount / 12), currency)} a month, billed yearly · save ${savings}%`
          : "Billed monthly · cancel anytime"}
      </p>
    </div>
  );
}

export function PricingSection({
  currency,
  currentPlan,
  highlights,
}: PricingSectionProps) {
  const { pricing } = siteConfig;
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [pendingPlan, setPendingPlan] = useState<PaidPlan | null>(null);
  const [isPending, startTransition] = useTransition();
  const { data: session } = authClient.useSession();
  const { openAuthDialog } = useAuthStore();
  const isSignedIn = Boolean(session?.user) || currentPlan !== null;

  const startCheckout = (plan: PaidPlan, billing: BillingInterval) => {
    setPendingPlan(plan);
    startTransition(async () => {
      const result = await createCheckout({ plan, interval: billing });
      if ("url" in result) {
        window.location.assign(result.url);
        return;
      }
      setPendingPlan(null);
      if (result.reason === "sign_in") {
        openAuthDialog("signup", "CHECKOUT", { plan, interval: billing });
        return;
      }
      if (result.reason === "subscribed") {
        toast.error(result.error, {
          action: {
            label: "Open portal",
            onClick: () => window.location.assign(PORTAL_HREF),
          },
        });
        return;
      }
      toast.error(result.error);
    });
  };

  usePostLoginAction<{ plan?: unknown; interval?: unknown }>(
    "CHECKOUT",
    (data) => {
      startCheckout(
        isPaidPlan(data?.plan) ? data.plan : "pro",
        isInterval(data?.interval) ? data.interval : "year",
      );
    },
  );

  const onUpgrade = (plan: PaidPlan) => {
    if (!isSignedIn) {
      openAuthDialog("signup", "CHECKOUT", { plan, interval });
      return;
    }
    startCheckout(plan, interval);
  };

  const paidAction = (plan: PaidPlan) => {
    const tier = pricing.tiers[plan];
    if (!PRICING[plan][interval].productId) {
      return {
        button: (
          <Button className="w-full" disabled variant="outline">
            Coming soon
          </Button>
        ),
        caption: `${PLAN_NAMES[plan]} isn't available for checkout yet.`,
      };
    }
    if (currentPlan === plan) {
      return {
        button: (
          <Button asChild className="w-full" variant="outline">
            {/* Route handler that redirects off-site, so no <Link>. */}
            <a href={PORTAL_HREF}>Manage subscription</a>
          </Button>
        ),
        caption: "This is your current plan.",
      };
    }
    if (currentPlan && currentPlan !== "free") {
      return {
        button: (
          <Button asChild className="w-full" variant="outline">
            <a href={PORTAL_HREF}>Switch to {PLAN_NAMES[plan]}</a>
          </Button>
        ),
        caption: "Plan changes happen in the billing portal.",
      };
    }
    const busy = isPending && pendingPlan === plan;
    return {
      button: (
        <Button
          className="w-full"
          disabled={isPending}
          onClick={() => onUpgrade(plan)}
          variant={plan === "pro" ? "default" : "outline"}
        >
          {busy ? (
            <>
              <Loader2 aria-hidden className="animate-spin" />
              Redirecting...
            </>
          ) : (
            tier.cta
          )}
        </Button>
      ),
      caption: undefined,
    };
  };

  const cards: {
    plan: Plan;
    lead?: string;
    action: { button: React.ReactNode; caption?: string };
  }[] = [
    {
      plan: "free",
      action: {
        button: (
          <Button asChild className="w-full" variant="outline">
            <Link href={isSignedIn ? "/dashboard" : "/playground"}>
              {isSignedIn ? "Go to dashboard" : pricing.tiers.free.cta}
            </Link>
          </Button>
        ),
        caption:
          currentPlan === "free" ? "This is your current plan." : undefined,
      },
    },
    {
      plan: "pro",
      lead: "Everything in Free, plus:",
      action: paidAction("pro"),
    },
    {
      plan: "business",
      lead: "Everything in Pro, plus:",
      action: paidAction("business"),
    },
  ];

  return (
    <section
      className="relative flex w-full flex-col items-center pb-12"
      id="pricing"
    >
      <SectionHeader>
        <h1 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
          {pricing.title}
        </h1>
        <p className="text-muted-foreground text-center text-balance font-medium">
          {pricing.description}
        </p>
      </SectionHeader>

      <div className="flex w-full flex-col items-center gap-3 px-6 pt-10 pb-8">
        <BillingToggle
          interval={interval}
          onChange={setInterval}
          savings={maxYearlySavingsPercent(currency)}
        />
        <CurrencyNote currency={currency} />
      </div>

      <div className="grid w-full max-w-6xl gap-4 px-6 md:grid-cols-3">
        {cards.map(({ plan, lead, action }) => {
          const popular = plan === "pro";
          return (
            <div
              className={cn(
                "relative flex flex-col gap-6 rounded-xl border p-6",
                popular
                  ? "border-primary/40 bg-secondary shadow-lg ring-1 ring-primary/30"
                  : "border-border bg-[#F3F4F6] dark:bg-[#F9FAFB]/2",
              )}
              key={plan}
            >
              <div className="flex flex-col gap-2">
                <h2 className="flex items-center gap-2 text-lg font-medium">
                  {PLAN_NAMES[plan]}
                  {popular && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      Popular
                    </span>
                  )}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {pricing.tiers[plan].tagline}
                </p>
              </div>
              <PriceLine currency={currency} interval={interval} plan={plan} />
              <div className="flex flex-col gap-2">
                {action.button}
                {action.caption && (
                  <p className="text-center text-xs text-muted-foreground">
                    {action.caption}
                  </p>
                )}
              </div>
              <hr className="border-border dark:border-white/20" />
              <FeatureList items={highlights[plan]} lead={lead} />
            </div>
          );
        })}
      </div>

      <div className="mt-4 w-full max-w-6xl px-6">
        <div className="flex flex-col gap-4 rounded-xl border border-dashed border-border p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Server aria-hidden className="size-5 text-muted-foreground" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-medium">
                {pricing.selfHost.title}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  · {formatPrice(0, currency)} · {pricing.selfHost.license}
                </span>
              </h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {pricing.selfHost.description}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/docs/self-hosting">
                <Server aria-hidden />
                Self-hosting guide
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <a href={siteConfig.links.github} rel="noopener" target="_blank">
                <Github aria-hidden />
                GitHub
              </a>
            </Button>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {pricing.footnote}
        </p>
      </div>
    </section>
  );
}
