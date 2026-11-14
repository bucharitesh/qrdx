import { auth } from "@repo/auth/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { listAuthorizedApps } from "@/lib/oauth-apps/authorized";
import { signInPath } from "@/lib/safe-redirect";
import { AuthorizedAppsView } from "./_components/authorized-apps-view";

export const metadata: Metadata = {
  title: "Authorized apps",
  robots: { index: false, follow: false },
};

export default async function AuthorizedAppsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(signInPath("/settings/authorized-apps"));

  return (
    <AuthorizedAppsView apps={await listAuthorizedApps(session.user.id)} />
  );
}
