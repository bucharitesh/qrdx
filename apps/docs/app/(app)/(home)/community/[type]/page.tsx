import { Button } from "@repo/design-system/components/ui/button";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OFFICIAL_FRAME_COLLECTIONS } from "qrdx";
import { Suspense } from "react";
import { BrowseLayout } from "@/components/community/browse-layout";
import {
  GALLERY_GRID,
  HowToPublish,
  SidebarLink,
  SidebarSection,
  SortMenu,
} from "@/components/community/browse-sidebar";
import { CommunityTabs } from "@/components/community/community-tabs";
import { ItemGrid } from "@/components/community/item-card";
import {
  ItemPages,
  pageOf,
  pageParam,
} from "@/components/community/item-pages";
import { HairlineFigure } from "@/components/mockups/hairline";
import { COLLECTION_MIN_ITEMS } from "@/lib/community/bundles";
import { findOfficialFrame } from "@/lib/community/catalog";
import { hasCollections, hasKits, hasTemplates } from "@/lib/community/home";
import { LICENSE_SHORT } from "@/lib/community/licence";
import { listFrames, listItems } from "@/lib/community/queries";
import {
  type CommunityItemCard,
  type CommunityItemType,
  TYPE_LABELS,
  TYPE_SEGMENTS,
  typeFromSegment,
} from "@/lib/community/types";
import { viewerId } from "@/lib/community/viewer";
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

type Filter = "all" | "official" | "community" | "mine" | "saved";
type Sort = "popular" | "newest" | "oldest";

const FILTERS = ["all", "official", "community", "mine", "saved"] as const;

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
  const filter: Filter =
    FILTERS.find((option) => option === query.from) ?? "all";
  const sort: Sort =
    query.sort === "newest" || query.sort === "oldest" ? query.sort : "popular";
  // Official frames come in groups (holidays, seasons, uses): ?group=<id>
  const group =
    OFFICIAL_FRAME_COLLECTIONS.find((item) => item.id === query.group)?.id ??
    null;
  const tag = typeof query.tag === "string" ? query.tag : null;
  const page = pageParam(query.page);
  const [showCollections, showTemplates, showKits] = await Promise.all([
    hasCollections(),
    hasTemplates(),
    hasKits(),
  ]);

  return (
    <main className="w-full border-b">
      {/* Rail to rail: the text lines up with the sidebar's rows below. */}
      <section className="mx-6 px-4 pt-12 pb-6 sm:px-6">
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
        showKits={showKits}
        showTemplates={showTemplates}
        wide
      />

      <div className="mx-6">
        {type === "theme" ? (
          // nuqs reads search params; without a boundary the whole page renders client-side
          <Suspense fallback={<div className="min-h-[60vh] w-full" />}>
            <CommunityThemesContent />
          </Suspense>
        ) : (
          <TypeBrowse
            filter={filter}
            group={type === "frame" ? group : null}
            page={page}
            sort={sort}
            tag={type === "frame" ? null : tag}
            type={type}
          />
        )}
      </div>
    </main>
  );
}

const TAB_OF = {
  frame: "frames",
  theme: "themes",
  collection: "collections",
  "page-template": "templates",
  kit: "kits",
} as const satisfies Record<CommunityItemType, string>;

type GalleryType = Exclude<CommunityItemType, "theme">;

const EMPTY: Record<
  GalleryType,
  { title: string; body: string; link?: { href: string; label: string } }
> = {
  frame: {
    title: "No frames here yet",
    body: "Make a frame in the editor's Frame section, then publish it.",
    link: { href: playgroundHref({ tab: "design" }), label: "Open the editor" },
  },
  collection: {
    title: "No collections yet",
    body: "Group frames, themes and page templates you saved or made.",
    link: { href: "/community/new", label: "Make a collection" },
  },
  kit: {
    title: "No kits yet",
    body: "Pair a page template with a theme or frame you saved, then publish it as a kit.",
    link: { href: "/community/new?make=kit", label: "Make a kit" },
  },
  "page-template": {
    title: "No page templates yet",
    body: "Publish one of your hosted pages from Pages in your dashboard. Your own details are taken out first.",
    link: { href: dashboardEntry("pages"), label: "Open your pages" },
  },
};

const LINK = "text-foreground font-medium underline underline-offset-2";

