import { auth } from "@repo/auth/server";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Users } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { SignInButton } from "@/app/dashboard/team/_components/small-actions";
import {
  getInvitationDetails,
  isTeamMember,
} from "@/app/dashboard/team/_lib/queries";
import {
  formatUtcDateTime,
  TEAM_ROLE_LABELS,
} from "@/app/dashboard/team/_lib/team";
import { InviteActions, SignOutButton } from "./invite-actions";

/** j***@example.com: enough to recognise the address without exposing it. */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "another address";
  return `${local.charAt(0)}${"*".repeat(Math.max(2, local.length - 1))}@${domain}`;
}

function InviteCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <div className="bg-primary/10 mx-auto mb-2 w-fit rounded-full p-3">
          <Users className="text-primary size-6" />
        </div>
        <CardTitle className="text-xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {children && (
        <CardContent className="flex flex-col items-center gap-3 text-center">
          {children}
        </CardContent>
      )}
    </Card>
  );
}

const STATUS_MESSAGES: Record<string, string> = {
  accepted: "This invitation has already been accepted.",
  rejected: "This invitation was declined.",
  canceled: "This invitation was revoked by the team.",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  // Team details are shown only to the invitee, so signed-out visitors get a
  // generic prompt. Signing in returns here (the auth dialog keeps the URL).
  if (!session?.user) {
    return (
      <InviteCard
        description="Sign in with the email address the invitation was sent to."
        title="You've been invited to a team"
      >
        <SignInButton className="w-full">Sign in to continue</SignInButton>
      </InviteCard>
    );
  }

  const invitation = id.length <= 128 ? await getInvitationDetails(id) : null;
  const goToDashboard = (
    <Button asChild variant="outline">
      <Link href="/dashboard">Go to dashboard</Link>
    </Button>
  );

  if (!invitation) {
    return (
      <InviteCard
        description="Check that you copied the whole link, or ask for a new invitation."
        title="Invitation not found"
      >
        {goToDashboard}
      </InviteCard>
    );
  }

  if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
    return (
      <InviteCard
        description={
          <>
            This invitation was sent to{" "}
            <span className="font-medium">{maskEmail(invitation.email)}</span>,
            but you're signed in as{" "}
            <span className="font-medium">{session.user.email}</span>. Sign in
            with the invited address to accept it.
          </>
        }
        title="Wrong account"
      >
        <SignOutButton />
      </InviteCard>
    );
  }

  if (invitation.status !== "pending") {
    const alreadyMember =
      invitation.status === "accepted" &&
      (await isTeamMember(invitation.organizationId, session.user.id));
    return (
      <InviteCard
        description={
          alreadyMember
            ? `You're already a member of ${invitation.teamName}. Switch to it from the workspace menu in your dashboard.`
            : (STATUS_MESSAGES[invitation.status] ??
              "This invitation is no longer valid.")
        }
        title={alreadyMember ? "Already joined" : "Invitation unavailable"}
      >
        {goToDashboard}
      </InviteCard>
    );
  }

  if (invitation.expiresAt < new Date()) {
    return (
      <InviteCard
        description="Invitations are valid for 48 hours. Ask a team owner or admin for a new link."
        title="Invitation expired"
      >
        {goToDashboard}
      </InviteCard>
    );
  }

  return (
    <InviteCard
      description={
        <>
          {invitation.inviterName ? (
            <span className="font-medium">{invitation.inviterName}</span>
          ) : (
            "A team admin"
          )}{" "}
          invited you to join{" "}
          <span className="font-medium">{invitation.teamName}</span> as{" "}
          {TEAM_ROLE_LABELS[invitation.role].toLowerCase()}.
        </>
      }
      title={`Join ${invitation.teamName}`}
    >
      <p className="text-muted-foreground text-xs">
        Team members share the team's dynamic QR codes and themes. Expires{" "}
        {formatUtcDateTime(invitation.expiresAt)}.
      </p>
      <div className="w-full">
        <InviteActions invitationId={invitation.id} />
      </div>
    </InviteCard>
  );
}
