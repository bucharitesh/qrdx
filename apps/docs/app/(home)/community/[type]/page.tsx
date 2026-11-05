import { cn } from "@repo/design-system/lib/utils";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CommunityTabs } from "@/components/community/community-tabs";
import { ItemGrid } from "@/components/community/item-card";
import { HairlineFigure } from "@/components/mockups/hairline";
import { hasCollections, hasTemplates } from "@/lib/community/home";
import { LICENSE_SHORT } from "@/lib/community/licence";
import { listFrames, listItems } from "@/lib/community/queries";
import {
  type CommunityItemType,
  TYPE_SEGMENTS,
  typeFromSegment,
} from "@/lib/community/types";
import { createMetadata } from "@/lib/metadata";
import { playgroundHref } from "@/lib/playground-links";
import { dashboardEntry } from "@/lib/workspace-paths";
import { CommunityThemesContent } from "../_components/community-themes-content";
import { COPY } from "./copy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>;
}): Promise<Metadata> {
  const type = typeFromSegment((await params).type);
  if (!type) return {};
  return {
    ...createMetadata({
      title: `${COPY[type].title} | Community`,
      description: COPY[type].description,
      path: `/community/${(await params).type}`,
      ownOgImage: true,
    }),
    // Community pages stay out of search until the first moderation pass.
    robots: { index: false, follow: true },
  };
}

type Filter = "all" | "official" | "community";

export default async function CommunityTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const type = typeFromSegment((await params).type);
  if (!type) notFound();
  const query = await searchParams;
  const from = typeof query.from === "string" ? query.from : "all";
  const filter: Filter =
    from === "official" || from === "community" ? from : "all";
  const sort = query.sort === "newest" ? "newest" : "popular";
  const [showCollections, showTemplates] = await Promise.all([
    hasCollections(),
    hasTemplates(),
  ]);

  return (
    <main className="w-full border-b">
      <section className="mx-auto max-w-6xl px-4 pt-12 pb-6 sm:px-6">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Community
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-4xl">
          {COPY[type].heading}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-pretty">
          {COPY[type].intro}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">{LICENSE_SHORT}</p>
      </section>

      <CommunityTabs
        active={TAB_OF[type]}
        showCollections={showCollections || type === "collection"}
        showTemplates={showTemplates}
      />

      {type === "theme" ? (
        <div className="mx-auto max-w-6xl py-6">
          {/* nuqs reads search params; without a boundary the whole page renders client-side */}
          <Suspense fallback={<div className="min-h-[50vh] w-full" />}>
            <CommunityThemesContent />
          </Suspense>
        </div>
      ) : (
        <TypeGrid filter={filter} sort={sort} type={type} />
      )}
    </main>
  );
}

const TAB_OF = {
  frame: "frames",
  theme: "themes",
  collection: "collections",
  "page-template": "templates",
} as const satisfies Record<CommunityItemType, string>;

const EMPTY: Record<
  Exclude<CommunityItemType, "theme">,
  { title: string; body: string; link?: { href: string; label: string } }
> = {
  frame: {
    title: "No frames here yet",
    body: "Make a frame in the editor's Frame section, then publish it.",
    link: { href: playgroundHref({ tab: "design" }), label: "Open the editor" },
  },
  collection: {
    title: "No collections yet",
    body: "Collections from QRdx appear here.",
  },
  "page-template": {
    title: "No page templates yet",
    body: "Publish one of your hosted pages from Pages in your dashboard. Your own details are taken out first.",
    link: { href: dashboardEntry("pages"), label: "Open your pages" },
  },
};

async function TypeGrid({
  type,
  filter,
  sort,
}: {
  type: Exclude<CommunityItemType, "theme">;
  filter: Filter;
  sort: "popular" | "newest";
}) {
  const official =
    filter === "official" ? true : filter === "community" ? false : undefined;
  const cards =
    type === "frame"
      ? await listFrames({ official, sort })
      : await listItems({ type, official, sort, limit: 200 });
  const base = `/community/${TYPE_SEGMENTS[type]}`;
  const link = (next: Partial<{ from: Filter; sort: string }>) => {
    const params = new URLSearchParams();
    const nextFrom = next.from ?? filter;
    const nextSort = next.sort ?? sort;
    if (nextFrom !== "all") params.set("from", nextFrom);
    if (nextSort !== "popular") params.set("sort", nextSort);
    const search = params.toString();
    return search ? `${base}?${search}` : base;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Made by" className="flex gap-1.5">
          {(["all", "official", "community"] as const).map((option) => (
            <Link
              aria-current={option === filter ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                option === filter
                  ? "bg-foreground text-background border-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              href={link({ from: option })}
              key={option}
            >
              {option === "all"
                ? "All"
                : option === "official"
                  ? "From QRdx"
                  : "From the community"}
            </Link>
          ))}
        </nav>
        <nav aria-label="Sort" className="flex gap-3 text-sm">
          {(["popular", "newest"] as const).map((option) => (
            <Link
              aria-current={option === sort ? "true" : undefined}
              className={cn(
                option === sort
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
              href={link({ sort: option })}
              key={option}
            >
              {option === "popular" ? "Popular" : "Newest"}
            </Link>
          ))}
        </nav>
      </div>

      {cards.length > 0 ? (
        <ItemGrid cards={cards} />
      ) : (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <HairlineFigure className="aspect-square w-36" figure="Palette" />
          <h2 className="text-lg font-semibold tracking-tight">
            {EMPTY[type].title}
          </h2>
          <p className="text-muted-foreground max-w-sm text-sm text-pretty">
            {EMPTY[type].body}
          </p>
          {EMPTY[type].link && (
            <Link
              className="text-sm underline underline-offset-2"
              href={EMPTY[type].link.href}
            >
              {EMPTY[type].link.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
