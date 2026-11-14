// Scan analytics ranges (lib/scan-ranges.ts): which range a plan may read
// ("All time" only where the plan keeps the whole history), how many days
// it covers (from the first scan, else creation) and how its series is
// bucketed (per day up to 3 years, then per week or month).
import { describe, expect, it } from "vitest";
import {
  formatBucket,
  formatBucketSpan,
} from "@/app/(app)/dashboard/codes/_components/format";
import { PLAN_LIMITS } from "@/lib/plans";
import {
  ALL_TIME_RANGE,
  DAILY_SERIES_MAX_DAYS,
  daysSince,
  fillSeries,
  rangeStart,
  resolveScanRange,
  SCAN_RANGE_KEYS,
  SCAN_RANGES,
  scanRangeDays,
  scanRangeLabel,
  seriesDates,
  seriesInterval,
  WEEKLY_SERIES_MAX_DAYS,
} from "@/lib/scan-ranges";

const NOW = new Date("2026-11-01T12:00:00Z");
const FREE = PLAN_LIMITS.free.analyticsRetentionDays;
const PRO = PLAN_LIMITS.pro.analyticsRetentionDays;
const BUSINESS = PLAN_LIMITS.business.analyticsRetentionDays;

describe("resolveScanRange", () => {
  it("offers All time last, after every fixed range", () => {
    expect(SCAN_RANGE_KEYS).toEqual([
      "7d",
      "30d",
      "90d",
      "365d",
      "1095d",
      "all",
    ]);
    expect(SCAN_RANGES.all).toBe(Number.POSITIVE_INFINITY);
    expect(scanRangeLabel("all")).toBe("All time");
    expect(scanRangeLabel("1095d")).toBe("3 years");
  });

  it("gives All time to plans that keep the whole history", () => {
    expect(resolveScanRange("all", PRO)).toBe(ALL_TIME_RANGE);
    expect(resolveScanRange("all", BUSINESS)).toBe(ALL_TIME_RANGE);
  });

  it("keeps Free to its 1-year history: All time falls back to 30 days", () => {
    expect(FREE).toBe(365);
    expect(resolveScanRange("all", FREE)).toBe("30d");
    expect(resolveScanRange("1095d", FREE)).toBe("30d");
    expect(resolveScanRange("365d", FREE)).toBe("365d");
  });

  it("keeps old links working and ignores anything else", () => {
    for (const key of ["7d", "30d", "90d", "365d", "1095d"] as const) {
      expect(resolveScanRange(key, PRO), key).toBe(key);
    }
    for (const value of [undefined, "", "10y", "ALL", ["all"], "toString"]) {
      expect(resolveScanRange(value, PRO), String(value)).toBe("30d");
    }
  });
});

describe("scanRangeDays", () => {
  it("is the fixed length for fixed ranges, whatever the history", () => {
    expect(scanRangeDays("90d", new Date("2020-01-01T00:00:00Z"), NOW)).toBe(
      90,
    );
    expect(scanRangeDays("7d", null, NOW)).toBe(7);
  });

  it("counts All time from the day of the first scan, today included", () => {
    const first = new Date("2022-08-17T22:30:00Z");
    const days = scanRangeDays("all", first, NOW);
    expect(days).toBe(1538);
    // The range then starts at midnight UTC of that day.
    expect(rangeStart(days, NOW).toISOString()).toBe(
      "2022-08-17T00:00:00.000Z",
    );
  });

  it("is today alone for a code made (or first scanned) today", () => {
    expect(scanRangeDays("all", new Date("2026-11-01T00:00:00Z"), NOW)).toBe(1);
    expect(scanRangeDays("all", null, NOW)).toBe(1);
    // A clock that ran ahead never makes an empty or negative range.
    expect(daysSince(new Date("2026-11-05T00:00:00Z"), NOW)).toBe(1);
    expect(daysSince(new Date(Number.NaN), NOW)).toBe(1);
  });

  it("works in UTC days, as every range does", () => {
    // 23:59 UTC on Oct 31 is Oct 31's day, even where it is already Nov 1.
    expect(daysSince(new Date("2026-10-31T23:59:59Z"), NOW)).toBe(2);
    expect(daysSince(new Date("2026-11-01T00:00:00Z"), NOW)).toBe(1);
  });
});

