"use server";

import {
  affiliate,
  affiliateCommission,
  affiliatePayout,
  database as db,
  user,
} from "@repo/database";
import cuid from "cuid";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { isMissingTableError } from "@/lib/affiliates/missing-table";
import { payableCommissions } from "@/lib/affiliates/program";
import { minimumPayout } from "@/lib/affiliates/rules";
import { formatMinorAmount } from "@/lib/affiliates/terms";
import {
  type AdminActionResult,
  adminError,
  runAdminAction,
} from "../_lib/action";
import { adminId, optionalReason, requiredReason } from "../_lib/rules";
import { requireStrongAdmin } from "../_lib/strong-admin";

// The affiliate program's admin actions (/admin/affiliates). Each runs
// through runAdminAction (admin re-check, rate limit, input check, an entry
// in the admin audit log with the reason) and asks for the admin's own
// second factor first (requireStrongAdmin): approving someone lets them
// earn, and marking a payout paid records money sent.

const REVALIDATE = ["/admin/affiliates"];

async function findAffiliate(affiliateId: string) {
  try {
    const [row] = await db
      .select({
        id: affiliate.id,
        userId: affiliate.userId,
        status: affiliate.status,
        code: affiliate.code,
        paypalEmail: affiliate.paypalEmail,
        approvedAt: affiliate.approvedAt,
        email: user.email,
      })
      .from(affiliate)
      .innerJoin(user, eq(user.id, affiliate.userId))
      .where(eq(affiliate.id, affiliateId))
      .limit(1);
    if (!row) throw adminError("Affiliate not found", 404);
    return row;
  } catch (error) {
    if (isMissingTableError(error)) {
      throw adminError(
        "The affiliate tables don't exist yet. Apply packages/database/manual-sql/2026-11-10-affiliates.sql first.",
      );
    }
    throw error;
  }
}

const decisionSchema = z.object({
  affiliateId: adminId,
  reason: optionalReason,
});
const reasonSchema = z.object({
  affiliateId: adminId,
  reason: requiredReason,
});

async function setStatus(
  admin: { id: string },
  row: Awaited<ReturnType<typeof findAffiliate>>,
  to: "approved" | "rejected" | "suspended",
  reason: string | undefined,
) {
  const now = new Date();
  await db
    .update(affiliate)
    .set({
      status: to,
      ...(to === "approved" && !row.approvedAt
        ? { approvedAt: now, approvedBy: admin.id }
        : {}),
      // A PayPal address is only kept for approved affiliates; someone
      // turned down never had one.
      ...(to === "rejected" ? { paypalEmail: null } : {}),
      reviewedAt: now,
      reviewedBy: admin.id,
      statusNote: reason ?? null,
      updatedAt: now,
    })
    .where(eq(affiliate.id, row.id));
}

const audit = (row: Awaited<ReturnType<typeof findAffiliate>>) => ({
  targetType: "affiliate",
  targetId: row.id,
  subjectUserId: row.userId,
  metadata: { targetEmail: row.email, code: row.code, from: row.status },
});

/** An application (or a rejected one, on second thought) becomes approved. */
export async function approveAffiliateAction(
  input: z.input<typeof decisionSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    {
      action: "affiliate.approve",
      schema: decisionSchema,
      revalidate: REVALIDATE,
    },
    input,
    async (admin, { affiliateId, reason }) => {
      const row = await findAffiliate(affiliateId);
      if (row.status === "approved") return null;
      if (row.status === "suspended") {
        throw adminError("This affiliate is suspended. Use Reinstate.");
      }
      await requireStrongAdmin(admin);
      await setStatus(admin, row, "approved", reason);
      return { audit: audit(row) };
    },
  );
}

/** An application is turned down. */
export async function rejectAffiliateAction(
  input: z.input<typeof reasonSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    {
      action: "affiliate.reject",
      schema: reasonSchema,
      revalidate: REVALIDATE,
    },
    input,
    async (admin, { affiliateId, reason }) => {
      const row = await findAffiliate(affiliateId);
      if (row.status === "rejected") return null;
      if (row.status !== "pending") {
        throw adminError("Only an application can be rejected. Use Suspend.");
      }
      await requireStrongAdmin(admin);
      await setStatus(admin, row, "rejected", reason);
      return { audit: audit(row) };
    },
  );
}

