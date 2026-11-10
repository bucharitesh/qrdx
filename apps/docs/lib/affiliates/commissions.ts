import "server-only";

import {
  affiliate,
  affiliateCommission,
  affiliateReferral,
  affiliateRefundedOrder,
  database as db,
  subscription,
} from "@repo/database";
import cuid from "cuid";
import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { logError } from "@/lib/log-error";
import { noteMissingTables } from "./missing-table";
import {
  availableAtFor,
  chargedNetAmount,
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
// event. Nothing runs unless the program is on (QRDX_AFFILIATES); then only
// these matter:
//
// - order.paid: a referred customer paid. Their first payment starts their
//   12 months (recorded before anything else is checked, so a payment while
//   their affiliate is suspended still counts as the first). Within those 12
//   months, that's a pending commission of 30% of what the customer was
//   charged before tax (rules.ts chargedNetAmount: Polar's `net_amount`,
//   capped at `due_amount − tax_amount` for account credit) less
//   `refunded_amount`, payable 30 days after the payment. One per order:
//   polar_order_id is unique, so a repeated webhook finds the existing row
//   and changes nothing.
// - refund.created / refund.updated (status "succeeded", net amount above
//   0) and order.refunded: a refund before the 30 days are over voids the
//   commission. A refund Polar made to prevent a chargeback (the refund has
//   a `dispute`, or the reason "dispute_prevention") is recorded as a
//   chargeback. Repeats are harmless: only a pending or approved commission
//   is voided, and the refund's id is kept. A refund that arrives before
//   the order's commission exists is kept in affiliate_refunded_order, and
//   order.paid then records the commission void.
//
// Polar sends no webhook for a dispute itself; a chargeback that ends
// without a refund event is voided by hand in the admin area.
//
// Self-referral is checked again here (people can join a workspace after
// sign-up): such an order gets a void commission with the reason
// "self_referral", so the admin can see it.
//
// Nothing here throws: a failure, including the tables not existing yet, is
// logged and the webhook still succeeds. A database error is logged at
// error level as affiliates.commission_failed with the order id, so a
// missed commission can be found and added by hand.

export interface PolarOrderLike {
  id: string;
  created_at?: string | Date | null;
  modified_at?: string | Date | null;
  status?: string;
  paid?: boolean;
  net_amount: number;
  tax_amount?: number | null;
  due_amount?: number | null;
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
  customer_id?: string | null;
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
  | { status: "refund_recorded" }
  | {
      status: "skipped";
      reason:
        | "unavailable"
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

/** The QRdx account of a Polar customer: its external id, else a subscription's. */
async function userIdForCustomer(customer: {
  externalId?: string | null;
  polarCustomerId?: string | null;
}): Promise<string | null> {
  if (customer.externalId) return customer.externalId;
  if (!customer.polarCustomerId) return null;
  const [row] = await db
    .select({ userId: subscription.userId })
    .from(subscription)
    .where(eq(subscription.customerId, customer.polarCustomerId))
    .limit(1);
  return row?.userId ?? null;
}

/**
 * Starts the customer's 12 months at their earliest payment: sets
 * first_paid_at to `paidAt` unless an earlier one is already there, in one
 * conditional UPDATE (the same rule as `LEAST(coalesce(first_paid_at, $1),
 * $1)`, so two orders handled at once both end at the earlier). Returns the
 * stored value.
 */
async function recordFirstPayment(
  referralId: string,
  paidAt: Date,
): Promise<Date> {
  await db
    .update(affiliateReferral)
    .set({ firstPaidAt: paidAt })
    .where(
      and(
        eq(affiliateReferral.id, referralId),
        or(
          isNull(affiliateReferral.firstPaidAt),
          gt(affiliateReferral.firstPaidAt, paidAt),
        ),
      ),
    );
  const [row] = await db
    .select({ firstPaidAt: affiliateReferral.firstPaidAt })
    .from(affiliateReferral)
    .where(eq(affiliateReferral.id, referralId))
    .limit(1);
  return row?.firstPaidAt ?? paidAt;
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

  const userId = await userIdForCustomer({
    externalId: order.customer?.external_id,
    polarCustomerId: order.customer_id,
  });
  if (!userId) return { status: "skipped", reason: "no_user" };

  const [referral] = await db
    .select({
      id: affiliateReferral.id,
      affiliateId: affiliateReferral.affiliateId,
    })
    .from(affiliateReferral)
    .where(eq(affiliateReferral.referredUserId, userId))
    .limit(1);
  if (!referral) return { status: "skipped", reason: "not_referred" };

  // What the customer was charged before tax. A free order (a 100%
  // discount) or one paid entirely with account credit isn't a payment: it
  // neither earns nor starts the customer's 12 months.
  const charged = chargedNetAmount(order);
  if (charged <= 0) return { status: "skipped", reason: "zero_amount" };

  // Their 12 months start at their first payment, whatever happens next.
  const firstPaidAt = await recordFirstPayment(referral.id, paidAt);

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
  if (!isWithinCommissionWindow(firstPaidAt, paidAt)) {
    return { status: "skipped", reason: "outside_window" };
  }

  const availableAt = availableAtFor(paidAt);
  const refunded = Math.max(0, Number(order.refunded_amount ?? 0) || 0);
  // A refund or chargeback reported before this order had a commission.
  const [earlierRefund] = await db
    .select({
      polarRefundId: affiliateRefundedOrder.polarRefundId,
      reason: affiliateRefundedOrder.reason,
      refundedAt: affiliateRefundedOrder.refundedAt,
    })
    .from(affiliateRefundedOrder)
    .where(eq(affiliateRefundedOrder.polarOrderId, order.id))
    .limit(1);

  let voidReason: VoidReason | null = null;
  let voidRefundId: string | null = null;
  if (
    await isSelfReferral({
      affiliateUserId: owner.userId,
      customerUserId: userId,
      customerEmails: [order.customer?.email],
    })
  ) {
    voidReason = "self_referral";
  } else if (
    earlierRefund &&
    refundVoids({ status: "pending", availableAt }, earlierRefund.refundedAt)
  ) {
    voidReason =
      earlierRefund.reason === "chargeback" ? "chargeback" : "refund";
    voidRefundId = earlierRefund.polarRefundId;
  } else if (refunded > 0) {
    // Refunded before this webhook was handled: still within the 30 days.
    voidReason = "refund";
  }

  const base =
    voidReason === "refund" || voidReason === "chargeback"
      ? charged
      : commissionBase(order);
  const id = cuid();
  const inserted = await db
    .insert(affiliateCommission)
    .values({
      id,
      affiliateId: referral.affiliateId,
      referralId: referral.id,
      referredUserId: userId,
      polarOrderId: order.id,
      currency: order.currency,
      orderAmount: base,
      rateBps: AFFILIATE_COMMISSION_BPS,
      amount: commissionFor(base),
      status: voidReason ? "void" : "pending",
      orderPaidAt: paidAt,
      availableAt,
      voidedAt: voidReason ? now : null,
      voidReason,
      voidRefundId,
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

/**
 * A refund that came before its order's commission: kept for order.paid, but
 * only for a referred customer (or one this server can't place), so these
 * rows never hold other customers' refunds.
 */
async function rememberRefundedOrder(input: {
  orderId: string;
  refundedAt: Date;
  refundId?: string | null;
  reason: "refund" | "chargeback";
  customer: { externalId?: string | null; polarCustomerId?: string | null };
  now: Date;
}): Promise<CommissionResult> {
  const userId = await userIdForCustomer(input.customer);
  if (userId) {
    const [referral] = await db
      .select({ id: affiliateReferral.id })
      .from(affiliateReferral)
      .where(eq(affiliateReferral.referredUserId, userId))
      .limit(1);
    if (!referral) return { status: "skipped", reason: "no_commission" };
  }
  await db
    .insert(affiliateRefundedOrder)
    .values({
      polarOrderId: input.orderId,
      polarRefundId: input.refundId ?? null,
      reason: input.reason,
      refundedAt: input.refundedAt,
      createdAt: input.now,
    })
    .onConflictDoNothing({ target: affiliateRefundedOrder.polarOrderId });
  console.info(
    JSON.stringify({
      event: "affiliates.refund_before_order",
      orderId: input.orderId,
      reason: input.reason,
    }),
  );
  return { status: "refund_recorded" };
}

/** A refund or chargeback: voids the order's commission if it's still in its hold. */
export async function voidForRefund(input: {
  orderId: string;
  refundedAt: Date;
  refundId?: string | null;
  reason: Extract<VoidReason, "refund" | "chargeback">;
  customer?: { externalId?: string | null; polarCustomerId?: string | null };
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
  if (!row) {
    return rememberRefundedOrder({
      orderId: input.orderId,
      refundedAt: input.refundedAt,
      refundId: input.refundId,
      reason: input.reason,
      customer: input.customer ?? {},
      now,
    });
  }

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
        customer: {
          externalId: order.customer?.external_id,
          polarCustomerId: order.customer_id,
        },
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
        customer: { polarCustomerId: refund.customer_id },
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
 * The Polar webhook's affiliate step. Does nothing while the program is off.
 * Never throws: a failure is logged at error level with the event type, the
 * order's id and the refund's id, so a missed commission can be found and
 * added by hand.
 */
export async function handleAffiliateWebhook(
  event: AffiliateWebhookEvent,
  options: { now?: Date } = {},
): Promise<CommissionResult> {
  if (!HANDLED.has(event?.type)) {
    return { status: "skipped", reason: "ignored_event" };
  }
  if (!isFeatureAvailable("affiliates")) {
    return { status: "skipped", reason: "unavailable" };
  }
  try {
    return await handle(event, options.now ?? new Date());
  } catch (error) {
    if (noteMissingTables(error)) {
      return { status: "skipped", reason: "missing_tables" };
    }
    const data = event.data as {
      id?: unknown;
      order_id?: unknown;
    } | null;
    const orderId =
      typeof data?.order_id === "string"
        ? data.order_id
        : typeof data?.id === "string"
          ? data.id
          : null;
    // For reconciling by hand: which event, which order, what failed.
    console.error(
      JSON.stringify({
        event: "affiliates.commission_failed",
        type: event.type,
        orderId,
        refundId:
          event.type.startsWith("refund.") && typeof data?.id === "string"
            ? data.id
            : null,
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}`.slice(0, 300)
            : "unknown",
      }),
    );
    logError(error as Error, { action: "affiliates.webhook", orderId });
    return { status: "skipped", reason: "error" };
  }
}

/**
 * The daily cron (/api/cron/webhooks): marks pending commissions whose 30
 * days are over as approved, in batches, until the deadline. Pages don't
 * wait for this (they treat a pending commission past its hold as payable),
 * it keeps the stored status honest. Does nothing while the program is off.
 * Never throws; returns how many it moved.
 */
export async function releaseHeldCommissions(
  options: { now?: Date; deadline?: number; batchSize?: number } = {},
): Promise<number> {
  if (!isFeatureAvailable("affiliates")) return 0;
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
