"use client";

import { toast } from "@repo/design-system";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeMember, updateMemberRole } from "@/actions/organizations";
import {
  formatUtcDate,
  TEAM_ROLE_DESCRIPTIONS,
  TEAM_ROLE_LABELS,
  type TeamRole,
} from "../_lib/team";

export interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
}

const ROLES: TeamRole[] = ["owner", "admin", "member"];

export function MembersTable({
  members,
  currentUserId,
  currentRole,
}: {
  members: MemberRow[];
  currentUserId: string;
  currentRole: TeamRole;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  const canManage = currentRole !== "member";
  const ownerCount = members.filter((m) => m.role === "owner").length;

  // Mirrors the organization plugin's rules so the UI only offers allowed changes.
  const canChangeRole = (target: MemberRow) => {
    if (!canManage) return false;
    if (target.role === "owner" && currentRole !== "owner") return false;
    if (target.userId === currentUserId) {
      return currentRole === "owner" && ownerCount > 1;
    }
    return true;
  };
  const canRemove = (target: MemberRow) =>
    canManage &&
    target.userId !== currentUserId &&
    (target.role !== "owner" || currentRole === "owner");

  const changeRole = (target: MemberRow, role: TeamRole) =>
    startTransition(async () => {
      const result = await updateMemberRole({ memberId: target.id, role });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        `${target.name || target.email} is now ${TEAM_ROLE_LABELS[role].toLowerCase()}`,
      );
      router.refresh();
    });

  const confirmRemove = () => {
    const target = removing;
    if (!target) return;
    startTransition(async () => {
      const result = await removeMember({ memberId: target.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRemoving(null);
      toast.success(`Removed ${target.name || target.email}`);
      router.refresh();
    });
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Joined</TableHead>
            {canManage && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell className="max-w-[260px]">
                <div className="truncate font-medium">
                  {member.name || member.email}
                  {member.userId === currentUserId && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      (you)
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  {member.email}
                </div>
              </TableCell>
              <TableCell>
                {canChangeRole(member) ? (
                  <Select
                    disabled={isPending}
                    onValueChange={(value) =>
                      changeRole(member, value as TeamRole)
                    }
                    value={member.role}
                  >
                    <SelectTrigger
                      aria-label={`Role for ${member.email}`}
                      className="h-8 w-32"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.filter(
                        (role) => role !== "owner" || currentRole === "owner",
                      ).map((role) => (
                        <SelectItem key={role} value={role}>
                          <span title={TEAM_ROLE_DESCRIPTIONS[role]}>
                            {TEAM_ROLE_LABELS[role]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge
                    variant={member.role === "owner" ? "default" : "outline"}
                  >
                    {TEAM_ROLE_LABELS[member.role]}
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatUtcDate(member.joinedAt)}
              </TableCell>
              {canManage && (
                <TableCell className="text-right">
                  {canRemove(member) && (
                    <Button
                      disabled={isPending}
                      onClick={() => setRemoving(member)}
                      size="sm"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog
        onOpenChange={(open) => !open && setRemoving(null)}
        open={removing !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing?.name || removing?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this team right away. Dynamic QR codes and
              brand kits they created stay with the team and keep working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmRemove();
              }}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
