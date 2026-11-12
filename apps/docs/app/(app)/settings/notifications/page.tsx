import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ConfirmIdentityProvider } from "@/components/confirm-identity/provider";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import { isEmailConfigured } from "@/lib/email/send";
import { listNotificationWorkspaces } from "@/lib/events/notification-settings";
import { getAppTranslations } from "@/lib/i18n/app-locale";
import { signInPath } from "@/lib/safe-redirect";
import { SettingsHeader } from "../components/settings-header";
import {
  NotificationsFooter,
  WorkspaceNotifications,
} from "./_components/workspace-notifications";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const t = await getAppTranslations("app.settings.notifications.page");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(signInPath("/settings/notifications"));

  const workspaces = await listNotificationWorkspaces(session.user.id);

  // Adding a Slack or Discord webhook asks "Confirm it's you" first.
  return (
    <ConfirmIdentityProvider>
      <div className="space-y-6">
        <SettingsHeader
          description={t("chooseWhatQrdxTellsYou")}
          title={t("notifications")}
        />

        {!isEmailConfigured && (
          <p className="bg-muted/40 rounded-lg border p-4 text-sm">
            {t.rich("emailIsntSetUpOn", {
              link: (chunks) => (
                <Link className="underline" href="/docs/notifications">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        )}

        {workspaces.map((workspace) => (
          <WorkspaceNotifications
            email={session.user.email}
            key={workspace.organizationId ?? "personal"}
            workspace={workspace}
          />
        ))}

        <NotificationsFooter />
      </div>
    </ConfirmIdentityProvider>
  );
}
