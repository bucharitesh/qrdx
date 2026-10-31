import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "@/components/header";
import { DashboardNav } from "./_components/dashboard-nav";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

// Signed-out visitors are redirected by proxy.ts; pages re-check the session themselves.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <Header />
      <main className="flex w-full flex-1 flex-col gap-4 px-4 py-4 md:flex-row md:px-6 md:py-8">
        <DashboardNav />
        <div className="mx-auto w-full max-w-6xl min-w-0 flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
