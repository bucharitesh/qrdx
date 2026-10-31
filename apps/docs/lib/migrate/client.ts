"use client";

// Browser side of /api/migrate/**. The dialog talks to `MigrateClient`, so
// the dev-only mock (lib/migrate/mock.ts) can stand in without a session.

import { connectIntegrationAction } from "@/app/settings/integrations/actions";
import { connectWithApiKeyAction } from "@/app/settings/integrations/connected-account-actions";
import type { ApiProviderId } from "./providers";
import { API_PROVIDERS } from "./providers";
import type {
  ChunkResult,
  ImportPreview,
  JobItem,
  JobSummary,
  LinkFilters,
  LinksResponse,
  PreviewRequest,
  ProvidersInfo,
  RedirectMode,
  RedirectResult,
} from "./types";

export class MigrateApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "MigrateApiError";
  }
}

export interface MigrateClient {
  mock: boolean;
  providers(): Promise<ProvidersInfo>;
  links(
    provider: ApiProviderId,
    cursor: string | null,
    filters: LinkFilters & { withDomains?: boolean },
  ): Promise<LinksResponse>;
  preview(request: PreviewRequest): Promise<ImportPreview>;
  start(
    request: PreviewRequest,
  ): Promise<{ job: JobSummary; preview: ImportPreview }>;
  run(jobId: string): Promise<ChunkResult>;
  job(jobId: string): Promise<{ job: JobSummary; items: JobItem[] }>;
  jobs(): Promise<JobSummary[]>;
  redirects(
    jobId: string,
    mode: RedirectMode,
    retry?: boolean,
  ): Promise<RedirectResult>;
  attachDomain(jobId: string): Promise<{ attached: number; job: JobSummary }>;
  /** OAuth URL to send the browser to */
  connectOAuth(provider: ApiProviderId): Promise<string>;
  connectKey(
    provider: ApiProviderId,
    key: string,
  ): Promise<{ ok: true } | { ok: false; error: string }>;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new MigrateApiError(0, "NETWORK", "You seem to be offline. Try again.");
  }
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    code?: string;
    message?: string;
  } | null;
  if (!response.ok) {
    const retry = Number(response.headers.get("Retry-After"));
    throw new MigrateApiError(
      response.status,
      body?.code ?? (response.status === 401 ? "UNAUTHORIZED" : "ERROR"),
      response.status === 401
        ? "Your session ended. Sign in again to continue."
        : (body?.message ?? "Something went wrong. Try again."),
      Number.isFinite(retry) && retry > 0 ? retry : null,
    );
  }
  return body?.data as T;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

export const httpClient: MigrateClient = {
  mock: false,
  providers: () => call("/api/migrate/providers"),
  links(provider, cursor, filters) {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (filters.search) params.set("search", filters.search);
    if (filters.domain) params.set("domain", filters.domain);
    if (filters.tag) params.set("tag", filters.tag);
    if (filters.withDomains) params.set("domains", "1");
    return call(`/api/migrate/${provider}/links?${params}`);
  },
  preview: (request) => call("/api/migrate/preview", post(request)),
  start: (request) => call("/api/migrate/jobs", post(request)),
  run: (id) => call(`/api/migrate/jobs/${encodeURIComponent(id)}/run`, post({})),
  job: (id) => call(`/api/migrate/jobs/${encodeURIComponent(id)}`),
  jobs: () => call("/api/migrate/jobs"),
  redirects: (id, mode, retry) =>
    call(
      `/api/migrate/jobs/${encodeURIComponent(id)}/redirects`,
      post({ mode, retry }),
    ),
  attachDomain: (id) =>
    call(`/api/migrate/jobs/${encodeURIComponent(id)}/domain`, post({})),
  async connectOAuth(provider) {
    try {
      const { url } = await connectIntegrationAction(
        API_PROVIDERS[provider].integration,
      );
      if (url) return url;
    } catch {
      // Same message below.
    }
    throw new MigrateApiError(
      503,
      "UNAVAILABLE",
      `Connecting ${API_PROVIDERS[provider].name} isn't available right now. Try again later.`,
    );
  },
  connectKey: (provider, key) =>
    connectWithApiKeyAction(API_PROVIDERS[provider].integration, key),
};

/** Waits out a 429/409 (Retry-After) and tries again, up to `attempts`. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 4, onWait }: { attempts?: number; onWait?: (s: number) => void } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retryable =
        error instanceof MigrateApiError &&
        (error.status === 429 || error.code === "BUSY");
      if (!retryable || attempt >= attempts) throw error;
      const seconds = Math.min(60, error.retryAfterSeconds ?? 5 * attempt);
      onWait?.(seconds);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    }
  }
}
