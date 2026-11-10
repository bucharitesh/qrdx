import "server-only";

import {
  affiliate,
  affiliateCommission,
  affiliateReferral,
  database as db,
  subscription,
} from "@repo/database";
import cuid from "cuid";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { logError } from "@/lib/log-error";
import { noteMissingTables } from "./missing-table";
import {
  availableAtFor,
  commissionBase,
  commissionFor,
  isWithinCommissionWindow,
  refundVoids,
  type VoidReason,
} from "./rules";
import { isSelfReferral } from "./self-referral";
import { AFFILIATE_COMMISSION_BPS } from "./terms";

// Commissions from Polar's webhooks (app/api/webhook/polar). The route calls
// handleAffiliateWebhook after it has saved the billing state, for every
// event; only these matter here:
//
// - order.paid: a referred customer paid. Within 12 months of their first
//   payment, that's a pending commission of 30% of Polar's `net_amount`
//   (after discounts, before tax) less `refunded_amount`, payable 30 days
//   after the payment. One per order: polar_order_id is unique, so a
//   repeated webhook finds the existing row and changes nothing.
// - refund.created / refund.updated (status "succeeded", net amount above
//   0) and order.refunded: a refund before the 30 days are over voids the
//   commission. A refund Polar made to prevent a chargeback (the refund has
//   a `dispute`, or the reason "dispute_prevention") is recorded as a
//   chargeback. Repeats are harmless: only a pending or approved commission
//   is voided, and the refund's id is kept.
//
// Polar sends no webhook for a dispute itself; a chargeback that ends
// without a refund event is voided by hand in the admin area.
//
// Self-referral is checked again here (people can join a workspace after
// sign-up): such an order gets a void commission with the reason
// "self_referral", so the admin can see it.
//
// Nothing here throws: a failure, including the tables not existing yet, is
// logged with the order id and the webhook still succeeds.

export interface PolarOrderLike {
  id: string;
  created_at?: string | Date | null;
  modified_at?: string | Date | null;
  status?: string;
  paid?: boolean;
  net_amount: number;
  refunded_amount?: number | null;
  currency: string;
  customer_id?: string | null;
  customer?: {
    external_id?: string | null;
    email?: string | null;
  } | null;
}

export interface PolarRefundLike {
  id: string;
  created_at?: string | Date | null;
  status?: string;
  amount?: number;
  order_id?: string | null;
  reason?: string | null;
  dispute?: unknown;
}

export interface AffiliateWebhookEvent {
  type: string;
  timestamp?: string | Date | null;
  data: unknown;
}

export type CommissionResult =
  | { status: "created"; commissionId: string; voidReason: VoidReason | null }
  | { status: "duplicate" }
  | { status: "voided"; reason: VoidReason }
  | {
      status: "skipped";
      reason:
        | "ignored_event"
        | "invalid"
        | "unpaid"
        | "no_user"
        | "not_referred"
        | "affiliate_not_approved"
        | "zero_amount"
        | "outside_window"
        | "no_commission"
        | "already_void"
        | "already_paid"
        | "after_hold"
        | "missing_tables"
        | "error";
    };

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The QRdx account behind a Polar order: the customer's external id, else a subscription's. */
async function userIdForOrder(order: PolarOrderLike): Promise<string | null> {
  const external = order.customer?.external_id;
  if (external) return external;
  if (!order.customer_id) return null;
  const [row] = await db
    .select({ userId: subscription.userId })
    .from(subscription)
    .where(eq(subscription.customerId, order.customer_id))
    .limit(1);
  return row?.userId ?? null;
}

