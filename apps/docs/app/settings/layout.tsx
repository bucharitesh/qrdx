import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell/app-shell";
import { UserSettingsProvider } from "@/lib/hooks/use-user-settings";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

// Signed-out visitors are redirected by proxy.ts; pages re-check the session themselves.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <UserSettingsProvider>
      <AppShell>{children}</AppShell>
    </UserSettingsProvider>
  );
}
