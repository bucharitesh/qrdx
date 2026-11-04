import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveMeterCaps } from "@/app/settings/usage/_lib/meters";
import { getChangelogFeed } from "@/lib/changelog-feed-server";
import { PLAN_LIMITS } from "@/lib/plans";
import { AppShellSheet, type SheetOpen } from "./sheet";

// Dev-only contact sheet of the app shell's "What's new" and plan-limit
// parts, rendered with made-up counts (no session, no database), for
// screenshots: the dashboard itself needs a signed-in account. Not built
// into production.

export const metadata: Metadata = {
  title: "App shell parts",
  robots: { index: false, follow: false },
};

const OPEN: readonly SheetOpen[] = ["whats-new", "limit", "help"];

export default async function AppShellSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { open } = await searchParams;

  return (
    <AppShellSheet
      caps={{
        freeOwn: resolveMeterCaps(PLAN_LIMITS, "free", { isTeam: false }),
        freeTeam: resolveMeterCaps(PLAN_LIMITS, "free", { isTeam: true }),
        proOwn: resolveMeterCaps(PLAN_LIMITS, "pro", { isTeam: false }),
        proTeam: resolveMeterCaps(PLAN_LIMITS, "pro", { isTeam: true }),
        businessTeam: resolveMeterCaps(PLAN_LIMITS, "business", {
          isTeam: true,
        }),
      }}
      items={getChangelogFeed()}
      open={OPEN.find((value) => value === open) ?? null}
      // Fresh per load, so "seen" in this browser never carries over.
      viewerId={`preview-${crypto.randomUUID()}`}
    />
  );
}
