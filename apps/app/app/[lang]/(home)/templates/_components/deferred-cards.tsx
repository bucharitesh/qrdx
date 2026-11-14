"use client";

import { type ReactNode, useCallback } from "react";
import { LocaleLink as Link } from "@/components/i18n/locale-link";
import {
  type ChunkLoader,
  createChunkLoader,
  DeferredButton,
  type DeferredLabels,
  useDeferredChunk,
} from "@/components/infinite/deferred";
import { CARD_BOX, chunkKey } from "../_lib/gallery";
import { loadTemplateCards } from "../actions";

// Template cards past the first screen. Each one's live preview (the heavy
// part of the gallery) loads as the cards near the screen, one request for
// every section that does so at once (../actions.tsx). Until then a card
// shows its name and description in an empty phone, at its final size, so
// the page keeps its length, its anchors (/templates#menu) and every
// template's name and demo link in the HTML.

export interface CardSummary {
  name: string;
  description?: string;
  /** The demo page */
  href: string;
}

const loaders = new Map<string, ChunkLoader>();

function loaderFor(locale: string): ChunkLoader {
  let loader = loaders.get(locale);
  if (!loader) {
    loader = createChunkLoader((keys) => loadTemplateCards(locale, keys));
    loaders.set(locale, loader);
  }
  return loader;
}

/** A card before it loads: the phone, the name, the two buttons' places. */
function CardPlaceholder({
  card,
  children,
  ref,
}: {
  card: CardSummary;
  children?: ReactNode;
  ref?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-4 ${CARD_BOX}`}
      data-card-placeholder=""
      ref={ref}
    >
      <div className="relative rounded-[2.25rem] bg-foreground/[0.04] p-[7px] ring-1 ring-border dark:bg-white/[0.04]">
        <div className="bg-muted aspect-[9/16] rounded-[1.85rem] ring-1 ring-black/5 dark:ring-white/5" />
        {children}
      </div>
      <div className="space-y-1 px-1">
        <h3 className="text-[15px] font-medium tracking-tight">
          <Link href={card.href} prefetch={false}>
            {card.name}
          </Link>
        </h3>
        {card.description && (
          <p className="text-muted-foreground line-clamp-2 text-[13px] leading-snug text-pretty">
            {card.description}
          </p>
        )}
      </div>
      <div aria-hidden className="mt-auto grid grid-cols-2 gap-2 px-1">
        <span className="h-8 rounded-full border" />
        <span className="h-8 rounded-full border" />
      </div>
    </div>
  );
}

/**
 * Cards of a section, from the `offset`-th on, as grid items of the
 * section's grid (the page draws the grid and any cards before them).
 */
export function DeferredCards({
  type,
  offset,
  locale,
  cards,
  labels,
}: {
  type: string;
  offset: number;
  locale: string;
  cards: CardSummary[];
  labels: DeferredLabels;
}) {
  const { content, status, ref, load } = useDeferredChunk<HTMLElement>(
    chunkKey(type, offset),
    loaderFor(locale),
  );
  // Watch the section's row, not the card: on phones the row scrolls
  // sideways, and a card out of its view never counts as near the screen.
  const watchRow = useCallback(
    (node: HTMLDivElement | null) => ref(node?.parentElement ?? null),
    [ref],
  );
  if (content) return content.node;
  return cards.map((card, index) =>
    index === 0 ? (
      <CardPlaceholder card={card} key={card.href} ref={watchRow}>
        <DeferredButton labels={labels} load={load} status={status} />
      </CardPlaceholder>
    ) : (
      <CardPlaceholder card={card} key={card.href} />
    ),
  );
}
