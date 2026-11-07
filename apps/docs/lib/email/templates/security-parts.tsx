import { Link, Section } from "react-email";
import { baseUrl } from "@/lib/metadata";
import { EmailButton, EmailText } from "./layout";
import { DetailsTable } from "./parts";

// Shared by every security email (two-step verification, passkeys, email
// changes, new sign-ins, confirmation codes): where and when it happened,
// the way to the security settings, and the support address.

export const SUPPORT_EMAIL = "support@qrdx.dev";

/** Settings → Profile & security, at Two-step verification. */
export const reviewSecurityUrl = () =>
  new URL("/settings/account#two-factor", baseUrl).toString();

/**
 * Where and when a security event happened. The senders fill it from the
 * request (lib/security/request-details.ts).
 */
export interface SecurityEventDetails {
  /** "Chrome on macOS" */
  device: string | null;
  /** "Mumbai, India" (approximate); null when unknown */
  location: string | null;
  ip: string | null;
  /** "Nov 7, 2026, 3:04 PM GMT+5:30" */
  time: string;
  /**
   * Who made the change when it wasn't the account holder, e.g. "QRdx
   * support". Shown instead of the device, place and address, which would
   * be theirs.
   */
  actor?: string | null;
}

/**
 * Device, approximate location, IP address and time, as label/value rows.
 * Nothing without details (a template rendered outside a sender).
 */
export function SecurityDetails({
  details,
  extra = [],
}: {
  details: SecurityEventDetails | undefined;
  /** Rows after the device's, e.g. how someone signed in */
  extra?: { label: string; value: string }[];
}) {
  if (!details) return null;
  const rows = details.actor
    ? [{ label: "By", value: details.actor }]
    : [
        details.device ? { label: "Device", value: details.device } : null,
        details.location
          ? { label: "Approximate location", value: details.location }
          : null,
        details.ip ? { label: "IP address", value: details.ip } : null,
      ];
  return (
    <DetailsTable
      rows={[
        ...rows.filter((row) => row !== null),
        ...extra,
        { label: "Time", value: details.time },
      ]}
    />
  );
}

export function ReviewSecurityButton() {
  return (
    <Section style={{ margin: "4px 0 8px" }}>
      <EmailButton href={reviewSecurityUrl()}>Review security</EmailButton>
    </Section>
  );
}

/** On every email that carries a code. */
export function NeverAskForCode() {
  return (
    <EmailText>
      QRdx will never ask for this code by phone, chat or email.
    </EmailText>
  );
}

export function SupportLink() {
  return <Link href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</Link>;
}
