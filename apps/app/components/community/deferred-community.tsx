"use client";

import { cn } from "@repo/design-system/lib/utils";
import { loadCommunityChunks } from "@/app/(app)/(home)/community/actions";
import {
  createChunkLoader,
  Deferred,
  type DeferredLabels,
} from "@/components/infinite/deferred";
import { WallPlaceholder } from "@/components/showcase/wall-placeholder";
import type { WallShapeRow } from "@/lib/landing/showcase-wall";
import {
  CARD_ART,
  CARD_FRAME,
  CARD_TEXT,
  ROW_CARD,
  ROW_CARDS,
} from "./card-layout";

// The /community overview past its first screen: the "Made with QRdx"
// wall's later rows and the rows of cards under it load as they near the
// screen, all that do so at once in one request
// (app/(app)/(home)/community/actions.tsx). Until then each shows a
// placeholder of its exact size.

const loader = createChunkLoader(loadCommunityChunks);

/** A chunk of the wall's rows. */
export function DeferredWallRows({
  chunkKey,
  shape,
  labels,
}: {
  /** "<band>:<index>" (lib/landing/showcase-wall.ts, wallChunkKey) */
  chunkKey: string;
  shape: WallShapeRow[];
  labels: DeferredLabels;
}) {
  return (
    <Deferred
      chunkKey={`wall:${chunkKey}`}
      labels={labels}
      loader={loader}
      placeholder={<WallPlaceholder shape={shape} />}
    />
  );
}

/**
 * A card before it loads: its frame, its design's box and its two lines,
 * laid out as the card's (components/community/item-card.tsx), so it has
 * the card's height to the pixel.
 */
function CardPlaceholder() {
  return (
    <div aria-hidden className={cn(CARD_FRAME, ROW_CARD)}>
      <div className={CARD_ART} />
      <div className={CARD_TEXT}>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium">{" "}</span>
        </div>
        <div className="flex min-w-0 items-center text-xs">
          <span className="size-5 shrink-0" />
        </div>
      </div>
    </div>
  );
}

/** A row of the overview's cards (lib/community/home.ts). */
export function DeferredRowCards({
  row,
  count,
  labels,
}: {
  row: string;
  /** How many cards the row has, for the placeholder */
  count: number;
  labels: DeferredLabels;
}) {
  return (
    <Deferred
      chunkKey={`row:${row}`}
      className={ROW_CARDS}
      labels={labels}
      loader={loader}
      placeholder={Array.from({ length: count }, (_, index) => (
        <CardPlaceholder key={index} />
      ))}
    />
  );
}
