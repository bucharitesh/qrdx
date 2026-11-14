// /admin/growth reads the shared, live database: every statement is a
// read-only aggregate, sent in one READ ONLY transaction with a statement
// timeout, and admin accounts and test addresses are left out of every
// count. Tables and columns that packages/database/manual-sql/
// 2026-11-13-growth-analytics.sql adds may not exist yet: those parts say
// "not set up" instead of failing. The database is faked here.

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const batch = vi.fn<(items: unknown[]) => Promise<unknown[]>>();
const admins = vi.hoisted(() => ({
  ids: [] as string[],
  emails: undefined as string | undefined,
}));

vi.mock("@repo/database", () => ({
  database: {
    execute: (query: SQL) => query,
    batch: (items: unknown[]) => batch(items),
  },
}));
vi.mock("@repo/auth/admin", () => ({
  getAdminUserIds: () => admins.ids,
}));
vi.mock("@repo/auth/keys", () => ({
  keys: () => ({ ADMIN_EMAILS: admins.emails }),
}));

const growth = await import("@/app/(app)/admin/_lib/growth");
const { growthWeeks } = await import("@/app/(app)/admin/_lib/weeks");

const dialect = new PgDialect();
const compile = (query: unknown) => dialect.sqlToQuery(query as SQL);
const sqlText = (query: unknown) => compile(query).sql;

const WEEKS = growthWeeks(new Date("2026-11-13T12:00:00Z"));
const START = WEEKS[0] as string;

/** A Postgres error the way the driver and Drizzle wrap it. */
const pgError = (code: string) =>
  Object.assign(new Error("Failed query"), {
    cause: Object.assign(new Error("relation does not exist"), { code }),
  });

/** Rows for each statement after the two SET statements. */
const answer = (...rows: unknown[][]) => [
  { rows: [] },
  { rows: [] },
  ...rows.map((r) => ({ rows: r })),
];

const sentBatches = () =>
  batch.mock.calls.map((call) => (call[0] ?? []).map(sqlText));

beforeEach(() => {
  batch.mockReset();
  admins.ids = [];
  admins.emails = undefined;
});

describe("who counts", () => {
  it("always leaves out the admin role and reserved test addresses", () => {
    const { sql, params } = compile(
      growth.countedUser({ ids: [], emails: [] }),
    );
    expect(sql).toContain(`coalesce(u.role, '') !~ '(^|,) *admin *(,|$)'`);
    expect(sql).toContain(
      String.raw`u.email !~* '(\.(test|example|invalid|localhost)|@example\.(com|net|org))$'`,
    );
    // No empty NOT IN () when no admins are listed in the environment.
    expect(sql).not.toContain("NOT IN");
    expect(params).toEqual([]);
  });

  it("leaves out ADMIN_USER_IDS and ADMIN_EMAILS as parameters", () => {
    const { sql, params } = compile(
      growth.countedUser({
        ids: ["u_1", "u_2"],
        emails: ["owner@qrdx.dev"],
      }),
    );
    expect(sql).toContain("u.id NOT IN ($1, $2)");
    expect(sql).toContain("lower(u.email) NOT IN ($3)");
    expect(params).toEqual(["u_1", "u_2", "owner@qrdx.dev"]);
  });

  it("reads the admin lists from the environment, emails lower-cased", () => {
    admins.ids = ["u_admin"];
    admins.emails = " Owner@QRdx.dev , ,second@example.org";
    expect(growth.adminExclusions()).toEqual({
      ids: ["u_admin"],
      emails: ["owner@qrdx.dev", "second@example.org"],
    });
  });

  it("matches the admin role the way Better Auth lists roles", () => {
    const pattern = /(^|,) *admin *(,|$)/;
    expect(pattern.test("admin")).toBe(true);
    expect(pattern.test("user,admin")).toBe(true);
    expect(pattern.test("admin, user")).toBe(true);
    expect(pattern.test("user")).toBe(false);
    expect(pattern.test("superadmin")).toBe(false);
    expect(pattern.test("administrator")).toBe(false);
  });
});

