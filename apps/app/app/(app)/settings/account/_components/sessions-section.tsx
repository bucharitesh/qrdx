"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
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
import { Devices, Mobile, Monitor } from "iconsax-reactjs";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { SessionDevice, SessionView } from "@/lib/account/sessions";
import { revokeOtherSessions, revokeSession } from "../_lib/actions";
import { SettingsSection } from "./settings-section";

const DEVICE_ICONS: Record<SessionDevice, typeof Monitor> = {
  desktop: Monitor,
  mobile: Mobile,
  tablet: Mobile,
  other: Devices,
};

export function SessionsSection({ sessions }: { sessions: SessionView[] }) {
  const t = useTranslations("app.settings.account.sessionsSection");
  const router = useRouter();
  const [ending, setEnding] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [endingAll, setEndingAll] = useState(false);
  const others = sessions.filter((session) => !session.current).length;

  const endSession = async (session: SessionView) => {
    setEnding(session.id);
    try {
      const result = await revokeSession({ sessionId: session.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("signedOutLabel", { label: session.label }));
      router.refresh();
    } finally {
      setEnding(null);
    }
  };

  const endOthers = async () => {
    setEndingAll(true);
    try {
      const result = await revokeOtherSessions();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(t("signedOutEverywhereElse"));
      setConfirmAll(false);
      router.refresh();
    } finally {
      setEndingAll(false);
    }
  };

  return (
    <SettingsSection
      action={
        <Button
          disabled={others === 0}
          onClick={() => setConfirmAll(true)}
          size="sm"
          variant="outline"
        >
          {t("signOutEverywhereElse")}
        </Button>
      }
      description={t("browsersAndDevicesSignedIn")}
      id="sessions"
      title={t("sessions")}
    >
      <ul className="divide-y">
        {sessions.map((session) => {
          const Icon = DEVICE_ICONS[session.device];
          const details = [
            session.lastActive,
            session.location,
            session.network,
          ].filter(Boolean);
          return (
            <li
              className="flex items-center gap-3 px-5 py-4 sm:gap-4 sm:px-6"
              key={session.id}
            >
              <span className="bg-muted/60 flex size-9 shrink-0 items-center justify-center rounded-full border">
                <Icon aria-hidden className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{session.label}</p>
                  {session.current && (
                    <Badge variant="secondary">{t("thisDevice")}</Badge>
                  )}
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {details.join(" · ")}
                </p>
                <p className="text-muted-foreground text-xs">
                  {session.signedIn}
                </p>
              </div>
              {!session.current && (
                <Button
                  className="shrink-0"
                  disabled={ending !== null}
                  onClick={() => endSession(session)}
                  size="sm"
                  variant="ghost"
                >
                  {ending === session.id && (
                    <Spinner className="animate-spin" />
                  )}
                  {t("signOut")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog
        onOpenChange={(open) => {
          if (!endingAll) setConfirmAll(open);
        }}
        open={confirmAll}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("signOutEverywhereElse2")}</AlertDialogTitle>
            <AlertDialogDescription>
              {others === 1
                ? t("theOtherSessionIsSigned")
                : t("theOtherOthersSessionsAre", { others })}{" "}
              {t("thisDeviceStaysSignedIn")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={endingAll}>
              {t("cancel")}
            </AlertDialogCancel>
            <Button disabled={endingAll} onClick={endOthers} variant="outline">
              {endingAll && <Spinner className="animate-spin" />}
              {t("signOutOthers")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}