describe("series buckets", () => {
  it("keeps every fixed range daily, as before", () => {
    for (const key of SCAN_RANGE_KEYS) {
      const days = SCAN_RANGES[key];
      if (Number.isFinite(days)) expect(seriesInterval(days), key).toBe("day");
    }
  });

  it("goes weekly after 3 years and monthly after 10", () => {
    expect(DAILY_SERIES_MAX_DAYS).toBe(3 * 365);
    expect(WEEKLY_SERIES_MAX_DAYS).toBe(10 * 365);
    expect(seriesInterval(1)).toBe("day");
    expect(seriesInterval(DAILY_SERIES_MAX_DAYS)).toBe("day");
    expect(seriesInterval(DAILY_SERIES_MAX_DAYS + 1)).toBe("week");
    expect(seriesInterval(WEEKLY_SERIES_MAX_DAYS)).toBe("week");
    expect(seriesInterval(WEEKLY_SERIES_MAX_DAYS + 1)).toBe("month");
  });

  it("lists one date per day", () => {
    const from = new Date("2026-10-30T00:00:00Z");
    expect(seriesDates(from, 3, "day")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });

  it("starts weeks on Monday, like Postgres date_trunc('week')", () => {
    // Wednesday Aug 17, 2022 → the week of Monday Aug 15.
    const from = new Date("2022-08-17T00:00:00Z");
    const dates = seriesDates(from, 1538, "week");
    expect(dates[0]).toBe("2022-08-15");
    expect(dates[1]).toBe("2022-08-22");
    // The last week holds today (Sunday Nov 1, 2026: the week of Oct 26).
    expect(dates.at(-1)).toBe("2026-10-26");
    expect(dates).toHaveLength(220);
    for (const date of dates) {
      expect(new Date(`${date}T00:00:00Z`).getUTCDay(), date).toBe(1);
    }
  });

  it("lists calendar months, the first one holding `from`", () => {
    const from = new Date("2016-10-31T00:00:00Z");
    const dates = seriesDates(from, 3654, "month");
    expect(dates[0]).toBe("2016-10-01");
    expect(dates[1]).toBe("2016-11-01");
    expect(dates.at(-1)).toBe("2026-11-01");
    expect(dates).toHaveLength(122);
  });

  it("fills empty buckets with 0 and keeps the counts of the rest", () => {
    const from = new Date("2026-10-12T00:00:00Z");
    expect(
      fillSeries(
        [
          { day: "2026-10-12", count: 4 },
          { day: "2026-10-26", count: 2 },
        ],
        from,
        21,
        "week",
      ),
    ).toEqual([
      { date: "2026-10-12", count: 4 },
      { date: "2026-10-19", count: 0 },
      { date: "2026-10-26", count: 2 },
    ]);
  });

  it("never draws more points than the 3-year range does", () => {
    for (const years of [1, 3, 4, 9, 10, 25]) {
      const days = years * 365 + 3;
      const from = rangeStart(days, NOW);
      const points = seriesDates(from, days, seriesInterval(days)).length;
      expect(points, `${years} years`).toBeLessThanOrEqual(
        DAILY_SERIES_MAX_DAYS,
      );
    }
  });
});

describe("chart labels", () => {
  it("dates days, and gives weeks and months their year", () => {
    expect(formatBucket("2026-10-26")).toBe("Oct 26");
    expect(formatBucket("2026-10-26", "week")).toBe("Oct 2026");
    expect(formatBucket("2026-10-01", "month")).toBe("Oct 2026");
    expect(formatBucketSpan("2026-10-26", "day")).toBe("Oct 26");
    expect(formatBucketSpan("2026-10-26", "week")).toBe("Oct 26 – Nov 1, 2026");
    expect(formatBucketSpan("2026-10-01", "month")).toBe("Oct 2026");
  });
});
