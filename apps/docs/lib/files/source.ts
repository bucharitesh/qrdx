import { z } from "zod";
import type { BlockRenderContext } from "@/lib/landing/registry";
import { baseUrl } from "@/lib/metadata";
import { landingUrlSchema } from "@/types/landing";
import { FILE_ID_PATTERN, filePath } from "./types";

/**
 * Where a block's media comes from: a file uploaded to QRdx storage (by id,
 * served from its stable /api/files/<id> link) or a link to a file hosted
 * elsewhere (works without storage).
 */
export const fileSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("file"),
    fileId: z.string().regex(FILE_ID_PATTERN),
    /** File name at the time it was picked (shown in editors and as a label fallback) */
    name: z.string().trim().max(200).default(""),
  }),
  z.object({ type: z.literal("url"), url: landingUrlSchema }),
]);

export type FileSource = z.output<typeof fileSourceSchema>;

/**
 * URL of a source for rendering. Live pages may be served on a customer's
 * domain, where only short links and pages are routed, so uploaded files use
 * the app's own origin there; the editor preview stays relative.
 */
export function sourceUrl(
  source: FileSource | null | undefined,
  context: Pick<BlockRenderContext, "mode">,
  { download = false }: { download?: boolean } = {},
): string | null {
  if (!source) return null;
  if (source.type === "url") return source.url;
  const path = filePath(source.fileId, { download });
  return context.mode === "live" ? new URL(path, baseUrl).toString() : path;
}

/** A readable name for a source: its file name or the link's last segment. */
export function sourceName(source: FileSource | null | undefined): string {
  if (!source) return "";
  if (source.type === "file") return source.name;
  try {
    const { pathname, hostname } = new URL(source.url);
    const last = decodeURIComponent(
      pathname.split("/").filter(Boolean).pop() ?? "",
    );
    return last || hostname;
  } catch {
    return source.url;
  }
}
