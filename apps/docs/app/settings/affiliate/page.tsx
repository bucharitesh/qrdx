import { auth } from "@repo/auth/server";
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
import {
  SettingsRow,
  SettingsSection,
} from "@/app/settings/account/_components/settings-section";
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
  AFFILIATE_MIN_PAYOUT_INR_LABEL,
  AFFILIATE_MIN_PAYOUT_USD_LABEL,
  formatMinorAmount,
} from "@/lib/affiliates/terms";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { signInPath } from "@/lib/safe-redirect";
import { SettingsHeader } from "../components/settings-header";
import {
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
  const entries = currencyEntries(totals).filter(([, amount]) => amount > 0);
  if (entries.length === 0) {
    return <span className="text-muted-foreground">None</span>;
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(signInPath("/settings/affiliate"));

  const loaded = await loadAffiliateDashboard(session.user.id);

  return (
    <ConfirmIdentityProvider>
      <div className="space-y-6">
        <SettingsHeader
          description={`Earn ${AFFILIATE_COMMISSION_PERCENT}% of what the customers you refer pay in their first ${AFFILIATE_COMMISSION_MONTHS} months.`}
          title="Affiliate program"
        />
        {!loaded.ready ? (
          <p className="bg-muted/40 rounded-lg border p-4 text-sm">
            The affiliate program isn't available yet. Please check back soon.
          </p>
        ) : (
          <Dashboard dashboard={loaded.value} />
        )}
      </div>
    </ConfirmIdentityProvider>
  );
}

function Dashboard({ dashboard }: { dashboard: AffiliateDashboard }) {
  const row = dashboard.affiliate;
  if (!row) {
    return (
      <SettingsSection
        description="Share QRdx and earn a commission on what the people you refer pay."
        id="apply"
        title="You're not an affiliate yet"
      >
        <SettingsRow label="Apply">
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm text-pretty">
              Read how it works and apply in a minute. We review each
              application by hand.
            </p>
            <Button asChild>
              <Link href="/affiliates#apply">Read the terms and apply</Link>
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
            ? "Thanks for applying. We review each application by hand and you'll see the answer here."
            : "Your application wasn't accepted, so there's no referral link for this account."
        }
        id="status"
        title={
          row.status === "pending"
            ? "Your application is being reviewed"
            : "Application not accepted"
        }
      >
        <SettingsRow label="Applied">
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
            {suspended ? "Suspended" : "Approved"}
          </Badge>
        }
        description={
          suspended
            ? "Your account is suspended: new orders from your referrals don't earn a commission, and your link doesn't count visits. Commissions already recorded are shown below."
            : "Share this link. People who create a QRdx account through it are your referrals."
        }
        id="link"
        title="Your referral link"
      >
        <SettingsRow
          description="Visits are counted without cookies. Repeat visits count again."
          label="Link"
        >
          <ReferralLinkField link={referralLink(row.code)} />
        </SettingsRow>
        <div className="grid grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-3 sm:px-6">
          <Stat
            label="Link visits"
            value={dashboard.clicks.toLocaleString("en-US")}
          />
          <Stat
            label="Sign-ups"
            value={dashboard.signUps.toLocaleString("en-US")}
          />
          <Stat
            label="Paying customers"
            value={dashboard.payingCustomers.toLocaleString("en-US")}
          />
        </div>
      </SettingsSection>

      <SettingsSection
        description={`Each commission waits ${AFFILIATE_HOLD_DAYS} days; a refund or chargeback in that time cancels it. Amounts stay in the currency the customer paid in.`}
        id="earnings"
        title="Earnings"
      >
        <div className="grid grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-3 sm:px-6">
          <Stat
            label="On hold"
            value={<Amounts totals={dashboard.totals.pending} />}
          />
          <Stat
            label="Payable"
            value={<Amounts totals={dashboard.totals.payable} />}
          />
          <Stat
            label="Paid"
            value={<Amounts totals={dashboard.totals.paid} />}
          />
        </div>
        <SettingsRow
          description={`Payouts go out by hand through PayPal once a month, once what's payable reaches ${AFFILIATE_MIN_PAYOUT_USD_LABEL} (or ${AFFILIATE_MIN_PAYOUT_INR_LABEL} for rupees).`}
          label="PayPal email"
        >
          {suspended ? (
            <p className="text-sm">{row.paypalEmail ?? "Not set"}</p>
          ) : (
            <PaypalEmailForm current={row.paypalEmail} />
          )}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection id="payouts" title="Payouts">
        {dashboard.payouts.length === 0 ? (
          <p className="text-muted-foreground px-5 py-5 text-sm sm:px-6">
            No payouts yet.
          </p>
        ) : (
          <div className="px-5 py-3 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>PayPal transaction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell>{dateFormat.format(payout.paidAt)}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatMinorAmount(payout.amount, payout.currency)}
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
        description="One per payment by a customer you referred. Who they are stays private."
        id="commissions"
        title="Commissions"
      >
        {dashboard.commissions.length === 0 ? (
          <p className="text-muted-foreground px-5 py-5 text-sm sm:px-6">
            No commissions yet. They appear here when someone you referred pays.
          </p>
        ) : (
          <div className="px-5 py-3 sm:px-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payable from</TableHead>
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
        The full terms are in the{" "}
        <Link
          className="underline underline-offset-4"
          href="/legal/affiliate-terms"
        >
          affiliate terms
        </Link>
        . Questions:{" "}
        <a
          className="underline underline-offset-4"
          href="mailto:support@qrdx.dev"
        >
          support@qrdx.dev
        </a>
        .
      </p>
    </>
  );
}
