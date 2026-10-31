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
import { useState, useTransition } from "react";
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
  const router = useRouter();
  return (
    <OAuthAppForm
      disabled={!canManage}
      initial={toFormValues(app)}
      key={app.updatedAt.toString()}
      onSubmit={async (input) => {
        const result = await updateOAuthAppAction({ id: app.id, ...input });
        if (!result.ok) return result.error;
        toast.success("App saved");
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
      toast.success(active ? "App resumed" : "App paused");
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
      toast.success("App deleted");
      router.push("/settings/developers");
      router.refresh();
    });

  const people =
    app.userCount === 1
      ? "1 person"
      : `${app.userCount.toLocaleString("en")} people`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status</CardTitle>
        <CardDescription>
          {app.userCount > 0
            ? `${people} currently ${app.userCount === 1 ? "has" : "have"} access through this app.`
            : "Nobody has authorized this app yet."}
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <div className="flex items-start justify-between gap-4 pb-4">
          <div className="space-y-0.5">
            <Label htmlFor="oauth-app-active">Active</Label>
            <p className="text-muted-foreground text-xs">
              While paused, nobody can authorize the app and its tokens are
              refused. Resume to restore them.
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
            <p className="text-sm font-medium">Delete app</p>
            <p className="text-muted-foreground text-xs">
              Revokes every token it issued. This can't be undone.
            </p>
          </div>
          <Button
            disabled={pending}
            onClick={() => setConfirmDelete(true)}
            size="sm"
            variant="destructive"
          >
            Delete app
          </Button>
        </div>
      </CardContent>

      <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {app.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its client ID and secret stop working and every access and refresh
              token it issued is revoked
              {app.userCount > 0 ? `, disconnecting ${people}` : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button disabled={pending} onClick={remove} variant="destructive">
              {pending ? "Deleting…" : "Delete app"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
