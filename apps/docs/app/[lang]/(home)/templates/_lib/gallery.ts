// Shared by the /templates gallery's server parts (page, the cards' server
// action) and its client part (the placeholders cards show until they
// load), so both lay the cards out the same way.

/** A section's cards: a swipeable row on phones, a grid from sm. */
export const SECTION_CARDS =
  "flex scroll-px-10 snap-x snap-mandatory gap-4 overflow-x-auto px-10 pt-1 pb-10 [scrollbar-width:none] sm:grid sm:snap-none sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 sm:overflow-visible lg:grid-cols-3 lg:gap-x-8";

/** One card's box in a section. */
export const CARD_BOX = "w-[15.5rem] shrink-0 snap-start sm:w-auto";

/**
 * Cards drawn in full on the server, all in the first section: its first
 * row from `lg` up, which is all the cards the first screen shows. Every
 * other card loads its preview as it nears the screen.
 */
export const EAGER_CARDS = 3;

/** Most chunks one request may ask for (there are about twenty sections). */
export const MAX_CHUNKS_PER_REQUEST = 32;

/** A chunk of cards: a section's, from its `offset`-th card on. */
export const chunkKey = (type: string, offset: number) => `${type}:${offset}`;

export function parseChunkKey(
  key: string,
): { type: string; offset: number } | null {
  const match = /^([a-z][a-z0-9-]{0,47}):(\d{1,3})$/.exec(key);
  if (!match?.[1] || match[2] === undefined) return null;
  return { type: match[1], offset: Number(match[2]) };
}
