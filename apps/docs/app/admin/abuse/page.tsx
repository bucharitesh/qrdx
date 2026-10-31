import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@repo/design-system/components/ui/card";
import type { Metadata } from "next";
import Link from "next/link";
import { SettingsHeader } from "@/app/settings/components/settings-header";
import { abuseReasonLabel } from "@/lib/safety/abuse-reasons";
import { isNewAccount } from "@/lib/safety/velocity";
import { Pager } from "../_components/pager";
import { EmptyRow } from "../_components/stat-card";
import { formatDate, formatDateTime } from "../_lib/format";
import { requireAdmin } from "../_lib/guard";
import { parsePage } from "../_lib/queries";
import {
  type AbuseReportRow,
  type AbuseStatusFilter,
  countOpenAbuseReports,
  listAbuseReports,
} from "./queries";
import { ReportActions } from "./report-actions";

export const metadata: Metadata = { title: "Admin · Abuse reports" };

const STATUSES: { value: AbuseStatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "actioned", label: "Actioned" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

const isStatus = (value: unknown): value is AbuseStatusFilter =>
  STATUSES.some((item) => item.value === value);

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge variant="destructive">Open</Badge>;
  if (status === "actioned") return <Badge variant="secondary">Actioned</Badge>;
  return <Badge variant="outline">Dismissed</Badge>;
}

function CodeSummary({ code }: { code: NonNullable<AbuseReportRow["code"]> }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs">/q/{code.slug}</span>
        {code.kind === "page" && <Badge variant="outline">Page</Badge>}
        {!code.isActive ? (
          <Badge variant="destructive">Disabled</Badge>
        ) : code.archivedAt ? (
          <Badge variant="outline">Archived</Badge>
        ) : (
          <Badge variant="secondary">Active</Badge>
        )}
      </div>
      {/* Plain text on purpose: the destination may be malicious. */}
      <p
        className="text-muted-foreground max-w-xl truncate text-xs"
        title={code.destinationUrl}
      >
        {code.destinationUrl}
      </p>
      <p className="text-muted-foreground text-xs">
        Owner{" "}
        <Link
          className="text-foreground hover:underline"
          href={`/admin/users/${encodeURIComponent(code.ownerId)}`}
        >
          {code.ownerEmail}
        </Link>
        {" · joined "}
        {formatDate(code.ownerCreatedAt)}
        {isNewAccount(code.ownerCreatedAt) && " (new account)"}
        {code.organizationId && " · team code"}
      </p>
    </div>
  );
}

function ReportCard({ report }: { report: AbuseReportRow }) {
  const files = [
    ...report.pageFiles.map((file) => ({
      id: file.id,
      filename: file.filename,
      blocked: file.status === "blocked",
    })),
    ...(report.linkedFileId &&
    !report.pageFiles.some((file) => file.id === report.linkedFileId)
      ? [
          {
            id: report.linkedFileId,
            filename: `File ${report.linkedFileId.slice(0, 8)}`,
            blocked: false,
          },
        ]
      : []),
  ];

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex flex-col gap-2 px-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={report.status} />
            <span className="font-medium">
              {abuseReasonLabel(report.reason)}
            </span>
            {report.openReportsForCode > 1 && (
              <Badge variant="outline">
                {report.openReportsForCode} open reports on this code
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {formatDateTime(report.createdAt)}
            {report.reporterEmail && ` · from ${report.reporterEmail}`}
          </p>
        </div>
        <ReportActions
          code={
            report.code
              ? { slug: report.code.slug, isActive: report.code.isActive }
              : null
          }
          files={files}
          reportId={report.id}
          status={report.status}
        />
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        {report.code ? (
          <CodeSummary code={report.code} />
        ) : (
          <p className="text-muted-foreground text-sm">
            Not linked to a QRdx code (or the code was deleted).
          </p>
        )}
        {report.page && (
          <p className="text-muted-foreground text-xs">
            Hosted page: {report.page.title || "Untitled"}
            {report.pageFiles.length > 0 &&
              ` · ${report.pageFiles.length} file${report.pageFiles.length === 1 ? "" : "s"} (${report.pageFiles.filter((file) => file.status === "blocked").length} blocked)`}
          </p>
        )}
        {report.url && (
          <p className="text-xs">
            <span className="text-muted-foreground">Reported URL: </span>
            <span className="break-all">{report.url}</span>
          </p>
        )}
        {report.details && (
          <p className="bg-muted/50 rounded-md p-3 text-sm whitespace-pre-wrap">
            {report.details}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function AdminAbusePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const status: AbuseStatusFilter = isStatus(params.status)
    ? params.status
    : "open";
  const page = parsePage(params.page);
  const [{ reports, total }, openCount] = await Promise.all([
    listAbuseReports({ status, page }),
    countOpenAbuseReports(),
  ]);

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Abuse reports"
        description="Reports from the public form and codes held by the automated checks (new accounts with suspicious links). Disabling a code stops it redirecting and the owner cannot turn it back on; blocking a file makes pages show it as unavailable. Every action is written to the audit log."
      />

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((item) => (
          <Button
            asChild
            key={item.value}
            size="sm"
            variant={item.value === status ? "secondary" : "ghost"}
          >
            <Link href={`/admin/abuse?status=${item.value}`}>
              {item.label}
              {item.value === "open" && openCount > 0 && ` (${openCount})`}
            </Link>
          </Button>
        ))}
      </div>

      {reports.length === 0 ? (
        <EmptyRow>
          {status === "open" ? "No open reports" : "No reports"}
        </EmptyRow>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}

      <Pager
        basePath="/admin/abuse"
        page={page}
        params={{ status }}
        total={total}
      />
    </div>
  );
}
