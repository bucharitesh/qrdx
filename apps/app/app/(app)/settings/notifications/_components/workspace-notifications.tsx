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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
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
import { Separator } from "@repo/design-system/components/ui/separator";
import { Switch } from "@repo/design-system/components/ui/switch";
import {
  Sms as Mail,
  MessageSquare,
  Edit2 as Pencil,
  Add as Plus,
  Send2 as Send,
  Trash as Trash2,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { EventCheckboxes } from "@/app/(app)/dashboard/webhooks/_components/event-checkboxes";
import { UpgradePlanButton } from "@/app/(app)/dashboard/webhooks/_components/upgrade-plan-button";
import { useConfirmation } from "@/components/confirm-identity/provider";
import { useWorkspaceHref } from "@/components/workspace-provider";
import type { NotificationWorkspace } from "@/lib/events/notification-settings";
import {
  CHAT_NOTIFICATION_EVENTS,
  EVENT_INFO,
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
} from "@/lib/events/types";
import { PLAN_NAMES } from "@/lib/pricing";
import { useGetProDialogStore } from "@/store/get-pro-dialog-store";
import {
  addNotificationWebhook,
  type NotificationActionResult,
  removeNotificationWebhook,
  setNotificationEmailEvents,
  testNotificationWebhook,
  updateNotificationWebhook,
} from "../_lib/actions";

type Chat = NotificationWorkspace["chats"][number];
type ChatDialog =
  | { mode: "add"; channel: "slack" | "discord" }
  | { mode: "edit"; chat: Chat };

const CHANNEL_HELP = {
  slack: {
    placeholder: "https://hooks.slack.com/services/…",
    help: "In Slack: Apps → Incoming WebHooks (or your own Slack app) → Add to a channel, then copy the webhook URL.",
  },
  discord: {
    placeholder: "https://discord.com/api/webhooks/…",
    help: "In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.",
  },
} as const;

/** The app's own logo mark (both read on light and dark backgrounds). */
function ChatIcon({ channel }: { channel: "slack" | "discord" }) {
  return (
    <img
      alt=""
      aria-hidden
      className="size-4 shrink-0 object-contain"
      src={`/integrations/${channel}.svg`}
    />
  );
}

export function WorkspaceNotifications({
  workspace,
  email,
}: {
  workspace: NotificationWorkspace;
  /** The signed-in account's address (email alerts always go there) */
  email: string;
}) {
  const t = useTranslations(
    "app.settings.notifications.workspaceNotifications",
  );
  const router = useRouter();
  const openUpgradeDialog = useGetProDialogStore((s) => s.openUpgradeDialog);
  const isTeam = !workspace.own;
  const [emailEvents, setEmailEventsState] = useState<NotificationEvent[]>(
    workspace.email?.events ?? [],
  );
  const [chatDialog, setChatDialog] = useState<ChatDialog | null>(null);
  const [chatUrl, setChatUrl] = useState("");
  const [chatEvents, setChatEvents] = useState<NotificationEvent[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Chat | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [, startAction] = useTransition();
  const { withConfirmation } = useConfirmation();

  const reportError = (result: NotificationActionResult<unknown>) => {
    if (result.ok) return;
    if (result.upgrade && !isTeam) {
      const plan = result.upgrade;
      toast.error(result.error, {
        action: { label: t("upgrade"), onClick: () => openUpgradeDialog(plan) },
      });
    } else {
      toast.error(result.error);
    }
  };

  const toggleEmail = (event: NotificationEvent, on: boolean) => {
    const previous = emailEvents;
    const next = on
      ? [...previous.filter((item) => item !== event), event]
      : previous.filter((item) => item !== event);
    setEmailEventsState(next);
    setBusy(`email:${event}`);
    startAction(async () => {
      const result = await setNotificationEmailEvents({
        organizationId: workspace.organizationId,
        events: next,
      });
      setBusy(null);
      if (!result.ok) {
        setEmailEventsState(previous);
        reportError(result);
        return;
      }
      router.refresh();
    });
  };

  const openChatDialog = (dialog: ChatDialog) => {
    setChatError(null);
    setChatUrl("");
    setChatEvents(
      dialog.mode === "edit"
        ? dialog.chat.events
        : CHAT_NOTIFICATION_EVENTS.filter((event) => event !== "code.updated"),
    );
    setChatDialog(dialog);
  };

  const submitChat = (event: FormEvent) => {
    event.preventDefault();
    if (!chatDialog) return;
    setChatError(null);
    startSaving(async () => {
      // A new address asks "Confirm it's you" first.
      const result =
        chatDialog.mode === "add"
          ? await withConfirmation(
              () =>
                addNotificationWebhook({
                  organizationId: workspace.organizationId,
                  channel: chatDialog.channel,
                  url: chatUrl.trim(),
                  events: chatEvents,
                }),
              "add-notification-webhook",
            )
          : await updateNotificationWebhook({
              id: chatDialog.chat.id,
              events: chatEvents,
            });
      if (result === null) return;
      if (!result.ok) {
        setChatError(result.error);
        return;
      }
      toast.success(
        chatDialog.mode === "add" ? t("webhookAdded") : t("notificationsSaved"),
      );
      setChatDialog(null);
      router.refresh();
    });
  };

  const test = (chat: Chat) => {
    setBusy(chat.id);
    startAction(async () => {
      const result = await testNotificationWebhook({ id: chat.id });
      setBusy(null);
      if (result.ok) {
        toast.success(
          t("testMessageSentToValue", {
            value: NOTIFICATION_CHANNEL_LABELS[chat.channel],
          }),
        );
      } else {
        reportError(result);
      }
    });
  };

  const confirmRemove = () => {
    const chat = removing;
    if (!chat) return;
    setBusy(chat.id);
    startAction(async () => {
      const result = await removeNotificationWebhook({ id: chat.id });
      setBusy(null);
      if (!result.ok) return reportError(result);
      setRemoving(null);
      toast.success(t("webhookRemoved"));
      router.refresh();
    });
  };

  const lockedNote = (plan: "pro" | "business", note: string) => (
    <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <p className="text-muted-foreground text-sm">
        {note}
        {isTeam ? ` ${t("thisWorkspaceFollowsThePlan")}` : ""}
      </p>
      {!isTeam && <UpgradePlanButton plan={plan} size="sm" />}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{workspace.name}</CardTitle>
          <Badge variant={workspace.plan === "free" ? "secondary" : "default"}>
            {PLAN_NAMES[workspace.plan]}
          </Badge>
        </div>
        <CardDescription>
          {isTeam
            ? t("alertsAboutThisWorkspacesCodes")
            : t("alertsAboutTheCodesAnd")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section aria-labelledby={`email-${workspace.organizationId ?? "me"}`}>
          <div className="mb-3 flex items-center gap-2">
            <Mail aria-hidden className="text-muted-foreground size-4" />
            <h3
              className="text-sm font-semibold"
              id={`email-${workspace.organizationId ?? "me"}`}
            >
              {t("emailToEmail", { email })}
            </h3>
          </div>
          {!workspace.emailAlerts && lockedNote("pro", t("emailAlertsArePro"))}
          <ul className="divide-y">
            {NOTIFICATION_EVENTS.map((event) => {
              const on = emailEvents.includes(event);
              const id = `${workspace.organizationId ?? "me"}-email-${event}`;
              return (
                <li
                  className="flex items-start justify-between gap-4 py-3"
                  key={event}
                >
                  <label className="min-w-0 space-y-0.5" htmlFor={id}>
                    <span className="block text-sm font-medium">
                      {EVENT_INFO[event].label}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {EVENT_INFO[event].description}
                    </span>
                  </label>
                  <Switch
                    checked={on}
                    // Turning off always works, even after a downgrade.
                    disabled={
                      busy === `email:${event}` ||
                      (!on && !workspace.emailAlerts)
                    }
                    id={id}
                    onCheckedChange={(next) => toggleEmail(event, next)}
                  />
                </li>
              );
            })}
          </ul>
        </section>

        <Separator />

        <section aria-labelledby={`chat-${workspace.organizationId ?? "me"}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare
                aria-hidden
                className="text-muted-foreground size-4"
              />
              <h3
                className="text-sm font-semibold"
                id={`chat-${workspace.organizationId ?? "me"}`}
              >
                {t("slackAndDiscord")}
              </h3>
            </div>
            {workspace.chat && (
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    openChatDialog({ mode: "add", channel: "slack" })
                  }
                  size="sm"
                  variant="outline"
                >
                  <Plus />
                  {t("slack")}
                </Button>
                <Button
                  onClick={() =>
                    openChatDialog({ mode: "add", channel: "discord" })
                  }
                  size="sm"
                  variant="outline"
                >
                  <Plus />
                  {t("discord")}
                </Button>
              </div>
            )}
          </div>
          {!workspace.chat &&
            lockedNote("business", t("chatAlertsAreBusiness"))}
          {workspace.chats.length === 0 ? (
            workspace.chat && (
              <p className="text-muted-foreground text-sm">
                {t("postScanMilestonesFormResponses")}
              </p>
            )
          ) : (
            <ul className="mt-3 space-y-2">
              {workspace.chats.map((chat) => (
                <li
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                  key={chat.id}
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <ChatIcon channel={chat.channel} />
                      <span className="font-medium">
                        {NOTIFICATION_CHANNEL_LABELS[chat.channel]}
                      </span>
                      <span className="text-muted-foreground truncate font-mono text-xs">
                        {chat.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {chat.events.map((event) => (
                        <Badge key={event} variant="secondary">
                          {EVENT_INFO[event].label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      aria-label={t("sendATestMessage")}
                      disabled={busy === chat.id || !workspace.chat}
                      onClick={() => test(chat)}
                      size="icon-sm"
                      title={t("sendATestMessage")}
                      variant="ghost"
                    >
                      <Send />
                    </Button>
                    <Button
                      aria-label={t("editEvents")}
                      disabled={!workspace.chat}
                      onClick={() => openChatDialog({ mode: "edit", chat })}
                      size="icon-sm"
                      title={t("editEvents")}
                      variant="ghost"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      aria-label={t("removeWebhook")}
                      disabled={busy === chat.id}
                      onClick={() => setRemoving(chat)}
                      size="icon-sm"
                      title={t("remove")}
                      variant="ghost"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>

      <Dialog
        onOpenChange={(open) => !open && setChatDialog(null)}
        open={chatDialog !== null}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <form className="space-y-5" onSubmit={submitChat}>
            <DialogHeader>
              <DialogTitle>
                {chatDialog?.mode === "add"
                  ? t("addAValueWebhook", {
                      value: NOTIFICATION_CHANNEL_LABELS[chatDialog.channel],
                    })
                  : t("editNotifications")}
              </DialogTitle>
              <DialogDescription>
                {chatDialog?.mode === "add"
                  ? CHANNEL_HELP[chatDialog.channel].help
                  : t("pickWhatNamePostsTo", { name: workspace.name })}
              </DialogDescription>
            </DialogHeader>
            {chatDialog?.mode === "add" && (
              <div className="space-y-2">
                <Label htmlFor="chat-webhook-url">{t("webhookUrl")}</Label>
                <Input
                  autoComplete="off"
                  id="chat-webhook-url"
                  inputMode="url"
                  onChange={(e) => setChatUrl(e.target.value)}
                  placeholder={CHANNEL_HELP[chatDialog.channel].placeholder}
                  required
                  spellCheck={false}
                  type="url"
                  value={chatUrl}
                />
                <p className="text-muted-foreground text-xs">
                  {t("treatItLikeAPassword")}
                </p>
              </div>
            )}
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                {t("postAbout")}
              </legend>
              <EventCheckboxes
                events={CHAT_NOTIFICATION_EVENTS}
                idPrefix={`chat-${workspace.organizationId ?? "me"}`}
                onChange={setChatEvents}
                showWireNames={false}
                value={chatEvents}
              />
            </fieldset>
            {chatError && (
              <p className="text-destructive text-sm" role="alert">
                {chatError}
              </p>
            )}
            <DialogFooter>
              <Button
                onClick={() => setChatDialog(null)}
                type="button"
                variant="outline"
              >
                {t("cancel")}
              </Button>
              <Button
                disabled={isSaving || chatEvents.length === 0}
                type="submit"
              >
                {isSaving ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => !open && setRemoving(null)}
        open={removing !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("removeThisWebhook")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("removeWebhookDescription", {
                chat: removing?.label ?? "",
                channel: removing
                  ? NOTIFICATION_CHANNEL_LABELS[removing.channel]
                  : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <Button
              disabled={busy === removing?.id}
              onClick={confirmRemove}
              variant="destructive"
            >
              {t("remove")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function NotificationsFooter() {
  const t = useTranslations(
    "app.settings.notifications.workspaceNotifications",
  );
  const inWorkspace = useWorkspaceHref();
  return (
    <p className="text-muted-foreground text-xs">
      {t.rich("everyAlertEmailHasAn", {
        link: (chunks) => (
          <Link className="underline" href={inWorkspace("/settings/webhooks")}>
            {chunks}
          </Link>
        ),
      })}
    </p>
  );
}
