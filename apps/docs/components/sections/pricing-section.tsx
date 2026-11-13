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
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createCheckout } from "@/actions/checkout";
import { useAvailability } from "@/components/availability-provider";
import { AsciiField, RadialHalo } from "@/components/fx";
import { LocaleLink } from "@/components/i18n/locale-link";
import { EASE_CLASS } from "@/components/mockups/motion";
import { useSlidingPill } from "@/components/mockups/sliding-pill";
import { CurrencyNote } from "@/components/sections/pricing/currency-note";
import { EnterpriseCard } from "@/components/sections/pricing/enterprise-card";
import { InvoiceRequestDialog } from "@/components/sections/pricing/invoice-request-dialog";
import { PricingOffers } from "@/components/sections/pricing/pricing-offers";
import { maxYearlySavingsPercent } from "@/components/sections/pricing/savings";
import { siteConfig } from "@/config/site";
import { track } from "@/lib/analytics";
import { usePostLoginAction } from "@/lib/hooks/use-post-login-action";
import { playgroundHref } from "@/lib/playground-links";
import {
  BILLING_INTERVALS,
  type BillingInterval,
  EUR_PRICES,
  formatPrice,
  PAID_PLANS,
  type PaidPlan,
  PLAN_NAMES,
  type Plan,
  PRICING,
  type PricingCurrency,
} from "@/lib/pricing";
import { useAuthStore } from "@/store/auth-store";

interface PricingSectionProps {
  /** Display currency (lib/region); checkout currency is Polar's choice. */
  currency: PricingCurrency;
  /** The signed-in user's own plan; null when signed out. */
  currentPlan: Plan | null;
  /** The intro under the title (buildPricingIntro: only what's offered here). */
  description: string;
  /** Card feature lists, built from lib/plans on the server. */
  highlights: Record<Plan, string[]>;
}

