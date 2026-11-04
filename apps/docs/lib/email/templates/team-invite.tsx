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

// The workspace roles (apps/docs/lib/permissions.ts), as the invitation
// says them. Kept here so the template renders on its own.
const ROLE_COPY = {
  owner: {
    phrase: "an owner",
    line: "Owners can do everything, including billing and deleting the workspace.",
  },
  admin: {
    phrase: "an admin",
    line: "Admins manage people, settings, domains and everyone's codes.",
  },
  member: {
    phrase: "a member",
    line: "Members create codes and pages and edit the workspace's codes.",
  },
  billing: {
    phrase: "a billing manager",
    line: "Billing managers handle the plan and billing, and can see everything else without changing it.",
  },
  viewer: {
    phrase: "a viewer",
    line: "Viewers see the workspace's codes, pages and analytics without changing anything.",
  },
} as const;

export type InviteRole = keyof typeof ROLE_COPY;

const RANK: InviteRole[] = ["owner", "admin", "member", "billing", "viewer"];

/**
 * The strongest role in Better Auth's comma-separated field; anything
 * unknown reads as viewer, the same rule as the app's permissions.
 */
export function inviteRole(role: string | null | undefined): InviteRole {
  const roles = (role ?? "").split(",").map((part) => part.trim());
  return RANK.find((known) => roles.includes(known)) ?? "viewer";
}

/** "an admin", "a billing manager", "a viewer", ... */
export function inviteRolePhrase(role: string | null | undefined): string {
  return ROLE_COPY[inviteRole(role)].phrase;
}

/** The subject line, also the inbox preview: who, where and as what. */
export function teamInviteSubject({
  inviterName,
  teamName,
  memberRole,
}: Pick<TeamInviteEmailProps, "inviterName" | "teamName" | "memberRole">) {
  return `${inviterName} invited you to ${teamName} on QRdx as ${inviteRolePhrase(memberRole)}`;
}

/** Transactional: sent when an owner or admin invites someone to a workspace. */
export function TeamInviteEmail({
  teamName,
  inviterName,
  memberRole,
  inviteUrl,
  expiresAt,
}: TeamInviteEmailProps) {
  return (
    <EmailLayout
      preview={teamInviteSubject({ inviterName, teamName, memberRole })}
      reason="You got this email because someone invited this address to a QRdx workspace."
    >
      <EmailHeading>Join {teamName} on QRdx</EmailHeading>
      <EmailText>
        {inviterName} invited you to the {teamName} workspace as{" "}
        {inviteRolePhrase(memberRole)}. {ROLE_COPY[inviteRole(memberRole)].line}
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