/** The toolbar's "How to publish" note, per type. */
function Help({ type }: { type: GalleryType }) {
  switch (type) {
    case "frame":
      return (
        <HowToPublish
          footer={
            <Link className={LINK} href={playgroundHref({ tab: "design" })}>
              Open the editor
            </Link>
          }
          title="Publish your frame"
        >
          Make a frame in the editor's Frame section, then choose{" "}
          <span className="text-foreground font-medium">Publish frame</span>. It
          must scan Great to be published.
        </HowToPublish>
      );
    case "collection":
      return (
        <HowToPublish
          footer={
            <Link className={LINK} href="/community/new">
              Make a collection
            </Link>
          }
          label="How to make one"
          title="Make a collection"
        >
          Save or publish at least {COLLECTION_MIN_ITEMS} frames, themes or page
          templates, then group them into a collection.
        </HowToPublish>
      );
    case "kit":
      return (
        <HowToPublish
          footer={
            <Link className={LINK} href="/community/new?make=kit">
              Make a kit
            </Link>
          }
          label="How to make one"
          title="Make a kit"
        >
          Pair a page template with a theme or frame you saved, then publish it
          as a kit.
        </HowToPublish>
      );
    case "page-template":
      return (
        <HowToPublish
          footer={
            <Link className={LINK} href={dashboardEntry("pages")}>
              Open your pages
            </Link>
          }
          title="Publish a page template"
        >
          Publish one of your hosted pages from Pages in your dashboard. Your
          own details are taken out first.
        </HowToPublish>
      );
  }
}

const SORT_LABELS: Record<Sort, string> = {
  popular: "Popular",
  newest: "Newest",
  oldest: "Oldest",
};

