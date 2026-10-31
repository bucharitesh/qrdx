import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IntegrationApiError } from "../src/core/http-client";
import { createOAuthHandler } from "../src/core/oauth";
import { HUBSPOT_TARGETS } from "../src/integrations/hubspot/sink";
import {
  getIntegrationConfigWithEnv,
  registerAllIntegrations,
} from "../src/registry/loader";
import {
  mappedValues,
  normalizeEmail,
  splitName,
  suggestConsentField,
  suggestMapping,
} from "../src/sinks/mapping";
import {
  dedupeLatest,
  describeSyncError,
  initialSyncState,
  isSyncDue,
  nextSyncState,
  readSyncState,
  resumeSyncState,
  SYNC_MAX_ATTEMPTS,
  syncRetryDelayMs,
} from "../src/sinks/state";
import { json, mockFetch } from "./helpers";

const NOW = new Date("2026-11-01T10:00:00.000Z");
const fixed = () => 0.5; // no jitter

const apiError = (code: IntegrationApiError["code"], status: number) =>
  new IntegrationApiError({
    provider: "hubspot",
    status,
    code,
    message: "Contact ada@example.com rejected",
  });

describe("sync state (same backoff as webhooks)", () => {
  it("retries after 1, 4, 16 minutes … capped at 24 hours", () => {
    expect(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => syncRetryDelayMs(n, fixed) / 60_000)
    ).toEqual([1, 4, 16, 64, 256, 1024, 1440, 1440]);
  });

  it("starts at 'now' so only new items are sent", () => {
    const state = initialSyncState("org_1", NOW);
    expect(state.cursor).toEqual({ at: NOW.toISOString(), id: "" });
    expect(state).toMatchObject({
      enabled: true,
      organizationId: "org_1",
      status: "idle",
      attempts: 0,
    });
  });

  it("success advances the cursor and resets failures", () => {
    const failing = {
      ...initialSyncState(null, NOW),
      attempts: 3,
      status: "retrying" as const,
      lastError: "x",
    };
    const next = nextSyncState(
      failing,
      {
        ok: true,
        result: {
          delivered: 5,
          skipped: 1,
          cursor: { at: "2026-11-01T10:01:00.000Z", id: "r9" },
        },
      },
      NOW
    );
    expect(next).toMatchObject({
      status: "ok",
      attempts: 0,
      lastError: null,
      delivered: 5,
      skipped: 1,
      cursor: { id: "r9" },
      leaseUntil: null,
    });
  });

  it("an empty batch keeps the cursor", () => {
    const state = initialSyncState(null, NOW);
    const next = nextSyncState(
      state,
      { ok: true, result: { delivered: 0, skipped: 0, cursor: null } },
      NOW
    );
    expect(next.cursor).toEqual(state.cursor);
  });

  it("429 / 5xx / network retry with backoff; the cursor never moves on failure", () => {
    const state = initialSyncState(null, NOW);
    for (const error of [
      apiError("rate_limited", 429),
      apiError("server", 503),
      apiError("network", 0),
    ]) {
      const next = nextSyncState(state, { ok: false, error }, NOW, fixed);
      expect(next.status).toBe("retrying");
      expect(next.cursor).toEqual(state.cursor);
      expect(next.nextAttemptAt).toBe(
        new Date(NOW.getTime() + 60_000).toISOString()
      );
    }
  });

  it("401/403 stop at once; the 8th failure stops for good", () => {
    const state = initialSyncState(null, NOW);
    expect(
      nextSyncState(
        state,
        { ok: false, error: apiError("unauthorized", 401) },
        NOW
      ).status
    ).toBe("failed");
    expect(
      nextSyncState(
        state,
        { ok: false, error: apiError("forbidden", 403) },
        NOW
      ).status
    ).toBe("failed");
    const last = { ...state, attempts: SYNC_MAX_ATTEMPTS - 1 };
    const stopped = nextSyncState(
      last,
      { ok: false, error: apiError("server", 500) },
      NOW
    );
    expect(stopped).toMatchObject({
      status: "failed",
      attempts: SYNC_MAX_ATTEMPTS,
      nextAttemptAt: null,
    });
  });

  it("errors are described without personal data", () => {
    const text = describeSyncError(apiError("bad_request", 400));
    expect(text).toBe("the request was rejected (HTTP 400)");
    expect(text).not.toContain("ada@");
    expect(describeSyncError(new Error("token=abc"))).toBe("unexpected error");
  });

  it("is due unless off, failed, leased or waiting for its retry time", () => {
    const state = initialSyncState(null, NOW);
    expect(isSyncDue(state, NOW)).toBe(true);
    expect(isSyncDue({ ...state, enabled: false }, NOW)).toBe(false);
    expect(isSyncDue({ ...state, status: "failed" }, NOW)).toBe(false);
    expect(
      isSyncDue({ ...state, leaseUntil: "2026-11-01T10:04:00.000Z" }, NOW)
    ).toBe(false);
    expect(
      isSyncDue({ ...state, leaseUntil: "2026-11-01T09:00:00.000Z" }, NOW)
    ).toBe(true);
    expect(
      isSyncDue({ ...state, nextAttemptAt: "2026-11-01T10:01:00.000Z" }, NOW)
    ).toBe(false);
  });

  it("'Retry now' clears the failure and keeps the cursor", () => {
    const failed = {
      ...initialSyncState(null, NOW),
      status: "failed" as const,
      attempts: 8,
      lastError: "x",
    };
    expect(resumeSyncState(failed)).toMatchObject({
      status: "idle",
      attempts: 0,
      lastError: null,
      cursor: failed.cursor,
    });
  });

  it("reads stored JSON defensively", () => {
    expect(readSyncState(null)).toBeNull();
    expect(readSyncState({ enabled: "yes" })).toBeNull();
    expect(
      readSyncState({ enabled: true, status: "bogus", delivered: "7" })
    ).toMatchObject({ status: "idle", delivered: 0, cursor: null });
  });

  it("dedupe keeps the latest item per key, in order", () => {
    expect(
      dedupeLatest(
        [
          { k: "a", v: 1 },
          { k: "b", v: 2 },
          { k: "a", v: 3 },
        ],
        (x) => x.k
      )
    ).toEqual([
      { k: "b", v: 2 },
      { k: "a", v: 3 },
    ]);
  });
});

