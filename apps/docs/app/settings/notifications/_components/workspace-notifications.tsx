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
  Slack,
  Trash as Trash2,
} from "iconsax-reactjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { EventCheckboxes } from "@/app/dashboard/webhooks/_components/event-checkboxes";
import { UpgradePlanButton } from "@/app/dashboard/webhooks/_components/upgrade-plan-button";
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

function ChatIcon({ channel }: { channel: "slack" | "discord" }) {
  const Icon = channel === "slack" ? Slack : MessageSquare;
  return <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" />;
}

export function WorkspaceNotifications({
  workspace,
  email,
}: {
  workspace: NotificationWorkspace;
  /** The signed-in account's address (email alerts always go there) */
  email: string;
}) {
  const router = useRouter();
  const openUpgradeDialog = useGetProDialogStore((s) => s.openUpgradeDialog);
  const isTeam = workspace.organizationId !== null;
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

  const reportError = (result: NotificationActionResult<unknown>) => {
    if (result.ok) return;
    if (result.upgrade && !isTeam) {
      const plan = result.upgrade;
      toast.error(result.error, {
        action: { label: "Upgrade", onClick: () => openUpgradeDialog(plan) },
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
      const result =
        chatDialog.mode === "add"
          ? await addNotificationWebhook({
              organizationId: workspace.organizationId,
              channel: chatDialog.channel,
              url: chatUrl.trim(),
              events: chatEvents,
            })
          : await updateNotificationWebhook({
              id: chatDialog.chat.id,
              events: chatEvents,
            });
      if (!result.ok) {
        setChatError(result.error);
        return;
      }
      toast.success(
        chatDialog.mode === "add" ? "Webhook added" : "Notifications saved",
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
          `Test message sent to ${NOTIFICATION_CHANNEL_LABELS[chat.channel]}`,
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
      toast.success("Webhook removed");
      router.refresh();
    });
  };

  const lockedNote = (plan: "pro" | "business", what: string) => (
    <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <p className="text-muted-foreground text-sm">
        {what}{" "}
        {plan === "pro"
          ? "are part of Pro and Business"
          : "are part of Business"}
        .{isTeam ? " Team features follow the plan of the team's owners." : ""}
      </p>
      {!isTeam && <UpgradePlanButton plan={plan} size="sm" />}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{workspace.name}</CardTitle>
          {isTeam && <Badge variant="outline">Team</Badge>}
          <Badge variant={workspace.plan === "free" ? "secondary" : "default"}>
            {PLAN_NAMES[workspace.plan]}
          </Badge>
        </div>
        <CardDescription>
          {isTeam
            ? "Alerts about this team's codes and pages. Only you get them; every member picks their own."
            : "Alerts about the codes and pages in your personal workspace."}
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
              Email to {email}
            </h3>
          </div>
          {!workspace.emailAlerts &&
            lockedNote("pro", "Email alerts and the weekly digest")}
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
                Slack and Discord
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
                  Slack
                </Button>
                <Button
                  onClick={() =>
                    openChatDialog({ mode: "add", channel: "discord" })
                  }
                  size="sm"
                  variant="outline"
                >
                  <Plus />
                  Discord
                </Button>
              </div>
            )}
          </div>
          {!workspace.chat &&
            lockedNote("business", "Slack and Discord alerts")}
          {workspace.chats.length === 0 ? (
            workspace.chat && (
              <p className="text-muted-foreground text-sm">
                Post scan milestones, form responses and code changes to a
                channel with an incoming webhook.
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
                      aria-label="Send a test message"
                      disabled={busy === chat.id || !workspace.chat}
                      onClick={() => test(chat)}
                      size="icon-sm"
                      title="Send a test message"
                      variant="ghost"
                    >
                      <Send />
                    </Button>
                    <Button
                      aria-label="Edit events"
                      disabled={!workspace.chat}
                      onClick={() => openChatDialog({ mode: "edit", chat })}
                      size="icon-sm"
                      title="Edit events"
                      variant="ghost"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      aria-label="Remove webhook"
                      disabled={busy === chat.id}
                      onClick={() => setRemoving(chat)}
                      size="icon-sm"
                      title="Remove"
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
                  ? `Add a ${NOTIFICATION_CHANNEL_LABELS[chatDialog.channel]} webhook`
                  : "Edit notifications"}
              </DialogTitle>
              <DialogDescription>
                {chatDialog?.mode === "add"
                  ? CHANNEL_HELP[chatDialog.channel].help
                  : `Pick what ${workspace.name} posts to this channel.`}
              </DialogDescription>
            </DialogHeader>
            {chatDialog?.mode === "add" && (
              <div className="space-y-2">
                <Label htmlFor="chat-webhook-url">Webhook URL</Label>
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
                  Treat it like a password: anyone with it can post to the
                  channel. We only show the start of it after saving.
                </p>
              </div>
            )}
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Post about</legend>
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
                Cancel
              </Button>
              <Button
                disabled={isSaving || chatEvents.length === 0}
                type="submit"
              >
                {isSaving ? "Saving..." : "Save"}
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
            <AlertDialogTitle>Remove this webhook?</AlertDialogTitle>
            <AlertDialogDescription>
              QRdx stops posting to {removing?.label}. The webhook itself stays
              in {removing ? NOTIFICATION_CHANNEL_LABELS[removing.channel] : ""}{" "}
              until you delete it there.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              disabled={busy === removing?.id}
              onClick={confirmRemove}
              variant="destructive"
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function NotificationsFooter() {
  return (
    <p className="text-muted-foreground text-xs">
      Every alert email has an unsubscribe link. Team invitations and other
      account emails are always sent. Want events in your own systems?{" "}
      <Link className="underline" href="/dashboard/webhooks">
        Use webhooks
      </Link>
      .
    </p>
  );
}
