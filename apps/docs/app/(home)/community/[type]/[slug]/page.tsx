import { auth } from "@repo/auth/server";
import { Info, Tick } from "@repo/design-system/components/icons";
import { Badge } from "@repo/design-system/components/ui/badge";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getAdminUser } from "@/app/admin/_lib/guard";
import { CreatorLine } from "@/components/community/creator-line";
import { ItemActions } from "@/components/community/item-actions";
import { ItemGrid, ItemRow } from "@/components/community/item-card";
import { RemoveItemButton } from "@/components/community/remove-item-button";
import { TryIt } from "@/components/community/try-it";
import { itemScanGate } from "@/lib/community/home";
import {
  COMMUNITY_LICENSE_NAME,
  COMMUNITY_LICENSE_URL,
} from "@/lib/community/licence";
import { getItem, moreFromCreator } from "@/lib/community/queries";
import { MIN_GATE_SCORE } from "@/lib/community/scan-samples";
import {
  type CommunityItemDetail,
  TYPE_LABELS,
  TYPE_SEGMENTS,
  typeFromSegment,
} from "@/lib/community/types";
import { createMetadata } from "@/lib/metadata";
import { contentTypeLabel } from "@/lib/qr-design/content";
import type { ContentType } from "@/types/qr-content";

async function viewerId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

const loadItem = cache(async (segment: string, slug: string) => {
  const type = typeFromSegment(segment);
  if (!type) return null;
  return getItem(type, slug, await viewerId());
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string; slug: string }>;
}): Promise<Metadata> {
  const { type, slug } = await params;
  const item = await loadItem(type, slug);
  if (!item) return {};
  const by = item.creator.handle
    ? `@${item.creator.handle}`
    : item.creator.displayName;
  return {
    ...createMetadata({
      title: `${item.name}: free QR code ${TYPE_LABELS[item.type].one.toLowerCase()} by ${by}`,
      description:
        item.description ??
        `A free QR code ${TYPE_LABELS[item.type].one.toLowerCase()} from the QRdx community, under ${COMMUNITY_LICENSE_NAME}.`,
      path: `/community/${type}/${slug}`,
    }),
    // Item pages stay out of search until the first moderation pass.
    robots: { index: false, follow: true },
  };
}

export default async function CommunityItemPage({
  params,
}: {
  params: Promise<{ type: string; slug: string }>;
}) {
  const { type: segment, slug } = await params;
  const item = await loadItem(segment, slug);
  if (!item) notFound();
  const [more, admin] = await Promise.all([
    moreFromCreator(item),
    getAdminUser(),
  ]);
  const typeLabel = TYPE_LABELS[item.type];

  return (
    <main className="w-full border-b">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 md:py-12">
        <nav
          aria-label="Breadcrumb"
          className="text-muted-foreground mb-6 flex min-w-0 items-center gap-1.5 text-sm"
        >
          <Link className="hover:text-foreground" href="/community">
            Community
          </Link>
          <span aria-hidden>/</span>
          <Link
            className="hover:text-foreground"
            href={`/community/${TYPE_SEGMENTS[item.type]}`}
          >
            {typeLabel.many}
          </Link>
          <span aria-hidden>/</span>
          <span className="text-foreground truncate">{item.name}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
          <div className="min-w-0">
            {item.type === "collection" ? (
              <ItemGrid cards={item.entries ?? []} />
            ) : (
              <TryIt style={item.preview} />
            )}
          </div>

          <div className="min-w-0 space-y-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                  {item.name}
                </h1>
                {item.isOfficial && <Badge variant="outline">Official</Badge>}
              </div>
              <p className="text-muted-foreground text-sm">
                {typeLabel.one}
                {item.type === "collection" && item.entries
                  ? ` · ${item.entries.length} items`
                  : ` · v${item.version}`}{" "}
                ·{" "}
                <a
                  className="underline underline-offset-2"
                  href={COMMUNITY_LICENSE_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {COMMUNITY_LICENSE_NAME}
                </a>
              </p>
              <CreatorLine creator={item.creator} size="md" />
              {item.description && (
                <p className="text-sm leading-relaxed text-pretty">
                  {item.description}
                </p>
              )}
              {item.remixedFromLabel && (
                <p className="text-muted-foreground text-xs">
                  Remix of {item.remixedFromLabel}
                </p>
              )}
            </div>

            {item.type !== "collection" && <ScanCheck item={item} />}

            <ItemActions item={item} />

            {admin && item.id && (
              <RemoveItemButton itemId={item.id} name={item.name} />
            )}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {item.contentTypes.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Works with</dt>
                  <dd>
                    {item.contentTypes
                      .map((type) => contentTypeLabel(type as ContentType))
                      .join(" · ")}
                  </dd>
                </>
              )}
              {item.type !== "collection" && (
                <>
                  <dt className="text-muted-foreground">Exports</dt>
                  <dd>PNG · SVG · PDF · EPS</dd>
                </>
              )}
              {item.tags.length > 0 && (
                <>
                  <dt className="text-muted-foreground">Tags</dt>
                  <dd>{item.tags.join(" · ")}</dd>
                </>
              )}
              {(item.likeCount > 0 || item.useCount > 0) && (
                <>
                  <dt className="text-muted-foreground">Activity</dt>
                  <dd className="tabular-nums">
                    {item.useCount} {item.useCount === 1 ? "use" : "uses"} ·{" "}
                    {item.likeCount} {item.likeCount === 1 ? "like" : "likes"}
                  </dd>
                </>
              )}
            </dl>
          </div>
        </div>

        <div className="mt-14 space-y-10">
          <ItemRow
            cards={more}
            href={
              item.creator.handle
                ? `/community/@${item.creator.handle}`
                : undefined
            }
            title={`More from ${item.creator.displayName}`}
          />
          {item.type !== "collection" && (
            <section className="bg-muted/30 rounded-xl border p-5 text-sm">
              <h2 className="font-semibold">How to use it</h2>
              <ol className="text-muted-foreground mt-2 list-decimal space-y-1 pl-5">
                <li>Select Use in editor.</li>
                <li>
                  Enter your content
                  {item.type === "frame" ? " and edit the labels" : ""}.
                </li>
                <li>Download, or save it as a dynamic code.</li>
              </ol>
              <p className="text-muted-foreground mt-3 text-xs">
                Free under {COMMUNITY_LICENSE_NAME}: use it for anything, no
                credit needed.
              </p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

async function ScanCheck({ item }: { item: CommunityItemDetail }) {
  const gate = await itemScanGate(JSON.stringify(item.preview));
  const subject =
    item.type === "frame" ? "On a plain code, it scans" : "It scans";
  return (
    <div className="space-y-1.5 rounded-lg border p-3 text-sm">
      <p className="font-medium">Scan check</p>
      <ul className="space-y-1">
        {gate.results.map((result) => (
          <li className="flex items-center gap-2" key={result.sample}>
            {result.passed ? (
              <Tick aria-hidden className="size-4 shrink-0" />
            ) : (
              <Info
                aria-hidden
                className="text-muted-foreground size-4 shrink-0"
              />
            )}
            <span>
              {subject} {result.passed ? "Great" : "below Great"} with{" "}
              {result.label}{" "}
              <span className="text-muted-foreground tabular-nums">
                ({result.grade === "too-long" ? "too long" : result.score})
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        Scored on the server the way the editor scores a design (Great is{" "}
        {MIN_GATE_SCORE} or more).
      </p>
    </div>
  );
}
