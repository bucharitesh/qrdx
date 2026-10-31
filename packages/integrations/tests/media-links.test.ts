import { beforeEach, describe, expect, it } from "vitest";
import {
  createSpotifyPlaylistsClient,
  resetSpotifyTokenCache,
} from "../src/integrations/spotify/client";
import {
  parseSpotifyUrl,
  spotifyOEmbedUrl,
} from "../src/integrations/spotify/parser";
import { createYouTubeChannelClient } from "../src/integrations/youtube/client";
import {
  parseYouTubeTime,
  parseYouTubeUrl,
  youTubeOEmbedUrl,
  youTubeThumbnailUrl,
} from "../src/integrations/youtube/parser";
import { fetchOEmbedPreview } from "../src/sources/oembed";
import { json, mockFetch } from "./helpers";

const V = "dQw4w9WgXcQ";

describe("YouTube links", () => {
  it.each([
    [
      `https://www.youtube.com/watch?v=${V}`,
      "video",
      `https://www.youtube.com/watch?v=${V}`,
    ],
    [`https://youtu.be/${V}`, "video", `https://www.youtube.com/watch?v=${V}`],
    [
      `https://youtu.be/${V}?si=AbCdEf123&t=42`,
      "video",
      `https://www.youtube.com/watch?v=${V}&t=42s`,
    ],
    [
      `youtube.com/watch?v=${V}&feature=share&pp=ygU`,
      "video",
      `https://www.youtube.com/watch?v=${V}`,
    ],
    [
      `https://m.youtube.com/watch?v=${V}&t=1h2m3s`,
      "video",
      `https://www.youtube.com/watch?v=${V}&t=3723s`,
    ],
    [
      `https://www.youtube.com/watch?v=${V}#t=1m30s`,
      "video",
      `https://www.youtube.com/watch?v=${V}&t=90s`,
    ],
    [
      `https://www.youtube.com/watch?v=${V}&list=PLabc123XYZ&index=3`,
      "video",
      `https://www.youtube.com/watch?v=${V}&list=PLabc123XYZ`,
    ],
    [
      `https://www.youtube.com/shorts/${V}?feature=share`,
      "short",
      `https://www.youtube.com/shorts/${V}`,
    ],
    [
      `https://www.youtube.com/live/${V}?si=x`,
      "live",
      `https://www.youtube.com/watch?v=${V}`,
    ],
    [
      `https://www.youtube.com/embed/${V}?start=75`,
      "video",
      `https://www.youtube.com/watch?v=${V}&t=75s`,
    ],
    [
      `https://www.youtube-nocookie.com/embed/${V}`,
      "video",
      `https://www.youtube.com/watch?v=${V}`,
    ],
    [
      `https://music.youtube.com/watch?v=${V}&si=zz`,
      "video",
      `https://music.youtube.com/watch?v=${V}`,
    ],
    [
      "https://music.youtube.com/playlist?list=OLAK5uy_abc123",
      "playlist",
      "https://music.youtube.com/playlist?list=OLAK5uy_abc123",
    ],
    [
      "https://www.youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
      "playlist",
      "https://www.youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs",
    ],
    [
      "https://www.youtube.com/@qrdx/videos",
      "channel",
      "https://www.youtube.com/@qrdx",
    ],
    ["@qrdx", "channel", "https://www.youtube.com/@qrdx"],
    [
      "https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
      "channel",
      "https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
    ],
    [
      "https://www.youtube.com/c/GoogleDevelopers",
      "channel",
      "https://www.youtube.com/c/GoogleDevelopers",
    ],
    [
      "https://www.youtube.com/user/GoogleDevelopers",
      "channel",
      "https://www.youtube.com/user/GoogleDevelopers",
    ],
  ])("%s → %s", (input, kind, url) => {
    const parsed = parseYouTubeUrl(input);
    expect(parsed?.kind).toBe(kind);
    expect(parsed?.url).toBe(url);
  });

  it("puts channels in channelUrl and everything else in videoUrl", () => {
    expect(parseYouTubeUrl("@qrdx")?.field).toBe("channelUrl");
    expect(parseYouTubeUrl(`https://youtu.be/${V}`)?.field).toBe("videoUrl");
  });

  it.each([
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/short",
    "https://www.youtube.com/watch?v=",
    "https://www.youtube.com/feed/trending",
    "https://evil-youtube.com/watch?v=dQw4w9WgXcQ",
    "javascript:alert(1)",
    "",
  ])("rejects %s", (input) => {
    expect(parseYouTubeUrl(input)).toBeNull();
  });

  it("parses timestamps", () => {
    expect(parseYouTubeTime("90")).toBe(90);
    expect(parseYouTubeTime("1:30")).toBe(90);
    expect(parseYouTubeTime("1:02:03")).toBe(3723);
    expect(parseYouTubeTime("2m5s")).toBe(125);
    expect(parseYouTubeTime("nope")).toBeUndefined();
    expect(parseYouTubeTime("0")).toBeUndefined();
  });

  it("builds oEmbed and thumbnail URLs (none for channels)", () => {
    const video = parseYouTubeUrl(`https://youtu.be/${V}?t=4`);
    expect(video && youTubeOEmbedUrl(video)).toBe(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${V}`)}`
    );
    expect(video && youTubeThumbnailUrl(video)).toBe(
      `https://i.ytimg.com/vi/${V}/hqdefault.jpg`
    );
    const channel = parseYouTubeUrl("@qrdx");
    expect(channel && youTubeOEmbedUrl(channel)).toBeNull();
  });
});

