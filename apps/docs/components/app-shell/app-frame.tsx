"use client";

import { cn } from "@repo/design-system/lib/utils";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { Meter } from "@/app/(app)/settings/usage/_lib/meters";
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
    // From md up the frame is exactly the screen: the top bar and sidebar stay
    // put and only the page scrolls, inside <main>. Phones scroll the window
    // (the sidebar is a sheet there).
    <div className="flex min-h-svh flex-col md:h-svh md:overflow-hidden">
      <AppTopBar limitWarnings={limitWarnings} shell={shell} />
      <div className="flex flex-1 md:min-h-0">
        <aside
          className={cn(
            "bg-sidebar border-sidebar-border hidden shrink-0 border-r transition-[width] duration-200 ease-out motion-reduce:transition-none md:block",
            collapsed ? "w-14" : "w-60",
          )}
          data-state={collapsed ? "collapsed" : "expanded"}
        >
          {/* Full height under the top bar; its links scroll inside it. */}
          <div className="h-full">
            <AppSidebar
              collapsed={collapsed}
              limitWarnings={limitWarnings}
              onCollapsedChange={setCollapsed}
              shell={shell}
            />
          </div>
        </aside>
        <main
          className="min-w-0 flex-1 px-4 py-5 md:overflow-y-auto md:overscroll-contain md:px-8 md:py-8"
          data-app-scroll=""
        >
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