describe("field mapping", () => {
  it("suggests email, phone and names; leaves unknown questions out", () => {
    const fields = [
      { id: "1", label: "Full name", type: "text" },
      { id: "2", label: "E-mail", type: "email" },
      { id: "3", label: "Mobile", type: "phone" },
      { id: "4", label: "Favourite dish", type: "text" },
      { id: "5", label: "Rate us", type: "stars" },
      { id: "6", label: "Keep me posted", type: "consent" },
    ];
    expect(suggestMapping(fields, HUBSPOT_TARGETS)).toEqual({
      "1": "__fullname",
      "2": "email",
      "3": "phone",
      "4": "",
      "5": "",
      "6": "",
    });
    expect(suggestConsentField(fields)).toBe("6");
  });

  it("emails are normalized; full names split; empty answers dropped", () => {
    expect(normalizeEmail(" ADA@Example.COM ")).toBe("ada@example.com");
    expect(normalizeEmail("not-an-email")).toBeNull();
    expect(splitName("  Grace   Brewster Hopper ")).toEqual({
      first: "Grace",
      last: "Brewster Hopper",
    });
    const values = mappedValues(
      {
        id: "r",
        createdAt: NOW.toISOString(),
        pageId: "p",
        pageTitle: null,
        formId: "f",
        codeSlug: null,
        answers: [
          {
            id: "n",
            label: "Name",
            type: "text",
            value: "Grace Hopper",
            text: "Grace Hopper",
          },
          {
            id: "e",
            label: "Email",
            type: "email",
            value: "g@navy.mil",
            text: "g@navy.mil",
          },
          { id: "c", label: "Company", type: "text", value: "", text: "  " },
        ],
      },
      { fields: { n: "__fullname", e: "email", c: "company" } },
      { first: "firstname", last: "lastname" }
    );
    expect(values).toEqual({
      email: "g@navy.mil",
      values: { firstname: "Grace", lastname: "Hopper" },
    });
  });
});

