// The Barcodes list's filters, kept in the URL
// (?q=&format=&folder=&status=&size=&page=), and what each card shows. Pure
// and client-safe.
import {
  GRID_PAGE_SIZES,
  parsePageSize,
} from "@/app/(app)/dashboard/_lib/list-paging";
import {
  buildFolderTree,
  type FolderRow,
  flattenFolderTree,
} from "@/app/(app)/dashboard/codes/_lib/organize-shared";
import { type BarcodeFormatId, isBarcodeFormatId } from "@/lib/barcode/formats";
import type { BarcodeStatus } from "@/lib/barcodes/schema";
import { parsePage } from "@/lib/paging";

export interface BarcodesFilters {
  q: string;
  format: BarcodeFormatId | null;
  /** A folder id, "none" for barcodes in no folder, null for all */
  folder: string | null;
  status: BarcodeStatus;
  page: number;
  /** Cards per page, one of GRID_PAGE_SIZES */
  size: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : "";

export function parseBarcodesFilters(params: SearchParams): BarcodesFilters {
  const format = one(params.format);
  const folder = one(params.folder).trim().slice(0, 64);
  return {
    q: one(params.q).trim().slice(0, 200),
    format: isBarcodeFormatId(format) ? format : null,
    folder: folder || null,
    status: one(params.status) === "trash" ? "trash" : "active",
    page: parsePage(params.page),
    size: parsePageSize(params.size, GRID_PAGE_SIZES),
  };
}

export function barcodesHref(
  basePath: string,
  filters: BarcodesFilters,
  patch: Partial<BarcodesFilters>,
): string {
  // Changing a filter (or the page size) starts again on the first page;
  // the page size is kept.
  const next = { ...filters, page: 1, ...patch };
  const search = new URLSearchParams();
  if (next.status === "trash") search.set("status", "trash");
  if (next.folder) search.set("folder", next.folder);
  if (next.format) search.set("format", next.format);
  if (next.q) search.set("q", next.q);
  if (next.size !== GRID_PAGE_SIZES[0]) search.set("size", String(next.size));
  if (next.page > 1) search.set("page", String(next.page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export const isUnfiltered = (filters: BarcodesFilters) =>
  !filters.q && !filters.format && !filters.folder;

/** One card in the list, as the server renders it for the client. */
export interface BarcodeCard {
  id: string;
  /** The title, else "EAN-13 5901234123457" */
  label: string;
  titled: boolean;
  format: BarcodeFormatId;
  formatLabel: string;
  value: string;
  folderId: string | null;
  folderName: string | null;
  updatedAt: string;
  inTrash: boolean;
  /** May this person trash or delete it (their own, or any as an owner or admin) */
  canDelete: boolean;
  /** The preview as SVG markup (shown through an <img>), null when it can't be drawn */
  preview: string | null;
  /** The public image API URL (embeddable, no key) */
  imageUrl: string;
}

export interface FolderOption {
  id: string;
  name: string;
  depth: number;
}

/** The workspace's folders in tree order, for pickers. */
export function folderOptions(rows: FolderRow[]): FolderOption[] {
  return flattenFolderTree(buildFolderTree(rows)).map((node) => ({
    id: node.id,
    name: node.name,
    depth: node.depth,
  }));
}
