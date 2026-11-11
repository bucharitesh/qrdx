import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SettingsHeader } from "@/app/(app)/settings/components/settings-header";
import { fetchUsdRates } from "@/lib/affiliates/exchange-rates";
import { referralLinkLabel } from "@/lib/affiliates/links";
import {
  type QuoteResult,
  quotePayout,
  signPayoutQuote,
} from "@/lib/affiliates/payout-quote";
import { loadAffiliateForAdmin } from "@/lib/affiliates/program";
import { meetsMinimumPayout } from "@/lib/affiliates/rules";
import {
  AFFILIATE_FX_SOURCE_URL,
  AFFILIATE_MIN_PAYOUT_LABEL,
  AFFILIATE_PAYOUT_CURRENCY,
  formatMinorAmount,
} from "@/lib/affiliates/terms";
import { AdminAction } from "../../_components/admin-action";
import { Empty, Facts, Row, Rows } from "../../_components/panel";
import { Section } from "../../_components/stat-card";
import { formatDate, formatNumber } from "../../_lib/format";
import { requireAdmin } from "../../_lib/guard";
import { adminMetadata } from "../../_lib/metadata";
import { Money } from "../money";

export const generateMetadata = adminMetadata("Admin · Affiliate");

const STATUS_LABELS = {
  pending: "On hold",
  payable: "Payable",
  paid: "Paid",
  void: "Void",
} as const;

