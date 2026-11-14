"use client";

import { toast } from "@repo/design-system";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { cancelInvitation } from "@/actions/organizations";
import {
  formatUtcDateTime,
  TEAM_ROLE_LABELS,
  type TeamRole,
} from "../_lib/team";
import { CopyInviteLinkButton } from "./invite-link";

export interface PendingInvitationRow {
  id: string;
  email: string;
  role: TeamRole;
  expiresAt: string;
  inviterName: string | null;
}

export function PendingInvitations({
  invitations,
}: {
  invitations: PendingInvitationRow[];
}) {
  const t = useTranslations("app.dashboard.team.pendingInvitations");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const revoke = (invitation: PendingInvitationRow) =>
    startTransition(async () => {
      const result = await cancelInvitation({ invitationId: invitation.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        t("revokedTheInvitationForEmail", { email: invitation.email }),
      );
      router.refresh();
    });

  if (invitations.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t("noPendingInvitations")}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("email")}</TableHead>
          <TableHead>{t("role")}</TableHead>
          <TableHead className="hidden sm:table-cell">{t("expires")}</TableHead>
          <TableHead className="text-right">
            <span className="max-sm:sr-only">{t("actions")}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => (
          <TableRow key={invitation.id}>
            <TableCell className="max-w-[220px] truncate font-medium">
              {invitation.email}
              {invitation.inviterName && (
                <span className="text-muted-foreground block text-xs font-normal">
                  {t("invitedByInvitername", {
                    inviterName: invitation.inviterName,
                  })}
                </span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="outline">
                {TEAM_ROLE_LABELS[invitation.role]}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
              {formatUtcDateTime(invitation.expiresAt)}
            </TableCell>
            <TableCell>
              <div className="flex items-center justify-end gap-1">
                <CopyInviteLinkButton invitationId={invitation.id} />
                <Button
                  disabled={isPending}
                  onClick={() => revoke(invitation)}
                  size="sm"
                  variant="ghost"
                >
                  {t("revoke")}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
