// YouTube / Vimeo / Loom links → privacy-friendly embed URLs. Only these
// hosts can be embedded on hosted pages.

export type VideoProvider = "youtube" | "vimeo" | "loom";

export interface ParsedVideo {
  provider: VideoProvider;
  id: string;
  /** Start offset in seconds (YouTube `t`/`start`) */
  start?: number;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function seconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(value);
  if (!match) return undefined;
  const total =
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0);
  return total > 0 ? total : undefined;
}

export function parseVideoUrl(input: string): ParsedVideo | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (
    host === "youtu.be" ||
    host === "youtube.com" ||
    host === "youtube-nocookie.com"
  ) {
    let id: string | undefined;
    if (host === "youtu.be") id = parts[0];
    else if (parts[0] === "watch") id = url.searchParams.get("v") ?? undefined;
    else if (["embed", "shorts", "live", "v"].includes(parts[0] ?? "")) {
      id = parts[1];
    }
    if (!(id && YOUTUBE_ID.test(id))) return null;
    const start = seconds(
      url.searchParams.get("t") ?? url.searchParams.get("start"),
    );
    return { provider: "youtube", id, ...(start && { start }) };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = parts.find((part) => /^\d{6,12}$/.test(part));
    return id ? { provider: "vimeo", id } : null;
  }

  if (host === "loom.com") {
    const id = parts[0] === "share" || parts[0] === "embed" ? parts[1] : null;
    return id && /^[a-f0-9]{32}$/i.test(id) ? { provider: "loom", id } : null;
  }
  return null;
}

/** Embed URL that starts playing (the facade loads it only after a tap). */
export function videoEmbedUrl(video: ParsedVideo): string {
  switch (video.provider) {
    case "youtube": {
      const params = new URLSearchParams({
        autoplay: "1",
        rel: "0",
        playsinline: "1",
        ...(video.start && { start: String(video.start) }),
      });
      return `https://www.youtube-nocookie.com/embed/${video.id}?${params}`;
    }
    case "vimeo":
      return `https://player.vimeo.com/video/${video.id}?autoplay=1&dnt=1`;
    case "loom":
      return `https://www.loom.com/embed/${video.id}?autoplay=1`;
  }
}

export const VIDEO_PROVIDER_LABELS: Record<VideoProvider, string> = {
  youtube: "YouTube",
  vimeo: "Vimeo",
  loom: "Loom",
};
