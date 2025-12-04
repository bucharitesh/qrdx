import { Button } from "@repo/design-system/components/ui/button";
import { Card } from "@repo/design-system/components/ui/card";
import { Palette, Plus } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getThemes } from "@/actions/qr-themes";
import { ThemesList } from "@/app/settings/components/themes-list";
import { auth } from "@/lib/auth";
import { SettingsHeader } from "../components/settings-header";

export default async function ThemesPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/editor/theme");

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
      {sortedThemes.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-4 py-12 text-center">
          <div className="bg-primary/10 mb-6 rounded-full p-4">
            <Palette className="text-primary size-12" />
          </div>
          <h2 className="mb-2 text-xl font-semibold md:text-2xl">
            No themes created yet
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md text-pretty">
            Create your first custom theme to personalize your projects with
            unique color palettes.
          </p>
          <div className="w-full max-w-md">
            <Link href="/editor/theme">
              <Button size="lg" className="w-full gap-2">
                <Plus className="size-4" />
                Create Your First Theme
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <ThemesList themes={sortedThemes} />
      )}
    </div>
  );
}
