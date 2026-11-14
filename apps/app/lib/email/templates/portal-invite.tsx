import {
  EmailButton,
  EmailDivider,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./layout";
import { MutedText } from "./parts";

// Agency tools: a workspace on Business shared some of its folders with a
// client. Sent in the workspace's name (EmailLayout `sender`).

export interface PortalInviteEmailProps {
  /** The portal's name (its branding, else the workspace's name) */
  portalName: string;
  inviterName: string;
  portalUrl: string;
  /** The folders shared, by name */
  folders: string[];
}

export const portalInviteSubject = (portalName: string) =>
  `${portalName} shared QR code reports with you`;

export function PortalInviteEmail({
  portalName,
  inviterName,
  portalUrl,
  folders,
}: PortalInviteEmailProps) {
  const list =
    folders.length === 0
      ? null
      : folders.length === 1
        ? folders[0]
        : `${folders.slice(0, -1).join(", ")} and ${folders.at(-1)}`;
  return (
    <EmailLayout
      preview={portalInviteSubject(portalName)}
      reason={`You got this email because ${inviterName} at ${portalName} invited this address to see their QR code reports.`}
      sender={{ name: portalName }}
    >
      <EmailHeading>Your QR code reports</EmailHeading>
      <EmailText>
        {inviterName} invited you to see {portalName}'s QR codes
        {list ? ` in ${list}` : ""}: how often each one is scanned, where and on
        which devices, and the pages they open. It's read-only.
      </EmailText>
      <EmailButton href={portalUrl}>Open the reports</EmailButton>
      <EmailDivider />
      <MutedText>
        Sign in with this email address: we'll send you a one-time code. If you
        weren't expecting this, you can ignore it.
      </MutedText>
      <MutedText>Or paste this link into your browser: {portalUrl}</MutedText>
    </EmailLayout>
  );
}

export default PortalInviteEmail;
