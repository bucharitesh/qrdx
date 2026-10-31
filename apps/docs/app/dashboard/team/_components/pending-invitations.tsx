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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const revoke = (invitation: PendingInvitationRow) =>
    startTransition(async () => {
      const result = await cancelInvitation({ invitationId: invitation.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Revoked the invitation for ${invitation.email}`);
      router.refresh();
    });

  if (invitations.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No pending invitations.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => (
          <TableRow key={invitation.id}>
            <TableCell className="max-w-[220px] truncate font-medium">
              {invitation.email}
              {invitation.inviterName && (
                <span className="text-muted-foreground block text-xs font-normal">
                  Invited by {invitation.inviterName}
                </span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="outline">
                {TEAM_ROLE_LABELS[invitation.role]}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
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
                  Revoke
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
