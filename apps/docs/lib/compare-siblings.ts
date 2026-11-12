/**
 * Which comparisons a /compare/<slug> page links to under "More comparisons".
 *
 * Taking the alphabet-first few gave the same handful of pages every sibling
 * link and left the rest with none. This is a rotation instead: the pages that
 * follow the current one in alphabetical order, wrapping around, the same
 * kind of tool (generator or library) first. Every page then gets about the
 * same number of sibling links, and the pick only depends on the slug, so the
 * pages stay static.
 */
export interface CompareSibling {
  slug: string;
  /** The competitor's display name, used for the sort. */
  name: string;
  category: string;
}

const byName = (a: CompareSibling, b: CompareSibling) =>
  a.name.localeCompare(b.name, "en") || a.slug.localeCompare(b.slug, "en");

/** Up to `count` items that follow `start` in `list`, wrapping around. */
function following<T>(list: T[], start: number, count: number): T[] {
  const picked: T[] = [];
  for (let step = 1; step <= list.length && picked.length < count; step++) {
    picked.push(list[(start + step) % list.length] as T);
  }
  return picked;
}

export function pickCompareSiblings<T extends CompareSibling>(
  pages: T[],
  currentSlug: string,
  count: number,
): T[] {
  const sorted = [...pages].sort(byName);
  const current = sorted.find((page) => page.slug === currentSlug);
  if (!current) {
    return sorted.slice(0, count);
  }

  const sameKind = sorted.filter((page) => page.category === current.category);
  const position = sameKind.indexOf(current);
  // `following` skips the current page: it starts one step after it and
  // stops before wrapping back onto it.
  const picked = following(
    sameKind,
    position,
    Math.min(count, sameKind.length - 1),
  );

  const otherKinds = sorted.filter(
    (page) => page.category !== current.category,
  );
  const missing = Math.min(count - picked.length, otherKinds.length);
  if (missing > 0) {
    // Spread the fill too: each page of a small kind starts further along.
    const start = (position * missing) % otherKinds.length;
    picked.push(...following(otherKinds, start - 1, missing));
  }
  return picked;
}
