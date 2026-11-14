import "server-only";

import { getBarcodeFormat } from "@/lib/barcode/formats";
import { renderBarcodeServer } from "@/lib/barcode/server";
import { barcodeImageUrl } from "@/lib/barcode/url";
import { type BarcodeView, barcodeLabel } from "@/lib/barcodes/service";
import { baseUrl } from "@/lib/metadata";
import { can } from "@/lib/permissions";
import type { ActiveScope } from "@/lib/scope";
import type { BarcodeCard } from "./filters";

/** The preview's scale: sharp at card size, a few KB of SVG. */
const PREVIEW_SCALE = 2;

/** A saved barcode as the list's card shows it, with its preview drawn here. */
export function toBarcodeCard(
  scope: ActiveScope,
  view: BarcodeView,
  folders: Map<string, string>,
): BarcodeCard {
  let preview: string | null = null;
  try {
    preview = renderBarcodeServer(view.format, view.value, {
      ...view.options,
      scale: PREVIEW_SCALE,
    }).svg;
  } catch {
    // A row the encoder refuses still lists, without its picture.
  }
  const manageAll =
    !scope.organizationId || can(scope.role, "content.manageAll");
  return {
    id: view.id,
    label: barcodeLabel(view),
    titled: Boolean(view.title),
    format: view.format,
    formatLabel: getBarcodeFormat(view.format).label,
    value: view.value,
    folderId: view.folderId,
    folderName: view.folderId ? (folders.get(view.folderId) ?? null) : null,
    updatedAt: view.updatedAt.toISOString(),
    inTrash: Boolean(view.deletedAt),
    canDelete:
      can(scope.role, "content.write") &&
      (manageAll || view.createdBy === scope.userId),
    preview,
    imageUrl: barcodeImageUrl(baseUrl, view.format, view.value, view.options),
  };
}
