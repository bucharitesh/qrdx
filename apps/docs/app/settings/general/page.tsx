import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserSettings } from "@/actions/user-settings";
import { auth } from "@/lib/auth";
import { AppearanceForm } from "./components/appearance-form";
import { GeneralSettingsForm } from "./components/general-settings-form";

export default async function GeneralSettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/playground");
  }

  const userSettings = await getUserSettings();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">General Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your general preferences and settings
        </p>
      </div>

      <AppearanceForm />

      <GeneralSettingsForm initialSettings={userSettings} />
    </div>
  );
}