describe("Spotify links", () => {
  const T = "4cOdK2wGLETKBW3PvgPWqT";
  it.each([
    [
      `https://open.spotify.com/track/${T}?si=abc123`,
      "track",
      `https://open.spotify.com/track/${T}`,
    ],
    [
      `https://open.spotify.com/intl-de/track/${T}`,
      "track",
      `https://open.spotify.com/track/${T}`,
    ],
    [
      `https://open.spotify.com/intl-pt-BR/album/${T}?si=x`,
      "album",
      `https://open.spotify.com/album/${T}`,
    ],
    [
      `https://open.spotify.com/embed/playlist/${T}?utm_source=generator`,
      "playlist",
      `https://open.spotify.com/playlist/${T}`,
    ],
    [
      `https://open.spotify.com/embed-podcast/episode/${T}`,
      "episode",
      `https://open.spotify.com/episode/${T}`,
    ],
    [
      `open.spotify.com/artist/${T}`,
      "artist",
      `https://open.spotify.com/artist/${T}`,
    ],
    [
      `https://play.spotify.com/show/${T}`,
      "show",
      `https://open.spotify.com/show/${T}`,
    ],
    [
      `https://open.spotify.com/user/spotify/playlist/${T}`,
      "playlist",
      `https://open.spotify.com/playlist/${T}`,
    ],
    [`spotify:track:${T}`, "track", `https://open.spotify.com/track/${T}`],
    [`spotify:album:${T}`, "album", `https://open.spotify.com/album/${T}`],
    [
      `spotify:user:alice:playlist:${T}`,
      "playlist",
      `https://open.spotify.com/playlist/${T}`,
    ],
    [
      "https://open.spotify.com/user/alice.smith",
      "user",
      "https://open.spotify.com/user/alice.smith",
    ],
  ])("%s → %s", (input, kind, url) => {
    const parsed = parseSpotifyUrl(input);
    expect(parsed?.kind).toBe(kind);
    expect(parsed?.url).toBe(url);
  });

  it("keeps a matching URI", () => {
    expect(parseSpotifyUrl(`https://open.spotify.com/track/${T}`)?.uri).toBe(
      `spotify:track:${T}`
    );
  });

  it.each([
    "https://spotify.link/AbCdEf",
    "https://open.spotify.com/track/tooShort",
    "https://open.spotify.com/genre/pop",
    "https://example.com/track/4cOdK2wGLETKBW3PvgPWqT",
    "spotify:",
  ])("rejects %s", (input) => {
    expect(parseSpotifyUrl(input)).toBeNull();
  });

  it("builds the oEmbed URL from the clean link", () => {
    const parsed = parseSpotifyUrl(
      `https://open.spotify.com/intl-fr/track/${T}?si=1`
    );
    expect(parsed && spotifyOEmbedUrl(parsed)).toBe(
      `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${T}`)}`
    );
  });
});

describe("oEmbed previews", () => {
  it("reads title and https thumbnails only", async () => {
    mockFetch(
      json({
        title: "Song",
        author_name: "Band",
        thumbnail_url: "http://insecure/x.jpg",
      })
    );
    const preview = await fetchOEmbedPreview(
      "https://open.spotify.com/oembed?url=x"
    );
    expect(preview).toEqual({
      title: "Song",
      authorName: "Band",
      thumbnailUrl: undefined,
    });
  });

  it("refuses any other endpoint (no arbitrary fetches)", async () => {
    const { calls } = mockFetch();
    await expect(
      fetchOEmbedPreview("https://example.com/oembed?url=x")
    ).rejects.toThrow();
    await expect(
      fetchOEmbedPreview("https://www.youtube.com/watch?v=x")
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe("YouTube channel videos (API key)", () => {
  it("looks up the uploads playlist by handle, then pages its videos", async () => {
    const { calls } = mockFetch(
      json({
        items: [
          {
            id: "UC1",
            contentDetails: { relatedPlaylists: { uploads: "UU1" } },
          },
        ],
      }),
      json({
        nextPageToken: "CAUQAA",
        items: [
          {
            contentDetails: {
              videoId: V,
              videoPublishedAt: "2026-10-24T10:00:00Z",
            },
            snippet: {
              title: "Roast",
              thumbnails: {
                medium: { url: "https://i.ytimg.com/vi/x/mq.jpg" },
              },
            },
          },
          { contentDetails: { videoId: "bad" }, snippet: { title: "Broken" } },
        ],
      }),
      json({ items: [] })
    );
    const client = createYouTubeChannelClient(
      "yt-key",
      "https://www.youtube.com/@qrdx"
    );
    const page = await client.list();
    const lookup = new URL(calls[0]?.url ?? "");
    expect(lookup.searchParams.get("forHandle")).toBe("@qrdx");
    expect(lookup.searchParams.get("key")).toBe("yt-key");
    expect(page.items).toEqual([
      {
        id: V,
        title: "Roast",
        subtitle: "2026-10-24",
        url: `https://www.youtube.com/watch?v=${V}`,
        image: "https://i.ytimg.com/vi/x/mq.jpg",
      },
    ]);
    expect(page.nextCursor).toBe("CAUQAA");
    await client.list({ cursor: "CAUQAA" });
    expect(new URL(calls[2]?.url ?? "").searchParams.get("pageToken")).toBe(
      "CAUQAA"
    );
  });

  it("maps quota errors without Google's message and rejects non-channels", async () => {
    mockFetch(
      json(
        {
          error: {
            message: "key AIza… for project 123",
            errors: [{ reason: "quotaExceeded" }],
          },
        },
        403
      )
    );
    const error = await createYouTubeChannelClient("k", "@qrdx")
      .list()
      .catch((e) => e);
    expect(error.code).toBe("forbidden");
    expect(error.message).toContain("quota");
    expect(error.message).not.toContain("project");
    expect(() =>
      createYouTubeChannelClient("k", `https://youtu.be/${V}`)
    ).toThrow();
  });
});

