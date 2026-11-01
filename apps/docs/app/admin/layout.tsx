import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import { Header } from "@/components/header";
import { AdminNav } from "./_components/admin-nav";
import { AdminSearch } from "./_components/admin-search";
import { requireAdmin } from "./_lib/guard";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Each page calls requireAdmin() too: layouts are not re-rendered on client navigation.
  await requireAdmin();

  return (
    <div className="flex flex-col">
      <Header />
      <main className="flex w-full flex-1 flex-col gap-4 px-4 py-4 md:flex-row md:px-6 md:py-8">
        <AdminNav />
        <div className="mx-auto w-full max-w-6xl min-w-0 flex-1 space-y-4">
          <Suspense fallback={<div className="h-9" />}>
            <AdminSearch />
          </Suspense>
          <div>{children}</div>
        </div>
      </main>
    </div>
  );
}
