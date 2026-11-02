import { workspaceLink } from "@/lib/workspace-paths";

// Tabs of the code page (/dashboard/<workspace>/codes/<id>). The tab is a
// query parameter, so a tab can be bookmarked or linked to:
// /dashboard/<workspace>/codes/<id> opens Overview and analytics links with
// ?range=… or ?tz=… open Analytics.

export const CODE_TABS = ["overview", "analytics", "settings"] as const;

export type CodeTab = (typeof CODE_TABS)[number];

export const CODE_TAB_LABELS: Record<CodeTab, string> = {
  overview: "Overview",
  analytics: "Analytics",
  settings: "Settings",
};

type Query = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const isTab = (value: unknown): value is CodeTab =>
  typeof value === "string" && (CODE_TABS as readonly string[]).includes(value);

/** The tab a request asks for. */
export function resolveCodeTab(query: Query): CodeTab {
  const tab = first(query.tab);
  if (isTab(tab)) return tab;
  // Analytics-only parameters from links made before the tabs existed.
  if (first(query.range) !== undefined || first(query.tz) !== undefined) {
    return "analytics";
  }
  return "overview";
}

/**
 * Link to a tab of a code's page in workspace `slug` (null: the reader's
 * default workspace); Overview has no parameter.
 */
export function codeTabHref(
  slug: string | null,
  codeId: string,
  tab: CodeTab,
  extra: { params?: Record<string, string>; hash?: string } = {},
): string {
  const search = new URLSearchParams();
  if (tab !== "overview") search.set("tab", tab);
  for (const [key, value] of Object.entries(extra.params ?? {})) {
    search.set(key, value);
  }
  const query = search.toString();
  return workspaceLink(
    slug,
    `/codes/${encodeURIComponent(codeId)}${query ? `?${query}` : ""}${extra.hash ? `#${extra.hash}` : ""}`,
  );
}
