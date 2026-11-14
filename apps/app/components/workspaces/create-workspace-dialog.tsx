"use client";

import { slugifyWorkspaceName } from "@repo/auth/workspace-rules";
import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/design-system/components/ui/dialog";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createWorkspace } from "@/actions/organizations";
import { useRefreshTeams } from "@/components/org-switcher";
import { workspaceHref } from "@/lib/workspace-paths";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import {
  useWorkspaceSlugCheck,
  WorkspaceSlugField,
} from "./workspace-slug-field";

/** Name and URL for a new workspace; opens it once it's made. */
export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("app.workspaces.createWorkspaceDialog");
  const router = useRouter();
  const refresh = useRefreshTeams();
  const openGetProDialog = useGetProDialogStore((s) => s.openGetProDialog);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [isPending, startTransition] = useTransition();
  const status = useWorkspaceSlugCheck(slug);

  const close = () => {
    onOpenChange(false);
    setName("");
    setSlug("");
    setSlugEdited(false);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await createWorkspace({ name, slug });
      if (!result.ok) {
        toast.error(result.error);
        if (result.upgrade) {
          close();
          openGetProDialog();
        }
        return;
      }
      toast.success(t("createdName", { name: name.trim() }));
      close();
      refresh();
      router.push(workspaceHref(result.data.slug));
    });
  };

  return (
    <Dialog
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      open={open}
    >
      <DialogContent>
        <form className="space-y-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("createAWorkspace")}</DialogTitle>
            <DialogDescription>{t("itsOwnCodesPagesThemes")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">{t("workspaceName")}</Label>
            <Input
              autoFocus
              id="workspace-name"
              maxLength={50}
              minLength={2}
              onChange={(event) => {
                setName(event.target.value);
                if (!slugEdited) {
                  setSlug(slugifyWorkspaceName(event.target.value));
                }
              }}
              placeholder={t("acmeMarketing")}
              required
              value={name}
            />
          </div>
          <WorkspaceSlugField
            hint="3-48 lowercase letters, numbers and dashes."
            id="workspace-slug"
            onChange={(value) => {
              setSlugEdited(true);
              setSlug(value);
            }}
            status={status}
            value={slug}
          />
          <DialogFooter>
            <Button
              disabled={isPending || status.state === "blocked"}
              type="submit"
            >
              {isPending ? t("creating") : t("createWorkspace")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
