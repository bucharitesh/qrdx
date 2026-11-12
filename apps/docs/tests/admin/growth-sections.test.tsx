// What /admin/growth shows: each section rendered from a fake database and
// faked npm and Google answers. Until the growth SQL is applied, the parts
// that need its tables say "not set up" and the rest still shows; Search
// Console explains its setup when the key isn't there. Nothing goes out.

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: {} as { GSC_SERVICE_ACCOUNT_JSON?: string },
  /** Tables and columns the fake database doesn't have */
  missing: [] as string[],
  /** Any statement matching this fails as a timeout */
  failing: null as RegExp | null,
}));

const dialect = new PgDialect();
const sqlText = (query: unknown) => dialect.sqlToQuery(query as SQL).sql;

const NOW = new Date("2026-11-13T12:00:00Z");

/** Rows the fake database answers for each statement, by what it reads. */
function rowsFor(text: string): unknown[] {
  if (text.includes("LEFT JOIN user_acquisition")) {
    return [
      { week: "2026-11-02", key: "search", count: 3 },
      { week: "2026-11-09", key: "unknown", count: 1 },
    ];
  }
  if (text.includes("a.referrer_host AS value")) {
    return [{ value: "www.google.com", count: 3 }];
  }
  if (text.includes("FROM user_acquisition")) return [];
  if (text.includes("AS signed_up")) {
    return [
      {
        week: "2026-11-02",
        signed_up: 4,
        made_code: 2,
        real_scan: 1,
        returned: 1,
        paid: 0,
      },
      {
        week: "2026-11-09",
        signed_up: 2,
        made_code: 1,
        real_scan: 0,
        returned: 0,
        paid: 0,
      },
    ];
  }
  if (text.includes('FROM "user" u') && text.includes("GROUP BY 1")) {
    return [{ week: "2026-11-09", key: "unknown", count: 6 }];
  }
  if (text.includes("c.created_via")) {
    return [{ week: "2026-11-09", key: "api", count: 2 }];
  }
  if (text.includes("AS real_scans")) {
    return [{ week: "2026-11-09", scans: 12, real_scans: 11, codes: 1 }];
  }
  if (text.includes("really_scanned")) return [{ codes: 3, really_scanned: 1 }];
  if (text.includes("FROM qr_code c")) {
    return [{ week: "2026-11-09", key: "not recorded", count: 2 }];
  }
  if (text.includes("d.channel || ' · '")) {
    return [{ week: "2026-11-09", key: "mcp · tool_call", count: 5 }];
  }
  if (text.includes("FROM usage_daily")) {
    return [
      { channel: "mcp", metric: "tool_call", key: "design_qr", count: 5 },
    ];
  }
  if (text.includes("keys_live")) {
    return [
      {
        keys_live: 1,
        keys_used: 1,
        key_users: 1,
        tokens_live: 0,
        token_users: 0,
        token_apps: 0,
      },
    ];
  }
  if (text.includes("slack_bot_installation")) {
    return [{ installs: 2, recent: 1 }];
  }
  return [];
}

vi.mock("@repo/database", () => ({
  database: {
    execute: (query: SQL) => query,
    batch: async (items: unknown[]) => {
      const texts = items.map(sqlText);
      for (const text of texts) {
        if (state.failing?.test(text)) {
          throw Object.assign(new Error("canceling statement"), {
            code: "57014",
          });
        }
        const gone = state.missing.find((name) => text.includes(name));
        if (gone) {
          throw Object.assign(new Error("Failed query"), {
            cause: Object.assign(new Error(`${gone} does not exist`), {
              code: gone.includes(".") ? "42703" : "42P01",
            }),
          });
        }
      }
      return texts.map((text) =>
        text.startsWith("SET ") ? { rows: [] } : { rows: rowsFor(text) },
      );
    },
  },
}));
vi.mock("@repo/auth/admin", () => ({ getAdminUserIds: () => ["u_admin"] }));
vi.mock("@repo/auth/keys", () => ({ keys: () => ({}) }));
vi.mock("@/lib/env", () => ({ env: state.env }));

const sections = await import("@/app/(app)/admin/growth/sections");
const { growthWeeks } = await import("@/app/(app)/admin/_lib/weeks");
const { GROWTH_SQL_FILE } = await import("@/app/(app)/admin/_lib/growth");

