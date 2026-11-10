// The query behind "QRdx in numbers" runs against the shared, live
// database: one statement of aggregates, in a READ ONLY transaction with a
// statement timeout, and nothing that writes. Results that aren't counts
// throw, so they can never reach the page.

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const batch = vi.fn<(items: unknown[]) => Promise<unknown[]>>();

vi.mock("@repo/database", () => ({
  database: {
    execute: (query: SQL) => query,
    batch: (items: unknown[]) => batch(items),
  },
}));

const {
  HOME_NUMBERS_DEADLINE_MS,
  HOME_NUMBERS_SQL,
  HOME_NUMBERS_STATEMENTS,
  parseHomeNumberCounts,
  queryHomeNumberCounts,
} = await import("@/lib/home-numbers/query");

const dialect = new PgDialect();
const sqlText = (query: unknown) => dialect.sqlToQuery(query as SQL).sql;

const ROW = {
  codes: "4321000",
  codes_since: "2026-10",
  scans: "512345",
  scans_since: "2026-10",
  countries: "87",
  accounts: "234",
  accounts_since: "2026-09",
};

beforeEach(() => {
  batch.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the statements sent", () => {
  it("are read-only, time-limited and in one transaction", async () => {
    batch.mockResolvedValue([{ rows: [] }, { rows: [] }, { rows: [ROW] }]);
    await queryHomeNumberCounts();
    expect(batch).toHaveBeenCalledTimes(1);
    const sent = (batch.mock.calls[0]?.[0] ?? []).map(sqlText);
    expect(sent).toEqual([
      "SET TRANSACTION READ ONLY",
      "SET LOCAL statement_timeout = '3s'",
      HOME_NUMBERS_SQL,
    ]);
    expect(sent).toEqual([...HOME_NUMBERS_STATEMENTS]);
  });

  it("only read: one SELECT, no writes or DDL", () => {
    expect(HOME_NUMBERS_SQL.trimStart()).toMatch(/^WITH\b/);
    expect(HOME_NUMBERS_SQL).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|ANALYZE|LOCK|REFRESH|nextval|setval|pg_advisory\w*)\b/i,
    );
    expect(HOME_NUMBERS_SQL).not.toContain(";");
  });

  it("never counts qr_scan rows for the scan total (scan_count is the rollup)", () => {
    expect(HOME_NUMBERS_SQL).toContain("sum(c.scan_count)");
    expect(HOME_NUMBERS_SQL).not.toMatch(/count\(\*\)\s+FROM\s+qr_scan/i);
    // Countries: one GROUP BY pass, no per-code join or DISTINCT sort.
    expect(HOME_NUMBERS_SQL).toMatch(
      /SELECT country\s+FROM qr_scan\s+WHERE[^)]*GROUP BY country/,
    );
    expect(HOME_NUMBERS_SQL).not.toMatch(/count\(DISTINCT/i);
  });

  it("leaves out test accounts, banned and unverified ones, and switched-off codes", () => {
    expect(HOME_NUMBERS_SQL).toContain("WHERE email_verified");
    expect(HOME_NUMBERS_SQL).toContain("banned IS NOT TRUE");
    expect(HOME_NUMBERS_SQL).toContain("WHERE c.is_active");
    const reserved =
      /(\.(test|example|invalid|localhost)|@example\.(com|net|org))$/i;
    expect(HOME_NUMBERS_SQL).toContain(reserved.source);
    for (const email of [
      "admin@qrdx.test",
      "e2e-new@qrdx.test",
      "a@example.com",
      "b@mail.example",
    ]) {
      expect(reserved.test(email)).toBe(true);
    }
    for (const email of ["someone@gmail.com", "x@testing.io", "y@qrdx.dev"]) {
      expect(reserved.test(email)).toBe(false);
    }
  });
});

describe("the result", () => {
  it("parses counts and months", async () => {
    batch.mockResolvedValue([{ rows: [] }, { rows: [] }, { rows: [ROW] }]);
    expect(await queryHomeNumberCounts()).toEqual({
      codes: 4_321_000,
      codesSince: "2026-10",
      scans: 512_345,
      scansSince: "2026-10",
      countries: 87,
      accounts: 234,
      accountsSince: "2026-09",
    });
  });

  it("allows no months yet (empty tables)", () => {
    expect(
      parseHomeNumberCounts({
        ...ROW,
        codes: "0",
        codes_since: null,
        scans: "0",
        scans_since: null,
        countries: "0",
      }).codesSince,
    ).toBeNull();
  });

  it.each([
    ["no row", undefined],
    ["a negative count", { ...ROW, scans: "-1" }],
    ["a fraction", { ...ROW, accounts: "1.5" }],
    ["text", { ...ROW, codes: "lots" }],
    ["a missing count", { ...ROW, countries: undefined }],
    ["a bad month", { ...ROW, codes_since: "Oct 2026" }],
  ])("throws on %s", (_name, row) => {
    expect(() => parseHomeNumberCounts(row)).toThrow(TypeError);
  });

  it("passes a database error on", async () => {
    batch.mockRejectedValue(
      new Error("canceling statement due to statement timeout"),
    );
    await expect(queryHomeNumberCounts()).rejects.toThrow("statement timeout");
  });

  it("gives up when the database doesn't answer", async () => {
    vi.useFakeTimers();
    batch.mockReturnValue(new Promise(() => {}));
    const pending = queryHomeNumberCounts();
    const check = expect(pending).rejects.toThrow("no answer");
    await vi.advanceTimersByTimeAsync(HOME_NUMBERS_DEADLINE_MS);
    await check;
  });
});
