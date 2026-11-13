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
    // --app-sidebar-width: what the sidebar takes from md up, so fixed layers
    // over the page (the lists' selection bar) centre on the page beside it.
    <div
      className={cn(
        "flex min-h-svh flex-col md:h-svh md:overflow-hidden",
        // The aside's w-14 and w-60, on the same spacing scale.
        collapsed
          ? "md:[--app-sidebar-width:--spacing(14)]"
          : "md:[--app-sidebar-width:--spacing(60)]",
      )}
    >
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
        {/* Room at the bottom, so the last row and the pager scroll clear of
            what floats over the page: a list's selection bar while it's open
            (dashboard/_components/selection-bar.tsx) and the "Get set up"
            launcher while it's on screen (setup-guide.tsx sets
            --setup-guide-clearance, which already counts a bar under it).
            Focusable from script only (tabIndex -1, no ring): where focus
            lands when the control holding it goes away (focus-page.ts). */}
        <main
          className={cn(
            "min-w-0 flex-1 outline-none px-4 pt-5 pb-[max(1.25rem,var(--setup-guide-clearance,0px))] md:overflow-y-auto md:overscroll-contain md:px-8 md:pt-8 md:pb-[max(2rem,var(--setup-guide-clearance,0px))]",
            "has-[[data-selection-bar=open]]:pb-[max(calc(env(safe-area-inset-bottom)+5.5rem),var(--setup-guide-clearance,0px))] md:has-[[data-selection-bar=open]]:pb-[max(calc(env(safe-area-inset-bottom)+6.5rem),var(--setup-guide-clearance,0px))]",
          )}
          data-app-scroll=""
          tabIndex={-1}
        >
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
