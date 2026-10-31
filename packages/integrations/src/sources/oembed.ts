import { providerRequest } from "../core/http-client";
import { httpsOrUndefined } from "./types";

export interface OEmbedPreview {
  title?: string;
  authorName?: string;
  thumbnailUrl?: string;
}

const OEMBED_HOSTS: Record<string, { slug: string; name: string }> = {
  "www.youtube.com": { slug: "youtube", name: "YouTube" },
  "open.spotify.com": { slug: "spotify", name: "Spotify" },
};

/**
 * Reads a public oEmbed endpoint built by youTubeOEmbedUrl / spotifyOEmbedUrl
 * (both send CORS headers, so browsers can call them directly). Any other
 * host is refused, so arbitrary URLs are never fetched.
 */
export async function fetchOEmbedPreview(
  oembedUrl: string,
  init: RequestInit = {}
): Promise<OEmbedPreview> {
  const url = new URL(oembedUrl);
  const provider = OEMBED_HOSTS[url.hostname];
  if (!(provider && url.protocol === "https:" && url.pathname === "/oembed")) {
    throw new Error("Not an allowed oEmbed endpoint");
  }
  const data = await providerRequest<Record<string, unknown>>(
    provider,
    url.toString(),
    init
  );
  const text = (value: unknown) =>
    typeof value === "string" && value.trim()
      ? value.trim().slice(0, 300)
      : undefined;
  return {
    title: text(data?.title),
    authorName: text(data?.author_name),
    thumbnailUrl: httpsOrUndefined(data?.thumbnail_url),
  };
}
