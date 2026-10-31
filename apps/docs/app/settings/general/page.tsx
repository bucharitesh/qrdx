import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserSettings } from "@/actions/user-settings";
import { SoundSetting } from "@/components/sound/sound-setting";
import { SettingsHeader } from "../components/settings-header";
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
      <SettingsHeader
        title="Preferences"
        description="Manage your general preferences and settings"
      />

      <AppearanceForm />

      <GeneralSettingsForm initialSettings={userSettings} />
      <SoundSetting />
    </div>
  );
}
