"use server";

import { abuseReport, database as db, qrCode } from "@repo/database";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { setFileBlocked } from "@/lib/files/admin";
import { ABUSE_REPORT_STATUSES } from "@/lib/safety/abuse-reasons";
import {
  type AdminActionResult,
  adminError,
  runAdminAction,
} from "../_lib/action";
import { adminId, optionalReason } from "../_lib/rules";

const statusSchema = z.object({
  reportId: adminId,
  status: z.enum(ABUSE_REPORT_STATUSES),
  reason: optionalReason,
});
const codeSchema = z.object({ reportId: adminId, reason: optionalReason });
const fileSchema = z.object({
  reportId: adminId,
  fileId: adminId,
  reason: optionalReason,
});

async function findReport(reportId: string) {
  const [report] = await db
    .select()
    .from(abuseReport)
    .where(eq(abuseReport.id, reportId))
    .limit(1);
  if (!report) throw adminError("Report not found", 404);
  return report;
}

/** Marks a report actioned, dismissed or open again. */
export async function setAbuseReportStatusAction(
  input: z.input<typeof statusSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "abuse_report.status", schema: statusSchema },
    input,
    async (_admin, { reportId, status }) => {
      const report = await findReport(reportId);
      if (report.status === status) return null;
      await db
        .update(abuseReport)
        .set({ status })
        .where(eq(abuseReport.id, reportId));
      return {
        audit: {
          targetType: "abuse_report",
          targetId: reportId,
          metadata: {
            from: report.status,
            to: status,
            qrCodeId: report.qrCodeId,
          },
        },
      };
    },
  );
}

/**
 * Turns the reported code off (it shows "no longer active"; the owner can't
 * turn it back on) and resolves every open report about it.
 */
export async function disableReportedCodeAction(
  input: z.input<typeof codeSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "qr_code.disable", schema: codeSchema },
    input,
    async (_admin, { reportId }) => {
      const report = await findReport(reportId);
      if (!report.qrCodeId) {
        throw adminError("This report isn't linked to a code");
      }
      const [code] = await db
        .update(qrCode)
        .set({ isActive: false })
        .where(eq(qrCode.id, report.qrCodeId))
        .returning({
          slug: qrCode.slug,
          destinationUrl: qrCode.destinationUrl,
          userId: qrCode.userId,
        });
      if (!code) throw adminError("QR code not found", 404);

      await db
        .update(abuseReport)
        .set({ status: "actioned" })
        .where(
          and(
            eq(abuseReport.qrCodeId, report.qrCodeId),
            eq(abuseReport.status, "open"),
          ),
        );
      return {
        audit: {
          targetType: "qr_code",
          targetId: report.qrCodeId,
          subjectUserId: code.userId,
          metadata: {
            slug: code.slug,
            destinationUrl: code.destinationUrl,
            ownerId: code.userId,
            abuseReportId: reportId,
          },
        },
      };
    },
  );
}

/**
 * Turns a reported or held code back on (e.g. a held destination that is
 * fine) and dismisses the report.
 */
export async function restoreReportedCodeAction(
  input: z.input<typeof codeSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "qr_code.enable", schema: codeSchema },
    input,
    async (_admin, { reportId }) => {
      const report = await findReport(reportId);
      if (!report.qrCodeId) {
        throw adminError("This report isn't linked to a code");
      }
      const [code] = await db
        .update(qrCode)
        .set({ isActive: true })
        .where(eq(qrCode.id, report.qrCodeId))
        .returning({
          slug: qrCode.slug,
          destinationUrl: qrCode.destinationUrl,
          userId: qrCode.userId,
        });
      if (!code) throw adminError("QR code not found", 404);

      await db
        .update(abuseReport)
        .set({ status: "dismissed" })
        .where(eq(abuseReport.id, reportId));
      return {
        audit: {
          targetType: "qr_code",
          targetId: report.qrCodeId,
          subjectUserId: code.userId,
          metadata: {
            slug: code.slug,
            destinationUrl: code.destinationUrl,
            ownerId: code.userId,
            abuseReportId: reportId,
          },
        },
      };
    },
  );
}

/**
 * Blocks a file named by the report (takedown); the report is actioned.
 * setFileBlocked writes its own "file.block" audit entry; this one records
 * the report it came from.
 */
export async function blockReportedFileAction(
  input: z.input<typeof fileSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    { action: "abuse_report.block_file", schema: fileSchema },
    input,
    async (admin, { reportId, fileId, reason }) => {
      await findReport(reportId);
      await setFileBlocked(admin, fileId, true, {
        reason: reason || `Abuse report ${reportId}`,
      });
      await db
        .update(abuseReport)
        .set({ status: "actioned" })
        .where(eq(abuseReport.id, reportId));
      return {
        audit: {
          targetType: "abuse_report",
          targetId: reportId,
          metadata: { fileId },
        },
      };
    },
  );
}
