// What the URL form's "Use a link from…" menu offers, worked out from the
// signed-in user's connections and this deployment's integration
// availability. Pure, so the rules are tested (tests/lib/link-sources.test.ts).

/** A shortener or file account (lib/connected-accounts/client). */
export interface LinkConnection {
  slug: string;
  name: string;
  logo: string;
  capability: "short-links" | "files";
  configured: boolean;
  connected: boolean;
  status: "active" | "disconnected" | "error" | null;
}

/** A content source such as Stripe or Shopify (lib/data-connections/client). */
export interface LinkSource {
  slug: string;
  name: string;
  logo: string;
  configured: boolean;
  needsQuery: boolean;
  connected: boolean;
  status: "active" | "disconnected" | "error" | null;
}

export interface LinkAvailability {
  /** Slugs this deployment leaves out (production and preview). */
  hidden: readonly string[];
  /** Local dev only: slugs that still need env variables. */
  needsSetup: Readonly<Record<string, readonly string[]>>;
}

export type LinkSourceOption =
  | { kind: "short-links" | "files"; slug: string; name: string; logo: string }
  | { kind: "source"; slug: string; name: string; logo: string };

export interface LinkSourceMenuModel {
  /** Connected and working: pick from these. */
  ready: LinkSourceOption[];
  /** Offered here but not connected yet, by name, for one "Connect" item. */
  connectable: string[];
}

/** What a picked item becomes, shown next to the provider's name. */
export const SOURCE_HINTS: Record<string, string> = {
  stripe: "Payment link",
  shopify: "Product",
  calendly: "Event",
  calcom: "Event",
};

export const KIND_HINTS = { "short-links": "Shorten", files: "File" } as const;

/**
 * Null hides the menu: signed out, still loading, or nothing this
 * deployment can connect. Anything not configured here, hidden by
 * availability or still needing setup is left out, so the menu never shows
 * an option that can't work.
 */
export function buildLinkSourceMenu(
  connections: readonly LinkConnection[] | null,
  sources: readonly LinkSource[] | null,
  availability: LinkAvailability | null,
): LinkSourceMenuModel | null {
  if (!(connections && sources && availability)) return null;
  const offered = (item: { slug: string; configured: boolean }) =>
    item.configured &&
    !availability.hidden.includes(item.slug) &&
    !Object.hasOwn(availability.needsSetup, item.slug);
  const working = (item: { connected: boolean; status: string | null }) =>
    item.connected && item.status === "active";

  const accounts = connections.filter(offered);
  // Sources that need a query (a YouTube channel) belong to other types.
  const urlSources = sources.filter(
    (source) => offered(source) && !source.needsQuery,
  );

  const ready: LinkSourceOption[] = [
    ...accounts
      .filter(working)
      .sort((a, b) => kindOrder(a.capability) - kindOrder(b.capability))
      .map(({ capability, slug, name, logo }) => ({
        kind: capability,
        slug,
        name,
        logo,
      })),
    ...urlSources.filter(working).map(({ slug, name, logo }) => ({
      kind: "source" as const,
      slug,
      name,
      logo,
    })),
  ];
  const connectable = [...accounts, ...urlSources]
    .filter((item) => !working(item))
    .map((item) => item.name);

  if (ready.length === 0 && connectable.length === 0) return null;
  return { ready, connectable };
}

function kindOrder(kind: LinkConnection["capability"]): number {
  return kind === "short-links" ? 0 : 1;
}

/** "Bitly, Dropbox and 3 more": the names under the Connect item. */
export function connectableSummary(names: readonly string[], shown = 3) {
  if (names.length <= shown) {
    return names.length <= 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  }
  return `${names.slice(0, shown).join(", ")} and ${names.length - shown} more`;
}
