import type { CSSProperties } from "react";
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import {
  ReviewSecurityButton,
  SecurityDetails,
  type SecurityEventDetails,
  SupportLink,
} from "./security-parts";

export const NEW_SIGN_IN_SUBJECT = "New sign-in to your QRdx account";

const styles = {
  list: {
    color: "#737373",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "0 0 16px",
    paddingLeft: "20px",
  },
  item: { margin: "0 0 4px" },
} satisfies Record<string, CSSProperties>;

export interface NewSignInEmailProps {
  details: SecurityEventDetails;
  /** How they signed in: "Google", "Email code, then a passkey" */
  method: string | null;
}

/**
 * Transactional, to the account's address when a browser or device signs in
 * for the first time. The only links go to the security settings and
 * support; nothing in it changes the account.
 */
export function NewSignInEmail({ details, method }: NewSignInEmailProps) {
  const where = details.location ? ` near ${details.location}` : "";
  return (
    <EmailLayout
      preview={`${details.device ?? "A new device"} signed in to your QRdx account${where}.`}
      reason="You got this email because it's the address of a QRdx account, and a browser or device signed in to it for the first time."
    >
      <EmailHeading>{NEW_SIGN_IN_SUBJECT}</EmailHeading>
      <EmailText>
        A browser or device that hasn't signed in to your QRdx account before
        just did.
      </EmailText>
      <SecurityDetails
        details={details}
        extra={method ? [{ label: "Signed in with", value: method }] : []}
      />
      <EmailText>If this was you, there's nothing to do.</EmailText>
      <ReviewSecurityButton />
      <EmailDivider />
      <MutedText>If this wasn't you:</MutedText>
      <ol style={styles.list}>
        <li style={styles.item}>
          Sign in, go to Settings → Profile & security, and under Sessions click
          Sign out everywhere else.
        </li>
        <li style={styles.item}>
          Turn on two-step verification on the same page, so signing in also
          takes your passkey or authenticator app.
        </li>
        <li style={styles.item}>
          Contact support at <SupportLink /> from this address, and we'll help
          you secure your account.
        </li>
      </ol>
    </EmailLayout>
  );
}