const weeks = growthWeeks(NOW);
const html = async (section: Promise<ReactElement>) =>
  renderToStaticMarkup(await section)
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'");
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => {
  state.missing = [];
  state.failing = null;
  state.env.GSC_SERVICE_ACCOUNT_JSON = undefined;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("before the growth SQL is applied", () => {
  beforeEach(() => {
    state.missing = ["user_acquisition", "c.created_via", "usage_daily"];
  });

  it("still shows sign-ups per week and says channels aren't recorded", async () => {
    const shown = text(await html(sections.Signups({ weeks })));
    expect(shown).toContain(
      `Channels aren't recorded. Not set up yet: it starts once ${GROWTH_SQL_FILE} is applied.`,
    );
    expect(shown).toContain("Sign-ups");
    expect(shown).toMatch(/Nov 9 · so far 6/);
    expect(shown).toContain("12 weeks 6");
    expect(shown).not.toContain("Referring sites");
  });

  it("still shows codes and scans", async () => {
    const shown = text(await html(sections.CodesAndScans({ weeks })));
    expect(shown).toContain("Where a code was made isn't recorded.");
    expect(shown).toContain("Dynamic codes, all time 3");
    expect(shown).toContain("Of them with a real scan 1");
    expect(shown).toContain("12 (11 real)");
  });

  it("says API, MCP and bot calls aren't counted", async () => {
    const shown = text(await html(sections.DeveloperUsage({ weeks })));
    expect(shown).toContain("API, MCP and bot calls aren't counted.");
  });

  it("shows keys, tokens and Slack installs, which don't need it", async () => {
    const shown = text(await html(sections.DeveloperAccounts()));
    expect(shown).toContain("API keys used, 7 days 1 (1 accounts)");
    expect(shown).toContain("Slack workspaces 2 (1 in 28 days)");
  });
});

describe("once it's applied", () => {
  it("shows sign-ups by channel, unknown last, and the top values", async () => {
    const markup = await html(sections.Signups({ weeks }));
    const shown = text(markup);
    expect(shown).not.toContain("Not set up");
    expect(markup.indexOf(">search<")).toBeLessThan(
      markup.indexOf(">unknown<"),
    );
    expect(shown).toContain(
      "Referring sites, 28 days www.google.com 3 sign-ups",
    );
    expect(shown).toContain("Landing pages, 28 days None yet.");
  });

  it("shows codes by where they were made", async () => {
    const shown = text(await html(sections.CodesAndScans({ weeks })));
    expect(shown).not.toContain("isn't recorded");
    expect(shown).toContain("api");
  });

  it("shows usage per week and the busiest tools", async () => {
    const shown = text(await html(sections.DeveloperUsage({ weeks })));
    expect(shown).toContain("mcp · tool_call");
    expect(shown).toContain("mcp · tool_call · design_qr 5");
  });
});

describe("activation", () => {
  it("shows counts with their share, greying windows still open", async () => {
    const markup = await html(sections.Activation({ weeks, now: NOW }));
    const shown = text(markup);
    // The week of Nov 2 has had 7 days by Nov 13 for some, not all, of it.
    expect(shown).toMatch(/Nov 2 4 2 · 50% 1 · 25% 1 · 25% 0 · 0%/);
    expect(markup).toContain('title="Window still open"');
    // Totals: 6 signed up, 3 made a code.
    expect(shown).toMatch(/12 weeks 6 3 · 50% 1 · 17% 1 · 17% 0 · 0%/);
  });
});

describe("a section whose query fails", () => {
  it("shows a notice instead of numbers", async () => {
    state.failing = /AS signed_up/;
    const shown = text(await html(sections.Activation({ weeks, now: NOW })));
    expect(shown).toContain("Couldn't load this section.");
  });
});

describe("npm downloads", () => {
  it("shows each package without and with its publish days", async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("n8n")) return json({ error: "not found" }, 404);
      if (url.startsWith("https://registry.npmjs.org/")) {
        return json({ time: { "0.0.48": "2026-11-10T22:38:18.986Z" } });
      }
      return json({
        downloads: [
          { day: "2026-11-09", downloads: 66 },
          { day: "2026-11-10", downloads: 416 },
        ],
      });
    });
    const shown = text(await html(sections.NpmDownloads({ weeks, now: NOW })));
    expect(shown).toContain("qrdx 66 in 28 days without publish days");
    expect(shown).toContain("482 with publish days (published 2026-11-10)");
    expect(shown).toContain("@qrdx/n8n-nodes-qrdx Not on npm");
    expect(shown).toMatch(/Nov 9 · so far 66 \(482\) 66 \(482\)/);
  });
});

describe("search console", () => {
  it("explains the setup without the key", async () => {
    const shown = text(await html(sections.SearchConsole({ weeks, now: NOW })));
    expect(shown).toContain("Not set up.");
    expect(shown).toContain("GSC_SERVICE_ACCOUNT_JSON");
    expect(shown).toContain("sc-domain:qrdx.dev");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says when the variable isn't a key", async () => {
    state.env.GSC_SERVICE_ACCOUNT_JSON = "not json";
    const shown = text(await html(sections.SearchConsole({ weeks, now: NOW })));
    expect(shown).toContain("isn't a service account's JSON key");
    expect(shown).not.toContain("not json");
  });
});
