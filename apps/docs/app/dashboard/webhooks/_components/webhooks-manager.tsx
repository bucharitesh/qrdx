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
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { Switch } from "@repo/design-system/components/ui/switch";
import {
  TickCircle as CheckCircle2,
  InfoCircle as CircleAlert,
  Clock,
  Key as KeyRound,
  Hierarchy2 as ListTree,
  More as MoreHorizontal,
  Edit2 as Pencil,
  Add as Plus,
  Send2 as Send,
  Trash as Trash2,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { WebhookEndpointView } from "@/lib/events/endpoints";
import { EVENT_INFO } from "@/lib/events/types";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  revealWebhookSecret,
  sendWebhookTest,
  updateWebhookEndpoint,
  type WebhookActionResult,
} from "../_lib/actions";
import { DELIVERY_STATUS_LABELS, formatDeliveryTime } from "../_lib/format";
import { EndpointDialog, type EndpointFormValues } from "./endpoint-dialog";
import { SecretDialog } from "./secret-dialog";

export function LastDelivery({
  delivery,
}: {
  delivery: WebhookEndpointView["lastDelivery"];
}) {
  if (!delivery) {
    return <span className="text-muted-foreground">No deliveries yet</span>;
  }
  const Icon =
    delivery.status === "succeeded"
      ? CheckCircle2
      : delivery.status === "failed"
        ? CircleAlert
        : Clock;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon
        aria-hidden
        className={
          delivery.status === "succeeded"
            ? "size-3.5 shrink-0 text-emerald-600"
            : delivery.status === "failed"
              ? "text-destructive size-3.5 shrink-0"
              : "size-3.5 shrink-0 text-amber-600"
        }
      />
      <span className="truncate">
        {DELIVERY_STATUS_LABELS[delivery.status]} · {delivery.event} ·{" "}
        {formatDeliveryTime(delivery.createdAt)}
        {delivery.status !== "succeeded" && delivery.lastError
          ? ` · ${delivery.lastError}`
          : ""}
      </span>
    </span>
  );
}

