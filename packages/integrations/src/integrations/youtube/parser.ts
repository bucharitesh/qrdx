/**
 * YouTube link parser: detects videos, Shorts, live streams, playlists and
 * channels in every common link shape (youtu.be, m., music., embed,
 * nocookie, timestamps, tracking params) and normalizes them. Client-safe.
 */

export type YouTubeLinkKind =
  | "video"
  | "short"
  | "live"
  | "playlist"
  | "channel";

export interface ParsedYouTubeLink {
  provider: "youtube";
  kind: YouTubeLinkKind;
  /** Video id, playlist id, channel id (UC…) or handle (@name) */
  id: string;
  /** Clean link to encode */
  url: string;
  /** Start time in seconds, when the link had one */
  start?: number;
  /** Playlist the video plays in, when the link had one */
  playlistId?: string;
  /** YouTube Music link (opens the Music app) */
  music?: boolean;
  /** Which YouTube form field the link belongs in */
  field: "videoUrl" | "channelUrl";
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{2,64}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE = /^@[A-Za-z0-9._-]{3,30}$/;
const LEGACY_NAME = /^[A-Za-z0-9._-]{1,100}$/;

const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "gaming.youtube.com",
]);

/** "1h2m3s", "90s", "90", "1:30" → seconds */
export function parseYouTubeTime(value: string | null | undefined) {
  if (!value) return;
  const text = value.trim().toLowerCase();
  if (/^\d+$/.test(text)) return Number(text) || undefined;
  if (/^\d+(?::\d{1,2}){1,2}$/.test(text)) {
    const parts = text.split(":").map(Number);
    const seconds = parts.reduce((total, part) => total * 60 + part, 0);
    return seconds || undefined;
  }
  const match = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || match[0] === "") return;
  const seconds =
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0);
  return seconds || undefined;
}

function toUrl(input: string): URL | null {
  let text = input.trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    return HOSTS.has(url.hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
}

function videoLink(
  id: string,
  options: {
    start?: number;
    playlistId?: string;
    music?: boolean;
    kind?: "video" | "short" | "live";
  }
): ParsedYouTubeLink | null {
  if (!VIDEO_ID.test(id)) return null;
  const kind = options.kind ?? "video";
  let url: string;
  if (kind === "short") {
    url = `https://www.youtube.com/shorts/${id}`;
  } else {
    const host = options.music ? "music.youtube.com" : "www.youtube.com";
    const search = new URLSearchParams({ v: id });
    if (options.playlistId) search.set("list", options.playlistId);
    if (options.start) search.set("t", `${options.start}s`);
    url = `https://${host}/watch?${search.toString()}`;
  }
  return {
    provider: "youtube",
    kind,
    id,
    url,
    ...(options.start && kind !== "short" ? { start: options.start } : {}),
    ...(options.playlistId ? { playlistId: options.playlistId } : {}),
    ...(options.music ? { music: true } : {}),
    field: "videoUrl",
  };
}

function playlistLink(id: string, music: boolean): ParsedYouTubeLink | null {
  if (!PLAYLIST_ID.test(id)) return null;
  const host = music ? "music.youtube.com" : "www.youtube.com";
  return {
    provider: "youtube",
    kind: "playlist",
    id,
    url: `https://${host}/playlist?list=${encodeURIComponent(id)}`,
    ...(music ? { music: true } : {}),
    field: "videoUrl",
  };
}

function channelLink(
  id: string,
  path: string,
  music = false
): ParsedYouTubeLink {
  const host = music ? "music.youtube.com" : "www.youtube.com";
  return {
    provider: "youtube",
    kind: "channel",
    id,
    url: `https://${host}/${path}`,
    ...(music ? { music: true } : {}),
    field: "channelUrl",
  };
}

/**
 * Parses any YouTube link (or a bare @handle). Returns null for anything
 * that isn't a YouTube video, Short, live stream, playlist or channel.
 */
export function parseYouTubeUrl(input: string): ParsedYouTubeLink | null {
  const trimmed = input.trim();
  if (HANDLE.test(trimmed)) {
    return channelLink(trimmed, trimmed);
  }
  const url = toUrl(trimmed);
  if (!url) return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const music = host === "music.youtube.com";
  const params = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const start = parseYouTubeTime(
    params.get("t") ?? params.get("start") ?? hash.get("t")
  );
  const list = params.get("list");
  const playlistId = list && PLAYLIST_ID.test(list) ? list : undefined;
  const segments = url.pathname.split("/").filter(Boolean);
  const [first = "", second = ""] = segments;

  if (host === "youtu.be") {
    return videoLink(first, { start, playlistId });
  }

  switch (first.toLowerCase()) {
    case "watch": {
      const id = params.get("v") ?? second;
      return videoLink(id, { start, playlistId, music });
    }
    case "shorts":
      return videoLink(second, { kind: "short" });
    case "live":
      return videoLink(second, { kind: "live", start });
    case "embed":
    case "v":
    case "e": {
      if (second === "videoseries" && playlistId) {
        return playlistLink(playlistId, false);
      }
      return videoLink(second, { start, playlistId });
    }
    case "playlist":
      return playlistId ? playlistLink(playlistId, music) : null;
    case "channel":
      return CHANNEL_ID.test(second)
        ? channelLink(second, `channel/${second}`, music)
        : null;
    case "c":
    case "user":
      return LEGACY_NAME.test(second)
        ? channelLink(second, `${first.toLowerCase()}/${second}`)
        : null;
    case "attribution_link": {
      const inner = params.get("u");
      return inner ? parseYouTubeUrl(`https://www.youtube.com${inner}`) : null;
    }
    default:
      break;
  }

  if (first.startsWith("@")) {
    const handle = decodeURIComponent(first);
    return HANDLE.test(handle) ? channelLink(handle, handle) : null;
  }
  return null;
}

/** Public oEmbed lookup (title, thumbnail); channels have none. */
export function youTubeOEmbedUrl(link: ParsedYouTubeLink): string | null {
  if (link.kind === "channel") return null;
  const target =
    link.kind === "playlist"
      ? `https://www.youtube.com/playlist?list=${encodeURIComponent(link.id)}`
      : `https://www.youtube.com/watch?v=${link.id}`;
  return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(target)}`;
}

/** Thumbnail without any request (videos only). */
export function youTubeThumbnailUrl(link: ParsedYouTubeLink): string | null {
  return link.kind === "playlist" || link.kind === "channel"
    ? null
    : `https://i.ytimg.com/vi/${link.id}/hqdefault.jpg`;
}

export const YOUTUBE_KIND_LABELS: Record<YouTubeLinkKind, string> = {
  video: "Video",
  short: "Short",
  live: "Live stream",
  playlist: "Playlist",
  channel: "Channel",
};
