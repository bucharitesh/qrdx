"use client";

import { toast } from "@repo/design-system";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/design-system/components/ui/alert-dialog";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { Label } from "@repo/design-system/components/ui/label";
import { Switch } from "@repo/design-system/components/ui/switch";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useWorkspaceHref } from "@/components/workspace-provider";
import type { OAuthAppView } from "@/lib/oauth-apps/service";
import {
  deleteOAuthAppAction,
  setOAuthAppActiveAction,
  updateOAuthAppAction,
} from "../_lib/actions";
import { OAuthAppForm, toFormValues } from "./oauth-app-form";

export function EditOAuthApp({
  app,
  storageEnabled,
  canManage,
}: {
  app: OAuthAppView;
  storageEnabled: boolean;
  canManage: boolean;
}) {
  const t = useTranslations("app.settings.developers.manageApp");
  const router = useRouter();
  return (
    <OAuthAppForm
      disabled={!canManage}
      initial={toFormValues(app)}
      key={app.updatedAt.toString()}
      onSubmit={async (input) => {
        const result = await updateOAuthAppAction({ id: app.id, ...input });
        if (!result.ok) return result.error;
        toast.success(t("appSaved"));
        router.refresh();
        return null;
      }}
      pendingLabel="Saving…"
      storageEnabled={storageEnabled}
      submitLabel="Save changes"
      verified={app.verified}
    />
  );
}

/** Pause or delete. Both cut off everyone who authorized the app. */
export function AppDangerZone({
  app,
}: {
  app: Pick<OAuthAppView, "id" | "name" | "active" | "userCount">;
}) {
  const t = useTranslations("app.settings.developers.manageApp");
  const inWorkspace = useWorkspaceHref();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const setActive = (active: boolean) =>
    startTransition(async () => {
      const result = await setOAuthAppActiveAction({ id: app.id, active });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(active ? t("appResumed") : t("appPaused"));
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteOAuthAppAction({ id: app.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setConfirmDelete(false);
      toast.success(t("appDeleted"));
      router.push(inWorkspace("/settings/developers"));
      router.refresh();
    });

  const people =
    app.userCount === 1
      ? "1 person"
      : `${app.userCount.toLocaleString("en")} people`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("status")}</CardTitle>
        <CardDescription>
          {app.userCount > 0
            ? `${people} currently ${app.userCount === 1 ? "has" : "have"} access through this app.`
            : t("nobodyHasAuthorizedThisApp")}
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <div className="flex items-start justify-between gap-4 pb-4">
          <div className="space-y-0.5">
            <Label htmlFor="oauth-app-active">{t("active")}</Label>
            <p className="text-muted-foreground text-xs">
              {t("whilePausedNobodyCanAuthorize")}
            </p>
          </div>
          <Switch
            checked={app.active}
            disabled={pending}
            id="oauth-app-active"
            onCheckedChange={setActive}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{t("deleteApp")}</p>
            <p className="text-muted-foreground text-xs">
              {t("revokesEveryTokenItIssued")}
            </p>
          </div>
          <Button
            disabled={pending}
            onClick={() => setConfirmDelete(true)}
            size="sm"
            variant="destructive"
          >
            {t("deleteApp")}
          </Button>
        </div>
      </CardContent>

      <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteName", { name: app.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("itsClientIdAndSecret")}
              {app.userCount > 0 ? t("disconnectingPeople", { people }) : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button disabled={pending} onClick={remove} variant="destructive">
              {pending ? t("deleting") : t("deleteApp")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
