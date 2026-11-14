import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { AppMessages } from "@/components/i18n/app-messages";
import { UserSettingsProvider } from "@/lib/hooks/use-user-settings";
import { SETTINGS_NAMESPACES } from "@/lib/i18n/playground";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

// Signed-out visitors are redirected by proxy.ts; pages re-check the session themselves.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <AppMessages namespaces={SETTINGS_NAMESPACES}>
      <UserSettingsProvider>
        <AppShell>{children}</AppShell>
      </UserSettingsProvider>
    </AppMessages>
  );
}
