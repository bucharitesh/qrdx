// A code shape of your own (QRSilhouette): the editor samples an uploaded
// picture (PNG, JPEG or SVG) in the browser into a small grid of cells and
// only that grid is kept. The picture itself is never stored or served.
// A saved design may hold one only when it is a well-formed grid the code
// fits in (getQRSilhouetteFit); like an uploaded logo, it never travels in
// a link, a community item, a snippet or the AI chat (withoutImageFills in
// lib/paint/image-fills.ts drops it).
import { getQRSilhouetteFit } from "qrdx";
import { type QRSilhouette, qrSilhouetteSchema } from "qrdx/types";
import type { z } from "zod";

/** Picture types the upload takes. */
export const SILHOUETTE_ACCEPT = "image/png,image/jpeg,image/svg+xml";

/** Largest picture the upload reads, in bytes (only the grid is kept). */
export const SILHOUETTE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * A silhouette as a saved design may hold it: the engine's grid schema
 * (at most 64 cells a side) plus the fit check, with its message.
 */
export const savedSilhouetteSchema = qrSilhouetteSchema.superRefine(
  (silhouette, ctx) => {
    const fit = getQRSilhouetteFit(silhouette);
    if (!fit.ok) ctx.addIssue({ code: "custom", message: fit.message });
  },
) as z.ZodType<QRSilhouette>;

/** Why an upload can't become a silhouette, before it is read. */
export function silhouetteFileProblem(file: {
  type: string;
  size: number;
}): string | null {
  if (!SILHOUETTE_ACCEPT.split(",").includes(file.type)) {
    return "Use a PNG, JPEG or SVG picture.";
  }
  if (file.size > SILHOUETTE_MAX_BYTES) {
    return "This picture is too large (5 MB at most).";
  }
  return null;
}
