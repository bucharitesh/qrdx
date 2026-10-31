import { providerRequest } from "../../core/http-client";
import type {
  ContentSourceClient,
  ListSourceOptions,
  SourceItem,
  SourcePage,
} from "../../sources/types";
import { filterSourceItems, httpsOrUndefined } from "../../sources/types";
import type { CalcomEventType, CalcomMe, CalcomResponse } from "./types";

const BASE_URL = "https://api.cal.com/v2";
const PROVIDER = { slug: "calcom", name: "Cal.com" };
/** Event types endpoint version (older values fall back to older shapes). */
export const CALCOM_EVENT_TYPES_VERSION = "2024-06-14";

/** cal_live_… (live) or cal_… (test) */
export const CALCOM_API_KEY = /^cal_(live_)?[A-Za-z0-9_-]{16,200}$/;

function bookingUrl(eventType: CalcomEventType, username: string | null) {
  const direct = httpsOrUndefined(eventType.bookingUrl);
  if (direct) return direct;
  if (!username) return;
  return `https://cal.com/${encodeURIComponent(username)}/${encodeURIComponent(eventType.slug)}`;
}

/** Cal.com API v2 with a personal API key: event types → booking URLs. */
export class CalcomClient implements ContentSourceClient {
  private readonly apiKey: string;
  private me?: CalcomMe;

  constructor(apiKey: string, options: { username?: string | null } = {}) {
    this.apiKey = apiKey;
    if (options.username !== undefined) {
      this.me = { id: 0, username: options.username };
    }
  }

  private request<T>(path: string, version?: string): Promise<T> {
    return providerRequest<T>(PROVIDER, `${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(version ? { "cal-api-version": version } : {}),
      },
    });
  }

  async getMe(): Promise<CalcomMe> {
    const response = await this.request<CalcomResponse<CalcomMe>>("/me");
    this.me = response.data;
    return response.data;
  }

  async listEventTypes(): Promise<CalcomEventType[]> {
    const me = this.me ?? (await this.getMe());
    const search = me.username
      ? `?${new URLSearchParams({ username: me.username }).toString()}`
      : "";
    const response = await this.request<CalcomResponse<CalcomEventType[]>>(
      `/event-types${search}`,
      CALCOM_EVENT_TYPES_VERSION
    );
    return Array.isArray(response.data) ? response.data : [];
  }

  async list(options: ListSourceOptions = {}): Promise<SourcePage> {
    const eventTypes = await this.listEventTypes();
    const username = this.me?.username ?? null;
    const items = eventTypes
      .filter((eventType) => !eventType.hidden)
      .flatMap((eventType): SourceItem[] => {
        const url = bookingUrl(eventType, username);
        if (!url) return [];
        return [
          {
            id: String(eventType.id),
            title: eventType.title,
            subtitle: eventType.lengthInMinutes
              ? `${eventType.lengthInMinutes} min`
              : undefined,
            url,
          },
        ];
      });
    // The API returns every event type at once.
    return { items: filterSourceItems(items, options.search) };
  }
}

export function createCalcomClient(
  apiKey: string,
  options?: { username?: string | null }
): CalcomClient {
  return new CalcomClient(apiKey, options);
}
