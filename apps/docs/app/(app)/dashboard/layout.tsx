import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

// The app shell lives in [workspace]/layout.tsx: every dashboard page belongs
// to a workspace. /dashboard itself only sends people to their default one.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
