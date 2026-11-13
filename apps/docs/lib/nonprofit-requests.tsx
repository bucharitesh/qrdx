import "server-only";

import { z } from "zod";
import { sendEmail } from "@/lib/email/send";
import {
  NonprofitRequestEmail,
  nonprofitRequestSubject,
} from "@/lib/email/templates/nonprofit-request";
import { HttpError } from "@/lib/error-response";
import { isFeatureAvailable } from "@/lib/feature-availability";
import {
  NONPROFIT_DISCOUNT_PERCENT,
  PAID_PLANS,
  type PaidPlan,
  PLAN_NAMES,
} from "@/lib/pricing";

// The non-profit discount: registered non-profits and charities get
// NONPROFIT_DISCOUNT_PERCENT off Pro or Business. The pricing page's form
// emails the request to QRdx with the requester as reply-to (the same path
// as pay-by-invoice requests, lib/invoice-requests.tsx); QRdx checks the
// registration and replies with a Polar discount code to enter at checkout.
// Only on qrdx.dev (feature "nonprofitDiscounts").

/** Where requests go: QRdx support, who also handles refunds. */
export const NONPROFIT_REQUEST_TO = "support@qrdx.dev";

export const nonprofitOffer = () =>
  `${NONPROFIT_DISCOUNT_PERCENT}% off ${PAID_PLANS.map((plan) => PLAN_NAMES[plan]).join(" or ")}`;

export const nonprofitRequestSchema = z.object({
  organization: z
    .string()
    .trim()
    .min(2, "Enter your organization's name.")
    .max(200, "Keep the organization name under 200 characters."),
  country: z
    .string()
    .trim()
    .min(2, "Enter your country.")
    .max(80, "Keep the country under 80 characters."),
  registration: z
    .string()
    .trim()
    .min(2, "Enter your registration number or a link to your entry.")
    .max(300, "Keep the registration under 300 characters."),
  contactEmail: z.email("Enter an email address we can reply to.").max(254),
  plan: z.enum(PAID_PLANS as [PaidPlan, ...PaidPlan[]], {
    error: "Choose Pro or Business.",
  }),
});

export type NonprofitRequestInput = z.input<typeof nonprofitRequestSchema>;

/**
 * Emails the request to QRdx. Throws 503 UNAVAILABLE where the discount
 * isn't offered and 502 NOT_SENT when the email didn't go out, so the form
 * can point at the address instead.
 */
export async function sendNonprofitRequest(
  input: NonprofitRequestInput,
  account: {
    id: string;
    email: string;
    workspace: { name: string; slug: string } | null;
  },
): Promise<void> {
  if (!isFeatureAvailable("nonprofitDiscounts")) {
    throw new HttpError(
      503,
      "UNAVAILABLE",
      "The non-profit discount isn't offered on this server.",
    );
  }
  const parsed = nonprofitRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Check the form and try again.",
    );
  }
  const data = parsed.data;
  const plan = PLAN_NAMES[data.plan];
  const result = await sendEmail({
    to: NONPROFIT_REQUEST_TO,
    replyTo: data.contactEmail,
    subject: nonprofitRequestSubject(data.organization, plan),
    react: (
      <NonprofitRequestEmail
        accountEmail={account.email}
        accountId={account.id}
        contactEmail={data.contactEmail}
        country={data.country}
        offer={nonprofitOffer()}
        organization={data.organization}
        plan={plan}
        registration={data.registration}
        workspace={account.workspace}
      />
    ),
    tags: [{ name: "kind", value: "nonprofit-request" }],
  });
  if (!result.sent) {
    throw new HttpError(
      502,
      "NOT_SENT",
      `We couldn't send your request. Email ${NONPROFIT_REQUEST_TO} instead.`,
    );
  }
}
