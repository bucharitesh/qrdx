import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function SettingsIndex() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/playground");

  redirect("/settings/themes");
}
