import { IntegrationApiError, providerRequest } from "../../core/http-client";
import type {
  ContentSourceClient,
  ListSourceOptions,
  SourcePage,
} from "../../sources/types";
import { filterSourceItems, httpsOrUndefined } from "../../sources/types";
import { parseYouTubeUrl } from "./parser";

const BASE_URL = "https://www.googleapis.com/youtube/v3";
const PROVIDER = { slug: "youtube", name: "YouTube" };
const PAGE_TOKEN = /^[A-Za-z0-9_-]{1,128}$/;

interface ChannelsResponse {
  items?: Array<{
    id: string;
    snippet?: { title?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
}

interface PlaylistItemsResponse {
  nextPageToken?: string;
  items?: Array<{
    contentDetails?: { videoId?: string; videoPublishedAt?: string };
    snippet?: {
      title?: string;
      thumbnails?: Record<string, { url?: string } | undefined>;
    };
  }>;
}

/** Google's message names the key's project; keep ours. */
const describeYouTubeError = (body: unknown) => {
  const reason = (body as { error?: { errors?: Array<{ reason?: string }> } })
    ?.error?.errors?.[0]?.reason;
  if (reason === "quotaExceeded") return "the daily API quota is used up.";
  return reason ? `request failed (${reason}).` : undefined;
};

/**
 * Optional "your channel's videos" source, enabled when the server has a
 * YouTube Data API key (YOUTUBE_API_KEY). Reads public uploads only, so no
 * account connection is needed: the person names their channel.
 */
export class YouTubeChannelClient implements ContentSourceClient {
  private readonly apiKey: string;
  private readonly channel: string;
  private uploadsPlaylist?: string;

  constructor(apiKey: string, channel: string) {
    const parsed = parseYouTubeUrl(channel);
    if (parsed?.kind !== "channel" || parsed.id.includes("/")) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 400,
        code: "bad_request",
        message: "Enter a channel link or @handle.",
      });
    }
    this.apiKey = apiKey;
    this.channel = parsed.id;
  }

  private request<T>(path: string, params: Record<string, string>) {
    const search = new URLSearchParams({ ...params, key: this.apiKey });
    return providerRequest<T>(PROVIDER, `${BASE_URL}${path}?${search}`, {
      describeError: describeYouTubeError,
    });
  }

  async getUploadsPlaylist(): Promise<string> {
    if (this.uploadsPlaylist) return this.uploadsPlaylist;
    const lookup: Record<string, string> = this.channel.startsWith("@")
      ? { forHandle: this.channel }
      : this.channel.startsWith("UC")
        ? { id: this.channel }
        : { forUsername: this.channel };
    const data = await this.request<ChannelsResponse>("/channels", {
      part: "contentDetails",
      ...lookup,
    });
    const uploads = data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 404,
        code: "not_found",
        message: "YouTube couldn't find that channel.",
      });
    }
    this.uploadsPlaylist = uploads;
    return uploads;
  }

  async list(options: ListSourceOptions = {}): Promise<SourcePage> {
    if (options.cursor && !PAGE_TOKEN.test(options.cursor)) {
      throw new IntegrationApiError({
        provider: PROVIDER.slug,
        status: 400,
        code: "bad_request",
        message: "YouTube page token is invalid.",
      });
    }
    const playlistId = await this.getUploadsPlaylist();
    const data = await this.request<PlaylistItemsResponse>("/playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: "25",
      ...(options.cursor ? { pageToken: options.cursor } : {}),
    });
    const items = (data.items ?? []).flatMap((item) => {
      const videoId = item.contentDetails?.videoId;
      if (!(videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId))) return [];
      const thumbs = item.snippet?.thumbnails ?? {};
      return [
        {
          id: videoId,
          title: item.snippet?.title?.trim() || "Video",
          subtitle: item.contentDetails?.videoPublishedAt?.slice(0, 10),
          url: `https://www.youtube.com/watch?v=${videoId}`,
          image: httpsOrUndefined(thumbs.medium?.url ?? thumbs.default?.url),
        },
      ];
    });
    return {
      items: filterSourceItems(items, options.search),
      nextCursor: data.nextPageToken,
    };
  }
}

export function createYouTubeChannelClient(
  apiKey: string,
  channel: string
): YouTubeChannelClient {
  return new YouTubeChannelClient(apiKey, channel);
}
