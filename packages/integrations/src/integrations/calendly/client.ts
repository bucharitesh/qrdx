import {
  IntegrationApiError,
  providerRequest,
} from "../../core/http-client";
import type {
  ContentSourceClient,
  ListSourceOptions,
  SourcePage,
} from "../../sources/types";
import { filterSourceItems, httpsOrUndefined } from "../../sources/types";
import type {
  CalendlyCollection,
  CalendlyEventType,
  CalendlyUser,
} from "./types";

const BASE_URL = "https://api.calendly.com";
export const CALENDLY_REVOKE_URL = "https://auth.calendly.com/oauth/revoke";
const PROVIDER = { slug: "calendly", name: "Calendly" };
const PAGE_TOKEN = /^[A-Za-z0-9_=-]{1,512}$/;
const USER_URI = /^https:\/\/api\.calendly\.com\/users\/[A-Za-z0-9-]{1,64}$/;

/** Calendly API v2 with an OAuth token: event types → scheduling URLs. */
export class CalendlyClient implements ContentSourceClient {
  private readonly accessToken: string;
  private userUri?: string;

  constructor(accessToken: string, options: { userUri?: string } = {}) {
    this.accessToken = accessToken;
    if (options.userUri && USER_URI.test(options.userUri)) {
      this.userUri = options.userUri;
    }
  }

  private request<T>(path: string): Promise<T> {
    return providerRequest<T>(PROVIDER, `${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
  }

  async getCurrentUser(): Promise<CalendlyUser> {
    const { resource } = await this.request<{ resource: CalendlyUser }>(
      "/users/me"
    );
    this.userUri = resource.uri;
    return resource;
  }

  async listEventTypes(
    params: { pageToken?: string; count?: number } = {}
  ): Promise<CalendlyCollection<CalendlyEventType>> {
    const user = this.userUri ?? (await this.getCurrentUser()).uri;
    const search = new URLSearchParams({
      user,
      active: "true",
      count: String(Math.min(Math.max(params.count ?? 50, 1), 100)),
      sort: "name:asc",
    });
    if (params.pageToken) {
      if (!PAGE_TOKEN.test(params.pageToken)) {
        throw new IntegrationApiError({
          provider: PROVIDER.slug,
          status: 400,
          code: "bad_request",
          message: "Calendly page token is invalid.",
        });
      }
      search.set("page_token", params.pageToken);
    }
    return this.request(`/event_types?${search.toString()}`);
  }

  async list(options: ListSourceOptions = {}): Promise<SourcePage> {
    const page = await this.listEventTypes({ pageToken: options.cursor });
    const items = page.collection.flatMap((eventType) => {
      const url = httpsOrUndefined(eventType.scheduling_url);
      if (!(url && eventType.active)) return [];
      return [
        {
          id: eventType.uri.split("/").at(-1) ?? eventType.uri,
          title: eventType.name?.trim() || eventType.slug || "Event type",
          subtitle: eventType.duration ? `${eventType.duration} min` : undefined,
          url,
          badge: eventType.secret ? "Secret link" : undefined,
        },
      ];
    });
    return {
      items: filterSourceItems(items, options.search),
      nextCursor: page.pagination.next_page_token ?? undefined,
    };
  }
}

export function createCalendlyClient(
  accessToken: string,
  options?: { userUri?: string }
): CalendlyClient {
  return new CalendlyClient(accessToken, options);
}

/** Revokes an access or refresh token (both stop working). */
export async function revokeCalendlyToken(options: {
  token: string;
  clientId: string;
  clientSecret: string;
}): Promise<void> {
  await providerRequest(PROVIDER, CALENDLY_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      token: options.token,
    }).toString(),
  });
}