/** An approved affiliate stops earning: new orders get no commission. */
export async function suspendAffiliateAction(
  input: z.input<typeof reasonSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    {
      action: "affiliate.suspend",
      schema: reasonSchema,
      revalidate: REVALIDATE,
    },
    input,
    async (admin, { affiliateId, reason }) => {
      const row = await findAffiliate(affiliateId);
      if (row.status === "suspended") return null;
      if (row.status !== "approved") {
        throw adminError("Only an approved affiliate can be suspended.");
      }
      await requireStrongAdmin(admin);
      await setStatus(admin, row, "suspended", reason);
      return { audit: audit(row) };
    },
  );
}

/** A suspended affiliate is approved again. */
export async function reinstateAffiliateAction(
  input: z.input<typeof reasonSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    {
      action: "affiliate.reinstate",
      schema: reasonSchema,
      revalidate: REVALIDATE,
    },
    input,
    async (admin, { affiliateId, reason }) => {
      const row = await findAffiliate(affiliateId);
      if (row.status === "approved") return null;
      if (row.status !== "suspended") {
        throw adminError("Only a suspended affiliate can be reinstated.");
      }
      await requireStrongAdmin(admin);
      await setStatus(admin, row, "approved", reason);
      return { audit: audit(row) };
    },
  );
}

const markPaidSchema = z.object({
  affiliateId: adminId,
  currency: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{3}$/, "Unknown currency"),
  /** The total the page showed, in minor units: it must still be the total. */
  amount: z.number().int().positive(),
  paypalReference: z
    .string()
    .trim()
    .min(4, "Enter the PayPal transaction ID.")
    .max(64, "That's too long for a PayPal transaction ID.")
    .regex(
      /^[A-Za-z0-9-]+$/,
      "A PayPal transaction ID has only letters, digits and hyphens.",
    ),
  reason: optionalReason,
});

/**
 * After the owner has sent the money through PayPal by hand: records the
 * payout and marks every payable commission in that currency as paid by it.
 * Only for an approved affiliate with a PayPal email, only when the total is
 * at least the minimum, and only when it's still the total the page showed.
 */
