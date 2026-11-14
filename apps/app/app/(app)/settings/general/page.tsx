import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserSettings } from "@/actions/user-settings";
import { SoundSetting } from "@/components/sound/sound-setting";
import { getAppLocale, getAppTranslations } from "@/lib/i18n/app-locale";
import { signInPath } from "@/lib/safe-redirect";
import { SettingsHeader } from "../components/settings-header";
import { AppearanceForm } from "./components/appearance-form";
import { GeneralSettingsForm } from "./components/general-settings-form";
import { LanguageForm } from "./components/language-form";

export default async function GeneralSettingsPage() {
  const t = await getAppTranslations("app.settings.general.page");
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect(signInPath("/settings/general"));
  }

  const [userSettings, locale] = await Promise.all([
    getUserSettings(),
    getAppLocale(),
  ]);

  return (
    <div className="space-y-6">
      <SettingsHeader
        title={t("preferences")}
        description={t("manageYourGeneralPreferencesAnd")}
      />

      <LanguageForm initialLocale={locale} />
      <AppearanceForm />

      <GeneralSettingsForm initialSettings={userSettings} />
      <SoundSetting />
    </div>
  );
}
