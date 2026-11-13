// How community cards are laid out, shared by the cards (./item-card.tsx,
// a server component) and the placeholders that stand in for them until
// they load (./deferred-cards.tsx, in the browser). No imports, so the
// browser gets the classes and nothing else.

/** A row's cards: a swipeable row on phones, a grid from sm. */
export const ROW_CARDS =
  "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 md:grid-cols-3 lg:grid-cols-4";

/** One card's box in a row. */
export const ROW_CARD = "w-[70%] shrink-0 snap-start sm:w-auto";

/** A card's frame. */
export const CARD_FRAME =
  "group bg-card relative flex min-w-0 flex-col overflow-hidden rounded-xl border shadow-xs";

/** The design's box at the top of a card. */
export const CARD_ART =
  "bg-muted/40 relative aspect-[6/5] overflow-hidden border-b";

/** The name, type and creator under it. */
export const CARD_TEXT = "flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-3";
