import { Button } from "@repo/design-system/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/header";
import { UserSettingsProvider } from "@/lib/hooks/use-user-settings";
import { SettingsSidebar } from "./components/settings-sidebar";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserSettingsProvider>
      <div className="flex flex-col">
        <Header />
        <main className="flex w-full flex-1 flex-col gap-4 px-4 py-4 md:flex-row md:px-6 md:py-8">
          <div className="flex flex-col gap-2">
            <Link href="/playground" className="w-fit">
              <Button variant="outline">
                <ArrowLeft /> Back
              </Button>
            </Link>
            <SettingsSidebar />
          </div>
          <div className="mx-auto w-full max-w-4xl flex-1">{children}</div>
        </main>
      </div>
    </UserSettingsProvider>
  );
}
