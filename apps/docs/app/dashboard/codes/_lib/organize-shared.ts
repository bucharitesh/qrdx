// Client-safe helpers for organizing codes: folder trees, tag colors and the
// codes list filters kept in the URL. No server imports.

export const MAX_FOLDERS = 500;
export const MAX_FOLDER_DEPTH = 5;
export const MAX_FOLDER_NAME = 60;
export const MAX_TAGS = 200;
export const MAX_TAG_NAME = 32;
export const MAX_TAGS_PER_CODE = 10;
export const MAX_NOTES_LENGTH = 2000;
/** Codes one bulk action may touch (a page of the list is 25). */
export const MAX_BULK_IDS = 200;

// ─── Tags ────────────────────────────────────────────────────────────────────

export const TAG_COLORS = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

/** Literal class names so Tailwind picks them up. */
export const TAG_DOT_CLASS: Record<TagColor, string> = {
  gray: "bg-zinc-400",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-400",
  green: "bg-emerald-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
};

export function tagColor(value: string | null | undefined): TagColor {
  return TAG_COLORS.includes(value as TagColor) ? (value as TagColor) : "gray";
}

/** Splits a "tags" cell: `a; b | c, d` → ["a", "b", "c", "d"] (deduped, case-insensitive). */
export function splitTagNames(value: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const part of value.split(/[;|,]/)) {
    const name = part.trim().replace(/\s+/g, " ");
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

// ─── Folders ─────────────────────────────────────────────────────────────────

export interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
  /** Codes directly in the folder (not in the trash) */
  codeCount: number;
}

export interface FolderNode extends FolderRow {
  depth: number;
  children: FolderNode[];
}

const byPositionThenName = (a: FolderRow, b: FolderRow) =>
  a.position - b.position ||
  a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** Nested tree; folders whose parent is missing (or part of a cycle) go to the top level. */
export function buildFolderTree(rows: FolderRow[]): FolderNode[] {
  const ids = new Set(rows.map((row) => row.id));
  const children = new Map<string | null, FolderRow[]>();
  for (const row of rows) {
    const parent =
      row.parentId && ids.has(row.parentId) && !isInCycle(rows, row.id)
        ? row.parentId
        : null;
    const list = children.get(parent) ?? [];
    list.push(row);
    children.set(parent, list);
  }

  const build = (parent: string | null, depth: number): FolderNode[] =>
    (children.get(parent) ?? [])
      .sort(byPositionThenName)
      .map((row) => ({ ...row, depth, children: build(row.id, depth + 1) }));
  return build(null, 0);
}

function isInCycle(rows: FolderRow[], id: string): boolean {
  const parents = new Map(rows.map((row) => [row.id, row.parentId]));
  const seen = new Set<string>();
  let current: string | null | undefined = id;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = parents.get(current);
  }
  return false;
}

/** Depth-first list of a tree (for pickers). */
export function flattenFolderTree(nodes: FolderNode[]): FolderNode[] {
  return nodes.flatMap((node) => [node, ...flattenFolderTree(node.children)]);
}

/** The folder and everything below it. */
export function folderSubtreeIds(
  rows: Pick<FolderRow, "id" | "parentId">[],
  id: string,
): Set<string> {
  const result = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of rows) {
      if (row.parentId && result.has(row.parentId) && !result.has(row.id)) {
        result.add(row.id);
        grew = true;
      }
    }
  }
  return result;
}

/** Root-first chain of folders ending at `id` (empty when unknown). */
export function folderPath<T extends Pick<FolderRow, "id" | "parentId">>(
  rows: T[],
  id: string,
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const path: T[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Levels below the top for a subtree (a lone folder is 1). */
export function subtreeHeight(
  rows: Pick<FolderRow, "id" | "parentId">[],
  id: string,
): number {
  const childrenOf = (parent: string) =>
    rows.filter((row) => row.parentId === parent);
  const height = (node: string, seen: Set<string>): number => {
    if (seen.has(node)) return 0;
    seen.add(node);
    return (
      1 +
      Math.max(0, ...childrenOf(node).map((child) => height(child.id, seen)))
    );
  };
  return height(id, new Set());
}

/** "Marketing / Spring 2026" → ["Marketing", "Spring 2026"]. */
export function splitFolderPath(value: string): string[] {
  return value
    .split("/")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

// ─── List filters (URL search params) ───────────────────────────────────────

export const CODE_SORTS = [
  "newest",
  "oldest",
  "scans",
  "recent",
  "title",
] as const;
export type CodeSort = (typeof CODE_SORTS)[number];

export const CODE_SORT_LABELS: Record<CodeSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  scans: "Most scans",
  recent: "Recently scanned",
  title: "Title A–Z",
};

export type CodesStatus = "active" | "archived" | "trash";

export interface CodesFilters {
  status: CodesStatus;
  q: string;
  /** Folder id, "none" for codes outside any folder, null for all */
  folder: string | null;
  tags: string[];
  favorites: boolean;
  sort: CodeSort;
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: SearchParams[string]) =>
  Array.isArray(value) ? value[0] : value;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function parseCodesFilters(params: SearchParams): CodesFilters {
  const status = first(params.status);
  const sort = first(params.sort);
  const folder = first(params.folder)?.trim() ?? "";
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  return {
    status: status === "archived" || status === "trash" ? status : "active",
    q: (first(params.q) ?? "").trim().slice(0, 200),
    folder: ID_PATTERN.test(folder) ? folder : null,
    tags: [
      ...new Set(
        (first(params.tags) ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => ID_PATTERN.test(tag)),
      ),
    ].slice(0, 10),
    favorites: first(params.fav) === "1",
    sort: CODE_SORTS.includes(sort as CodeSort) ? (sort as CodeSort) : "newest",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** URL for the codes list with `patch` applied; any filter change resets the page. */
export function codesHref(
  basePath: string,
  filters: CodesFilters,
  patch: Partial<CodesFilters> = {},
): string {
  const next = { ...filters, ...patch };
  if (!("page" in patch)) next.page = 1;
  const search = new URLSearchParams();
  if (next.status !== "active") search.set("status", next.status);
  if (next.folder) search.set("folder", next.folder);
  if (next.tags.length > 0) search.set("tags", next.tags.join(","));
  if (next.favorites) search.set("fav", "1");
  if (next.q) search.set("q", next.q);
  if (next.sort !== "newest") search.set("sort", next.sort);
  if (next.page > 1) search.set("page", String(next.page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** True when nothing narrows the list (the "no codes yet" state applies). */
export function isUnfiltered(filters: CodesFilters): boolean {
  return (
    filters.status === "active" &&
    !filters.q &&
    !filters.folder &&
    filters.tags.length === 0 &&
    !filters.favorites
  );
}
