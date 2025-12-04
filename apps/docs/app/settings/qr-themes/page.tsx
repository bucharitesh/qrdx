import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getThemes } from "@/actions/qr-themes";
import { ThemesList } from "@/app/settings/components/themes-list";
import { auth } from "@/lib/auth";
import { SettingsHeader } from "../components/settings-header";

export default async function ThemesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/editor/qr");

  const themes = await getThemes();
  const sortedThemes = themes.sort((a, b) => {
    return (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0);
  });

  return (
    <div>
      <SettingsHeader
        title="QR Code Themes"
        description="View and manage your QR code theme"
      />
      <ThemesList themes={sortedThemes} />
    </div>
  );
}