/** order.paid: creates the order's commission when it earns one. */
export async function recordPaidOrder(
  order: PolarOrderLike,
  options: { paidAt?: string | Date | null; now?: Date } = {},
): Promise<CommissionResult> {
  if (!(order?.id && typeof order.currency === "string")) {
    return { status: "skipped", reason: "invalid" };
  }
  if (order.paid === false) return { status: "skipped", reason: "unpaid" };
  const now = options.now ?? new Date();
  // When Polar reported the payment (the event's time), else the order's.
  const paidAt =
    toDate(options.paidAt) ??
    toDate(order.modified_at) ??
    toDate(order.created_at) ??
    now;

  const userId = await userIdForOrder(order);
  if (!userId) return { status: "skipped", reason: "no_user" };

  const [referral] = await db
    .select({
      id: affiliateReferral.id,
      affiliateId: affiliateReferral.affiliateId,
      firstPaidAt: affiliateReferral.firstPaidAt,
    })
    .from(affiliateReferral)
    .where(eq(affiliateReferral.referredUserId, userId))
    .limit(1);
  if (!referral) return { status: "skipped", reason: "not_referred" };

  const [owner] = await db
    .select({ userId: affiliate.userId, status: affiliate.status })
    .from(affiliate)
    .where(eq(affiliate.id, referral.affiliateId))
    .limit(1);
  if (owner?.status !== "approved") {
    console.info(
      JSON.stringify({
        event: "affiliates.commission_skipped",
        reason: "affiliate_not_approved",
        orderId: order.id,
      }),
    );
    return { status: "skipped", reason: "affiliate_not_approved" };
  }

  const net = Math.max(0, Number(order.net_amount) || 0);
  const refunded = Math.max(0, Number(order.refunded_amount ?? 0) || 0);
  const base = commissionBase(order);
  // A free order (a 100% discount) isn't a payment: it neither earns nor
  // starts the customer's 12 months.
  if (net <= 0) return { status: "skipped", reason: "zero_amount" };

  // Their 12 months start at their first payment.
  let firstPaidAt = referral.firstPaidAt;
  if (!firstPaidAt || paidAt.getTime() < firstPaidAt.getTime()) {
    await db
      .update(affiliateReferral)
      .set({ firstPaidAt: paidAt })
      .where(eq(affiliateReferral.id, referral.id));
    firstPaidAt = paidAt;
  }
  if (!isWithinCommissionWindow(firstPaidAt, paidAt)) {
    return { status: "skipped", reason: "outside_window" };
  }

  let voidReason: VoidReason | null = null;
  if (
    await isSelfReferral({
      affiliateUserId: owner.userId,
      customerUserId: userId,
      customerEmails: [order.customer?.email],
    })
  ) {
    voidReason = "self_referral";
  } else if (refunded > 0) {
    // Refunded before this webhook was handled: still within the 30 days.
    voidReason = "refund";
  }

  const id = cuid();
  const inserted = await db
    .insert(affiliateCommission)
    .values({
      id,
      affiliateId: referral.affiliateId,
      referralId: referral.id,
      referredUserId: userId,
      polarOrderId: order.id,
      polarCustomerId: order.customer_id ?? null,
      currency: order.currency,
      orderAmount: voidReason === "refund" ? net : base,
      rateBps: AFFILIATE_COMMISSION_BPS,
      amount: commissionFor(voidReason === "refund" ? net : base),
      status: voidReason ? "void" : "pending",
      orderPaidAt: paidAt,
      availableAt: availableAtFor(paidAt),
      voidedAt: voidReason ? now : null,
      voidReason,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: affiliateCommission.polarOrderId })
    .returning({ id: affiliateCommission.id });
  if (inserted.length === 0) return { status: "duplicate" };
  console.info(
    JSON.stringify({
      event: "affiliates.commission_created",
      orderId: order.id,
      status: voidReason ? "void" : "pending",
      voidReason,
    }),
  );
  return { status: "created", commissionId: id, voidReason };
}

/** A refund or chargeback: voids the order's commission if it's still in its hold. */
export async function voidForRefund(input: {
  orderId: string;
  refundedAt: Date;
  refundId?: string | null;
  reason: Extract<VoidReason, "refund" | "chargeback">;
  now?: Date;
}): Promise<CommissionResult> {
  const now = input.now ?? new Date();
  const [row] = await db
    .select({
      id: affiliateCommission.id,
      status: affiliateCommission.status,
      availableAt: affiliateCommission.availableAt,
      voidReason: affiliateCommission.voidReason,
      voidRefundId: affiliateCommission.voidRefundId,
    })
    .from(affiliateCommission)
    .where(eq(affiliateCommission.polarOrderId, input.orderId))
    .limit(1);
  if (!row) return { status: "skipped", reason: "no_commission" };

  if (row.status === "void") {
    // order.refunded may have voided it first, without the refund's id or
    // the fact that it was a chargeback: the refund event fills those in.
    if (input.refundId && !row.voidRefundId && row.voidReason === "refund") {
      await db
        .update(affiliateCommission)
        .set({
          voidReason: input.reason,
          voidRefundId: input.refundId,
          updatedAt: now,
        })
        .where(
          and(
            eq(affiliateCommission.id, row.id),
            eq(affiliateCommission.status, "void"),
            isNull(affiliateCommission.voidRefundId),
          ),
        );
    }
    return { status: "skipped", reason: "already_void" };
  }
  if (row.status === "paid") {
    console.warn(
      JSON.stringify({
        event: "affiliates.refund_after_payout",
        orderId: input.orderId,
        refundId: input.refundId ?? null,
      }),
    );
    return { status: "skipped", reason: "already_paid" };
  }
  if (!refundVoids(row, input.refundedAt)) {
    return { status: "skipped", reason: "after_hold" };
  }
  const updated = await db
    .update(affiliateCommission)
    .set({
      status: "void",
      voidedAt: now,
      voidReason: input.reason,
      voidRefundId: input.refundId ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(affiliateCommission.id, row.id),
        inArray(affiliateCommission.status, ["pending", "approved"]),
      ),
    )
    .returning({ id: affiliateCommission.id });
  if (updated.length === 0)
    return { status: "skipped", reason: "already_void" };
  console.info(
    JSON.stringify({
      event: "affiliates.commission_voided",
      orderId: input.orderId,
      reason: input.reason,
    }),
  );
  return { status: "voided", reason: input.reason };
}

