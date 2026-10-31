"use server";

import { abuseReport, database as db, qrCode } from "@repo/database";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HttpError } from "@/lib/error-response";
import { setFileBlocked } from "@/lib/files/admin";
import { ABUSE_REPORT_STATUSES } from "@/lib/safety/abuse-reasons";
import { writeAuditLog } from "../_lib/audit";
import { type AdminUser, assertAdmin } from "../_lib/guard";
import type { AdminActionResult } from "../actions";

const idSchema = z.string().trim().min(1).max(128);
const reasonSchema = z.string().trim().max(500).optional();

const statusSchema = z.object({
  reportId: idSchema,
  status: z.enum(ABUSE_REPORT_STATUSES),
});
const codeSchema = z.object({ reportId: idSchema, reason: reasonSchema });
const fileSchema = z.object({
  reportId: idSchema,
  fileId: idSchema,
  reason: reasonSchema,
});

async function findReport(reportId: string) {
  const [report] = await db
    .select()
    .from(abuseReport)
    .where(eq(abuseReport.id, reportId))
    .limit(1);
  if (!report) throw new HttpError(404, "NOT_FOUND", "Report not found");
  return report;
}

async function run(
  fn: (admin: AdminUser) => Promise<void>,
): Promise<AdminActionResult> {
  try {
    await fn(await assertAdmin());
  } catch (error) {
    if (error instanceof HttpError) return { ok: false, error: error.message };
    console.error("Admin abuse action failed:", error);
    return { ok: false, error: "Action failed" };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Marks a report actioned, dismissed or open again. */
export async function setAbuseReportStatusAction(
  input: z.input<typeof statusSchema>,
): Promise<AdminActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { reportId, status } = parsed.data;

  return run(async (admin) => {
    const report = await findReport(reportId);
    if (report.status === status) return;
    await db
      .update(abuseReport)
      .set({ status })
      .where(eq(abuseReport.id, reportId));
    await writeAuditLog({
      actor: admin,
      action: "abuse_report.status",
      targetType: "abuse_report",
      targetId: reportId,
      metadata: { from: report.status, to: status, qrCodeId: report.qrCodeId },
    });
  });
}

/**
 * Turns the reported code off (it shows "no longer active"; the owner can't
 * turn it back on) and resolves every open report about it.
 */
export async function disableReportedCodeAction(
  input: z.input<typeof codeSchema>,
): Promise<AdminActionResult> {
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { reportId, reason } = parsed.data;

  return run(async (admin) => {
    const report = await findReport(reportId);
    if (!report.qrCodeId) {
      throw new HttpError(400, "NO_CODE", "This report isn't linked to a code");
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
    if (!code) throw new HttpError(404, "NOT_FOUND", "QR code not found");

    await db
      .update(abuseReport)
      .set({ status: "actioned" })
      .where(
        and(
          eq(abuseReport.qrCodeId, report.qrCodeId),
          eq(abuseReport.status, "open"),
        ),
      );
    await writeAuditLog({
      actor: admin,
      action: "qr_code.disable",
      targetType: "qr_code",
      targetId: report.qrCodeId,
      metadata: {
        slug: code.slug,
        destinationUrl: code.destinationUrl,
        ownerId: code.userId,
        abuseReportId: reportId,
        reason: reason || null,
      },
    });
  });
}

/**
 * Turns a reported or held code back on (e.g. a held destination that is
 * fine) and dismisses the report.
 */
export async function restoreReportedCodeAction(
  input: z.input<typeof codeSchema>,
): Promise<AdminActionResult> {
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { reportId, reason } = parsed.data;

  return run(async (admin) => {
    const report = await findReport(reportId);
    if (!report.qrCodeId) {
      throw new HttpError(400, "NO_CODE", "This report isn't linked to a code");
    }
    const [code] = await db
      .update(qrCode)
      .set({ isActive: true })
      .where(eq(qrCode.id, report.qrCodeId))
      .returning({ slug: qrCode.slug, destinationUrl: qrCode.destinationUrl });
    if (!code) throw new HttpError(404, "NOT_FOUND", "QR code not found");

    await db
      .update(abuseReport)
      .set({ status: "dismissed" })
      .where(eq(abuseReport.id, reportId));
    await writeAuditLog({
      actor: admin,
      action: "qr_code.enable",
      targetType: "qr_code",
      targetId: report.qrCodeId,
      metadata: {
        slug: code.slug,
        destinationUrl: code.destinationUrl,
        abuseReportId: reportId,
        reason: reason || null,
      },
    });
  });
}

/** Blocks a file named by the report (takedown); the report is actioned. */
export async function blockReportedFileAction(
  input: z.input<typeof fileSchema>,
): Promise<AdminActionResult> {
  const parsed = fileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };
  const { reportId, fileId, reason } = parsed.data;

  return run(async (admin) => {
    await findReport(reportId);
    await setFileBlocked(admin, fileId, true, {
      reason: reason || `Abuse report ${reportId}`,
    });
    await db
      .update(abuseReport)
      .set({ status: "actioned" })
      .where(eq(abuseReport.id, reportId));
  });
}
