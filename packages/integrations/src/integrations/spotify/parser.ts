/**
 * Spotify link parser: tracks, albums, artists, playlists, podcasts
 * (shows, episodes), audiobooks and profiles from open.spotify.com links
 * (intl-xx paths, embeds, ?si= tracking) and spotify: URIs. Client-safe.
 */

export type SpotifyLinkKind =
  | "track"
  | "album"
  | "artist"
  | "playlist"
  | "show"
  | "episode"
  | "audiobook"
  | "user";

export interface ParsedSpotifyLink {
  provider: "spotify";
  kind: SpotifyLinkKind;
  id: string;
  /** Clean https link to encode (opens the app when installed) */
  url: string;
  /** spotify: URI for the same item */
  uri: string;
}

const ID = /^[A-Za-z0-9]{22}$/;
const USER_ID = /^[A-Za-z0-9._-]{1,64}$/;
const KINDS = new Set<SpotifyLinkKind>([
  "track",
  "album",
  "artist",
  "playlist",
  "show",
  "episode",
  "audiobook",
  "user",
]);
const HOSTS = new Set([
  "open.spotify.com",
  "play.spotify.com",
  "spotify.com",
  "www.spotify.com",
]);

function link(kind: SpotifyLinkKind, id: string): ParsedSpotifyLink | null {
  const valid = kind === "user" ? USER_ID.test(id) : ID.test(id);
  if (!valid) return null;
  const safeId = encodeURIComponent(id);
  return {
    provider: "spotify",
    kind,
    id,
    url: `https://open.spotify.com/${kind}/${safeId}`,
    uri: `spotify:${kind}:${id}`,
  };
}

function fromSegments(segments: string[]): ParsedSpotifyLink | null {
  const parts = [...segments];
  // /intl-de/track/…, /embed/track/…, /embed-podcast/episode/…
  while (parts[0] && /^(intl-[a-z]{2}(-[a-z]{2,4})?|embed|embed-podcast)$/i.test(parts[0])) {
    parts.shift();
  }
  const [kind = "", id = "", third = "", fourth = ""] = parts;
  const lower = kind.toLowerCase() as SpotifyLinkKind;
  // Legacy /user/<name>/playlist/<id>
  if (lower === "user" && third.toLowerCase() === "playlist") {
    return link("playlist", fourth);
  }
  return KINDS.has(lower) ? link(lower, id) : null;
}

/**
 * Parses any Spotify link or URI. spotify.link short links can't be read
 * offline, so they return null (paste the full open.spotify.com link).
 */
export function parseSpotifyUrl(input: string): ParsedSpotifyLink | null {
  const text = input.trim();
  if (!text) return null;

  if (/^spotify:/i.test(text)) {
    const segments = text.split(":").slice(1);
    // spotify:user:<name>:playlist:<id>
    if (segments[0]?.toLowerCase() === "user" && segments[2] === "playlist") {
      return link("playlist", segments[3] ?? "");
    }
    return fromSegments(segments);
  }

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  return fromSegments(url.pathname.split("/").filter(Boolean));
}

/** Public oEmbed lookup (title, thumbnail); profiles have none. */
export function spotifyOEmbedUrl(parsed: ParsedSpotifyLink): string | null {
  if (parsed.kind === "user") return null;
  return `https://open.spotify.com/oembed?url=${encodeURIComponent(parsed.url)}`;
}

export const SPOTIFY_KIND_LABELS: Record<SpotifyLinkKind, string> = {
  track: "Song",
  album: "Album",
  artist: "Artist",
  playlist: "Playlist",
  show: "Podcast",
  episode: "Episode",
  audiobook: "Audiobook",
  user: "Profile",
};
