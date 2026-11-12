// /admin/growth groups everything by UTC week starting on Monday, the way
// Postgres' date_trunc('week') does, so the page's weeks and the database's
// weeks must line up exactly. Pure; no database.
import { describe, expect, it } from "vitest";
import {
  growthWeeks,
  pivotWeeks,
  utcWeekStart,
  weekOfDay,
  windowClosed,
} from "@/app/(app)/admin/_lib/weeks";

describe("utcWeekStart", () => {
  it.each([
    ["2026-11-09T00:00:00Z", "2026-11-09"], // Monday, midnight
    ["2026-11-13T15:30:00Z", "2026-11-09"], // Friday
    ["2026-11-15T23:59:59Z", "2026-11-09"], // Sunday, last second
    ["2026-11-16T00:00:00Z", "2026-11-16"], // next Monday
    ["2026-01-01T12:00:00Z", "2025-12-29"], // across a year
  ])("%s is in the week of %s", (at, monday) => {
    expect(utcWeekStart(new Date(at)).toISOString()).toBe(
      `${monday}T00:00:00.000Z`,
    );
  });

  it("doesn't change the date it's given", () => {
    const date = new Date("2026-11-13T15:30:00Z");
    utcWeekStart(date);
    expect(date.toISOString()).toBe("2026-11-13T15:30:00.000Z");
  });
});

describe("growthWeeks", () => {
  it("is 12 Mondays, oldest first, ending with the current week", () => {
    const weeks = growthWeeks(new Date("2026-11-13T15:30:00Z"));
    expect(weeks).toHaveLength(12);
    expect(weeks[0]).toBe("2026-08-24");
    expect(weeks.at(-1)).toBe("2026-11-09");
    for (const week of weeks) {
      expect(new Date(`${week}T00:00:00Z`).getUTCDay()).toBe(1);
    }
    expect(new Set(weeks).size).toBe(12);
  });

  it("takes another count", () => {
    expect(growthWeeks(new Date("2026-11-16T00:00:00Z"), 2)).toEqual([
      "2026-11-09",
      "2026-11-16",
    ]);
  });
});

describe("weekOfDay", () => {
  it.each([
    ["2026-11-09", "2026-11-09"],
    ["2026-11-15", "2026-11-09"],
    ["2026-11-16", "2026-11-16"],
  ])("%s → %s", (day, week) => {
    expect(weekOfDay(day)).toBe(week);
  });
});

describe("windowClosed", () => {
  // The cohort of the week of Nov 2 signed up until Sunday Nov 8, 23:59.
  it("waits for the cohort's last sign-up to have had the whole window", () => {
    expect(
      windowClosed("2026-11-02", 7, new Date("2026-11-15T23:59:59Z")),
    ).toBe(false);
    expect(
      windowClosed("2026-11-02", 7, new Date("2026-11-16T00:00:00Z")),
    ).toBe(true);
    expect(
      windowClosed("2026-11-02", 14, new Date("2026-11-22T12:00:00Z")),
    ).toBe(false);
    expect(
      windowClosed("2026-11-02", 14, new Date("2026-11-23T00:00:00Z")),
    ).toBe(true);
  });
});

describe("pivotWeeks", () => {
  const weeks = ["2026-10-26", "2026-11-02", "2026-11-09"];

  it("zero-fills every week and orders keys by total, then name", () => {
    const pivot = pivotWeeks(weeks, [
      { week: "2026-11-02", key: "search", count: 2 },
      { week: "2026-11-09", key: "direct", count: 1 },
      { week: "2026-11-09", key: "search", count: 1 },
      { week: "2026-10-26", key: "ai_assistant", count: 1 },
    ]);
    expect(pivot.keys).toEqual(["search", "ai_assistant", "direct"]);
    expect(pivot.rows.map((row) => row.week)).toEqual(weeks);
    expect(pivot.rows[0]).toEqual({
      week: "2026-10-26",
      values: { search: 0, ai_assistant: 1, direct: 0 },
      total: 1,
    });
    expect(pivot.rows[2]?.total).toBe(2);
    expect(pivot.totals).toEqual({ search: 3, ai_assistant: 1, direct: 1 });
    expect(pivot.total).toBe(5);
  });

  it("puts the catch-all keys last, whatever their size", () => {
    const pivot = pivotWeeks(
      weeks,
      [
        { week: "2026-11-02", key: "unknown", count: 9 },
        { week: "2026-11-02", key: "search", count: 1 },
      ],
      ["unknown"],
    );
    expect(pivot.keys).toEqual(["search", "unknown"]);
  });

  it("ignores rows outside the weeks and adds up repeated ones", () => {
    const pivot = pivotWeeks(weeks, [
      { week: "2026-10-19", key: "search", count: 4 },
      { week: "2026-11-09", key: "search", count: 1 },
      { week: "2026-11-09", key: "search", count: 2 },
    ]);
    expect(pivot.totals).toEqual({ search: 3 });
    expect(pivot.rows[2]?.values.search).toBe(3);
  });

  it("is all zeros with no rows", () => {
    const pivot = pivotWeeks(weeks, []);
    expect(pivot.keys).toEqual([]);
    expect(pivot.rows.map((row) => row.total)).toEqual([0, 0, 0]);
    expect(pivot.total).toBe(0);
  });
});
