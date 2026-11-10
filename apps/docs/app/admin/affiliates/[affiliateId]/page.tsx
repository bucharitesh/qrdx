import { Badge } from "@repo/design-system/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { referralLinkLabel } from "@/lib/affiliates/links";
import { loadAffiliateForAdmin } from "@/lib/affiliates/program";
import { currencyEntries, minimumPayout } from "@/lib/affiliates/rules";
import { formatMinorAmount } from "@/lib/affiliates/terms";
import { AdminAction } from "../../_components/admin-action";
import { Empty, Facts, Row, Rows } from "../../_components/panel";
import { Section } from "../../_components/stat-card";
import { formatDate, formatNumber } from "../../_lib/format";
import { requireAdmin } from "../../_lib/guard";
import { Money } from "../money";

export const metadata: Metadata = { title: "Admin · Affiliate" };

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

export default async function AdminAffiliatePage({
  params,
}: {
  params: Promise<{ affiliateId: string }>;
}) {
  await requireAdmin();
  const { affiliateId } = await params;
  const loaded = await loadAffiliateForAdmin(affiliateId);
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
            { label: "PayPal email", value: row.paypalEmail ?? "Not set" },
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
        description="Send the money through PayPal first, then record it here with PayPal's transaction ID. Each currency is paid on its own."
        title="Payable now"
      >
        {Object.keys(row.totals.payable).length === 0 ? (
          <Empty>Nothing is past its hold and unpaid.</Empty>
        ) : (
          <Rows>
            {currencyEntries(row.totals.payable).map(([currency, amount]) => {
              const minimum = minimumPayout(currency);
              const belowMinimum = minimum === null || amount < minimum;
              const blocked =
                row.status !== "approved" || !row.paypalEmail || belowMinimum;
              const hint =
                row.status !== "approved"
                  ? "Only approved affiliates can be paid."
                  : !row.paypalEmail
                    ? "They haven't added a PayPal email yet."
                    : minimum === null
                      ? `No minimum is set for ${currency.toUpperCase()}.`
                      : belowMinimum
                        ? `Below the minimum of ${formatMinorAmount(minimum, currency)}.`
                        : undefined;
              return (
                <Row
                  actions={
                    <AdminAction
                      action="markAffiliatePaid"
                      confirmLabel="Mark paid"
                      description={`Records ${formatMinorAmount(amount, currency)} sent to ${row.paypalEmail ?? "their PayPal"} and marks every payable ${currency.toUpperCase()} commission paid. Do this after the PayPal payment went through.`}
                      disabled={blocked}
                      disabledHint={hint}
                      input={{ affiliateId: row.id, currency, amount }}
                      label="Mark paid"
                      reasonOptional
                      success="Payout recorded"
                      textField={{
                        name: "paypalReference",
                        label: "PayPal transaction ID",
                        maxLength: 64,
                      }}
                      title={`Mark ${formatMinorAmount(amount, currency)} paid?`}
                      variant="default"
                    />
                  }
                  key={currency}
                  meta={hint}
                  title={
                    <span className="tabular-nums">
                      {formatMinorAmount(amount, currency)}
                    </span>
                  }
                />
              );
            })}
          </Rows>
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
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(payout.commissionCount)}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">
                    {payout.paypalEmail}
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
