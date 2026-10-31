import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isEmailConfigured } from "@/lib/email/send";
import { listNotificationWorkspaces } from "@/lib/events/notification-settings";
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/playground");

  const workspaces = await listNotificationWorkspaces(session.user.id);

  return (
    <div className="space-y-6">
      <SettingsHeader
        description="Choose what QRdx tells you about: by email, or in Slack and Discord."
        title="Notifications"
      />

      {!isEmailConfigured && (
        <p className="bg-muted/40 rounded-lg border p-4 text-sm">
          Email isn't set up on this server (RESEND_API_KEY and EMAIL_FROM), so
          email alerts and digests are saved but not sent. Slack and Discord
          alerts still work.{" "}
          <Link className="underline" href="/docs/notifications">
            Setup guide
          </Link>
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
  );
}