export async function markAffiliatePaidAction(
  input: z.input<typeof markPaidSchema>,
): Promise<AdminActionResult<{ amount: number; commissions: number }>> {
  return runAdminAction(
    {
      action: "affiliate.mark_paid",
      schema: markPaidSchema,
      limit: "sensitive",
      revalidate: REVALIDATE,
    },
    input,
    async (admin, { affiliateId, currency, amount, paypalReference }) => {
      const row = await findAffiliate(affiliateId);
      if (row.status !== "approved") {
        throw adminError("Only an approved affiliate can be paid.");
      }
      if (!row.paypalEmail) {
        throw adminError("This affiliate hasn't added a PayPal email yet.");
      }
      const minimum = minimumPayout(currency);
      if (minimum === null) {
        throw adminError(
          `There's no minimum payout for ${currency.toUpperCase()} (lib/affiliates/terms.ts), so it can't be paid yet.`,
        );
      }
      await requireStrongAdmin(admin);
      const now = new Date();
      const due = await payableCommissions(affiliateId, currency, now);
      if (due.ids.length === 0) {
        throw adminError(`Nothing is payable in ${currency.toUpperCase()}.`);
      }
      if (due.total !== amount) {
        throw adminError(
          `The payable total is now ${formatMinorAmount(due.total, currency)}, not ${formatMinorAmount(amount, currency)}. Reload the page and check it before marking it paid.`,
        );
      }
      if (due.total < minimum) {
        throw adminError(
          `${formatMinorAmount(due.total, currency)} is below the minimum payout of ${formatMinorAmount(minimum, currency)}.`,
        );
      }
      const payoutId = cuid();
      const [, covered] = await db.batch([
        db.insert(affiliatePayout).values({
          id: payoutId,
          affiliateId,
          currency,
          amount: due.total,
          commissionCount: due.ids.length,
          paypalEmail: row.paypalEmail,
          paypalReference,
          paidAt: now,
          createdBy: admin.id,
          createdAt: now,
        }),
        db
          .update(affiliateCommission)
          .set({ status: "paid", payoutId, updatedAt: now })
          .where(
            and(
              inArray(affiliateCommission.id, due.ids),
              inArray(affiliateCommission.status, ["pending", "approved"]),
              isNull(affiliateCommission.payoutId),
            ),
          )
          .returning({
            id: affiliateCommission.id,
            amount: affiliateCommission.amount,
          }),
      ]);
      // A refund webhook can void one in the moment between reading and
      // writing: the payout then records what it really covers.
      const coveredRows = covered as { id: string; amount: number }[];
      const coveredTotal = coveredRows.reduce((sum, c) => sum + c.amount, 0);
      if (coveredRows.length !== due.ids.length) {
        console.error(
          JSON.stringify({
            event: "affiliates.payout_mismatch",
            payoutId,
            expected: due.ids.length,
            covered: coveredRows.length,
          }),
        );
        await db
          .update(affiliatePayout)
          .set({ amount: coveredTotal, commissionCount: coveredRows.length })
          .where(eq(affiliatePayout.id, payoutId));
      }
      return {
        audit: {
          targetType: "affiliate",
          targetId: affiliateId,
          subjectUserId: row.userId,
          metadata: {
            targetEmail: row.email,
            code: row.code,
            payoutId,
            currency,
            amount: coveredTotal,
            commissions: coveredRows.length,
            paypalReference,
          },
        },
        data: { amount: coveredTotal, commissions: coveredRows.length },
      };
    },
  );
}

const voidSchema = z.object({
  commissionId: adminId,
  reason: requiredReason,
});

/**
 * Cancels one commission that hasn't been paid: for a chargeback Polar
 * didn't report as a refund, or an order that shouldn't have earned.
 */
export async function voidCommissionAction(
  input: z.input<typeof voidSchema>,
): Promise<AdminActionResult> {
  return runAdminAction(
    {
      action: "affiliate_commission.void",
      schema: voidSchema,
      revalidate: REVALIDATE,
    },
    input,
    async (admin, { commissionId }) => {
      let row:
        | {
            id: string;
            affiliateId: string;
            status: string;
            amount: number;
            currency: string;
            polarOrderId: string;
          }
        | undefined;
      try {
        [row] = await db
          .select({
            id: affiliateCommission.id,
            affiliateId: affiliateCommission.affiliateId,
            status: affiliateCommission.status,
            amount: affiliateCommission.amount,
            currency: affiliateCommission.currency,
            polarOrderId: affiliateCommission.polarOrderId,
          })
          .from(affiliateCommission)
          .where(eq(affiliateCommission.id, commissionId))
          .limit(1);
      } catch (error) {
        if (isMissingTableError(error)) {
          throw adminError("The affiliate tables don't exist yet.");
        }
        throw error;
      }
      if (!row) throw adminError("Commission not found", 404);
      if (row.status === "void") return null;
      if (row.status === "paid") {
        throw adminError("A paid commission can't be voided.");
      }
      await requireStrongAdmin(admin);
      const now = new Date();
      await db
        .update(affiliateCommission)
        .set({
          status: "void",
          voidedAt: now,
          voidReason: "admin",
          updatedAt: now,
        })
        .where(
          and(
            eq(affiliateCommission.id, row.id),
            inArray(affiliateCommission.status, ["pending", "approved"]),
          ),
        );
      return {
        audit: {
          targetType: "affiliate_commission",
          targetId: row.id,
          metadata: {
            affiliateId: row.affiliateId,
            polarOrderId: row.polarOrderId,
            currency: row.currency,
            amount: row.amount,
          },
        },
      };
    },
  );
}
