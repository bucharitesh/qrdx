import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppMessages } from "@/components/i18n/app-messages";
import { DASHBOARD_NAMESPACES } from "@/lib/i18n/playground";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

// The app shell lives in [workspace]/layout.tsx: every dashboard page belongs
// to a workspace. /dashboard itself only sends people to their default one.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppMessages namespaces={DASHBOARD_NAMESPACES}>{children}</AppMessages>
  );
}
