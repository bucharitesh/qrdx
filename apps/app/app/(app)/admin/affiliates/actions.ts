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
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";
import { isMissingTableError } from "@/lib/affiliates/missing-table";
import {
  PAYOUT_QUOTE_MAX_AGE_MS,
  readPayoutQuote,
  sameAmounts,
} from "@/lib/affiliates/payout-quote";
import { payableCommissions } from "@/lib/affiliates/program";
import { meetsMinimumPayout, payableUsdTotal } from "@/lib/affiliates/rules";
import {
  AFFILIATE_MIN_PAYOUT_LABEL,
  AFFILIATE_PAYOUT_CURRENCY,
  formatMinorAmount,
} from "@/lib/affiliates/terms";
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
  /** The page's signed quote (lib/affiliates/payout-quote.ts). */
  quote: z.string().min(1).max(4000),
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

const CHANGED =
  "What's payable has changed since this page loaded (a refund, or another payout). Nothing was recorded. Reload the page and check it.";

/**
 * After the owner has sent the money through PayPal by hand: records the
 * payout the page showed, in US dollars (commissions in other currencies at
 * the rates the page showed, recorded with their date and source), and
 * marks the commissions it covers paid. Only for an approved affiliate with
 * a PayPal email, only from the minimum, and only when the commissions
 * payable at the page's moment are still exactly the ones it showed:
 * otherwise it refuses and records nothing. One payout per PayPal
 * transaction ID (a unique index), so a second submit can't record it
 * twice.
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
    async (admin, { affiliateId, quote: token, paypalReference }) => {
      const quote = readPayoutQuote(token);
      if (!quote || quote.affiliateId !== affiliateId) {
        throw adminError("This payout isn't one this page showed. Reload it.");
      }
      const now = new Date();
      const cutoff = new Date(quote.cutoff);
      if (
        cutoff.getTime() > now.getTime() ||
        now.getTime() - cutoff.getTime() > PAYOUT_QUOTE_MAX_AGE_MS
      ) {
        throw adminError(
          "This page is more than a day old, so its exchange rates aren't today's. Reload it and check the total.",
        );
      }
      const row = await findAffiliate(affiliateId);
      if (row.status !== "approved") {
        throw adminError("Only an approved affiliate can be paid.");
      }
      if (!row.paypalEmail) {
        throw adminError("This affiliate hasn't added a PayPal email yet.");
      }
      // Never a conversion without a rate, and the total is what the rates
      // make of the amounts.
      const usdTotal = payableUsdTotal(quote.sourceAmounts, quote.fxRates);
      if (usdTotal === null) {
        throw adminError(
          "There's no exchange rate for one of the currencies, so this can't be converted. Nothing was recorded.",
        );
      }
      if (usdTotal !== quote.usdTotal) {
        throw adminError("This payout isn't one this page showed. Reload it.");
      }
      if (!meetsMinimumPayout(usdTotal)) {
        throw adminError(
          `${formatMinorAmount(usdTotal, AFFILIATE_PAYOUT_CURRENCY)} is below the minimum payout of ${AFFILIATE_MIN_PAYOUT_LABEL}.`,
        );
      }
      await requireStrongAdmin(admin);
      const due = await payableCommissions(affiliateId, cutoff);
      if (
        due.ids.length === 0 ||
        !sameAmounts(due.byCurrency, quote.sourceAmounts)
      ) {
        throw adminError(CHANGED);
      }
      const payoutId = cuid();
      let covered: { id: string }[];
      try {
        const [, updated] = await db.batch([
          db.insert(affiliatePayout).values({
            id: payoutId,
            affiliateId,
            userId: row.userId,
            currency: AFFILIATE_PAYOUT_CURRENCY,
            amount: usdTotal,
            commissionCount: due.ids.length,
            sourceAmounts: quote.sourceAmounts,
            fxRates:
              Object.keys(quote.fxRates).length > 0 ? quote.fxRates : null,
            fxDate: quote.fxDate,
            fxSource: quote.fxSource,
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
            .returning({ id: affiliateCommission.id }),
        ]);
        covered = updated as { id: string }[];
      } catch (error) {
        if ((error as { code?: string })?.code === "23505") {
          throw adminError(
            "A payout with this PayPal transaction ID is already recorded. Nothing was recorded twice.",
          );
        }
        throw error;
      }
      if (covered.length !== due.ids.length) {
        // A refund voided one, or another payout took some, between the
        // check and the write. Undo this payout rather than record less
        // than was sent.
        await undoPayout(payoutId, due.statuses);
        console.error(
          JSON.stringify({
            event: "affiliates.payout_refused",
            payoutId,
            expected: due.ids.length,
            covered: covered.length,
          }),
        );
        throw adminError(CHANGED);
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
            currency: AFFILIATE_PAYOUT_CURRENCY,
            amount: usdTotal,
            sourceAmounts: quote.sourceAmounts,
            fxRates: quote.fxRates,
            fxDate: quote.fxDate,
            commissions: covered.length,
            paypalReference,
          },
        },
        data: { amount: usdTotal, commissions: covered.length },
      };
    },
  );
}

/**
 * Takes back a payout that covered fewer commissions than it should: its
 * commissions go back to the status they had, and the payout row goes.
 */
async function undoPayout(
  payoutId: string,
  statuses: Readonly<Record<string, "pending" | "approved">>,
) {
  const now = new Date();
  const restore = (["pending", "approved"] as const).flatMap((status) => {
    const ids = Object.entries(statuses)
      .filter(([, value]) => value === status)
      .map(([id]) => id);
    return ids.length === 0
      ? []
      : [
          db
            .update(affiliateCommission)
            .set({ status, payoutId: null, updatedAt: now })
            .where(
              and(
                eq(affiliateCommission.payoutId, payoutId),
                inArray(affiliateCommission.id, ids),
              ),
            ),
        ];
  });
  // Commissions first: deleting the payout would clear their payout_id.
  const queries: BatchItem<"pg">[] = [
    ...restore,
    db.delete(affiliatePayout).where(eq(affiliatePayout.id, payoutId)),
  ];
  await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
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