async function TypeBrowse({
  type,
  filter,
  sort,
  group,
  tag,
  page: requestedPage,
}: {
  type: GalleryType;
  filter: Filter;
  sort: Sort;
  /** An official frame collection (frames only) */
  group: string | null;
  /** A tag (not frames: theirs are one-offs, they have groups) */
  tag: string | null;
  page: number;
}) {
  const many = TYPE_LABELS[type].many.toLowerCase();
  const base = `/community/${TYPE_SEGMENTS[type]}`;
  const personal = filter === "mine" || filter === "saved";
  // Groups hold official frames only.
  const groupsApply =
    type === "frame" && (filter === "all" || filter === "official");
  const activeGroup = groupsApply ? group : null;

  const link = (
    next: Partial<{
      from: Filter;
      sort: Sort;
      group: string | null;
      tag: string | null;
      page: number;
    }>,
  ) => {
    const params = new URLSearchParams();
    const nextFrom = next.from ?? filter;
    const nextSort = next.sort ?? sort;
    const nextGroup = next.group === undefined ? activeGroup : next.group;
    const nextTag = next.tag === undefined ? tag : next.tag;
    // A new filter starts at the first page
    const nextPage = next.page ?? 1;
    if (nextFrom !== "all") params.set("from", nextFrom);
    if (nextSort !== "popular") params.set("sort", nextSort);
    if (nextGroup && (nextFrom === "all" || nextFrom === "official")) {
      params.set("group", nextGroup);
    }
    if (nextTag) params.set("tag", nextTag);
    if (nextPage > 1) params.set("page", String(nextPage));
    const search = params.toString();
    return search ? `${base}?${search}` : base;
  };

  const userId = personal ? await viewerId() : null;
  const official =
    filter === "official" ? true : filter === "community" ? false : undefined;
  const cards =
    personal && !userId
      ? []
      : type === "frame"
        ? await listFrames({
            official,
            sort,
            createdBy: filter === "mine" ? (userId ?? undefined) : undefined,
            savedBy: filter === "saved" ? (userId ?? undefined) : undefined,
          })
        : await listItems({
            type,
            official,
            sort,
            createdBy: filter === "mine" ? (userId ?? undefined) : undefined,
            savedBy: filter === "saved" ? (userId ?? undefined) : undefined,
            limit: 200,
          });

  const groupOf = (card: CommunityItemCard) =>
    card.isOfficial ? findOfficialFrame(card.slug)?.collection : undefined;
  const groupCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  for (const card of cards) {
    const id = groupsApply ? groupOf(card) : undefined;
    if (id) groupCounts.set(id, (groupCounts.get(id) ?? 0) + 1);
    if (type !== "frame") {
      for (const name of card.tags) {
        tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1);
      }
    }
  }
  const tags = [...tagCounts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30);

  const shown = cards.filter(
    (card) =>
      (!activeGroup || groupOf(card) === activeGroup) &&
      (!tag || card.tags.includes(tag)),
  );
  const { page, pages, items } = pageOf(shown, requestedPage);

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: `All ${many}` },
    { value: "official", label: "From QRdx" },
    { value: "community", label: "From the community" },
    { value: "mine", label: `My ${many}` },
    { value: "saved", label: `Saved ${many}` },
  ];

  const sidebar = (
    <>
      {filters.map((option) => (
        <SidebarLink
          active={option.value === filter}
          href={link({ from: option.value })}
          key={option.value}
          strong
        >
          {option.label}
        </SidebarLink>
      ))}
      {groupsApply && groupCounts.size > 0 && (
        <SidebarSection title="Groups">
          {OFFICIAL_FRAME_COLLECTIONS.filter((item) =>
            groupCounts.has(item.id),
          ).map((item) => (
            <SidebarLink
              active={item.id === activeGroup}
              count={groupCounts.get(item.id)}
              // Choosing the group in use again clears it
              href={link({ group: item.id === activeGroup ? null : item.id })}
              key={item.id}
            >
              {item.label}
            </SidebarLink>
          ))}
        </SidebarSection>
      )}
      {tags.length > 0 && (
        <SidebarSection title="Tags">
          {tags.map(([name, count]) => (
            <SidebarLink
              active={name === tag}
              count={count}
              href={link({ tag: name === tag ? null : name })}
              key={name}
            >
              {name}
            </SidebarLink>
          ))}
        </SidebarSection>
      )}
    </>
  );

  const narrowed = Boolean(activeGroup || tag);
  const signInHref = `/sign-in?next=${encodeURIComponent(link({}))}`;

  return (
    <BrowseLayout
      activeFilters={
        (filter !== "all" ? 1 : 0) + (activeGroup ? 1 : 0) + (tag ? 1 : 0)
      }
      aside={<Help type={type} />}
      sheetTitle={TYPE_LABELS[type].many}
      sidebar={sidebar}
      toolbar={
        <SortMenu
          groups={[
            {
              options: (["popular", "newest", "oldest"] as const).map(
                (option) => ({
                  label: SORT_LABELS[option],
                  href: link({ sort: option }),
                  active: option === sort,
                }),
              ),
            },
          ]}
          label={SORT_LABELS[sort]}
        />
      }
    >
      {items.length > 0 ? (
        <>
          <ItemGrid cards={items} className={GALLERY_GRID} />
          <ItemPages
            href={(next) => link({ page: next })}
            page={page}
            pages={pages}
          />
        </>
      ) : personal && !userId ? (
        <Empty
          action={
            <Button asChild className="mt-2" size="sm">
              <Link href={signInHref}>Sign in</Link>
            </Button>
          }
          body={
            filter === "mine"
              ? `Sign in to see the ${many} you published.`
              : `Sign in to see the ${many} you saved.`
          }
          title={filter === "mine" ? `Your ${many}` : `Saved ${many}`}
        />
      ) : narrowed ? (
        <Empty
          action={
            <Link
              className="text-sm underline underline-offset-2"
              href={link({ group: null, tag: null })}
            >
              Clear the filter
            </Link>
          }
          body="Nothing matches this filter yet."
          title={`No ${many} here`}
        />
      ) : filter === "saved" ? (
        <Empty
          action={
            <Link
              className="text-sm underline underline-offset-2"
              href={link({ from: "all" })}
            >
              Browse all {many}
            </Link>
          }
          body={`Choose Save on any ${TYPE_LABELS[type].one.toLowerCase()} to keep it here.`}
          title={`No saved ${many} yet`}
        />
      ) : (
        <Empty
          action={
            EMPTY[type].link && (
              <Link
                className="text-sm underline underline-offset-2"
                href={EMPTY[type].link.href}
              >
                {EMPTY[type].link.label}
              </Link>
            )
          }
          body={EMPTY[type].body}
          title={
            filter === "mine"
              ? `You haven't published any ${many} yet`
              : EMPTY[type].title
          }
        />
      )}
    </BrowseLayout>
  );
}

function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <HairlineFigure className="aspect-square w-36" figure="Palette" />
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-muted-foreground max-w-sm text-sm text-pretty">
        {body}
      </p>
      {action}
    </div>
  );
}
