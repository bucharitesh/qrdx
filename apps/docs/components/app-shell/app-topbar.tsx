"use client";

import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import bar from "@/components/header-bar.module.css";
import { QrdxLogo } from "@/components/qrdx-logo";
import { UserProfileDropdown } from "@/components/user-profile-dropdown";
import { CommandMenu } from "./command-menu";
import { CreateMenu } from "./create-menu";
import { HelpMenu } from "./help-menu";
import { MobileNav } from "./mobile-nav";
import { findActiveNavItem, isSettingsPath, SETTINGS_HOME } from "./nav-config";
import type { ShellData } from "./shell-data";

/** "Dashboard / Codes" or "Settings / Plan & usage", from the current path. */
function Breadcrumb() {
  const pathname = usePathname();
  const inSettings = isSettingsPath(pathname);
  const item = findActiveNavItem(pathname);
  const area = inSettings
    ? { label: "Settings", href: SETTINGS_HOME }
    : { label: "Dashboard", href: "/dashboard" };
  const page = item && item.href !== "/dashboard" ? item : null;

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        <li className="hidden shrink-0 sm:block">
          <Link
            className="text-muted-foreground hover:text-foreground rounded-sm transition-colors"
            href={area.href}
          >
            {area.label}
          </Link>
        </li>
        {page && (
          <>
            <li
              aria-hidden
              className="text-muted-foreground/50 hidden shrink-0 sm:block"
            >
              /
            </li>
            <li className="min-w-0">
              <Link
                aria-current={pathname === page.href ? "page" : undefined}
                className="block truncate font-medium"
                href={page.href}
              >
                {page.label}
              </Link>
            </li>
          </>
        )}
        {!page && <li className="font-medium sm:hidden">{area.label}</li>}
      </ol>
    </nav>
  );
}

/**
 * The app's own top bar (/dashboard, /settings), 48px: logo, where you are,
 * ⌘K, Create, Help and the account menu. No marketing menus; the site keeps
 * its own header.
 */
export function AppTopBar({ shell }: { shell: ShellData | null }) {
  return (
    // z-40: backdrop-blur makes the bar its own stacking context, so its
    // menus would otherwise sit under positioned page content.
    <header
      className={cn(
        bar.bar,
        bar.surface,
        "relative z-40 border-b backdrop-blur-md",
      )}
    >
      <div className="flex h-12 items-center gap-2 px-3 md:gap-3 md:px-4">
        <MobileNav shell={shell} />
        <Link
          aria-label="QRdx dashboard"
          className="flex shrink-0 items-center rounded-md p-1"
          href="/dashboard"
        >
          <QrdxLogo className="fill-secondary-foreground size-5" />
        </Link>
        <span aria-hidden className="text-border hidden text-lg sm:inline">
          /
        </span>
        <Breadcrumb />

        <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-2">
          <CommandMenu />
          <CreateMenu />
          <HelpMenu />
          <UserProfileDropdown plan={shell?.personalPlan} signedIn />
        </div>
      </div>
    </header>
  );
}
