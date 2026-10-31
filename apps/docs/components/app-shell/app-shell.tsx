import type { ReactNode } from "react";
import { Header } from "@/components/header";
import { AppSidebar } from "./app-sidebar";
import { MobileNav } from "./mobile-nav";

/** Shared chrome for /dashboard and /settings: site header, sidebar, content. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <Header />
      <div className="flex w-full flex-1 gap-8 px-4 py-4 md:px-6 md:py-8">
        <aside className="hidden w-56 shrink-0 md:block">
          {/* p-1/-m-1 keeps focus rings visible inside the scroll box. */}
          <div className="sticky top-8 -m-1 max-h-[calc(100svh-4rem)] overflow-y-auto p-1">
            <AppSidebar />
          </div>
        </aside>
        <main className="mx-auto w-full max-w-6xl min-w-0 flex-1">
          <MobileNav />
          {children}
        </main>
      </div>
    </div>
  );
}