describe("the statements", () => {
  const counted = growth.countedUser({ ids: ["u_admin"], emails: [] });
  const statements = {
    signupsByChannel: growth.signupsByChannelSql(START, counted),
    signups: growth.signupsSql(START, counted),
    top: growth.topAcquisitionSql("referrer_host", counted),
    activation: growth.activationSql(START, counted),
    codesByVia: growth.codesByViaSql(START, counted),
    codes: growth.codesSql(START, counted),
    scans: growth.scansSql(START, counted),
    codeTotals: growth.codeTotalsSql(counted),
    usageWeekly: growth.usageWeeklySql(START),
    usageTop: growth.usageTopSql(),
    developerAccounts: growth.developerAccountsSql(counted),
    slackInstalls: growth.slackInstallsSql(counted),
  };

  it.each(Object.entries(statements))("%s only reads", (_, statement) => {
    const text = sqlText(statement);
    expect(text.trimStart()).toMatch(/^SELECT\b/);
    expect(text).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|COPY|CALL|DO|LOCK|nextval|setval)\b/i,
    );
    expect(text).not.toContain(";");
  });

  it.each(
    Object.entries(statements).filter(([name]) => !name.startsWith("usage")),
  )("%s leaves out admins", (_, statement) => {
    const { sql, params } = compile(statement);
    expect(sql).toContain("u.id NOT IN");
    expect(params).toContain("u_admin");
  });

  it("passes the first week as a parameter, never in the text", () => {
    const { sql, params } = compile(statements.signupsByChannel);
    expect(sql).not.toContain(START);
    const at = Number(sql.match(/u\.created_at >= \$(\d+)::timestamp/)?.[1]);
    expect(params[at - 1]).toBe(START);
  });

  it("groups by Monday weeks in UTC", () => {
    expect(sqlText(statements.signups)).toContain(
      "to_char(date_trunc('week', u.created_at), 'YYYY-MM-DD') AS week",
    );
    expect(sqlText(statements.usageWeekly)).toContain(
      "date_trunc('week', d.day::timestamp)",
    );
    expect(sqlText(statements.top)).toContain("timezone('utc', now())");
  });

  it("keeps sign-ups without an acquisition row, as unknown", () => {
    const { sql, params } = compile(statements.signupsByChannel);
    expect(sql).toContain("LEFT JOIN user_acquisition a ON a.user_id = u.id");
    expect(sql).toMatch(/coalesce\(a\.channel, \$\d+\) AS key/);
    expect(params).toContain("unknown");
  });

  it("counts a real scan only more than an hour after the code was made", () => {
    for (const statement of [
      statements.activation,
      statements.scans,
      statements.codeTotals,
    ]) {
      expect(sqlText(statement)).toContain(
        "s.scanned_at > c.created_at + interval '1 hour'",
      );
    }
  });

  it("counts a week-2 return 7 to 14 days after sign-up, without impersonation", () => {
    const text = sqlText(statements.activation);
    expect(text).toContain(
      "(se.updated_at >= u.created_at + interval '7 days' AND se.updated_at < u.created_at + interval '14 days')",
    );
    expect(text).toContain("se.impersonated_by IS NULL");
    expect(text).toContain("c.created_at < u.created_at + interval '7 days'");
    expect(text).toContain("p.status IN ('active', 'trialing')");
  });

  it("never reads user data from usage_daily", () => {
    expect(sqlText(statements.usageTop)).not.toMatch(/"user"|user_id/);
    expect(sqlText(statements.usageWeekly)).not.toMatch(/"user"|user_id/);
  });

  it("keeps Slack installs whose installer is gone", () => {
    expect(sqlText(statements.slackInstalls)).toContain(
      "WHERE u.id IS NULL OR (",
    );
  });
});