function EndpointCard({
  endpoint,
  canManage,
  allowed,
  busy,
  onToggle,
  onTest,
  onEdit,
  onSecret,
  onDelete,
}: {
  endpoint: WebhookEndpointView;
  canManage: boolean;
  allowed: boolean;
  busy: boolean;
  onToggle: (active: boolean) => void;
  onTest: () => void;
  onEdit: () => void;
  onSecret: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="font-mono text-sm break-all">
                {endpoint.url}
              </CardTitle>
              {!endpoint.active && <Badge variant="outline">Disabled</Badge>}
            </div>
            <div className="flex flex-wrap gap-1">
              {endpoint.events.map((event) => (
                <Badge key={event} title={event} variant="secondary">
                  {EVENT_INFO[event]?.label ?? event}
                </Badge>
              ))}
            </div>
          </div>
          {canManage && (
            <div className="flex shrink-0 items-center gap-2">
              <Switch
                aria-label={
                  endpoint.active ? "Disable endpoint" : "Enable endpoint"
                }
                checked={endpoint.active}
                disabled={busy || (!allowed && !endpoint.active)}
                onCheckedChange={onToggle}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label="Endpoint actions"
                    disabled={busy}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled={!allowed} onSelect={onEdit}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onSecret}>
                    <KeyRound />
                    Signing secret
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onDelete} variant="destructive">
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-2 px-4 text-xs">
        <LastDelivery delivery={endpoint.lastDelivery} />
        <div className="flex gap-2">
          {canManage && (
            <Button
              disabled={busy || !allowed || !endpoint.active}
              onClick={onTest}
              size="sm"
              variant="outline"
            >
              <Send />
              Send test
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link
              href={`/dashboard/webhooks/${encodeURIComponent(endpoint.id)}`}
            >
              <ListTree />
              Deliveries
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function WebhooksManager({
  endpoints,
  canManage,
  allowed,
  canAdd,
  canUpgrade,
}: {
  endpoints: WebhookEndpointView[];
  /** Owner or admin of the active workspace */
  canManage: boolean;
  /** The workspace's plan includes webhooks */
  allowed: boolean;
  canAdd: boolean;
  /** Personal workspace: upgrading unlocks webhooks */
  canUpgrade: boolean;
}) {
  const router = useRouter();
  const openUpgradeDialog = useGetProDialogStore((s) => s.openUpgradeDialog);
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "edit"; endpoint: WebhookEndpointView } | null
  >(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{
    value: string;
    created: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState<WebhookEndpointView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [, startAction] = useTransition();

  const handle = <T,>(
    result: WebhookActionResult<T>,
    onOk: (data: T) => void,
  ) => {
    if (result.ok) {
      onOk(result.data);
      router.refresh();
      return;
    }
    if (result.upgrade && canUpgrade) {
      toast.error(result.error, {
        action: {
          label: "Upgrade",
          onClick: () => openUpgradeDialog("business"),
        },
      });
    } else {
      toast.error(result.error);
    }
  };

  const submit = (values: EndpointFormValues) => {
    setFormError(null);
    startSaving(async () => {
      if (dialog?.mode === "edit") {
        const result = await updateWebhookEndpoint({
          id: dialog.endpoint.id,
          ...values,
        });
        if (!result.ok) return setFormError(result.error);
        toast.success("Endpoint saved");
        setDialog(null);
        router.refresh();
        return;
      }
      const result = await createWebhookEndpoint(values);
      if (!result.ok) {
        setFormError(result.error);
        if (result.upgrade && canUpgrade) openUpgradeDialog("business");
        return;
      }
      setDialog(null);
      setSecret({ value: result.data.secret, created: true });
      router.refresh();
    });
  };

  const withBusy = (id: string, task: () => Promise<void>) => {
    setBusyId(id);
    startAction(async () => {
      try {
        await task();
      } finally {
        setBusyId(null);
      }
    });
  };

  const toggle = (endpoint: WebhookEndpointView, active: boolean) =>
    withBusy(endpoint.id, async () =>
      handle(await updateWebhookEndpoint({ id: endpoint.id, active }), () =>
        toast.success(active ? "Endpoint enabled" : "Endpoint disabled"),
      ),
    );

  const test = (endpoint: WebhookEndpointView) =>
    withBusy(endpoint.id, async () =>
      handle(await sendWebhookTest({ id: endpoint.id }), (data) =>
        data.ok
          ? toast.success(
              `Delivered: HTTP ${data.status} in ${data.durationMs} ms`,
            )
          : toast.error(`Not delivered: ${data.error}`),
      ),
    );

  const reveal = (endpoint: WebhookEndpointView) =>
    withBusy(endpoint.id, async () =>
      handle(await revealWebhookSecret({ id: endpoint.id }), (data) =>
        setSecret({ value: data.secret, created: false }),
      ),
    );

  const confirmDelete = () => {
    const endpoint = deleting;
    if (!endpoint) return;
    withBusy(endpoint.id, async () =>
      handle(await deleteWebhookEndpoint({ id: endpoint.id }), () => {
        setDeleting(null);
        toast.success("Endpoint deleted");
      }),
    );
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Events from this workspace are signed with each endpoint's secret
            and retried for about two days if your server is down.
          </p>
          <Button
            disabled={!canAdd}
            onClick={() => {
              setFormError(null);
              if (!allowed && canUpgrade) {
                openUpgradeDialog("business");
                return;
              }
              setDialog({ mode: "create" });
            }}
          >
            <Plus />
            Add endpoint
          </Button>
        </div>
      )}

      {endpoints.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          No endpoints yet. Add one, or connect Zapier or Make with your API
          token.
        </p>
      ) : (
        <div className="space-y-3">
          {endpoints.map((endpoint) => (
            <EndpointCard
              allowed={allowed}
              busy={busyId === endpoint.id}
              canManage={canManage}
              endpoint={endpoint}
              key={endpoint.id}
              onDelete={() => setDeleting(endpoint)}
              onEdit={() => {
                setFormError(null);
                setDialog({ mode: "edit", endpoint });
              }}
              onSecret={() => reveal(endpoint)}
              onTest={() => test(endpoint)}
              onToggle={(active) => toggle(endpoint, active)}
            />
          ))}
        </div>
      )}

      <EndpointDialog
        error={formError}
        initial={
          dialog?.mode === "edit"
            ? { url: dialog.endpoint.url, events: dialog.endpoint.events }
            : undefined
        }
        mode={dialog?.mode ?? "create"}
        onOpenChange={(open) => !open && setDialog(null)}
        onSubmit={submit}
        open={dialog !== null}
        pending={isSaving}
      />

      <SecretDialog
        description={
          secret?.created
            ? "Endpoint added. Use this secret to verify that requests come from QRdx. Owners and admins can show it again from the endpoint's menu."
            : "Use this secret to verify that requests come from QRdx. Rotate it from the endpoint's deliveries page if it leaks."
        }
        onClose={() => setSecret(null)}
        secret={secret?.value ?? null}
        title={secret?.created ? "Endpoint added" : "Signing secret"}
      />

      <AlertDialog
        onOpenChange={(open) => !open && setDeleting(null)}
        open={deleting !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this endpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.url} stops receiving events right away and its delivery
              log is deleted. Zaps or scenarios using it stop triggering.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              disabled={busyId === deleting?.id}
              onClick={confirmDelete}
              variant="destructive"
            >
              Delete endpoint
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
