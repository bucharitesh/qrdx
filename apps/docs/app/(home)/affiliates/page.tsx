import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight, Link21, MoneySend, ProfileAdd } from "iconsax-reactjs";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ToolHero } from "@/components/sections/tools/tool-hero";
import { referralLinkLabel } from "@/lib/affiliates/links";
import {
  AFFILIATE_COMMISSION_MONTHS,
  AFFILIATE_COMMISSION_PERCENT,
  AFFILIATE_HOLD_DAYS,
  AFFILIATE_MIN_PAYOUT_INR_LABEL,
  AFFILIATE_MIN_PAYOUT_USD_LABEL,
  AFFILIATE_PAYOUT_METHOD,
  AFFILIATE_REFERRAL_COOKIE_DAYS,
} from "@/lib/affiliates/terms";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { createMetadata } from "@/lib/metadata";
import { ApplyForm } from "./apply-form";

// Every number on this page comes from lib/affiliates/terms.ts, the same
// constants the commission code uses.

export const metadata: Metadata = createMetadata({
  title: `QRdx Affiliate Program: Earn ${AFFILIATE_COMMISSION_PERCENT}% for ${AFFILIATE_COMMISSION_MONTHS} Months`,
  description: `Refer people to QRdx and earn ${AFFILIATE_COMMISSION_PERCENT}% of what they pay in their first ${AFFILIATE_COMMISSION_MONTHS} months as paying customers. Paid by ${AFFILIATE_PAYOUT_METHOD} each month from ${AFFILIATE_MIN_PAYOUT_USD_LABEL}.`,
  path: "/affiliates",
});

const steps = [
  {
    icon: ProfileAdd,
    title: "Apply",
    body: "Tell us where you'd share QRdx. We review each application by hand.",
  },
  {
    icon: Link21,
    title: "Share your link",
    body: `Once you're approved you get a link like ${referralLinkLabel("your-name")}. People who create a QRdx account through it are your referrals.`,
  },
  {
    icon: MoneySend,
    title: "Get paid",
    body: `When a referral pays, you earn ${AFFILIATE_COMMISSION_PERCENT}% of it, for their first ${AFFILIATE_COMMISSION_MONTHS} months as a paying customer. We pay by ${AFFILIATE_PAYOUT_METHOD} once a month.`,
  },
];

const terms: { term: string; detail: string }[] = [
  {
    term: "Commission",
    detail: `${AFFILIATE_COMMISSION_PERCENT}% of what a customer you referred pays, after discounts and before tax, for their first ${AFFILIATE_COMMISSION_MONTHS} months as a paying customer. After that, nothing.`,
  },
  {
    term: "Waiting period",
    detail: `Each commission waits ${AFFILIATE_HOLD_DAYS} days. If the payment is refunded or charged back in that time, the commission is cancelled.`,
  },
  {
    term: "Payouts",
    detail: `By ${AFFILIATE_PAYOUT_METHOD}, once a month, sent by hand by the QRdx team. The minimum is ${AFFILIATE_MIN_PAYOUT_USD_LABEL}, or ${AFFILIATE_MIN_PAYOUT_INR_LABEL} for commissions in Indian rupees. Commissions stay in the currency the customer paid in; what's below the minimum carries over to the next month.`,
  },
  {
    term: "Who counts",
    detail:
      "New QRdx accounts created through your link. An account that already exists can't be referred, and an account keeps the first referral it gets.",
  },
  {
    term: "Not your own",
    detail:
      "No commission on your own account, on an account using your email address under another spelling (such as you+qrdx@example.com), or on anyone in a workspace you're a member of.",
  },
  {
    term: "Taxes",
    detail: "You handle the taxes on what you earn.",
  },
  {
    term: "Fair play",
    detail:
      "No spam, no bidding on QRdx's name in search ads, and no misleading claims about QRdx. We can reject an application or suspend an affiliate account.",
  },
];

