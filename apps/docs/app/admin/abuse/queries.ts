import "server-only";

import {
  abuseReport,
  database as db,
  landingPage,
  qrCode,
  user,
} from "@repo/database";
import { and, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { type AdminFileView, listFilesForPage } from "@/lib/files/admin";
import type { AbuseReportStatus } from "@/lib/safety/abuse-reasons";
import { PAGE_SIZE } from "../_lib/queries";

export type AbuseStatusFilter = AbuseReportStatus | "all";

export interface AbuseReportRow {
  id: string;
  reason: string;
  details: string | null;
  url: string | null;
  reporterEmail: string | null;
  status: string;
  createdAt: Date;
  code: {
    id: string;
    slug: string;
    kind: string;
    destinationUrl: string;
    isActive: boolean;
    archivedAt: Date | null;
    ownerId: string;
    ownerEmail: string;
    ownerCreatedAt: Date;
    organizationId: string | null;
  } | null;
  page: { id: string; title: string | null } | null;
  /** Open reports about the same code, this one included */
  openReportsForCode: number;
  /** A file linked directly by the reported URL (/api/files/<id>) */
  linkedFileId: string | null;
  /** Files used by the reported page */
  pageFiles: AdminFileView[];
}

const FILE_LINK = /\/api\/files\/([a-z0-9]{20,40})/;

export async function countOpenAbuseReports(): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(abuseReport)
    .where(eq(abuseReport.status, "open"));
  return row?.total ?? 0;
}

export async function listAbuseReports({
  status,
  page,
}: {
  status: AbuseStatusFilter;
  page: number;
}): Promise<{ reports: AbuseReportRow[]; total: number }> {
  const where: SQL | undefined =
    status === "all" ? undefined : eq(abuseReport.status, status);

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        report: abuseReport,
        codeId: qrCode.id,
        slug: qrCode.slug,
        kind: qrCode.kind,
        destinationUrl: qrCode.destinationUrl,
        isActive: qrCode.isActive,
        archivedAt: qrCode.archivedAt,
        codePageId: qrCode.pageId,
        organizationId: qrCode.organizationId,
        ownerId: user.id,
        ownerEmail: user.email,
        ownerCreatedAt: user.createdAt,
      })
      .from(abuseReport)
      .leftJoin(qrCode, eq(qrCode.id, abuseReport.qrCodeId))
      .leftJoin(user, eq(user.id, qrCode.userId))
      .where(where)
      .orderBy(desc(abuseReport.createdAt), desc(abuseReport.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(abuseReport).where(where),
  ]);

  const codeIds = [
    ...new Set(rows.flatMap((row) => (row.codeId ? [row.codeId] : []))),
  ];
  const pageIds = [
    ...new Set(
      rows.flatMap((row) => {
        const id = row.report.pageId ?? row.codePageId;
        return id ? [id] : [];
      }),
    ),
  ];

  const [openCounts, pages, filesByPage] = await Promise.all([
    codeIds.length
      ? db
          .select({ codeId: abuseReport.qrCodeId, total: count() })
          .from(abuseReport)
          .where(
            and(
              inArray(abuseReport.qrCodeId, codeIds),
              eq(abuseReport.status, "open"),
            ),
          )
          .groupBy(abuseReport.qrCodeId)
      : [],
    pageIds.length
      ? db
          .select({ id: landingPage.id, title: landingPage.title })
          .from(landingPage)
          .where(inArray(landingPage.id, pageIds))
      : [],
    Promise.all(
      pageIds.map(
        async (id) =>
          [
            id,
            await listFilesForPage(id).catch((error: unknown) => {
              console.error("Listing files of a reported page failed:", error);
              return [];
            }),
          ] as const,
      ),
    ),
  ]);

  const openByCode = new Map(openCounts.map((row) => [row.codeId, row.total]));
  const pageById = new Map(pages.map((row) => [row.id, row]));
  const files = new Map(filesByPage);

  const reports = rows.map((row): AbuseReportRow => {
    const pageId = row.report.pageId ?? row.codePageId;
    return {
      id: row.report.id,
      reason: row.report.reason,
      details: row.report.details,
      url: row.report.url,
      reporterEmail: row.report.reporterEmail,
      status: row.report.status,
      createdAt: row.report.createdAt,
      code:
        row.codeId && row.slug && row.ownerId && row.ownerEmail
          ? {
              id: row.codeId,
              slug: row.slug,
              kind: row.kind ?? "redirect",
              destinationUrl: row.destinationUrl ?? "",
              isActive: row.isActive ?? true,
              archivedAt: row.archivedAt,
              ownerId: row.ownerId,
              ownerEmail: row.ownerEmail,
              ownerCreatedAt: row.ownerCreatedAt ?? new Date(0),
              organizationId: row.organizationId,
            }
          : null,
      page: pageId ? (pageById.get(pageId) ?? null) : null,
      openReportsForCode: row.codeId ? (openByCode.get(row.codeId) ?? 0) : 0,
      linkedFileId: row.report.url?.match(FILE_LINK)?.[1] ?? null,
      pageFiles: pageId ? (files.get(pageId) ?? []) : [],
    };
  });

  return { reports, total: totalRow?.total ?? 0 };
}
