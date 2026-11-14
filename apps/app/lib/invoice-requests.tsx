import "server-only";

import { z } from "zod";
import { sendEmail } from "@/lib/email/send";
import {
  InvoiceRequestEmail,
  invoiceRequestSubject,
} from "@/lib/email/templates/invoice-request";
import { ENTERPRISE_EMAIL } from "@/lib/enterprise";
import { HttpError } from "@/lib/error-response";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { cheapestPlanWith } from "@/lib/plans";
import { formatPrice, PLAN_NAMES, PRICING } from "@/lib/pricing";

// Paying a yearly plan by invoice (agency tools). Polar, QRdx's merchant of
// record, only takes cards, wallets and a few local methods at checkout:
// no bank transfer, no invoice to pay later, and nothing to turn on
// (polar.sh/docs/features/checkout/payment-methods). So a request is
// emailed to QRdx with the requester as reply-to, and the invoice is
// arranged by hand. Only on qrdx.dev (feature "invoiceRequests").

/** Where requests go: QRdx's address for contracts and custom invoicing. */
export const INVOICE_REQUEST_TO = ENTERPRISE_EMAIL;

/** The plan an invoice can pay for: the cheapest with invoiceBilling, yearly. */
export function invoicePlan() {
  const plan = cheapestPlanWith((limits) => limits.invoiceBilling);
  if (!plan || plan === "free") return null;
  return {
    plan,
    label: `${PLAN_NAMES[plan]}, billed yearly (${formatPrice(
      PRICING[plan].year.amounts.USD,
      "USD",
      "en",
    )} a year)`,
  };
}

export const invoiceRequestSchema = z.object({
  company: z
    .string()
    .trim()
    .min(1, "Enter your company's name.")
    .max(200, "Keep the company name under 200 characters."),
  billingEmail: z
    .email("Enter the email address invoices should go to.")
    .max(254),
  country: z
    .string()
    .trim()
    .min(2, "Enter your country.")
    .max(80, "Keep the country under 80 characters."),
  taxId: z
    .string()
    .trim()
    .max(64, "Keep the tax ID under 64 characters.")
    .transform((value) => value || null),
  address: z
    .string()
    .trim()
    .max(500, "Keep the address under 500 characters.")
    .transform((value) => value || null),
  notes: z
    .string()
    .trim()
    .max(1000, "Keep the notes under 1,000 characters.")
    .transform((value) => value || null),
});

export type InvoiceRequestInput = z.input<typeof invoiceRequestSchema>;

/**
 * Emails the request to QRdx. Throws 503 UNAVAILABLE where the feature
 * isn't offered and 502 NOT_SENT when the email didn't go out, so the form
 * can point at the address instead.
 */
export async function sendInvoiceRequest(
  input: InvoiceRequestInput,
  account: {
    id: string;
    email: string;
    workspace: { name: string; slug: string } | null;
  },
): Promise<void> {
  const offer = invoicePlan();
  if (!(isFeatureAvailable("invoiceRequests") && offer)) {
    throw new HttpError(
      503,
      "UNAVAILABLE",
      "Paying by invoice isn't offered on this server.",
    );
  }
  const parsed = invoiceRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Check the form and try again.",
    );
  }
  const data = parsed.data;
  const result = await sendEmail({
    to: INVOICE_REQUEST_TO,
    replyTo: data.billingEmail,
    subject: invoiceRequestSubject(data.company, offer.label),
    react: (
      <InvoiceRequestEmail
        accountEmail={account.email}
        accountId={account.id}
        address={data.address}
        billingEmail={data.billingEmail}
        company={data.company}
        country={data.country}
        notes={data.notes}
        plan={offer.label}
        taxId={data.taxId}
        workspace={account.workspace}
      />
    ),
    tags: [{ name: "kind", value: "invoice-request" }],
  });
  if (!result.sent) {
    throw new HttpError(
      502,
      "NOT_SENT",
      `We couldn't send your request. Email ${INVOICE_REQUEST_TO} instead.`,
    );
  }
}