const PORTAL_HREF = "/settings/portal";

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
  const t = useTranslations("pricing.billing");
  const { pill, capture } = useSlidingPill();
  return (
    <fieldset className="flex h-10 w-fit items-center rounded-full border bg-muted/60 p-1">
      <legend className="sr-only">{t("legend")}</legend>
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
            {t(option)}
            {option === "year" && savings > 0 && (
              <SavingsBadge>{t("saveUpTo", { percent: savings })}</SavingsBadge>
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
  const t = useTranslations("pricing");
  const locale = useLocale();
  const price = (amount: number) => formatPrice(amount, currency, locale);
  if (plan === "free") {
    return (
      <div className="flex flex-col gap-1.5">
        <p className="flex items-baseline gap-1.5">
          <span className="text-4xl font-semibold tracking-tight tabular-nums">
            {price(0)}
          </span>
          <span className="text-sm text-muted-foreground">
            {t("price.forever")}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">{t("price.noCard")}</p>
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
          {price(amount)}
        </span>
        <span className="text-sm text-muted-foreground">
          {interval === "year" ? t("price.perYear") : t("price.perMonth")}
        </span>
        {interval === "year" && savings > 0 && (
          <span className="ml-1 self-center">
            <SavingsBadge>
              {t("billing.save", { percent: savings })}
            </SavingsBadge>
          </span>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        {interval === "year"
          ? t("price.aboutMonthly", { price: price(Math.round(amount / 12)) })
          : t("price.billedMonthly")}
      </p>
    </div>
  );
}

export function PricingSection({
  currency,
  currentPlan,
  description,
  highlights,
}: PricingSectionProps) {
  const t = useTranslations("pricing");
  const locale = useLocale();
  // "Free" is translated; "Pro" and "Business" stay in English.
  const planName = (plan: Plan) =>
    plan === "free" ? t("plans.free") : PLAN_NAMES[plan];
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
  // Agency tools: Business yearly can be paid by invoice where QRdx offers it.
  const invoices = useAvailability().has("invoiceRequests");
  const [invoiceOpen, setInvoiceOpen] = useState(false);

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
            label: t("cards.openPortal"),
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
    if (!PRICING[plan][interval].productId) {
      return {
        button: (
          <Button className="w-full" disabled variant="outline">
            {t("cards.comingSoon")}
          </Button>
        ),
        caption: t("cards.notAvailable", { plan: planName(plan) }),
      };
    }
    if (currentPlan === plan) {
      return {
        button: (
          <Button asChild className="w-full" variant="outline">
            {/* Route handler that redirects off-site, so no <Link>. */}
            <a href={PORTAL_HREF}>{t("cards.manage")}</a>
          </Button>
        ),
        caption: t("cards.current"),
      };
    }
    // Agency tools: anyone not on Business yet can ask to pay a year by invoice.
    const invoiceLink =
      plan === "business" && interval === "year" && invoices ? (
        <button
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm text-xs underline-offset-4 transition-colors hover:underline focus-visible:ring-2 focus-visible:outline-none"
          onClick={() => {
            if (!isSignedIn) {
              openAuthDialog("signin");
              return;
            }
            setInvoiceOpen(true);
          }}
          type="button"
        >
          {t("invoice.open")}
        </button>
      ) : undefined;
    if (currentPlan && currentPlan !== "free") {
      return {
        button: (
          <Button asChild className="w-full" variant="outline">
            <a href={PORTAL_HREF}>
              {t("cards.switchTo", { plan: planName(plan) })}
            </a>
          </Button>
        ),
        caption: invoiceLink ? (
          <div className="flex flex-col items-center gap-1">
            <span>{t("cards.portalNote")}</span>
            {invoiceLink}
          </div>
        ) : (
          t("cards.portalNote")
        ),
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
              {t("cards.redirecting")}
            </>
          ) : (
            t(`tiers.${plan}.cta`)
          )}
        </Button>
      ),
      caption: invoiceLink,
    };
  };

  const cards: {
    plan: Plan;
    lead?: string;
    action: { button: React.ReactNode; caption?: React.ReactNode };
  }[] = [
    {
      plan: "free",
      action: {
        button: (
          <Button asChild className="w-full" variant="outline">
            <LocaleLink href={isSignedIn ? "/dashboard" : playgroundHref()}>
              {isSignedIn ? t("cards.goToDashboard") : t("tiers.free.cta")}
            </LocaleLink>
          </Button>
        ),
        caption: currentPlan === "free" ? t("cards.current") : undefined,
      },
    },
    {
      plan: "pro",
      lead: t("cards.leadPro"),
      action: paidAction("pro"),
    },
    {
      plan: "business",
      lead: t("cards.leadBusiness"),
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
        <div className="relative mx-auto flex max-w-[44rem] flex-col items-center gap-3 px-10 pt-14 pb-10 text-center md:pt-20">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t("header.eyebrow")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance md:text-5xl">
            {t("header.title")}
          </h1>
          <p className="max-w-xl text-pretty text-muted-foreground md:text-lg">
            {description}
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

      {/* Four cards: two by two on tablets, a row of four on wide screens. */}
      <div className="relative grid w-full max-w-[80rem] gap-4 px-10 md:grid-cols-2 xl:grid-cols-4">
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
                  {planName(plan)}
                  {popular && <Badge>{t("cards.popular")}</Badge>}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t(`tiers.${plan}.tagline`)}
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
                  <div className="text-center text-xs text-muted-foreground">
                    {action.caption}
                  </div>
                )}
              </div>
              <hr className="border-border" />
              <FeatureList items={highlights[plan]} lead={lead} />
            </Card>
          );
        })}
        {/* Enterprise: the Business plan under a contract (lib/enterprise.ts) */}
        <EnterpriseCard />
      </div>

      {/* Money-back guarantee and non-profit discount (pricing/pricing-offers.tsx) */}
      <PricingOffers className="mt-6" signedIn={isSignedIn} />

      {invoices && isSignedIn && (
        <InvoiceRequestDialog
          email={session?.user?.email ?? ""}
          onOpenChange={setInvoiceOpen}
          open={invoiceOpen}
          planName={PLAN_NAMES.business}
        />
      )}

      <div className="mt-4 w-full max-w-[80rem] px-10">
        <Card className="gap-4 bg-muted/40 p-5 shadow-none md:flex-row md:items-center md:justify-between dark:bg-card">
          <div className="flex items-start gap-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border bg-muted/40">
              <Driver aria-hidden className="size-4 text-foreground/80" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="flex flex-wrap items-baseline gap-x-2 font-semibold tracking-tight">
                {t("selfHost.title")}
                <span className="text-sm font-normal text-muted-foreground">
                  {formatPrice(0, currency, locale)} · AGPL-3.0
                </span>
              </h2>
              <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
                {t("selfHost.description")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 pl-13 md:pl-0">
            <Button asChild size="sm" variant="outline">
              <LocaleLink href="/docs/self-hosting">
                <Book1 aria-hidden />
                {t("selfHost.guide")}
              </LocaleLink>
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
          {t(EUR_PRICES ? "footnoteEur" : "footnote")}
        </p>
      </div>
    </section>
  );
}
