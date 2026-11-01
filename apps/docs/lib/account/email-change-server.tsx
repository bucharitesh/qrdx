import "server-only";

import { isOutboundDeliveryAllowed } from "@/lib/delivery-guard";
import { sendEmail } from "@/lib/email/send";
import {
  EMAIL_CHANGED_SUBJECT,
  EmailChangedEmail,
} from "@/lib/email/templates/email-change";
import { isBillingConfigured, polar } from "@/lib/polar";
import { deliverEmailChangedNotice } from "./email-change";

// No addresses or ids in these logs: outcomes only.
function log(level: "info" | "warn", fields: Record<string, unknown>) {
  console[level](JSON.stringify({ event: "account.email_changed", ...fields }));
}

const statusOf = (error: unknown): number | undefined => {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : undefined;
};

const isNotFound = (error: unknown) =>
  statusOf(error) === 404 ||
  (error instanceof Error && error.name === "ResourceNotFound");

/**
 * Keeps the Polar customer's email (receipts, the billing portal) in step.
 * Best effort: most users never checked out, so have no Polar customer.
 * Polar errors can echo the request, so only their name and status are kept.
 */
async function updatePolarCustomerEmail(
  userId: string,
  email: string,
): Promise<"updated" | "no-customer" | "not-configured" | "failed"> {
  if (!isBillingConfigured) return "not-configured";
  try {
    await polar.customers.updateExternal({
      externalId: userId,
      customerUpdateExternalID: { email },
    });
    return "updated";
  } catch (error) {
    if (isNotFound(error)) return "no-customer";
    log("warn", {
      step: "polar",
      error: error instanceof Error ? error.name : "unknown",
      status: statusOf(error),
    });
    return "failed";
  }
}

/**
 * Everything after the address changed. Never throws: the change is done,
 * and each step is reported rather than undone.
 */
export async function afterEmailChanged({
  userId,
  previousEmail,
  newEmail,
}: {
  userId: string;
  previousEmail: string;
  newEmail: string;
}): Promise<void> {
  const [notice, polarCustomer] = await Promise.all([
    deliverEmailChangedNotice(
      { previousEmail, newEmail },
      {
        nodeEnv: process.env.NODE_ENV,
        deliveryAllowed: isOutboundDeliveryAllowed(),
        log: (line) => console.info(line),
        send: () =>
          sendEmail({
            to: previousEmail,
            subject: EMAIL_CHANGED_SUBJECT,
            react: <EmailChangedEmail newEmail={newEmail} />,
            tags: [{ name: "category", value: "email_changed" }],
          }),
      },
    ),
    updatePolarCustomerEmail(userId, newEmail),
  ]);
  log(notice === "not-sent" ? "warn" : "info", {
    notice,
    polar: polarCustomer,
  });
}
