import { Link } from "react-email";
import { baseUrl } from "@/lib/metadata";
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";

const SUPPORT_EMAIL = "support@qrdx.dev";

export type PasskeyChange = "added" | "removed";

export const PASSKEY_NOTICE_SUBJECTS: Record<PasskeyChange, string> = {
  added: "A passkey was added to your QRdx account",
  removed: "A passkey was removed from your QRdx account",
};

export interface PasskeyNoticeEmailProps {
  change: PasskeyChange;
  /** The passkey's name, e.g. "Chrome on macOS" */
  passkeyName: string;
}

/**
 * Transactional security notice after a passkey is added or removed. The
 * only links go to the settings page and support; nothing in it changes the
 * account.
 */
export function PasskeyNoticeEmail({
  change,
  passkeyName,
}: PasskeyNoticeEmailProps) {
  const settingsUrl = new URL("/settings/account#passkeys", baseUrl).toString();
  const added = change === "added";
  return (
    <EmailLayout
      preview={
        added
          ? `The passkey "${passkeyName}" can now sign in to your QRdx account.`
          : `The passkey "${passkeyName}" can no longer sign in to your QRdx account.`
      }
      reason="You got this email because it's the address of a QRdx account, and we tell you about every change to how it signs in."
    >
      <EmailHeading>{PASSKEY_NOTICE_SUBJECTS[change]}</EmailHeading>
      <EmailText>
        {added ? (
          <>
            The passkey <strong>{passkeyName}</strong> can now sign in to your
            QRdx account.
          </>
        ) : (
          <>
            The passkey <strong>{passkeyName}</strong> can no longer sign in to
            your QRdx account.
          </>
        )}
      </EmailText>
      <EmailText>
        If this was you, there's nothing else to do. You can see your passkeys
        in <Link href={settingsUrl}>Profile &amp; security</Link>.
      </EmailText>
      <EmailDivider />
      <MutedText>
        If this wasn't you, sign in and remove any passkey you don't recognise,
        then contact support at{" "}
        <Link href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</Link> from this
        address.
      </MutedText>
    </EmailLayout>
  );
}
