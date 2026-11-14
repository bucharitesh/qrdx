// Enterprise: the Business plan under a contract, with written reply times
// and invoicing (owner decisions, 2026-11-09 and 2026-11-13). Client-safe:
// the /enterprise page, the Enterprise card on /pricing, llms.txt and the
// contact form's server side all read these.
//
// Reply times only. Nothing QRdx runs on carries an uptime guarantee, so
// no copy anywhere promises uptime or an uptime percentage.

/** Where contracts, custom invoicing and security reviews go. */
export { ENTERPRISE_EMAIL } from "@repo/config";

/** Written reply times in an Enterprise contract (business hours/days). */
export const ENTERPRISE_REPLY = {
  /** When codes or hosted pages stop working. */
  outageBusinessHours: 4,
  /** Everything else. */
  otherBusinessDays: 1,
} as const;

/** The Business plan's reply time, as /docs/help/contact promises it. */
export const BUSINESS_REPLY_BUSINESS_DAYS = 1;

/** Business hours for both: Monday to Friday, India time. */
export const SUPPORT_HOURS = "Monday to Friday, India time";

/**
 * The contact form's hidden field: people never see it, so a sender that
 * fills it in is a bot and gets a quiet "sent" without an email going out.
 */
export const ENTERPRISE_HONEYPOT_FIELD = "website";

/** The contact form's longest answers, in characters. */
export const ENTERPRISE_FIELD_LIMITS = {
  name: 120,
  email: 254,
  company: 200,
  need: 2000,
} as const;

/** Team sizes the contact form offers, in order. */
export const TEAM_SIZES = [
  "1-10",
  "11-50",
  "51-200",
  "201-1000",
  "1000+",
] as const;

export type TeamSize = (typeof TEAM_SIZES)[number];

export function isTeamSize(value: unknown): value is TeamSize {
  return (
    typeof value === "string" &&
    (TEAM_SIZES as readonly string[]).includes(value)
  );
}

/** How the email to QRdx writes a team size. */
export const TEAM_SIZE_LABELS: Record<TeamSize, string> = {
  "1-10": "1 to 10 people",
  "11-50": "11 to 50 people",
  "51-200": "51 to 200 people",
  "201-1000": "201 to 1,000 people",
  "1000+": "More than 1,000 people",
};

/**
 * What Enterprise adds over Business, in English, for llms.txt and
 * /pricing.md. The page and the pricing card say the same from
 * messages/en.json (pricing.enterprise.adds).
 */
export const ENTERPRISE_ADDS = [
  "A yearly contract with your company, paid by invoice",
  `Written reply times: within ${ENTERPRISE_REPLY.outageBusinessHours} business hours when codes or hosted pages stop working, within ${ENTERPRISE_REPLY.otherBusinessDays} business day for everything else`,
  "Answers for your security review and questionnaires",
  "Single sign-on and the audit log on your own server, under the QRdx commercial license",
] as const;
