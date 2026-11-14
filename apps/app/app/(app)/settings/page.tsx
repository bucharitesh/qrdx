import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signInPath } from "@/lib/safe-redirect";

export default async function SettingsIndex() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect(signInPath("/settings"));

  redirect("/settings/general");
}
