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
import { SettingsHeader } from "@/app/(app)/settings/components/settings-header";
import { referralLinkLabel } from "@/lib/affiliates/links";
import {
  type AdminAffiliateList,
  type AdminAffiliateSummary,
  listAffiliatesForAdmin,
} from "@/lib/affiliates/program";
import {
  AFFILIATE_HOLD_DAYS,
  AFFILIATE_MIN_PAYOUT_LABEL,
} from "@/lib/affiliates/terms";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { PAGE_SIZE, parsePage } from "@/lib/paging";
import { AdminAction } from "../_components/admin-action";
import { Pager } from "../_components/pager";
import { Empty, Row, Rows } from "../_components/panel";
import { EmptyRow, Section, StatCard } from "../_components/stat-card";
import { formatDate, formatNumber } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import { adminMetadata } from "../_lib/metadata";
import { Money } from "./money";

export const generateMetadata = adminMetadata("Admin · Affiliates");

const BASE_PATH = "/admin/affiliates";

const detailHref = (id: string) => `${BASE_PATH}/${encodeURIComponent(id)}`;

function Application({ row }: { row: AdminAffiliateSummary }) {
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

export default async function AdminAffiliatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  // Each list pages on its own: ?page= for the affiliates table,
  // ?applications= and ?rejected= for the other two.
  const loaded = await listAffiliatesForAdmin(new Date(), {
    affiliates: parsePage(params.page),
    applications: parsePage(params.applications),
    rejected: parsePage(params.rejected),
  });
  const programOn = isFeatureAvailable("affiliates");

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Affiliates"
        description={`Applications, what each affiliate is owed, and payouts. Commissions wait ${AFFILIATE_HOLD_DAYS} days; payouts are sent by hand through PayPal in US dollars from ${AFFILIATE_MIN_PAYOUT_LABEL} (other currencies converted at the payout date's ECB rate), then marked paid here.`}
      />

      {!programOn && (
        <p className="bg-muted/40 rounded-lg border p-4 text-sm">
          The program is off on this server. It runs only where QRdx itself runs
          (qrdx.dev, its previews and local dev) and needs Polar's{" "}
          <code>POLAR_WEBHOOK_SECRET</code>.
        </p>
      )}

      {!loaded.ready ? (
        <p className="bg-muted/40 rounded-lg border p-4 text-sm">
          The affiliate tables don't exist yet. Apply{" "}
          <code>packages/database/manual-sql/2026-11-10-affiliates.sql</code> to
          the database first.
        </p>
      ) : (
        <AffiliateLists list={loaded.value} />
      )}
    </div>
  );
}

function AffiliateLists({ list }: { list: AdminAffiliateList }) {
  const { stats, applications, affiliates, rejected } = list;
  // Paging one list keeps the others where they are.
  const pageParam = (page: number) => (page > 1 ? String(page) : undefined);
  const pages = {
    page: pageParam(affiliates.page),
    applications: pageParam(applications.page),
    rejected: pageParam(rejected.page),
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          alert={stats.applications > 0}
          label="Applications"
          value={formatNumber(stats.applications)}
        />
        <StatCard label="Approved" value={formatNumber(stats.approved)} />
        <StatCard
          hint="Past the hold, not yet paid"
          label="With a payable balance"
          value={formatNumber(stats.withPayableBalance)}
        />
        <StatCard
          label="Sign-ups referred"
          value={formatNumber(stats.signUps)}
        />
      </div>

      <Section
        description="Approving lets them share their link and earn. Both ask you to confirm it's you."
        title="Applications"
      >
        {applications.total === 0 ? (
          <Empty>No applications waiting.</Empty>
        ) : (
          <Rows>
            {applications.rows.map((row) => (
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
        <SectionPager
          list={applications}
          pageParam="applications"
          params={pages}
        />
      </Section>

      <Section
        description="Pending: still in the hold. Payable: past it, not yet paid. Amounts stay in the currency the customer paid in."
        title="Affiliates"
      >
        {affiliates.total === 0 ? (
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
              {affiliates.rows.map((row) => (
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
        <SectionPager list={affiliates} pageParam="page" params={pages} />
      </Section>

      {rejected.total > 0 && (
        <Section title="Rejected">
          <Rows>
            {rejected.rows.map((row) => (
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
          <SectionPager list={rejected} pageParam="rejected" params={pages} />
        </Section>
      )}
    </>
  );
}

/** Previous / next under a list, once it has more than one page. */
function SectionPager({
  list,
  pageParam,
  params,
}: {
  list: { total: number; page: number };
  pageParam: string;
  params: Record<string, string | undefined>;
}) {
  if (list.total <= PAGE_SIZE) return null;
  return (
    <Pager
      basePath={BASE_PATH}
      page={list.page}
      pageParam={pageParam}
      params={params}
      total={list.total}
    />
  );
}
