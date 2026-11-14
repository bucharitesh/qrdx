import Link from "next/link";
import type { ReactNode } from "react";
import {
  BrandMark,
  brandStyle,
} from "@/app/(app)/stats/[token]/public-stats-view";
import type { PortalWorkspace } from "@/lib/portal/access";
import { portalPath } from "@/lib/portal/paths";
import { PortalSignOut } from "./portal-sign-in";

// Every page of a client portal (agency tools): the workspace's brand in
// place of QRdx's chrome, who's signed in, and a quiet footer. No QRdx mark.

export function PortalShell({
  portal,
  email,
  children,
}: {
  portal: PortalWorkspace;
  /** The signed-in person, when there is one */
  email?: string | null;
  children: ReactNode;
}) {
  return (
    <div
      className="flex min-h-dvh flex-col"
      style={brandStyle(portal.brand.accent)}
    >
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            className="flex min-w-0 items-center gap-2.5 text-sm font-semibold"
            href={portalPath(portal.slug)}
          >
            <BrandMark brand={portal.brand} />
            <span className="truncate">{portal.brand.name}</span>
          </Link>
          {email && (
            <div className="flex min-w-0 items-center gap-1">
              <span className="text-muted-foreground hidden truncate text-xs sm:inline">
                {email}
              </span>
              <PortalSignOut />
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
      <footer className="mx-auto w-full max-w-5xl px-4 pb-8 sm:px-6">
        <p className="text-muted-foreground text-xs">
          Read-only reports shared by {portal.brand.name}.
        </p>
      </footer>
    </div>
  );
}
