import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmIdentityProvider } from "@/components/confirm-identity/provider";
import { isEmailConfigured } from "@/lib/email/send";
import { listNotificationWorkspaces } from "@/lib/events/notification-settings";
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
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(signInPath("/settings/notifications"));

  const workspaces = await listNotificationWorkspaces(session.user.id);

  // Adding a Slack or Discord webhook asks "Confirm it's you" first.
  return (
    <ConfirmIdentityProvider>
      <div className="space-y-6">
        <SettingsHeader
          description="Choose what QRdx tells you about: by email, or in Slack and Discord."
          title="Notifications"
        />

        {!isEmailConfigured && (
          <p className="bg-muted/40 rounded-lg border p-4 text-sm">
            Email isn't set up on this server (RESEND_API_KEY and EMAIL_FROM),
            so email alerts and digests are saved but not sent. Slack and
            Discord alerts still work.{" "}
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
    </ConfirmIdentityProvider>
  );
}
