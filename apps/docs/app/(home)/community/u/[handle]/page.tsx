import { cn } from "@repo/design-system/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { CreatorLine } from "@/components/community/creator-line";
import { ItemGrid } from "@/components/community/item-card";
import { normalizeHandle, profilePath } from "@/lib/community/handles";
import { LICENSE_SHORT } from "@/lib/community/licence";
import { getProfileByHandle } from "@/lib/community/queries";
import {
  type CommunityItemType,
  TYPE_LABELS,
  typeFromSegment,
} from "@/lib/community/types";
import { createMetadata } from "@/lib/metadata";

// A creator's public profile: /community/@handle (rewritten here in
// next.config.ts; a folder named @x would be a parallel route slot).

const loadProfile = cache(async (raw: string) => {
  const handle = normalizeHandle(decodeURIComponent(raw));
  return handle ? getProfileByHandle(handle) : null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const profile = await loadProfile((await params).handle);
  if (!profile?.creator.handle) return {};
  return {
    ...createMetadata({
      title: `${profile.creator.displayName} (@${profile.creator.handle}) | Community`,
      description: `QR code frames and themes by ${profile.creator.displayName} on QRdx.`,
      path: profilePath(profile.creator.handle),
    }),
    robots: { index: false, follow: true },
  };
}

const NUMBER = new Intl.NumberFormat("en");

export default async function CreatorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await loadProfile((await params).handle);
  if (!profile?.creator.handle) notFound();
  const query = await searchParams;
  const tab =
    typeof query.type === "string" ? typeFromSegment(query.type) : null;
  const counts = new Map<CommunityItemType, number>();
  for (const item of profile.items) {
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  }
  const items = tab
    ? profile.items.filter((item) => item.type === tab)
    : profile.items;
  const base = profilePath(profile.creator.handle);
  const tabs: { id: CommunityItemType | null; label: string; count: number }[] =
    [
      { id: null, label: "All", count: profile.items.length },
      ...(["frame", "theme", "collection", "page-template"] as const)
        .filter((type) => counts.get(type))
        .map((type) => ({
          id: type,
          label: TYPE_LABELS[type].many,
          count: counts.get(type) ?? 0,
        })),
    ];

  return (
    <main className="w-full border-b">
      <section className="mx-auto max-w-6xl space-y-4 px-4 pt-12 pb-6 sm:px-6">
        <CreatorLine creator={profile.creator} link={false} size="lg" />
        {profile.creator.official && (
          <p className="text-muted-foreground text-sm">
            Made and checked by the QRdx team.
          </p>
        )}
        {profile.bio && (
          <p className="text-muted-foreground max-w-xl text-sm">
            {profile.bio}
          </p>
        )}
        <p className="text-muted-foreground text-sm tabular-nums">
          {NUMBER.format(profile.itemCount)}{" "}
          {profile.itemCount === 1 ? "item" : "items"} ·{" "}
          {NUMBER.format(profile.useCount)}{" "}
          {profile.useCount === 1 ? "use" : "uses"} ·{" "}
          {NUMBER.format(profile.likeCount)}{" "}
          {profile.likeCount === 1 ? "like" : "likes"}
        </p>
        <p className="text-muted-foreground text-xs">{LICENSE_SHORT}</p>
      </section>

      <nav aria-label="Item types" className="border-b">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
          {tabs.map((entry) => {
            const active = entry.id === tab;
            const href = entry.id
              ? `${base}?type=${entry.id === "frame" ? "frames" : entry.id === "theme" ? "themes" : "collections"}`
              : base;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                  active
                    ? "border-foreground text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
                href={href}
                key={entry.label}
              >
                {entry.label}{" "}
                <span className="text-muted-foreground tabular-nums">
                  {entry.count}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {items.length > 0 ? (
          <ItemGrid cards={items} />
        ) : (
          <p className="text-muted-foreground py-16 text-center text-sm">
            Nothing published here yet.
          </p>
        )}
      </div>
    </main>
  );
}
