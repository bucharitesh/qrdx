/** biome-ignore-all lint/style/noParameterProperties: <explanation> */
import type { DubLink, DubWorkspace } from "./types";

/**
 * Dub API Client
 * Provides methods to interact with the Dub.sh API
 */
export class DubClient {
  private readonly baseUrl = "https://api.dub.co";

  constructor(private readonly accessToken: string) {}

  /**
   * Make an authenticated request to the Dub API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: { message: "Unknown error" },
      }));
      throw new Error(
        `Dub API error: ${response.status} - ${error.error?.message || "Unknown error"}`
      );
    }

    return response.json();
  }

  /**
   * Get all workspaces for the authenticated user
   */
  getWorkspaces(): Promise<DubWorkspace[]> {
    return this.request<DubWorkspace[]>("/workspaces");
  }

  /**
   * Get a specific workspace by ID
   */
  getWorkspace(workspaceId: string): Promise<DubWorkspace> {
    return this.request<DubWorkspace>(`/workspaces/${workspaceId}`);
  }

  /**
   * Create a short link
   */
  createLink(data: {
    url: string;
    domain?: string;
    key?: string;
    expiresAt?: string;
    title?: string;
    description?: string;
    image?: string;
  }): Promise<DubLink> {
    return this.request<DubLink>("/links", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Get link information
   */
  getLink(linkId: string): Promise<DubLink> {
    return this.request<DubLink>(`/links/${linkId}`);
  }

  /**
   * Get all links for a workspace
   */
  getLinks(params?: {
    domain?: string;
    search?: string;
    userId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<DubLink[]> {
    const searchParams = new URLSearchParams();
    if (params?.domain) {
      searchParams.set("domain", params.domain);
    }
    if (params?.search) {
      searchParams.set("search", params.search);
    }
    if (params?.userId) {
      searchParams.set("userId", params.userId);
    }
    if (params?.page) {
      searchParams.set("page", params.page.toString());
    }
    if (params?.pageSize) {
      searchParams.set("pageSize", params.pageSize.toString());
    }

    const queryString = searchParams.toString();
    const endpoint = queryString ? `/links?${queryString}` : "/links";

    return this.request<DubLink[]>(endpoint);
  }

  /**
   * Update a link
   */
  updateLink(
    linkId: string,
    data: {
      url?: string;
      key?: string;
      expiresAt?: string;
      title?: string;
      description?: string;
      image?: string;
    }
  ): Promise<DubLink> {
    return this.request<DubLink>(`/links/${linkId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a link
   */
  async deleteLink(linkId: string): Promise<void> {
    await this.request<void>(`/links/${linkId}`, {
      method: "DELETE",
    });
  }

  /**
   * Get analytics for a link
   */
  getAnalytics(
    linkId: string,
    params?: {
      start?: string;
      end?: string;
      timezone?: string;
    }
  ): Promise<any> {
    const searchParams = new URLSearchParams();
    if (params?.start) {
      searchParams.set("start", params.start);
    }
    if (params?.end) {
      searchParams.set("end", params.end);
    }
    if (params?.timezone) {
      searchParams.set("timezone", params.timezone);
    }

    const queryString = searchParams.toString();
    const endpoint = queryString
      ? `/links/${linkId}/analytics?${queryString}`
      : `/links/${linkId}/analytics`;

    return this.request<any>(endpoint);
  }
}

/**
 * Create a Dub client instance
 */
export function createDubClient(accessToken: string): DubClient {
  return new DubClient(accessToken);
}
