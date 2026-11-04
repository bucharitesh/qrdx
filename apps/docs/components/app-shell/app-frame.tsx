"use client";

import { cn } from "@repo/design-system/lib/utils";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { Meter } from "@/app/settings/usage/_lib/meters";
import { AppSidebar } from "./app-sidebar";
import { AppTopBar } from "./app-topbar";
import type { ShellData } from "./shell-data";

const COLLAPSED_KEY = "qrdx:sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The app's frame: a 48px top bar, then the sidebar column (full height,
 * collapsible to an icon rail, remembered in this browser) beside the page.
 * Below md the sidebar opens as a sheet from the top bar instead.
 */
export function AppFrame({
  shell,
  limitWarnings = null,
  children,
}: {
  shell: ShellData | null;
  /** Limits at 90% or more, streamed from the server */
  limitWarnings?: Promise<Meter[]> | null;
  children: ReactNode;
}) {
  const [collapsed, setCollapsedState] = useState(false);
  useEffect(() => setCollapsedState(readCollapsed()), []);
  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Blocked storage: it stays as chosen until the page reloads.
    }
  }, []);

  return (
    <div className="flex min-h-svh flex-col">
      <AppTopBar limitWarnings={limitWarnings} shell={shell} />
      <div className="flex flex-1">
        <aside
          className={cn(
            "bg-sidebar border-sidebar-border hidden shrink-0 border-r transition-[width] duration-200 ease-out motion-reduce:transition-none md:block",
            collapsed ? "w-14" : "w-60",
          )}
          data-state={collapsed ? "collapsed" : "expanded"}
        >
          {/* Fills the screen under the top bar and stays while the page scrolls. */}
          <div className="sticky top-0 h-[calc(100svh-3rem)]">
            <AppSidebar
              collapsed={collapsed}
              limitWarnings={limitWarnings}
              onCollapsedChange={setCollapsed}
              shell={shell}
            />
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
