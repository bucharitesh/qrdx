import "server-only";

import { z } from "zod";
import { sendEmail } from "@/lib/email/send";
import {
  EnterpriseRequestEmail,
  enterpriseRequestSubject,
} from "@/lib/email/templates/enterprise-request";
import {
  ENTERPRISE_EMAIL,
  ENTERPRISE_FIELD_LIMITS,
  TEAM_SIZE_LABELS,
  TEAM_SIZES,
} from "@/lib/enterprise";
import { HttpError } from "@/lib/error-response";
import { isFeatureAvailable } from "@/lib/feature-availability";

// The contact form on /enterprise. It goes the way pay-by-invoice requests
// go (lib/invoice-requests.tsx): an email to QRdx's sales address with the
// sender as reply-to, and a person answers. Only where QRdx itself runs,
// with email set up (feature "enterpriseRequests"); the page shows the plain
// address everywhere. actions/enterprise-requests.ts adds the anti-abuse
// checks a public form needs.

export const enterpriseRequestSchema = z.object({
  name: z.string().trim().min(1).max(ENTERPRISE_FIELD_LIMITS.name),
  email: z.email().max(ENTERPRISE_FIELD_LIMITS.email),
  company: z.string().trim().min(1).max(ENTERPRISE_FIELD_LIMITS.company),
  teamSize: z.enum(TEAM_SIZES),
  need: z.string().trim().min(1).max(ENTERPRISE_FIELD_LIMITS.need),
});

export type EnterpriseRequestInput = z.input<typeof enterpriseRequestSchema>;
export type EnterpriseRequestField = keyof EnterpriseRequestInput;

/** The first field that failed, for the form to point at. */
export class EnterpriseRequestInvalid extends HttpError {
  readonly field: EnterpriseRequestField;
  constructor(field: EnterpriseRequestField) {
    super(400, "VALIDATION_ERROR", `Check the ${field} field.`);
    this.field = field;
  }
}

/**
 * Emails the request to QRdx. Throws 400 (EnterpriseRequestInvalid) for a
 * bad field, 503 UNAVAILABLE where the form isn't offered and 502 NOT_SENT
 * when the email didn't go out, so the form can point at the address.
 */
export async function sendEnterpriseRequest(
  input: EnterpriseRequestInput,
  locale: string,
): Promise<void> {
  if (!isFeatureAvailable("enterpriseRequests")) {
    throw new HttpError(
      503,
      "UNAVAILABLE",
      `The form isn't offered on this server. Email ${ENTERPRISE_EMAIL}.`,
    );
  }
  const parsed = enterpriseRequestSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    throw new EnterpriseRequestInvalid(
      (typeof field === "string" ? field : "need") as EnterpriseRequestField,
    );
  }
  const data = parsed.data;
  const teamSize = TEAM_SIZE_LABELS[data.teamSize];
  const result = await sendEmail({
    to: ENTERPRISE_EMAIL,
    replyTo: data.email,
    subject: enterpriseRequestSubject(data.company, teamSize),
    react: (
      <EnterpriseRequestEmail
        company={data.company}
        email={data.email}
        locale={locale}
        name={data.name}
        need={data.need}
        teamSize={teamSize}
      />
    ),
    tags: [{ name: "kind", value: "enterprise-request" }],
  });
  if (!result.sent) {
    throw new HttpError(
      502,
      "NOT_SENT",
      `We couldn't send your message. Email ${ENTERPRISE_EMAIL} instead.`,
    );
  }
}
