import {
  EmailButton,
  EmailDivider,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./layout";
import { formatEmailDateTime, MutedText } from "./parts";

export interface TeamInviteEmailProps {
  teamName: string;
  inviterName: string;
  memberRole: string;
  inviteUrl: string;
  expiresAt: Date | string;
}

/** Transactional: sent when an owner or admin invites someone to a team. */
export function TeamInviteEmail({
  teamName,
  inviterName,
  memberRole,
  inviteUrl,
  expiresAt,
}: TeamInviteEmailProps) {
  return (
    <EmailLayout
      preview={`${inviterName} invited you to ${teamName} on QRdx`}
      reason="You got this email because someone invited this address to a QRdx team."
    >
      <EmailHeading>Join {teamName} on QRdx</EmailHeading>
      <EmailText>
        {inviterName} invited you to the {teamName} team as{" "}
        {memberRole === "admin" ? "an admin" : "a member"}. Teams share dynamic
        QR codes, pages, themes and scan analytics.
      </EmailText>
      <EmailButton href={inviteUrl}>Accept invitation</EmailButton>
      <EmailDivider />
      <MutedText>
        Sign in with this email address to accept. The invitation expires on{" "}
        {formatEmailDateTime(expiresAt)}. If you weren't expecting it, you can
        ignore this email.
      </MutedText>
      <MutedText>Or paste this link into your browser: {inviteUrl}</MutedText>
    </EmailLayout>
  );
}

export default TeamInviteEmail;
