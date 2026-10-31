"use client";

import type { SourcePage, SyncState } from "@repo/integrations";
import type {
  MailchimpAudience,
  MailchimpMergeField,
} from "@repo/integrations/src/integrations/mailchimp/types";
import type { FormMapping } from "@repo/integrations/src/sinks/mapping";
import type { ScopedFormPage } from "./data";
import {
  isIntegrationsMock,
  MOCK_AUDIENCES,
  MOCK_FORM_PAGES,
  MOCK_MERGE_FIELDS,
  mockSourcePage,
  mockSyncState,
} from "./mock";

export { isIntegrationsMock };

export interface SourceStatusView {
  slug: string;
  name: string;
  logo: string;
  configured: boolean;
  needsQuery: boolean;
  connected: boolean;
  status: "active" | "disconnected" | "error" | null;
}

export class DataConnectionError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "DataConnectionError";
    this.code = code;
  }
}

/** Plain fetch: a 401 means "signed out", never "sign the user out". */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new DataConnectionError(
      "Couldn't reach QRdx. Check your connection and try again.",
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new DataConnectionError(
      body?.error ?? body?.message ?? "Something went wrong. Try again.",
      body?.code ?? (response.status === 401 ? "UNAUTHORIZED" : undefined),
    );
  }
  return body as T;
}

const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const MOCK_SOURCES: Record<string, SourceStatusView[]> = {
  url: [
    {
      slug: "stripe",
      name: "Stripe",
      logo: "/integrations/stripe.svg",
      configured: true,
      needsQuery: false,
      connected: true,
      status: "active",
    },
    {
      slug: "calendly",
      name: "Calendly",
      logo: "/integrations/calendly.svg",
      configured: true,
      needsQuery: false,
      connected: true,
      status: "active",
    },
    {
      slug: "shopify",
      name: "Shopify",
      logo: "/integrations/shopify.svg",
      configured: true,
      needsQuery: false,
      connected: true,
      status: "active",
    },
  ],
  calcom: [
    {
      slug: "calcom",
      name: "Cal.com",
      logo: "/integrations/calcom.svg",
      configured: true,
      needsQuery: false,
      connected: true,
      status: "active",
    },
  ],
  youtube: [
    {
      slug: "youtube",
      name: "YouTube",
      logo: "/integrations/youtube.svg",
      configured: true,
      needsQuery: true,
      connected: true,
      status: null,
    },
  ],
  spotify: [
    {
      slug: "spotify",
      name: "Spotify",
      logo: "/integrations/spotify.svg",
      configured: true,
      needsQuery: true,
      connected: true,
      status: null,
    },
  ],
};

export async function loadSources(
  contentType: string,
): Promise<{ signedIn: boolean; sources: SourceStatusView[] }> {
  if (isIntegrationsMock()) {
    return { signedIn: true, sources: MOCK_SOURCES[contentType] ?? [] };
  }
  return request(
    `/api/integrations/sources?contentType=${encodeURIComponent(contentType)}`,
  );
}

export async function loadSourcePage(
  provider: string,
  options: { cursor?: string; search?: string; query?: string },
): Promise<SourcePage> {
  if (isIntegrationsMock()) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return mockSourcePage(provider, options.search);
  }
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.search) params.set("search", options.search);
  if (options.query) params.set("query", options.query);
  return request(
    `/api/integrations/sources/${encodeURIComponent(provider)}?${params}`,
  );
}

export async function exportToSheet(
  body:
    | { kind: "scans"; codeId: string | null }
    | { kind: "responses"; pageId: string },
): Promise<{ url: string; rows: number; truncated: boolean }> {
  if (isIntegrationsMock()) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return {
      url: "https://docs.google.com/spreadsheets/d/mock",
      rows: 1284,
      truncated: false,
    };
  }
  return request("/api/integrations/google-sheets/export", json(body));
}

export interface SinkViewData {
  sync: SyncState | null;
  settings: Record<string, unknown>;
  pages: ScopedFormPage[];
  workspaceId: string | null;
}

function mockView(provider: string): SinkViewData {
  if (provider === "google-sheets") {
    return {
      sync: mockSyncState({ delivered: 2310, skipped: 0 }),
      settings: {
        lastExport: {
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/mock",
          label: "All codes",
          rowsWritten: 1284,
          createdAt: new Date(Date.now() - 86_400_000).toISOString(),
        },
        syncTarget: {
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/mock",
        },
        syncLabel: "All codes",
      },
      pages: [],
      workspaceId: null,
    };
  }
  return {
    sync:
      provider === "mailchimp"
        ? mockSyncState({
            status: "retrying",
            attempts: 2,
            lastError: "rate limited (HTTP 429)",
            nextAttemptAt: new Date(Date.now() + 4 * 60_000).toISOString(),
            lastSuccessAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
            delivered: 41,
          })
        : mockSyncState(),
    settings:
      provider === "mailchimp"
        ? {
            audienceId: MOCK_AUDIENCES[0]?.id,
            tags: ["qr", "spring-menu"],
            withoutConsent: "pending",
            pageIds: ["page_spring"],
            forms: {},
          }
        : { pageIds: null, forms: {} },
    pages: MOCK_FORM_PAGES,
    workspaceId: null,
  };
}

export async function loadSinkView(provider: string): Promise<SinkViewData> {
  if (isIntegrationsMock()) return mockView(provider);
  return request(`/api/integrations/sync/${provider}`);
}

export async function saveSink(
  provider: string,
  body:
    | { enabled: boolean }
    | {
        enabled: boolean;
        pageIds: string[] | null;
        forms: Record<string, FormMapping>;
        audienceId?: string;
        tags?: string[];
        withoutConsent?: "pending" | "skip";
      },
): Promise<SinkViewData> {
  if (isIntegrationsMock()) {
    const view = mockView(provider);
    return {
      ...view,
      sync: view.sync && {
        ...view.sync,
        enabled: body.enabled,
        status: body.enabled ? "ok" : "paused",
      },
    };
  }
  return request(`/api/integrations/sync/${provider}`, json(body, "PUT"));
}

export async function retrySinkNow(provider: string): Promise<SinkViewData> {
  if (isIntegrationsMock()) {
    return { ...mockView(provider), sync: mockSyncState() };
  }
  const result = await request<{ view: SinkViewData }>(
    `/api/integrations/sync/${provider}`,
    json({ action: "retry" }),
  );
  return result.view;
}

export async function loadMailchimpAudiences(): Promise<MailchimpAudience[]> {
  if (isIntegrationsMock()) return MOCK_AUDIENCES;
  return (
    await request<{ audiences: MailchimpAudience[] }>(
      "/api/integrations/sync/mailchimp/options",
    )
  ).audiences;
}

export async function loadMailchimpMergeFields(
  audienceId: string,
): Promise<MailchimpMergeField[]> {
  if (isIntegrationsMock()) return MOCK_MERGE_FIELDS;
  return (
    await request<{ mergeFields: MailchimpMergeField[] }>(
      `/api/integrations/sync/mailchimp/options?audience=${encodeURIComponent(audienceId)}`,
    )
  ).mergeFields;
}
