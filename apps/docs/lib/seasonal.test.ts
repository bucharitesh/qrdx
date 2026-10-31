// Run: cd apps/docs && npx tsx --test lib/seasonal.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getActiveSeason,
  hasSnow,
  parseSeasonOverride,
  resolveSeason,
  ringInYear,
} from "./seasonal";

const at = (day: string) => new Date(`${day}T12:00:00Z`);

describe("season windows (inclusive, UTC)", () => {
  const cases: [string, string | null][] = [
    ["2026-10-19", null],
    ["2026-10-20", "halloween"],
    ["2026-11-02", "halloween"],
    ["2026-11-03", null],
    ["2026-11-30", null],
    ["2026-12-01", "winter"],
    ["2026-12-17", "winter"],
    ["2026-12-18", "christmas"],
    ["2026-12-26", "christmas"],
    ["2026-12-27", "new-year"],
    ["2026-12-31", "new-year"],
    ["2027-01-01", "new-year"],
    ["2027-01-02", "new-year"],
    ["2027-01-03", "winter"],
    ["2027-02-28", "winter"],
    ["2027-03-01", null],
    ["2028-02-29", null],
  ];
  for (const [day, season] of cases) {
    it(`${day} → ${season}`, () => {
      assert.equal(getActiveSeason(at(day)), season);
    });
  }

  it("uses UTC days", () => {
    assert.equal(getActiveSeason(new Date("2026-12-17T23:59:59Z")), "winter");
    assert.equal(
      getActiveSeason(new Date("2026-12-18T00:00:00Z")),
      "christmas",
    );
  });
});

describe("overrides", () => {
  it("accepts every season id and off", () => {
    for (const id of ["halloween", "christmas", "new-year", "winter", "off"]) {
      assert.equal(parseSeasonOverride(id), id);
    }
    assert.equal(parseSeasonOverride("diwali"), undefined);
    assert.equal(parseSeasonOverride(["christmas", "off"]), "christmas");
  });

  it("resolves the query override before the date", () => {
    assert.equal(
      resolveSeason({ season: "new-year" }, at("2026-07-01")),
      "new-year",
    );
    assert.equal(resolveSeason({ season: "off" }, at("2026-12-20")), null);
    assert.equal(resolveSeason({}, at("2026-12-20")), "christmas");
  });
});

describe("helpers", () => {
  it("snows in winter and the festivals inside it", () => {
    assert.deepEqual(
      [null, "halloween", "winter", "christmas", "new-year"].map((s) =>
        hasSnow(s as Parameters<typeof hasSnow>[0]),
      ),
      [false, false, true, true, true],
    );
  });

  it("rings in next year in December and this year in January", () => {
    assert.equal(ringInYear(new Date(2026, 11, 30)), 2027);
    assert.equal(ringInYear(new Date(2027, 0, 1)), 2027);
  });
});
