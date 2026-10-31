import { Webhooks } from "@polar-sh/nextjs";
import { database as db, subscription } from "@repo/database";
import { sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

function safeParseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

type WebhooksConfig = Parameters<typeof Webhooks>[0];

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
      const userId = data.customer?.externalId;

      const subscriptionData = {
        id: data.id,
        createdAt: new Date(data.createdAt),
        modifiedAt: safeParseDate(data.modifiedAt),
        amount: data.amount,
        currency: data.currency,
        recurringInterval: data.recurringInterval,
        status: data.status,
        currentPeriodStart:
          safeParseDate(data.currentPeriodStart) || new Date(),
        currentPeriodEnd: safeParseDate(data.currentPeriodEnd) || new Date(),
        cancelAtPeriodEnd: data.cancelAtPeriodEnd || false,
        canceledAt: safeParseDate(data.canceledAt),
        startedAt: safeParseDate(data.startedAt) || new Date(),
        endsAt: safeParseDate(data.endsAt),
        endedAt: safeParseDate(data.endedAt),
        customerId: data.customerId,
        productId: data.productId,
        discountId: data.discountId || null,
        checkoutId: data.checkoutId || "",
        customerCancellationReason: data.customerCancellationReason || null,
        customerCancellationComment: data.customerCancellationComment || null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
        customFieldData: data.customFieldData
          ? JSON.stringify(data.customFieldData)
          : null,
        userId: userId as string | null,
      };

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
