"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { inviteMember } from "@/actions/organizations";
import { useConfirmation } from "@/components/confirm-identity/provider";
import { useShowLimit } from "@/components/limits/limit-dialog";
import {
  assignableRoles,
  JOINABLE_ROLES,
  type WorkspaceRole,
} from "@/lib/permissions";
import { InviteLinkField } from "./invite-link";
import { RoleSelect } from "./role-select";

export function InviteForm({ currentRole }: { currentRole: WorkspaceRole }) {
  const t = useTranslations("app.dashboard.team.inviteForm");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  // Never owner; billing only for owners (lib/permissions.ts).
  const roles = assignableRoles(currentRole).filter((r) =>
    JOINABLE_ROLES.includes(r),
  );
  const [created, setCreated] = useState<{
    id: string;
    email: string;
    emailed: boolean;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const showLimit = useShowLimit();
  // Inviting an admin asks "Confirm it's you" first (the server decides).
  const { withConfirmation } = useConfirmation();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await withConfirmation(
        () => inviteMember({ email, role }),
        "invite-admin",
      );
      if (result === null) return;
      if (!result.ok) {
        // No free seat (INVITATION_LIMIT_REACHED): the seats limit card.
        if (result.upgrade) {
          showLimit("teamSeats", { message: result.error });
        } else {
          toast.error(result.error);
        }
        return;
      }
      setCreated({
        id: result.data.id,
        email: result.data.email,
        emailed: result.data.emailed,
      });
      setEmail("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={submit}
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="invite-email">{t("email")}</Label>
          <Input
            autoComplete="off"
            id="invite-email"
            maxLength={254}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("teammateCompanyCom")}
            required
            type="email"
            value={email}
          />
        </div>
        <div className="space-y-1.5 sm:w-36">
          <Label htmlFor="invite-role">{t("role")}</Label>
          <RoleSelect
            className="w-full"
            id="invite-role"
            onChange={setRole}
            roles={roles}
            value={role}
          />
        </div>
        <Button disabled={isPending} type="submit">
          {isPending ? t("creatingLink") : t("createInviteLink")}
        </Button>
      </form>

      {created && (
        <div className="bg-muted/40 space-y-2 rounded-lg border p-3">
          <p className="text-sm">
            {created.emailed
              ? t("weEmailedTheInvitationTo")
              : t("sendThisLinkTo")}
            <span className="font-medium">{created.email}</span>
            {created.emailed ? t("youCanAlsoShareThis") : "."}{" "}
            {t("theyNeedToSignIn")}
          </p>
          <InviteLinkField invitationId={created.id} />
        </div>
      )}
    </div>
  );
}
