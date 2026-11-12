import { auth } from "@repo/auth/server";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Profile2User as Users } from "iconsax-reactjs";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { SignInButton } from "@/app/(app)/dashboard/team/_components/small-actions";
import {
  getInvitationDetails,
  isTeamMember,
} from "@/app/(app)/dashboard/team/_lib/queries";
import { formatUtcDateTime } from "@/app/(app)/dashboard/team/_lib/team";
import { inviteRolePhrase } from "@/lib/email/templates/team-invite";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import type { Translator } from "@/lib/i18n/translator";
import { InviteActions, SignOutButton } from "./invite-actions";

/** j***@example.com: enough to recognise the address without exposing it. */
function maskEmail(email: string, t: Translator<"app.invite.page">): string {
  const [local, domain] = email.split("@");
  if (!domain) return t("anotherAddress");
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
        <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full border bg-muted/40">
          <Users className="size-5 text-foreground/80" />
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
  const t = await getAppTranslations("app.invite.page");
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  // Team details are shown only to the invitee, so signed-out visitors get a
  // generic prompt. Signing in returns here (the auth dialog keeps the URL).
  if (!session?.user) {
    return (
      <InviteCard
        description={t("signInWithTheEmail")}
        title={t("youveBeenInvitedToA")}
      >
        <SignInButton className="w-full">{t("signInToContinue")}</SignInButton>
      </InviteCard>
    );
  }

  const invitation = id.length <= 128 ? await getInvitationDetails(id) : null;
  const goToDashboard = (
    <Button asChild variant="outline">
      <Link href="/dashboard">{t("goToDashboard")}</Link>
    </Button>
  );

  if (!invitation) {
    return (
      <InviteCard
        description={t("checkThatYouCopiedThe")}
        title={t("invitationNotFound")}
      >
        {goToDashboard}
      </InviteCard>
    );
  }

  if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
    return (
      <InviteCard
        description={t.rich("thisInvitationWasSentTo", {
          value: maskEmail(invitation.email, t),
          email: session.user.email,
          span: (chunks) => <span className="font-medium">{chunks}</span>,
          span2: (chunks) => <span className="font-medium">{chunks}</span>,
        })}
        title={t("wrongAccount")}
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
            ? t("youreAlreadyAMemberOf", { teamName: invitation.teamName })
            : (STATUS_MESSAGES[invitation.status] ??
              t("thisInvitationIsNoLonger"))
        }
        title={alreadyMember ? t("alreadyJoined") : t("invitationUnavailable")}
      >
        {goToDashboard}
      </InviteCard>
    );
  }

  if (invitation.expiresAt < new Date()) {
    return (
      <InviteCard
        description={t("invitationsAreValidFor48")}
        title={t("invitationExpired")}
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
            t("aTeamAdmin")
          )}{" "}
          {t("invitedYouToJoin")}{" "}
          <span className="font-medium">{invitation.teamName}</span> {t("as")}{" "}
          {inviteRolePhrase(invitation.role)}.
        </>
      }
      title={t("joinTeamname", { teamName: invitation.teamName })}
    >
      <p className="text-muted-foreground text-xs">
        {t("teamMembersShareTheTeams", {
          expiresAt: formatUtcDateTime(invitation.expiresAt),
        })}
      </p>
      <div className="w-full">
        <InviteActions invitationId={invitation.id} />
      </div>
    </InviteCard>
  );
}