/** A refund Polar made to head off a chargeback counts as a chargeback. */
export function isChargebackRefund(refund: PolarRefundLike): boolean {
  return refund.dispute != null || refund.reason === "dispute_prevention";
}

async function handle(
  event: AffiliateWebhookEvent,
  now: Date,
): Promise<CommissionResult> {
  switch (event.type) {
    case "order.paid":
      return recordPaidOrder(event.data as PolarOrderLike, {
        paidAt: event.timestamp,
        now,
      });
    case "order.refunded": {
      const order = event.data as PolarOrderLike;
      // A refund of tax only (refunded_amount 0) changes nothing here.
      if (!order?.id || !(Number(order.refunded_amount) > 0)) {
        return { status: "skipped", reason: "ignored_event" };
      }
      return voidForRefund({
        orderId: order.id,
        refundedAt: toDate(order.modified_at) ?? toDate(event.timestamp) ?? now,
        reason: "refund",
        now,
      });
    }
    case "refund.created":
    case "refund.updated": {
      const refund = event.data as PolarRefundLike;
      if (
        !(refund?.id && refund.order_id) ||
        refund.status !== "succeeded" ||
        !(Number(refund.amount) > 0)
      ) {
        return { status: "skipped", reason: "ignored_event" };
      }
      return voidForRefund({
        orderId: refund.order_id,
        refundedAt: toDate(refund.created_at) ?? toDate(event.timestamp) ?? now,
        refundId: refund.id,
        reason: isChargebackRefund(refund) ? "chargeback" : "refund",
        now,
      });
    }
    default:
      return { status: "skipped", reason: "ignored_event" };
  }
}

const HANDLED = new Set([
  "order.paid",
  "order.refunded",
  "refund.created",
  "refund.updated",
]);

/**
 * The Polar webhook's affiliate step. Never throws: failures are logged
 * with the event type and the order's id, so a missed commission can be
 * found and added by hand.
 */
export async function handleAffiliateWebhook(
  event: AffiliateWebhookEvent,
  options: { now?: Date } = {},
): Promise<CommissionResult> {
  if (!HANDLED.has(event?.type)) {
    return { status: "skipped", reason: "ignored_event" };
  }
  try {
    return await handle(event, options.now ?? new Date());
  } catch (error) {
    if (noteMissingTables(error)) {
      return { status: "skipped", reason: "missing_tables" };
    }
    const data = event.data as { id?: unknown; order_id?: unknown } | null;
    logError(error as Error, {
      action: "affiliates.webhook",
      type: event.type,
      orderId:
        typeof data?.order_id === "string"
          ? data.order_id
          : typeof data?.id === "string"
            ? data.id
            : null,
    });
    return { status: "skipped", reason: "error" };
  }
}

/**
 * The daily cron (/api/cron/webhooks): marks pending commissions whose 30
 * days are over as approved, in batches, until the deadline. Pages don't
 * wait for this (they treat a pending commission past its hold as payable),
 * it keeps the stored status honest. Never throws; returns how many it moved.
 */
export async function releaseHeldCommissions(
  options: { now?: Date; deadline?: number; batchSize?: number } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const deadline = options.deadline ?? Date.now() + 5_000;
  const batchSize = options.batchSize ?? 500;
  let released = 0;
  try {
    while (Date.now() < deadline) {
      const due = await db
        .select({ id: affiliateCommission.id })
        .from(affiliateCommission)
        .where(
          and(
            eq(affiliateCommission.status, "pending"),
            lte(affiliateCommission.availableAt, now),
          ),
        )
        .limit(batchSize);
      if (due.length === 0) break;
      const moved = await db
        .update(affiliateCommission)
        .set({ status: "approved", updatedAt: now })
        .where(
          and(
            inArray(
              affiliateCommission.id,
              due.map((row) => row.id),
            ),
            eq(affiliateCommission.status, "pending"),
          ),
        )
        .returning({ id: affiliateCommission.id });
      released += moved.length;
      if (due.length < batchSize) break;
    }
  } catch (error) {
    if (!noteMissingTables(error)) {
      logError(error as Error, { action: "affiliates.release" });
    }
  }
  return released;
}
