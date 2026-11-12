"use client";

import { emailInSsoDomain } from "@repo/auth/sso-rules";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/design-system/components/ui/table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { removeMember, updateMemberRole } from "@/actions/organizations";
import { useConfirmation } from "@/components/confirm-identity/provider";
import { assignableRoles, can } from "@/lib/permissions";
import { formatUtcDate, TEAM_ROLE_LABELS, type TeamRole } from "../_lib/team";
import { RoleSelect } from "./role-select";

export interface MemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: TeamRole;
  joinedAt: string;
  /** Two-step verification is on; only sent to owners and admins */
  twoFactor?: boolean;
}

/** "On" / "Off" for the members list (owners and admins see it). */
function TwoFactorBadge({ on }: { on: boolean }) {
  const t = useTranslations("app.dashboard.team.membersTable");
  return (
    <Badge variant={on ? "secondary" : "outline"}>
      {on ? t("on") : t("off")}
    </Badge>
  );
}

export function MembersTable({
  members,
  currentUserId,
  currentRole,
  ssoDomains = [],
}: {
  members: MemberRow[];
  currentUserId: string;
  currentRole: TeamRole;
  /** Verified SSO domains of this Business workspace (packages/auth/ee/sso.ts). */
  ssoDomains?: string[];
}) {
  const t = useTranslations("app.dashboard.team.membersTable");
  const router = useRouter();
  // Role changes and removals ask "Confirm it's you" first when this session
  // hasn't recently (the page's ConfirmIdentityProvider).
  const { withConfirmation } = useConfirmation();
  const [isPending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  const canManage = can(currentRole, "members.manage");
  // Who has two-step verification on: the page sends it to owners and admins.
  const showTwoFactor = members.some((m) => m.twoFactor !== undefined);
  const ownerCount = members.filter((m) => m.role === "owner").length;

  // Mirrors the server's rules (lib/permissions.ts canAssignRole and the
  // organization plugin) so the UI only offers allowed changes: admins
  // handle admin, member and viewer; owners also owner and billing.
  const rolesFor = (target: MemberRow) =>
    assignableRoles(currentRole, target.role);
  const canChangeRole = (target: MemberRow) => {
    if (rolesFor(target).length === 0) return false;
    if (target.userId === currentUserId) {
      return currentRole === "owner" && ownerCount > 1;
    }
    return true;
  };
  const canRemove = (target: MemberRow) =>
    canManage &&
    target.userId !== currentUserId &&
    ((target.role !== "owner" && target.role !== "billing") ||
      can(currentRole, "owners.manage"));

  const changeRole = (target: MemberRow, role: TeamRole) =>
    startTransition(async () => {
      const result = await withConfirmation(
        () => updateMemberRole({ memberId: target.id, role }),
        "change-member-role",
      );
      if (result === null) return;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        t("valueIsNowValue2", {
          value: target.name || target.email,
          value2: TEAM_ROLE_LABELS[role].toLowerCase(),
        }),
      );
      router.refresh();
    });

  // Every SSO sign-in adds the person back (packages/auth/ee/sso.ts joinWorkspace).
  const rejoinsWithSso = (target: MemberRow | null) =>
    target !== null &&
    ssoDomains.some((domain) => emailInSsoDomain(target.email, domain));

  const confirmRemove = () => {
    const target = removing;
    if (!target) return;
    startTransition(async () => {
      const result = await withConfirmation(
        () => removeMember({ memberId: target.id }),
        "remove-member",
      );
      if (result === null) return;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRemoving(null);
      toast.success(t("removedValue", { value: target.name || target.email }));
      router.refresh();
    });
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("member")}</TableHead>
            <TableHead>{t("role")}</TableHead>
            {/* Phones: name, email and role fit without scrolling sideways. */}
            {showTwoFactor && (
              <TableHead className="hidden sm:table-cell">
                {t("twoStepVerification")}
              </TableHead>
            )}
            <TableHead className="hidden sm:table-cell">
              {t("joined")}
            </TableHead>
            {canManage && (
              <TableHead className="text-right">
                <span className="max-sm:sr-only">{t("actions")}</span>
              </TableHead>
            )}
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
                      {t("you")}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground truncate text-xs">
                  {member.email}
                </div>
                {member.twoFactor !== undefined && (
                  <div className="text-muted-foreground text-xs sm:hidden">
                    {t("twoStepVerification")}{" "}
                    {member.twoFactor ? t("on2") : t("off2")}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {canChangeRole(member) ? (
                  <RoleSelect
                    className="h-8"
                    disabled={isPending}
                    label={t("roleForEmail", { email: member.email })}
                    onChange={(role) => changeRole(member, role)}
                    roles={rolesFor(member)}
                    value={member.role}
                  />
                ) : (
                  <Badge
                    variant={member.role === "owner" ? "default" : "outline"}
                  >
                    {TEAM_ROLE_LABELS[member.role]}
                  </Badge>
                )}
              </TableCell>
              {showTwoFactor && (
                <TableCell className="hidden sm:table-cell">
                  {member.twoFactor !== undefined && (
                    <TwoFactorBadge on={member.twoFactor} />
                  )}
                </TableCell>
              )}
              <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
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
                      {t("remove")}
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
              {t("removeValue", {
                value: (removing?.name || removing?.email) ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>{t("theyLoseAccessToThis")}</p>
                {rejoinsWithSso(removing) && (
                  <p className="text-pretty">
                    {t("emailCanSignInWith", { email: removing?.email ?? "" })}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault();
                confirmRemove();
              }}
            >
              {t("removeMember")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
