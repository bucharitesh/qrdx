import { Webhooks } from "@polar-sh/nextjs";
import { database as db, subscription } from "@repo/database";
import { sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import {
  plansBeforeBillingChange,
  recordPlanChanges,
} from "@/ee/audit-log/plan-change";
import { trackServer } from "@/lib/analytics/server";
import { env } from "@/lib/env";
import { planForProductId } from "@/lib/pricing";

function safeParseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

type WebhooksConfig = Parameters<typeof Webhooks>[0];

// Payload fields are snake_case since @polar-sh/sdk 1.0.
const onPayload: WebhooksConfig["onPayload"] = async ({ data, type }) => {
  if (
    type === "subscription.created" ||
    type === "subscription.active" ||
    type === "subscription.canceled" ||
    type === "subscription.revoked" ||
    type === "subscription.uncanceled" ||
    type === "subscription.updated"
  ) {
    try {
      const userId = data.customer?.external_id;

      const subscriptionData = {
        id: data.id,
        createdAt: new Date(data.created_at),
        modifiedAt: safeParseDate(data.modified_at),
        amount: data.amount,
        currency: data.currency,
        recurringInterval: data.recurring_interval,
        status: data.status,
        currentPeriodStart:
          safeParseDate(data.current_period_start) || new Date(),
        currentPeriodEnd: safeParseDate(data.current_period_end) || new Date(),
        cancelAtPeriodEnd: data.cancel_at_period_end || false,
        canceledAt: safeParseDate(data.canceled_at),
        startedAt: safeParseDate(data.started_at) || new Date(),
        endsAt: safeParseDate(data.ends_at),
        endedAt: safeParseDate(data.ended_at),
        customerId: data.customer_id,
        productId: data.product_id,
        discountId: data.discount_id || null,
        checkoutId: data.checkout_id || "",
        customerCancellationReason: data.customer_cancellation_reason || null,
        customerCancellationComment: data.customer_cancellation_comment || null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        customFieldData: data.custom_field_data
          ? JSON.stringify(data.custom_field_data)
          : null,
        userId: userId as string | null,
      };

      const plansBefore = await plansBeforeBillingChange(userId);
      await db
        .insert(subscription)
        .values(subscriptionData)
        .onConflictDoUpdate({
          target: subscription.id,
          // Webhooks can arrive out of order or be redelivered: never let an
          // older snapshot overwrite a newer one.
          setWhere: sql`coalesce(excluded.modified_at, excluded.created_at) >= coalesce(${subscription.modifiedAt}, ${subscription.createdAt})`,
          set: {
            modifiedAt: subscriptionData.modifiedAt,
            amount: subscriptionData.amount,
            currency: subscriptionData.currency,
            recurringInterval: subscriptionData.recurringInterval,
            status: subscriptionData.status,
            currentPeriodStart: subscriptionData.currentPeriodStart,
            currentPeriodEnd: subscriptionData.currentPeriodEnd,
            cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
            canceledAt: subscriptionData.canceledAt,
            startedAt: subscriptionData.startedAt,
            endsAt: subscriptionData.endsAt,
            endedAt: subscriptionData.endedAt,
            customerId: subscriptionData.customerId,
            productId: subscriptionData.productId,
            discountId: subscriptionData.discountId,
            checkoutId: subscriptionData.checkoutId,
            customerCancellationReason:
              subscriptionData.customerCancellationReason,
            customerCancellationComment:
              subscriptionData.customerCancellationComment,
            metadata: subscriptionData.metadata,
            customFieldData: subscriptionData.customFieldData,
            userId: sql`coalesce(excluded.user_id, ${subscription.userId})`,
          },
        });
      await recordPlanChanges(userId, plansBefore);

      if (type === "subscription.active") {
        trackServer(
          "subscription_activated",
          {
            plan: planForProductId(data.product_id) ?? "pro",
            interval: data.recurring_interval ?? undefined,
          },
          {
            // Named only if the buyer allowed analytics (set at checkout).
            distinctId:
              data.metadata?.analytics_consent === "1" ? userId : null,
            dedupeKey: data.id,
            timestamp: subscriptionData.startedAt,
          },
        );
      }

      console.log("Processed Polar webhook:", {
        type,
        subscriptionId: subscriptionData.id,
        status: subscriptionData.status,
      });
    } catch (error) {
      console.error("Error processing subscription webhook:", error);
      // Rethrow so the handler returns 5xx and Polar retries the delivery.
      throw error;
    }
  }
};

const handleWebhook = env.POLAR_WEBHOOK_SECRET
  ? Webhooks({ webhookSecret: env.POLAR_WEBHOOK_SECRET, onPayload })
  : null;

export async function POST(request: NextRequest) {
  if (!handleWebhook) {
    return NextResponse.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  return handleWebhook(request);
}
