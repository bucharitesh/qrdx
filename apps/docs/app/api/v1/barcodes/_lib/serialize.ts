import "server-only";

import { getBarcodeFormat } from "@/lib/barcode/formats";
import { barcodeImageUrl } from "@/lib/barcode/url";
import type { BarcodeView } from "@/lib/barcodes/service";
import { baseUrl } from "@/lib/metadata";

/** Public JSON shape of a saved barcode (/v1/barcodes). */
export function serializeBarcode(view: BarcodeView) {
  return {
    id: view.id,
    title: view.title,
    format: view.format,
    formatLabel: getBarcodeFormat(view.format).label,
    value: view.value,
    options: {
      ...view.options,
      rotation: view.options.rotation ?? 0,
    },
    folderId: view.folderId,
    // The same image from the public image API (no key): embeddable.
    imageUrl: barcodeImageUrl(baseUrl, view.format, view.value, view.options),
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    deletedAt: view.deletedAt?.toISOString() ?? null,
    organizationId: view.organizationId,
  };
}
