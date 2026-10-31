import { IntegrationApiError, providerRequest } from "../../core/http-client";
import type {
  ContentSourceClient,
  ListSourceOptions,
  SourcePage,
} from "../../sources/types";
import { filterSourceItems, httpsOrUndefined } from "../../sources/types";
import { parseSpotifyUrl } from "./parser";

const PROVIDER = { slug: "spotify", name: "Spotify" };
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_URL = "https://api.spotify.com/v1";
const PAGE_SIZE = 50;

interface PlaylistsResponse {
  items: Array<{
    id: string;
    name: string;
    external_urls?: { spotify?: string };
    images?: Array<{ url: string }> | null;
    tracks?: { total?: number };
    items?: { total?: number };
    public?: boolean | null;
  } | null>;
  next: string | null;
  offset: number;
  total: number;
}

let cachedToken: { key: string; token: string; expiresAt: number } | null =
  null;

/** App-only token (client credentials); cached until a minute before expiry. */
export async function getSpotifyAppToken(credentials: {
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const key = credentials.clientId;
  if (cachedToken?.key === key && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }
  const data = await providerRequest<{
    access_token: string;
    expires_in: number;
  }>(PROVIDER, TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    describeError: () => "rejected the app credentials.",
  });
  cachedToken = {
    key,
    token: data.access_token,
    expiresAt: Date.now() + Math.max(0, data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

/** For tests. */
export function resetSpotifyTokenCache() {
  cachedToken = null;
}

/**
 * Optional "your playlists" source, enabled when the server has Spotify app
 * credentials (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET). Lists a profile's
 * public playlists, so no account connection is needed.
 */
export class SpotifyPlaylistsClient implements ContentSourceClient {
  private readonly credentials: { clientId: string; clientSecret: string };
  private readonly userId: string;

  constructor(
    credentials: { clientId: string; clientSecret: string },
    profile: string
  ) {
    const parsed =
      parseSpotifyUrl(profile) ??
      parseSpotifyUrl(`spotify:user:${profile.trim()}`);
    if (parsed?.kind !== "user") {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 400,
        code: "bad_request",
        message: "Enter your Spotify profile link.",
      });
    }
    this.credentials = credentials;
    this.userId = parsed.id;
  }

  async list(options: ListSourceOptions = {}): Promise<SourcePage> {
    const offset = options.cursor ? Number.parseInt(options.cursor, 10) : 0;
    if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 400,
        code: "bad_request",
        message: "Spotify cursor is invalid.",
      });
    }
    const token = await getSpotifyAppToken(this.credentials);
    const search = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    const data = await providerRequest<PlaylistsResponse>(
      PROVIDER,
      `${API_URL}/users/${encodeURIComponent(this.userId)}/playlists?${search}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const items = data.items.flatMap((playlist) => {
      if (!playlist) return [];
      const link = parseSpotifyUrl(
        playlist.external_urls?.spotify ?? `spotify:playlist:${playlist.id}`
      );
      if (link?.kind !== "playlist") return [];
      const total = playlist.tracks?.total ?? playlist.items?.total;
      return [
        {
          id: playlist.id,
          title: playlist.name,
          subtitle: typeof total === "number" ? `${total} songs` : undefined,
          url: link.url,
          image: httpsOrUndefined(playlist.images?.[0]?.url),
        },
      ];
    });
    const next = offset + data.items.length;
    return {
      items: filterSourceItems(items, options.search),
      nextCursor: data.next && next < data.total ? String(next) : undefined,
    };
  }
}

export function createSpotifyPlaylistsClient(
  credentials: { clientId: string; clientSecret: string },
  profile: string
): SpotifyPlaylistsClient {
  return new SpotifyPlaylistsClient(credentials, profile);
}