describe("OAuth: auth URLs, minimal scopes, token refresh", () => {
  const ENV = {
    GOOGLE_CLIENT_ID: "g-id",
    GOOGLE_CLIENT_SECRET: "g-secret",
    CALENDLY_CLIENT_ID: "cal-id",
    CALENDLY_CLIENT_SECRET: "cal-secret",
    SLACK_CLIENT_ID: "sl-id",
    SLACK_CLIENT_SECRET: "sl-secret",
    HUBSPOT_CLIENT_ID: "hs-id",
    HUBSPOT_CLIENT_SECRET: "hs-secret",
    MAILCHIMP_CLIENT_ID: "mc-id",
    MAILCHIMP_CLIENT_SECRET: "mc-secret",
  };
  const config = (slug: string) => getIntegrationConfigWithEnv(slug, ENV);
  const authUrl = (slug: string) =>
    new URL(
      createOAuthHandler(config(slug)).generateAuthUrl("verifier", "state-1")
    );

  beforeAll(() => registerAllIntegrations());
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
  });

  it("Google Sheets: its own callback, spreadsheets + drive.file, PKCE, offline", () => {
    const url = authUrl("google-sheets");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/integrations/google-sheets/callback"
    );
    expect(url.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file"
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("state-1");
  });

  it("Calendly: read-only scopes with PKCE", () => {
    const url = authUrl("calendly");
    expect(url.searchParams.get("scope")).toBe("users:read event_types:read");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
  });

  it("Slack: incoming-webhook only; HubSpot: contacts write; Mailchimp: no scope", () => {
    expect(authUrl("slack").searchParams.get("scope")).toBe("incoming-webhook");
    expect(authUrl("hubspot").searchParams.get("scope")).toBe(
      "oauth crm.objects.contacts.write"
    );
    expect(authUrl("mailchimp").searchParams.has("scope")).toBe(false);
  });

  it("missing credentials mean 'not configured', never a crash", () => {
    expect(() => getIntegrationConfigWithEnv("hubspot", {})).toThrow(
      /HUBSPOT_CLIENT_ID/
    );
    // Key-only and link-only providers need no app credentials.
    expect(getIntegrationConfigWithEnv("stripe", {}).clientId).toBe("");
    expect(getIntegrationConfigWithEnv("youtube", {}).clientId).toBe("");
  });

  it("Calendly refresh authenticates with HTTP Basic (rotating refresh tokens)", async () => {
    const { calls } = mockFetch(
      json({
        access_token: "new",
        refresh_token: "rotated",
        expires_in: 7200,
        token_type: "Bearer",
      })
    );
    const tokens = await createOAuthHandler(
      config("calendly")
    ).refreshAccessToken("old-refresh");
    expect(calls[0]?.url).toBe("https://auth.calendly.com/oauth/token");
    expect(calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("cal-id:cal-secret").toString("base64")}`
    );
    const body = Object.fromEntries(new URLSearchParams(calls[0]?.body));
    expect(body).toEqual({
      grant_type: "refresh_token",
      refresh_token: "old-refresh",
    });
    expect(tokens.refresh_token).toBe("rotated");
  });

  it("HubSpot refresh posts client credentials to the dated token endpoint", async () => {
    const { calls } = mockFetch(
      json({
        access_token: "a",
        refresh_token: "r",
        expires_in: 1800,
        token_type: "bearer",
      })
    );
    await createOAuthHandler(config("hubspot")).refreshAccessToken(
      "hs-refresh"
    );
    expect(calls[0]?.url).toBe("https://api.hubapi.com/oauth/2026-09/token");
    expect(
      Object.fromEntries(new URLSearchParams(calls[0]?.body))
    ).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "hs-refresh",
      client_id: "hs-id",
      client_secret: "hs-secret",
    });
  });

  it("Google refresh failure surfaces as an error (the row is then marked)", async () => {
    mockFetch(json({ error: "invalid_grant" }, 400));
    await expect(
      createOAuthHandler(config("google-sheets")).refreshAccessToken("r")
    ).rejects.toThrow(/Token refresh failed: 400/);
  });
});
