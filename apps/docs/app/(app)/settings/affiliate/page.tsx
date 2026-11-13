import { auth } from "@repo/auth/server";
import { SUPPORT_EMAIL } from "@repo/config";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { use } from "react";
import {
  SettingsRow,
  SettingsSection,
} from "@/app/(app)/settings/account/_components/settings-section";
import { ConfirmIdentityProvider } from "@/components/confirm-identity/provider";
import { referralLink } from "@/lib/affiliates/links";
import {
  type AffiliateDashboard,
  type ByCurrency,
  loadAffiliateDashboard,
} from "@/lib/affiliates/program";
import { currencyEntries } from "@/lib/affiliates/rules";
import {
  AFFILIATE_COMMISSION_MONTHS,
  AFFILIATE_COMMISSION_PERCENT,
  AFFILIATE_HOLD_DAYS,
  AFFILIATE_MIN_PAYOUT_LABEL,
  formatMinorAmount,
} from "@/lib/affiliates/terms";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { signInPath } from "@/lib/safe-redirect";
import { SettingsHeader } from "../components/settings-header";
import {
  ChooseCodeForm,
  PaypalEmailForm,
  ReferralLinkField,
} from "./_components/affiliate-client";

export const metadata: Metadata = {
  title: "Affiliate program",
  robots: { index: false, follow: false },
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function Amounts({ totals }: { totals: ByCurrency }) {
  const t = use(getAppTranslations("app.settings.affiliate.page"));
  const entries = currencyEntries(totals).filter(([, amount]) => amount > 0);
  if (entries.length === 0) {
    return <span className="text-muted-foreground">{t("none")}</span>;
  }
  return (
    <span className="tabular-nums">
      {entries
        .map(([currency, amount]) => formatMinorAmount(amount, currency))
        .join(" · ")}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1 rounded-xl border px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

const STATUS_LABELS = {
  pending: "On hold",
  payable: "Payable",
  paid: "Paid",
  void: "Cancelled",
} as const;

const VOID_LABELS: Record<string, string> = {
  refund: "Refunded",
  chargeback: "Chargeback",
  self_referral: "Own account",
  admin: "Cancelled",
};

export default async function AffiliateSettingsPage() {
  if (!isFeatureAvailable("affiliates")) notFound();
  const t = await getAppTranslations("app.settings.affiliate.page");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(signInPath("/settings/affiliate"));

  const loaded = await loadAffiliateDashboard(session.user.id);

  return (
    <ConfirmIdentityProvider>
      <div className="space-y-6">
        <SettingsHeader
          description={t("earnAffiliateCommissionPercentOf", {
            AFFILIATE_COMMISSION_PERCENT,
            AFFILIATE_COMMISSION_MONTHS,
          })}
          title={t("affiliateProgram")}
        />
        {!loaded.ready ? (
          <p className="bg-muted/40 rounded-lg border p-4 text-sm">
            {t("theAffiliateProgramIsntAvailable")}
          </p>
        ) : (
          <Dashboard dashboard={loaded.value} />
        )}
      </div>
    </ConfirmIdentityProvider>
  );
}

function Dashboard({ dashboard }: { dashboard: AffiliateDashboard }) {
  const t = use(getAppTranslations("app.settings.affiliate.page"));
  const row = dashboard.affiliate;
  if (!row) {
    return (
      <SettingsSection
        description={t("shareQrdxAndEarnA")}
        id="apply"
        title={t("youreNotAnAffiliateYet")}
      >
        <SettingsRow label={t("apply")}>
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm text-pretty">
              {t("readHowItWorksAnd")}
            </p>
            <Button asChild>
              <Link href="/affiliates#apply">{t("readTheTermsAndApply")}</Link>
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>
    );
  }

  if (row.status === "pending" || row.status === "rejected") {
    return (
      <SettingsSection
        description={
          row.status === "pending"
            ? t("thanksForApplyingWeReview")
            : t("yourApplicationWasntAcceptedSo")
        }
        id="status"
        title={
          row.status === "pending"
            ? t("yourApplicationIsBeingReviewed")
            : t("applicationNotAccepted")
        }
      >
        <SettingsRow label={t("applied")}>
          <p className="text-sm">{dateFormat.format(row.createdAt)}</p>
        </SettingsRow>
      </SettingsSection>
    );
  }

  const suspended = row.status === "suspended";
  return (
    <>
      <SettingsSection
        action={
          <Badge variant={suspended ? "outline" : "default"}>
            {suspended ? t("suspended") : t("approved")}
          </Badge>
        }
        description={
          suspended
            ? t("yourAccountIsSuspendedNew")
            : t("shareThisLinkPeopleWho")
        }
        id="link"
        title={t("yourReferralLink")}
      >
        <SettingsRow description={t("aSignUpCountsWhen")} label={t("link")}>
          <ReferralLinkField link={referralLink(row.code)} />
        </SettingsRow>
        {!suspended && (
          <SettingsRow
            description={
              row.previousCode
                ? t("youChoseThisCodeLinks", { previousCode: row.previousCode })
                : t("yourCodeIsRandomYou")
            }
            label={t("code")}
          >
            {row.previousCode ? (
              <p className="font-mono text-sm">{row.code}</p>
            ) : (
              <ChooseCodeForm current={row.code} />
            )}
          </SettingsRow>
        )}
        <div className="grid grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-3 sm:px-6">
          <Stat
            label={t("linkVisits")}
            value={dashboard.clicks.toLocaleString("en-US")}
          />
          <Stat
            label={t("signUps")}
            value={dashboard.signUps.toLocaleString("en-US")}
          />
          <Stat
            label={t("payingCustomers")}
            value={dashboard.payingCustomers.toLocaleString("en-US")}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        description={t("eachCommissionWaitsAffiliateHold", {
          AFFILIATE_HOLD_DAYS,
        })}
        id="earnings"
        title={t("earnings")}
      >
        <div className="grid grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-3 sm:px-6">
          <Stat
            label={t("onHold")}
            value={<Amounts totals={dashboard.totals.pending} />}
          />
          <Stat
            label={t("payable")}
            value={<Amounts totals={dashboard.totals.payable} />}
          />
          <Stat
            label={t("paid")}
            value={<Amounts totals={dashboard.totals.paid} />}
          />
        </div>
        <SettingsRow
          description={t("payoutsGoOutByHand", { AFFILIATE_MIN_PAYOUT_LABEL })}
          label={t("paypalEmail")}
        >
          {suspended ? (
            <p className="text-sm">{row.paypalEmail ?? t("notSet")}</p>
          ) : (
            <PaypalEmailForm current={row.paypalEmail} />
          )}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection id="payouts" title={t("payouts")}>
        {dashboard.payouts.length === 0 ? (
          <p className="text-muted-foreground px-5 py-5 text-sm sm:px-6">
            {t("noPayoutsYet")}
          </p>
        ) : (
          <div className="px-5 py-3 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("amount")}</TableHead>
                  <TableHead>{t("paypalTransaction")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell>{dateFormat.format(payout.paidAt)}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatMinorAmount(payout.amount, payout.currency)}
                      {payout.fxRates && payout.fxDate && (
                        <span className="text-muted-foreground block text-xs">
                          {t("valueEcbFxdate", {
                            value: Object.entries(payout.fxRates)
                              .map(
                                ([currency, rate]) =>
                                  `${currency.toUpperCase()} at ${rate} US$ each`,
                              )
                              .join(", "),
                            fxDate: payout.fxDate,
                          })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {payout.paypalReference}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        description={t("onePerPaymentByA")}
        id="commissions"
        title={t("commissions")}
      >
        {dashboard.commissions.length === 0 ? (
          <p className="text-muted-foreground px-5 py-5 text-sm sm:px-6">
            {t("noCommissionsYetTheyAppear")}
          </p>
        ) : (
          <div className="px-5 py-3 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("payment")}</TableHead>
                  <TableHead>{t("commission")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("payableFrom")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.commissions.slice(0, 100).map((commission) => (
                  <TableRow key={commission.id}>
                    <TableCell>
                      {dateFormat.format(commission.orderPaidAt)}
                      <span className="text-muted-foreground block text-xs tabular-nums">
                        {formatMinorAmount(
                          commission.orderAmount,
                          commission.currency,
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatMinorAmount(
                        commission.amount,
                        commission.currency,
                      )}
                    </TableCell>
                    <TableCell>
                      {commission.status === "void"
                        ? (VOID_LABELS[commission.voidReason ?? ""] ??
                          STATUS_LABELS.void)
                        : STATUS_LABELS[commission.status]}
                    </TableCell>
                    <TableCell>
                      {commission.status === "void"
                        ? "—"
                        : dateFormat.format(commission.availableAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SettingsSection>

      <p className="text-muted-foreground text-sm">
        {t.rich("theFullTermsAreIn", {
          link: (chunks) => (
            <Link
              className="underline underline-offset-4"
              href="/legal/affiliate-terms"
            >
              {chunks}
            </Link>
          ),
          link2: (chunks) => (
            <a
              className="underline underline-offset-4"
              href={`mailto:${SUPPORT_EMAIL}`}
            >
              {chunks}
            </a>
          ),
        })}
      </p>
    </>
  );
}
