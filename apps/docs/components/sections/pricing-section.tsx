"use client";

import { authClient } from "@repo/auth/client";
import { toast } from "@repo/design-system";
import {
  GithubLogo,
  Spinner,
  Tick,
} from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { cn } from "@repo/design-system/lib/utils";
import { Book1, Driver } from "iconsax-reactjs";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createCheckout } from "@/actions/checkout";
import { AsciiField, RadialHalo } from "@/components/fx";
import { EASE_CLASS } from "@/components/mockups/motion";
import { useSlidingPill } from "@/components/mockups/sliding-pill";
import { maxYearlySavingsPercent } from "@/components/sections/pricing/plan-content";
import { siteConfig } from "@/config/site";
import { track } from "@/lib/analytics";
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
  const { pill, capture } = useSlidingPill();
  return (
    <fieldset className="flex h-10 w-fit items-center rounded-full border bg-muted/60 p-1">
      <legend className="sr-only">Billing period</legend>
      {BILLING_INTERVALS.map((option) => (
        <button
          aria-pressed={interval === option}
          className="relative flex h-8 cursor-pointer items-center rounded-full px-4 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          key={option}
          onClick={() => {
            if (interval !== option) capture();
            onChange(option);
          }}
          type="button"
        >
          {interval === option && (
            <span
              className="absolute inset-0 rounded-full bg-background shadow-xs ring-1 ring-border dark:bg-accent"
              ref={pill}
            />
          )}
          <span
            className={cn(
              "relative flex items-center gap-2 text-sm font-medium transition-colors",
              interval === option
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {INTERVAL_LABELS[option]}
            {option === "year" && savings > 0 && (
              <SavingsBadge>Save up to {savings}%</SavingsBadge>
            )}
          </span>
        </button>
      ))}
    </fieldset>
  );
}

function SavingsBadge({ children }: { children: React.ReactNode }) {
  return (
    <Badge className="border-transparent bg-emerald-500/10 text-emerald-700 tabular-nums dark:text-emerald-400">
      {children}
    </Badge>
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
        className="font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
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

function FeatureList({ items, lead }: { items: string[]; lead?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {lead && <p className="text-sm font-medium">{lead}</p>}
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li className="flex items-start gap-2.5 text-sm" key={item}>
            <Tick
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              strokeWidth={2}
            />
            <span className="text-foreground/90">{item}</span>
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
  toggled,
}: {
  plan: Plan;
  interval: BillingInterval;
  currency: PricingCurrency;
  /** True once the visitor has switched the billing period. */
  toggled: boolean;
}) {
  if (plan === "free") {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold tracking-tight tabular-nums">
            {formatPrice(0, currency)}
          </span>
          <span className="text-sm text-muted-foreground">forever</span>
        </p>
        <p className="text-xs text-muted-foreground">No credit card needed</p>
      </div>
    );
  }

  const amount = PRICING[plan][interval].amounts[currency];
  const monthly = PRICING[plan].month.amounts[currency];
  const savings = Math.round((1 - amount / (monthly * 12)) * 100);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span
          className={cn(
            "text-4xl font-semibold tracking-tight tabular-nums",
            // Server HTML shows the price; only later changes animate in.
            toggled &&
              "animate-in fade-in-0 slide-in-from-bottom-1 duration-220 motion-reduce:animate-none",
            toggled && EASE_CLASS,
          )}
          key={`${interval}-${currency}`}
        >
          {formatPrice(amount, currency)}
        </span>
        <span className="text-sm text-muted-foreground">
          /{interval === "year" ? "year" : "month"}
        </span>
        {interval === "year" && savings > 0 && (
          <span className="ml-1 self-center">
            <SavingsBadge>Save {savings}%</SavingsBadge>
          </span>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {interval === "year"
          ? `About ${formatPrice(Math.round(amount / 12), currency)} a month, billed yearly`
          : "Billed monthly, cancel anytime"}
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
  const [toggled, setToggled] = useState(false);
  const changeInterval = (next: BillingInterval) => {
    setToggled(true);
    setInterval(next);
  };
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
        track("checkout_started", { plan, interval: billing });
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
    track("upgrade_clicked", { source: "pricing", plan });
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
              <Spinner aria-hidden />
              Redirecting…
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
      <div className="relative w-full overflow-hidden">
        <AsciiField
          variant="ramp"
          focus={[1, 0]}
          className="[mask-image:linear-gradient(to_bottom,black_45%,transparent)]"
        />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-3 px-6 pt-14 pb-10 text-center md:pt-20">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Pricing
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            {pricing.title}
          </h1>
          <p className="max-w-xl text-pretty text-muted-foreground md:text-lg">
            {pricing.description}
          </p>
          <div className="mt-5 flex flex-col items-center gap-3">
            <BillingToggle
              interval={interval}
              onChange={changeInterval}
              savings={maxYearlySavingsPercent(currency)}
            />
            <CurrencyNote currency={currency} />
          </div>
        </div>
      </div>

      <div className="relative grid w-full max-w-6xl gap-4 px-6 md:grid-cols-3">
        {/* The Pro card (the middle one, also when stacked) sits in a soft light. */}
        <RadialHalo className="-inset-y-32" width={760} height={1000} />
        {cards.map(({ plan, lead, action }) => {
          const popular = plan === "pro";
          return (
            <Card
              className={cn(
                "relative p-6",
                popular
                  ? "border-foreground/20 shadow-lg shadow-black/[0.06] dark:border-white/20 dark:bg-accent/60 dark:shadow-black/40"
                  : "bg-muted/40 shadow-none dark:bg-card",
              )}
              key={plan}
            >
              {popular && (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-foreground/60 to-transparent"
                />
              )}
              <div className="flex flex-col gap-1.5">
                <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                  {PLAN_NAMES[plan]}
                  {popular && <Badge>Popular</Badge>}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {pricing.tiers[plan].tagline}
                </p>
              </div>
              <PriceLine
                currency={currency}
                interval={interval}
                plan={plan}
                toggled={toggled}
              />
              <div className="flex flex-col gap-2">
                {action.button}
                {action.caption && (
                  <p className="text-center text-xs text-muted-foreground">
                    {action.caption}
                  </p>
                )}
              </div>
              <hr className="border-border" />
              <FeatureList items={highlights[plan]} lead={lead} />
            </Card>
          );
        })}
      </div>

      <div className="mt-4 w-full max-w-6xl px-6">
        <Card className="gap-4 bg-muted/40 p-5 shadow-none md:flex-row md:items-center md:justify-between dark:bg-card">
          <div className="flex items-start gap-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-muted/40">
              <Driver aria-hidden className="size-4 text-foreground/80" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="flex flex-wrap items-baseline gap-x-2 font-semibold tracking-tight">
                {pricing.selfHost.title}
                <span className="text-sm font-normal text-muted-foreground">
                  {formatPrice(0, currency)} · {pricing.selfHost.license}
                </span>
              </h2>
              <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
                {pricing.selfHost.description}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 pl-13 md:pl-0">
            <Button asChild size="sm" variant="outline">
              <Link href="/docs/self-hosting">
                <Book1 aria-hidden />
                Self-hosting guide
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href={siteConfig.links.github} rel="noopener" target="_blank">
                <GithubLogo aria-hidden />
                GitHub
              </a>
            </Button>
          </div>
        </Card>
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-pretty text-muted-foreground">
          {pricing.footnote}
        </p>
      </div>
    </section>
  );
}
