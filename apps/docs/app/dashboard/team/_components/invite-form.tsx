"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inviteMember } from "@/actions/organizations";
import { useShowLimit } from "@/components/limits/limit-dialog";
import {
  assignableRoles,
  JOINABLE_ROLES,
  type WorkspaceRole,
} from "@/lib/permissions";
import { InviteLinkField } from "./invite-link";
import { RoleSelect } from "./role-select";

export function InviteForm({ currentRole }: { currentRole: WorkspaceRole }) {
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

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await inviteMember({ email, role });
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
          <Label htmlFor="invite-email">Email</Label>
          <Input
            autoComplete="off"
            id="invite-email"
            maxLength={254}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@company.com"
            required
            type="email"
            value={email}
          />
        </div>
        <div className="space-y-1.5 sm:w-36">
          <Label htmlFor="invite-role">Role</Label>
          <RoleSelect
            className="w-full"
            id="invite-role"
            onChange={setRole}
            roles={roles}
            value={role}
          />
        </div>
        <Button disabled={isPending} type="submit">
          {isPending ? "Creating link..." : "Create invite link"}
        </Button>
      </form>

      {created && (
        <div className="bg-muted/40 space-y-2 rounded-lg border p-3">
          <p className="text-sm">
            {created.emailed
              ? "We emailed the invitation to "
              : "Send this link to "}
            <span className="font-medium">{created.email}</span>
            {created.emailed ? ". You can also share this link." : "."} They
            need to sign in with that email address to join.
          </p>
          <InviteLinkField invitationId={created.id} />
        </div>
      )}
    </div>
  );
}