export default function AffiliatesPage() {
  if (!isFeatureAvailable("affiliates")) notFound();
  return (
    <main className="flex min-h-screen w-full flex-col divide-y divide-border">
      <ToolHero
        crumbs={[
          { name: "Home", path: "/" },
          { name: "Affiliate program", path: "/affiliates" },
        ]}
        focus={[0.5, 0.4]}
        intro={[
          `Share QRdx with people who make QR codes. When someone you refer becomes a paying customer, you earn ${AFFILIATE_COMMISSION_PERCENT}% of what they pay for their first ${AFFILIATE_COMMISSION_MONTHS} months.`,
        ]}
        pattern="halo"
        title={`Earn ${AFFILIATE_COMMISSION_PERCENT}% for ${AFFILIATE_COMMISSION_MONTHS} months`}
      >
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <Button asChild>
            <Link href="#apply">
              Apply
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/legal/affiliate-terms">Read the terms</Link>
          </Button>
        </div>
      </ToolHero>

      <section
        aria-labelledby="how"
        className="flex w-full flex-col gap-6 px-10 py-12"
      >
        <h2
          className="text-2xl font-medium tracking-tighter text-secondary-foreground"
          id="how"
        >
          How it works
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 shadow-sm"
              key={step.title}
            >
              <span className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/40">
                  <step.icon
                    aria-hidden
                    className="size-4 text-foreground/80"
                  />
                </span>
                <span className="text-muted-foreground font-mono text-xs">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </span>
              <h3 className="font-medium text-secondary-foreground">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="terms"
        className="flex w-full flex-col gap-6 px-10 py-12"
      >
        <div className="flex flex-col gap-2">
          <h2
            className="text-2xl font-medium tracking-tighter text-secondary-foreground"
            id="terms"
          >
            The terms, in plain words
          </h2>
          <p className="text-sm text-muted-foreground">
            The full text is in the{" "}
            <Link
              className="font-medium text-foreground underline underline-offset-4"
              href="/legal/affiliate-terms"
            >
              affiliate terms
            </Link>
            .
          </p>
        </div>
        <dl className="divide-y divide-border rounded-xl border border-border">
          {terms.map((item) => (
            <div
              className="grid gap-1 p-5 md:grid-cols-[12rem_1fr] md:gap-6"
              key={item.term}
            >
              <dt className="font-medium text-secondary-foreground">
                {item.term}
              </dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">
                {item.detail}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby="tracking"
        className="flex w-full flex-col gap-4 px-10 py-12"
      >
        <h2
          className="text-2xl font-medium tracking-tighter text-secondary-foreground"
          id="tracking"
        >
          How referrals are counted
        </h2>
        <div className="flex max-w-3xl flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Your link takes people to the QRdx home page with your code. If they
            sign up during that visit, without reloading the page or opening
            QRdx in a new tab, the code goes along with the sign-up and the new
            account is your referral. No cookie is needed for that.
          </p>
          <p>
            If they allow Analytics in Cookie settings, a cookie also remembers
            your link for {AFFILIATE_REFERRAL_COOKIE_DAYS} days, so a sign-up on
            a later visit still counts. Without that choice, a later visit
            doesn't count.
          </p>
          <p>
            Visits to your link are counted without cookies. You see how many
            people visited, signed up and became paying customers, never who
            they are.
          </p>
        </div>
      </section>

      <section
        aria-labelledby="apply-title"
        className="flex w-full scroll-mt-24 flex-col gap-6 px-10 py-12"
        id="apply"
      >
        <div className="flex max-w-xl flex-col gap-2">
          <h2
            className="text-2xl font-medium tracking-tighter text-secondary-foreground"
            id="apply-title"
          >
            Apply
          </h2>
          <p className="text-sm text-muted-foreground">
            It takes a minute. Once you're approved, your link and earnings are
            in Settings, under Affiliate program.
          </p>
        </div>
        <div className="max-w-xl rounded-xl border border-border bg-card p-5 shadow-sm">
          <ApplyForm />
        </div>
      </section>
    </main>
  );
}