describe("running them", () => {
  it("sends each batch read-only, with a statement timeout", async () => {
    batch.mockResolvedValue(answer([]));
    await growth.getActivation(WEEKS);
    const [sent] = sentBatches();
    expect(sent?.slice(0, 2)).toEqual([
      "SET TRANSACTION READ ONLY",
      "SET LOCAL statement_timeout = '5s'",
    ]);
    expect(sent).toHaveLength(3);
  });

  it("returns every week, zero-filled, from the cohort rows", async () => {
    batch.mockResolvedValue(
      answer([
        {
          week: "2026-11-02",
          signed_up: "5",
          made_code: 2,
          real_scan: 1,
          returned: 1,
          paid: 1,
        },
      ]),
    );
    const cohorts = await growth.getActivation(WEEKS);
    expect(cohorts).toHaveLength(12);
    expect(cohorts.find((row) => row.week === "2026-11-02")).toEqual({
      week: "2026-11-02",
      signedUp: 5,
      madeCode: 2,
      realScan: 1,
      returned: 1,
      paid: 1,
    });
    expect(cohorts[0]).toMatchObject({ week: START, signedUp: 0 });
  });

  it("falls back to plain sign-ups while user_acquisition doesn't exist", async () => {
    batch
      .mockRejectedValueOnce(pgError("42P01"))
      .mockResolvedValueOnce(
        answer([{ week: "2026-11-09", key: "unknown", count: 3 }]),
      );
    const signups = await growth.getSignups(WEEKS);
    expect(signups.tracking).toBe(false);
    expect(signups.top).toBeNull();
    expect(signups.weekly.total).toBe(3);
    const [tried, fallback] = sentBatches();
    expect(tried?.some((text) => text.includes("user_acquisition"))).toBe(true);
    expect(fallback?.some((text) => text.includes("user_acquisition"))).toBe(
      false,
    );
  });

  it("reads channels and the top values once user_acquisition exists", async () => {
    batch.mockResolvedValueOnce(
      answer(
        [
          { week: "2026-11-09", key: "search", count: 2 },
          { week: "2026-11-09", key: "unknown", count: 1 },
        ],
        [{ value: "www.google.com", count: 2 }],
        [],
        [{ value: "/playground", count: 1 }],
      ),
    );
    const signups = await growth.getSignups(WEEKS);
    expect(signups.tracking).toBe(true);
    expect(signups.weekly.keys).toEqual(["search", "unknown"]);
    expect(signups.top).toEqual({
      referrer_host: [{ value: "www.google.com", count: 2 }],
      utm_source: [],
      landing_path: [{ value: "/playground", count: 1 }],
    });
  });

  it("falls back when qr_code.created_via doesn't exist", async () => {
    batch.mockRejectedValueOnce(pgError("42703")).mockResolvedValueOnce(
      answer(
        [{ week: "2026-11-09", key: "not recorded", count: 1 }],
        [
          {
            week: "2026-11-09",
            scans: 12,
            real_scans: 11,
            codes: 1,
          },
        ],
        [{ codes: 3, really_scanned: 1 }],
      ),
    );
    const result = await growth.getCodesAndScans(WEEKS);
    expect(result.tracking).toBe(false);
    expect(result.codes.total).toBe(1);
    expect(result.scans.at(-1)).toEqual({
      week: "2026-11-09",
      scans: 12,
      realScans: 11,
      codes: 1,
    });
    expect(result.totals).toEqual({ codes: 3, reallyScanned: 1 });
    expect(sentBatches()[1]?.some((text) => text.includes("created_via"))).toBe(
      false,
    );
  });

  it("says usage isn't set up while usage_daily doesn't exist", async () => {
    batch.mockRejectedValueOnce(pgError("42P01"));
    expect(await growth.getDeveloperUsage(WEEKS)).toEqual({ ready: false });
  });

  it("lets every other error through, for the section to report", async () => {
    batch.mockRejectedValueOnce(
      Object.assign(new Error("canceling statement due to statement timeout"), {
        code: "57014",
      }),
    );
    await expect(growth.getDeveloperUsage(WEEKS)).rejects.toThrow(
      "statement timeout",
    );
  });

  it("reads keys and tokens even when the Slack table is missing", async () => {
    batch.mockImplementation(async (items) => {
      const text = (items as unknown[]).map(sqlText).join("\n");
      if (text.includes("slack_bot_installation")) throw pgError("42P01");
      return answer([
        {
          keys_live: 2,
          keys_used: 1,
          key_users: 1,
          tokens_live: 3,
          token_users: 2,
          token_apps: 1,
        },
      ]);
    });
    expect(await growth.getDeveloperAccounts()).toEqual({
      apiKeys: { live: 2, used7d: 1, users7d: 1 },
      oauth: { live: 3, users: 2, apps: 1 },
      slack: null,
    });
  });
});

describe("isNotSetUpError", () => {
  it.each([
    ["missing table", pgError("42P01"), true],
    ["missing column", pgError("42703"), true],
    ["bare code", Object.assign(new Error("x"), { code: "42P01" }), true],
    ["other database error", pgError("57014"), false],
    ["plain error", new Error("network"), false],
    ["nothing", undefined, false],
  ])("%s", (_, error, expected) => {
    expect(growth.isNotSetUpError(error)).toBe(expected);
  });
});
