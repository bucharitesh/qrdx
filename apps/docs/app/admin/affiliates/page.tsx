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
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { referralLinkLabel } from "@/lib/affiliates/links";
import {
  type AdminAffiliateRow,
  listAffiliatesForAdmin,
} from "@/lib/affiliates/program";
import {
  AFFILIATE_HOLD_DAYS,
  AFFILIATE_MIN_PAYOUT_INR_LABEL,
  AFFILIATE_MIN_PAYOUT_USD_LABEL,
} from "@/lib/affiliates/terms";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { AdminAction } from "../_components/admin-action";
import { Empty, Row, Rows } from "../_components/panel";
import { EmptyRow, Section, StatCard } from "../_components/stat-card";
import { formatDate, formatNumber } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import { Money } from "./money";

export const metadata: Metadata = { title: "Admin · Affiliates" };

const detailHref = (id: string) =>
  `/admin/affiliates/${encodeURIComponent(id)}`;

function Application({ row }: { row: AdminAffiliateRow }) {
  const website = row.application?.website;
  const promotion = row.application?.promotion;
  return (
    <div className="mt-1 space-y-1 text-sm">
      {website && (
        <p className="break-words">
          <span className="text-muted-foreground">Website or profile: </span>
          {/* Plain text on purpose: it may be anything. */}
          <span className="font-mono text-xs">{website}</span>
        </p>
      )}
      {promotion && (
        <p className="whitespace-pre-line break-words">
          <span className="text-muted-foreground">How they'll share it: </span>
          {promotion}
        </p>
      )}
    </div>
  );
}

export default async function AdminAffiliatesPage() {
  await requireAdmin();
  const loaded = await listAffiliatesForAdmin();
  const programOn = isFeatureAvailable("affiliates");

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Affiliates"
        description={`Applications, what each affiliate is owed, and payouts. Commissions wait ${AFFILIATE_HOLD_DAYS} days; payouts are sent by hand through PayPal from ${AFFILIATE_MIN_PAYOUT_USD_LABEL} (or ${AFFILIATE_MIN_PAYOUT_INR_LABEL}), then marked paid here.`}
      />

      {!programOn && (
        <p className="bg-muted/40 rounded-lg border p-4 text-sm">
          The program is off on this server: set <code>QRDX_AFFILIATES=1</code>{" "}
          (with Polar's <code>POLAR_WEBHOOK_SECRET</code>) to show the public
          page and take applications. Commissions for existing referrals are
          still recorded.
        </p>
      )}

      {!loaded.ready ? (
        <p className="bg-muted/40 rounded-lg border p-4 text-sm">
          The affiliate tables don't exist yet. Apply{" "}
          <code>packages/database/manual-sql/2026-11-10-affiliates.sql</code> to
          the database first.
        </p>
      ) : (
        <AffiliateLists rows={loaded.value} />
      )}
    </div>
  );
}

function AffiliateLists({ rows }: { rows: AdminAffiliateRow[] }) {
  const applications = rows.filter((row) => row.status === "pending");
  const active = rows.filter(
    (row) => row.status === "approved" || row.status === "suspended",
  );
  const rejected = rows.filter((row) => row.status === "rejected");
  const payable = active.filter(
    (row) => Object.keys(row.totals.payable).length > 0,
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          alert={applications.length > 0}
          label="Applications"
          value={formatNumber(applications.length)}
        />
        <StatCard
          label="Approved"
          value={formatNumber(
            active.filter((row) => row.status === "approved").length,
          )}
        />
        <StatCard
          hint="Past the hold, not yet paid"
          label="With a payable balance"
          value={formatNumber(payable.length)}
        />
        <StatCard
          label="Sign-ups referred"
          value={formatNumber(rows.reduce((sum, row) => sum + row.signUps, 0))}
        />
      </div>

      <Section
        description="Approving lets them share their link and earn. Both ask you to confirm it's you."
        title="Applications"
      >
        {applications.length === 0 ? (
          <Empty>No applications waiting.</Empty>
        ) : (
          <Rows>
            {applications.map((row) => (
              <Row
                actions={
                  <>
                    <AdminAction
                      action="approveAffiliate"
                      confirmLabel="Approve"
                      description={`${row.email} can share ${referralLinkLabel(row.code)} and earn commissions.`}
                      input={{ affiliateId: row.id }}
                      label="Approve"
                      reasonOptional
                      success="Approved"
                      title="Approve this affiliate?"
                      variant="default"
                    />
                    <AdminAction
                      action="rejectAffiliate"
                      confirmLabel="Reject"
                      description="They'll see that their application wasn't accepted. The reason stays in the audit log; they don't see it."
                      destructive
                      input={{ affiliateId: row.id }}
                      label="Reject"
                      success="Rejected"
                      title="Reject this application?"
                    />
                  </>
                }
                key={row.id}
                meta={`Applied ${formatDate(row.createdAt)} · code ${row.code}`}
                title={
                  <Link
                    className="hover:underline"
                    href={`/admin/users/${encodeURIComponent(row.userId)}`}
                  >
                    {row.email}
                  </Link>
                }
              >
                <Application row={row} />
              </Row>
            ))}
          </Rows>
        )}
      </Section>

      <Section
        description="Pending: still in the hold. Payable: past it, not yet paid. Amounts stay in the currency the customer paid in."
        title="Affiliates"
      >
        {active.length === 0 ? (
          <EmptyRow>No approved affiliates yet.</EmptyRow>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Affiliate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Sign-ups</TableHead>
                <TableHead className="text-right">Paying</TableHead>
                <TableHead>Pending</TableHead>
                <TableHead>Payable</TableHead>
                <TableHead>Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-56">
                    <Link
                      className="block truncate font-medium hover:underline"
                      href={detailHref(row.id)}
                    >
                      {row.email}
                    </Link>
                    <span className="text-muted-foreground font-mono text-xs">
                      {row.code}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.status === "approved" ? "default" : "outline"
                      }
                    >
                      {row.status}
                    </Badge>
                    {!row.paypalEmail && row.status === "approved" && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        no PayPal yet
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.signUps)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.payingCustomers)}
                  </TableCell>
                  <TableCell>
                    <Money totals={row.totals.pending} />
                  </TableCell>
                  <TableCell>
                    <Money totals={row.totals.payable} />
                  </TableCell>
                  <TableCell>
                    <Money totals={row.totals.paid} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      {rejected.length > 0 && (
        <Section title="Rejected">
          <Rows>
            {rejected.map((row) => (
              <Row
                actions={
                  <AdminAction
                    action="approveAffiliate"
                    confirmLabel="Approve"
                    description={`${row.email} can share ${referralLinkLabel(row.code)} and earn commissions.`}
                    input={{ affiliateId: row.id }}
                    label="Approve"
                    reasonOptional
                    success="Approved"
                    title="Approve after all?"
                  />
                }
                key={row.id}
                meta={`Applied ${formatDate(row.createdAt)}${row.statusNote ? ` · ${row.statusNote}` : ""}`}
                title={row.email}
              />
            ))}
          </Rows>
        </Section>
      )}
    </>
  );
}