describe("Spotify playlists (client credentials)", () => {
  beforeEach(() => resetSpotifyTokenCache());

  it("gets an app token once, then pages a profile's playlists by offset", async () => {
    const { calls } = mockFetch(
      json({ access_token: "app-token", expires_in: 3600 }),
      json({
        items: [
          {
            id: "37i9dQZF1DXcBWIGoYBM5M",
            name: "Mornings",
            external_urls: {
              spotify:
                "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
            },
            images: [{ url: "https://i.scdn.co/a" }],
            tracks: { total: 48 },
          },
          null,
        ],
        next: "https://api.spotify.com/v1/users/alice/playlists?offset=50",
        offset: 0,
        total: 70,
      }),
      json({ items: [], next: null, offset: 2, total: 70 })
    );
    const client = createSpotifyPlaylistsClient(
      { clientId: "id", clientSecret: "secret" },
      "https://open.spotify.com/user/alice"
    );
    const page = await client.list();
    expect(calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("id:secret").toString("base64")}`
    );
    expect(calls[0]?.body).toBe("grant_type=client_credentials");
    expect(calls[1]?.url).toContain(
      "/v1/users/alice/playlists?limit=50&offset=0"
    );
    expect(calls[1]?.headers.authorization).toBe("Bearer app-token");
    expect(page.items[0]).toMatchObject({
      title: "Mornings",
      subtitle: "48 songs",
    });
    expect(page.nextCursor).toBe("2");
    await client.list({ cursor: "2" });
    // token reused: no second token request
    expect(calls).toHaveLength(3);
  });
});
