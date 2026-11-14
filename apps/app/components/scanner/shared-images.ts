// Images shared to the installed scanner (lib/scanner-app.ts): the service
// worker (public/scan-sw.js) keeps them in Cache Storage and opens the page
// with #shared; the page reads them once and deletes them. They never leave
// the device.
import { SHARE_CACHE, SHARED_HASH } from "@/lib/scanner-app";

/** The images waiting from a share, oldest first; empty when none arrived. */
export async function takeSharedImages(): Promise<File[]> {
  if (typeof caches === "undefined") return [];
  try {
    if (!(await caches.has(SHARE_CACHE))) return [];
    const cache = await caches.open(SHARE_CACHE);
    const files: File[] = [];
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (!response) continue;
      const blob = await response.blob();
      const name = new URL(request.url).pathname.split("/").pop() ?? "shared";
      files.push(new File([blob], name, { type: blob.type }));
    }
    await caches.delete(SHARE_CACHE);
    return files;
  } catch {
    return [];
  }
}

/** How the page was opened: from a share, or from one of the app's shortcuts. */
export type LaunchIntent = "shared" | "image" | "camera" | null;

export function launchIntent(hash: string): LaunchIntent {
  switch (hash) {
    case SHARED_HASH:
      return "shared";
    case "#image":
      return "image";
    case "#camera":
      return "camera";
    default:
      return null;
  }
}