const VOID_LABELS: Record<string, string> = {
  refund: "refunded",
  chargeback: "chargeback",
  self_referral: "self-referral",
  admin: "voided by an admin",
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "today", "1 day ago", "12 days ago" */
function daysAgo(date: Date, now: Date): string {
  const days = Math.floor((now.getTime() - date.getTime()) / DAY_MS);
  if (days <= 0) return "today";
  return days === 1 ? "1 day ago" : `${formatNumber(days)} days ago`;
}

export default async function AdminAffiliatePage({
  params,
}: {
  params: Promise<{ affiliateId: string }>;
}) {
  await requireAdmin();
  const { affiliateId } = await params;
  // One moment for the whole page: "Mark paid" covers what was payable then.
  const shownAt = new Date();
  const loaded = await loadAffiliateForAdmin(affiliateId, shownAt);
  if (!loaded.ready) {
    return (
      <p className="bg-muted/40 rounded-lg border p-4 text-sm">
        The affiliate tables don't exist yet. Apply{" "}
        <code>packages/database/manual-sql/2026-11-10-affiliates.sql</code>{" "}
        first.
      </p>
    );
  }
  const detail = loaded.value;
  if (!detail) notFound();
  const { affiliate: row, commissions, payouts } = detail;
  const payable = row.totals.payable;
  const needsRates = Object.entries(payable).some(
    ([currency, amount]) =>
      amount !== 0 && currency !== AFFILIATE_PAYOUT_CURRENCY,
  );
  const quoted: QuoteResult | null =
    Object.keys(payable).length === 0
      ? null
      : quotePayout({
          affiliateId: row.id,
          cutoff: shownAt,
          byCurrency: payable,
          rates: needsRates ? await fetchUsdRates() : null,
        });

  return (
    <div className="space-y-4">
      <SettingsHeader
        description={
          <>
            <Link className="hover:underline" href="/admin/affiliates">
              Affiliates
            </Link>{" "}
            · {referralLinkLabel(row.code)}
          </>
        }
        title={row.email}
      />

      <Section title="Affiliate">
        <Facts
          items={[
            {
              label: "Status",
              value: (
                <Badge
                  variant={row.status === "approved" ? "default" : "outline"}
                >
                  {row.status}
                </Badge>
              ),
            },
            { label: "Applied", value: formatDate(row.createdAt) },
            { label: "Approved", value: formatDate(row.approvedAt) },
            {
              label: "Referral code",
              value: row.previousCode
                ? `${row.code} (chosen; ${row.previousCode} still works)`
                : row.code,
            },
            {
              label: "PayPal email",
              value: row.paypalEmail
                ? `${row.paypalEmail}${row.paypalEmailChangedAt ? `, changed ${daysAgo(row.paypalEmailChangedAt, shownAt)}` : ""}`
                : "Not set",
            },
            { label: "Link clicks", value: formatNumber(row.clickCount) },
            { label: "Sign-ups", value: formatNumber(row.signUps) },
            {
              label: "Paying customers",
              value: formatNumber(row.payingCustomers),
            },
            { label: "Pending", value: <Money totals={row.totals.pending} /> },
            { label: "Paid", value: <Money totals={row.totals.paid} /> },
          ]}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="text-sm underline underline-offset-4"
            href={`/admin/users/${encodeURIComponent(row.userId)}`}
          >
            Open their account
          </Link>
          {row.status === "approved" && (
            <AdminAction
              action="suspendAffiliate"
              confirmLabel="Suspend"
              description="New orders from their referrals earn nothing while they're suspended. Commissions already recorded stay, and the link stops counting."
              destructive
              input={{ affiliateId: row.id }}
              label="Suspend"
              success="Suspended"
              title="Suspend this affiliate?"
            />
          )}
          {row.status === "suspended" && (
            <AdminAction
              action="reinstateAffiliate"
              confirmLabel="Reinstate"
              description="They can earn again from new orders."
              input={{ affiliateId: row.id }}
              label="Reinstate"
              success="Reinstated"
              title="Reinstate this affiliate?"
            />
          )}
        </div>
      </Section>

      <Section
        description={`Everything payable is paid together in US dollars, from ${AFFILIATE_MIN_PAYOUT_LABEL}. Other currencies are converted at the rates shown. Send the money through PayPal first, then record it here with PayPal's transaction ID.`}
        title="Payable now"
      >
        {!quoted ? (
          <Empty>Nothing is past its hold and unpaid.</Empty>
        ) : (
          <PayableNow quoted={quoted} row={row} shownAt={shownAt} />
        )}
      </Section>

      <Section title="Payouts">
        {payouts.length === 0 ? (
          <Empty>No payouts yet.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paid</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="text-right">Commissions</TableHead>
                <TableHead>PayPal</TableHead>
                <TableHead>Transaction ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payouts.map((payout) => (
                <TableRow key={payout.id}>
                  <TableCell>{formatDate(payout.paidAt)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatMinorAmount(payout.amount, payout.currency)}
                    {payout.fxRates && payout.fxDate && (
                      <span className="text-muted-foreground block text-xs">
                        {Object.entries(payout.fxRates)
                          .map(
                            ([currency, rate]) =>
                              `${currency.toUpperCase()} at ${rate}`,
                          )
                          .join(", ")}{" "}
                        ({payout.fxSource}, {payout.fxDate})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(payout.commissionCount)}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">
                    {payout.paypalEmail ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {payout.paypalReference}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Commissions">
        {commissions.length === 0 ? (
          <Empty>No commissions yet.</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order paid</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payable from</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {commissions.map((commission) => (
                <TableRow key={commission.id}>
                  <TableCell>{formatDate(commission.orderPaidAt)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatMinorAmount(
                      commission.orderAmount,
                      commission.currency,
                    )}
                    <span className="text-muted-foreground block font-mono text-xs">
                      {commission.polarOrderId}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatMinorAmount(commission.amount, commission.currency)}
                  </TableCell>
                  <TableCell>
                    {STATUS_LABELS[commission.status]}
                    {commission.voidReason && (
                      <span className="text-muted-foreground block text-xs">
                        {VOID_LABELS[commission.voidReason] ??
                          commission.voidReason}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {commission.status === "void"
                      ? "—"
                      : formatDate(commission.availableAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {(commission.status === "pending" ||
                      commission.status === "payable") && (
                      <AdminAction
                        action="voidCommission"
                        confirmLabel="Void"
                        description="For a chargeback Polar didn't report as a refund, or an order that shouldn't have earned. It can't be undone."
                        destructive
                        input={{ commissionId: commission.id }}
                        label="Void"
                        success="Voided"
                        title="Void this commission?"
                        variant="ghost"
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}

function PayableNow({
  quoted,
  row,
  shownAt,
}: {
  quoted: QuoteResult;
  row: {
    id: string;
    status: string;
    paypalEmail: string | null;
    paypalEmailChangedAt: Date | null;
  };
  shownAt: Date;
}) {
  if (!quoted.ok) {
    return (
      <p className="bg-muted/40 rounded-lg border p-4 text-sm" role="alert">
        No exchange rate for{" "}
        {quoted.currencies.map((c) => c.toUpperCase()).join(", ")}:{" "}
        {quoted.detail} Nothing is converted without a rate, so this can't be
        marked paid until one is available. Reload later.
      </p>
    );
  }
  const { quote, lines } = quoted;
  const total = formatMinorAmount(quote.usdTotal, AFFILIATE_PAYOUT_CURRENCY);
  const belowMinimum = !meetsMinimumPayout(quote.usdTotal);
  const hint =
    row.status !== "approved"
      ? "Only approved affiliates can be paid."
      : !row.paypalEmail
        ? "They haven't added a PayPal email yet."
        : belowMinimum
          ? `Below the minimum of ${AFFILIATE_MIN_PAYOUT_LABEL}; it carries over.`
          : undefined;
  const changed = row.paypalEmailChangedAt
    ? ` Their PayPal email changed ${daysAgo(row.paypalEmailChangedAt, shownAt)}.`
    : "";
  return (
    <Rows>
      {lines.map((line) => (
        <Row
          key={line.currency}
          meta={
            line.rate
              ? `× ${line.rate} US$ per ${line.currency.toUpperCase()} = ${formatMinorAmount(line.usdCents, AFFILIATE_PAYOUT_CURRENCY)}`
              : undefined
          }
          title={
            <span className="tabular-nums">
              {formatMinorAmount(line.amount, line.currency)}
            </span>
          }
        />
      ))}
      <Row
        actions={
          <AdminAction
            action="markAffiliatePaid"
            confirmLabel="Mark paid"
            description={`Records ${total} sent to ${row.paypalEmail ?? "their PayPal"} and marks the ${lines.length === 1 ? "commissions" : "commissions in every currency"} above paid. Do this after the PayPal payment went through.${changed}`}
            disabled={Boolean(hint)}
            disabledHint={hint}
            input={{ affiliateId: row.id, quote: signPayoutQuote(quote) }}
            label="Mark paid"
            reasonOptional
            success="Payout recorded"
            textField={{
              name: "paypalReference",
              label: "PayPal transaction ID",
              maxLength: 64,
            }}
            title={`Mark ${total} paid?`}
            variant="default"
          />
        }
        meta={
          <>
            {quote.fxDate ? (
              <>
                Rates:{" "}
                <a
                  className="underline underline-offset-4"
                  href={AFFILIATE_FX_SOURCE_URL}
                  rel="noreferrer"
                  target="_blank"
                >
                  {quote.fxSource}
                </a>
                , {quote.fxDate}.{" "}
              </>
            ) : null}
            {hint}
            {changed}
          </>
        }
        title={
          <span className="font-medium tabular-nums">
            Total to send: {total}
          </span>
        }
      />
    </Rows>
  );
}
