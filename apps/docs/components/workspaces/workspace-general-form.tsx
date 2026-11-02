"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateWorkspace } from "@/actions/organizations";
import { useRefreshTeams } from "@/components/org-switcher";
import { workspaceHref } from "@/lib/workspace-paths";
import {
  useWorkspaceSlugCheck,
  WorkspaceSlugField,
} from "./workspace-slug-field";

/** Name and URL of the open workspace (owners and admins can change them). */
export function WorkspaceGeneralForm({
  name: savedName,
  slug: savedSlug,
  canEdit,
}: {
  name: string;
  slug: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const refresh = useRefreshTeams();
  const [name, setName] = useState(savedName);
  const [slug, setSlug] = useState(savedSlug);
  const [isPending, startTransition] = useTransition();
  const status = useWorkspaceSlugCheck(slug, savedSlug);
  const changed = name.trim() !== savedName || slug.trim() !== savedSlug;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateWorkspace({
        name: name.trim() !== savedName ? name : undefined,
        slug: slug.trim() !== savedSlug ? slug : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Workspace saved");
      if (result.data.slug && result.data.slug !== savedSlug) {
        router.replace(workspaceHref(result.data.slug, "/settings"));
      }
      refresh();
    });
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="space-y-1.5">
        <Label htmlFor="workspace-name">Workspace name</Label>
        <Input
          disabled={!canEdit}
          id="workspace-name"
          maxLength={50}
          minLength={2}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </div>
      <WorkspaceSlugField
        disabled={!canEdit}
        hint={
          slug !== savedSlug
            ? "Links to the old URL stop working. Printed codes don't change."
            : "Where this workspace lives in the dashboard."
        }
        id="workspace-slug"
        onChange={setSlug}
        status={status}
        value={slug}
      />
      {canEdit && (
        <Button
          disabled={!changed || isPending || status.state === "blocked"}
          type="submit"
        >
          {isPending ? "Saving..." : "Save"}
        </Button>
      )}
    </form>
  );
}
