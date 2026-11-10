// When the frame picker shows each holiday's and season's frames first
// (lib/frames/occasions.ts).
import { OFFICIAL_FRAMES } from "qrdx";
import { describe, expect, it } from "vitest";
import {
  easterSunday,
  hemisphereOf,
  OCCASIONS,
  upcomingOccasions,
} from "@/lib/frames/occasions";

const ids = (date: Date, hemisphere: "north" | "south" = "north") =>
  upcomingOccasions(date, hemisphere).map((occasion) => occasion.id);

describe("occasions", () => {
  it("has a calendar entry for every seasonal official frame", () => {
    for (const frame of OFFICIAL_FRAMES) {
      if (frame.category !== "seasonal") continue;
      expect(OCCASIONS[frame.occasion ?? ""], frame.id).toBeDefined();
    }
  });

  it("knows the dates of every occasion from 2026 to 2030", () => {
    for (const [id, occasion] of Object.entries(OCCASIONS)) {
      for (let year = 2026; year <= 2030; year++) {
        for (const hemisphere of ["north", "south"] as const) {
          const window = occasion.window(year, hemisphere);
          expect(window, `${id} ${year}`).not.toBeNull();
          if (window) {
            expect(window.end.getTime(), id).toBeGreaterThanOrEqual(
              window.start.getTime(),
            );
          }
        }
      }
    }
  });

  it("finds Easter Sunday", () => {
    const iso = (date: Date) =>
      `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    expect(iso(easterSunday(2024))).toBe("2024-3-31");
    expect(iso(easterSunday(2026))).toBe("2026-4-5");
    expect(iso(easterSunday(2027))).toBe("2027-3-28");
    expect(iso(easterSunday(2030))).toBe("2030-4-21");
  });

  it("puts what's on now and coming up first, soonest first", () => {
    const november = ids(new Date(2026, 10, 11));
    expect(november).toEqual(
      expect.arrayContaining([
        "diwali",
        "thanksgiving",
        "black-friday",
        "cyber-monday",
        "hanukkah",
        "autumn",
      ]),
    );
    expect(november).not.toContain("easter");
    expect(november).not.toContain("summer");
    // Christmas shows 40 days ahead: from November 14
    expect(november).not.toContain("christmas");
    expect(ids(new Date(2026, 10, 14))).toContain("christmas");
    expect(november.indexOf("diwali")).toBeLessThan(
      november.indexOf("thanksgiving"),
    );
    // Ended: Halloween is gone in November
    expect(november).not.toContain("halloween");
  });

  it("follows a year's turn and the lunar calendar", () => {
    expect(ids(new Date(2026, 11, 31))).toEqual(
      expect.arrayContaining(["new-year", "winter"]),
    );
    expect(ids(new Date(2027, 0, 20))).toContain("lunar-new-year");
    expect(ids(new Date(2027, 2, 5))).toEqual(
      expect.arrayContaining(["ramadan", "eid-al-fitr", "holi"]),
    );
  });

  it("turns the seasons round in the southern hemisphere", () => {
    expect(ids(new Date(2026, 10, 11), "south")).toContain("spring");
    expect(ids(new Date(2026, 10, 11), "south")).not.toContain("autumn");
    expect(ids(new Date(2027, 0, 20), "south")).toEqual(
      expect.arrayContaining(["summer", "back-to-school"]),
    );
    expect(hemisphereOf("Australia/Sydney")).toBe("south");
    expect(hemisphereOf("America/Sao_Paulo")).toBe("south");
    expect(hemisphereOf("Africa/Johannesburg")).toBe("south");
    expect(hemisphereOf("Europe/London")).toBe("north");
    expect(hemisphereOf("Asia/Kolkata")).toBe("north");
    expect(hemisphereOf(undefined)).toBe("north");
  });
});
