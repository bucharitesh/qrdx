"use client";

import { cn } from "@repo/design-system/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavLinks } from "../_lib/nav";

/** `consoleEnabled`: the back-office console is on (CONSOLE_ORIGIN is set). */
export function AdminNav({ consoleEnabled }: { consoleEnabled: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="w-full min-w-0 shrink-0 md:w-56">
      <nav className="flex gap-1 overflow-x-auto md:flex-col">
        {adminNavLinks(consoleEnabled).map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          const className = cn(
            "hover:bg-muted flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
            isActive && "bg-muted",
          );
          const content = (
            <>
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </>
          );
          // Another zone's page: a full page load (next/link can't cross zones).
          return item.crossZone ? (
            <a className={className} href={item.href} key={item.href}>
              {content}
            </a>
          ) : (
            <Link className={className} href={item.href} key={item.href}>
              {content}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
