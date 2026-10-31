import manifest from "./media-manifest.json";

/**
 * Site videos are served from Cloudflare R2, not /public. `pnpm media:upload`
 * (scripts/media/upload.mjs) uploads apps/docs/media/** with a content hash in
 * each key and rewrites media-manifest.json; this resolves a source path such
 * as "/videos/help/bulk-csv.mp4" to its public URL.
 */
const files: Record<string, string> = manifest.files;

export function mediaUrl(path: string): string {
  const key = files[path];
  if (!key) {
    // Not uploaded yet: keep the local path so a missing upload shows up as a
    // 404 in the network panel instead of a silent wrong URL.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[media] "${path}" is not in lib/media-manifest.json`);
    }
    return path;
  }
  return `${manifest.origin}/${key}`;
}
