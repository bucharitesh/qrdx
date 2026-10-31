"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createTeam } from "@/actions/organizations";
import { useRefreshTeams } from "@/components/org-switcher";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import { slugify, TEAM_SLUG_PATTERN } from "../_lib/team";

export function CreateTeamDialog({
  defaultOpen = false,
  variant = "default",
}: {
  /** Opened from a "Create team" link (/dashboard/team?create=1) */
  defaultOpen?: boolean;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [isPending, startTransition] = useTransition();
  const refresh = useRefreshTeams();
  const openGetProDialog = useGetProDialogStore((s) => s.openGetProDialog);

  const reset = () => {
    setName("");
    setSlug("");
    setSlugEdited(false);
    // Drop ?create=1 so the dialog does not reopen on the next render.
    if (defaultOpen) router.replace("/dashboard/team", { scroll: false });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createTeam({ name, slug });
      if (!result.ok) {
        toast.error(result.error);
        if (result.upgrade) {
          setOpen(false);
          openGetProDialog();
        }
        return;
      }
      toast.success(`Created ${name.trim()}`, {
        description: "You're now working in this team.",
      });
      setOpen(false);
      reset();
      refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Plus className="size-4" />
          Create team
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Create a team</DialogTitle>
            <DialogDescription>
              Teams share dynamic QR codes and team themes. You can invite
              members after creating it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Team name</Label>
            <Input
              autoFocus
              id="team-name"
              maxLength={50}
              minLength={2}
              onChange={(event) => {
                setName(event.target.value);
                if (!slugEdited) setSlug(slugify(event.target.value));
              }}
              placeholder="Acme Marketing"
              required
              value={name}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-slug">Team URL</Label>
            <Input
              id="team-slug"
              maxLength={48}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(event.target.value.toLowerCase());
              }}
              pattern={TEAM_SLUG_PATTERN}
              placeholder="acme-marketing"
              required
              title="3-48 lowercase letters, numbers and dashes"
              value={slug}
            />
            <p className="text-muted-foreground text-xs">
              A unique identifier: 3-48 lowercase letters, numbers and dashes.
            </p>
          </div>
          <DialogFooter>
            <Button disabled={isPending} type="submit">
              {isPending ? "Creating..." : "Create team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
