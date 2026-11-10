// "QRdx in numbers" shows counts compactly and always rounds them DOWN,
// so nothing on the home page is ever overstated (lib/home-numbers/format.ts).
import { describe, expect, it } from "vitest";
import {
  compactCount,
  countUpText,
  floorToTwoDigits,
} from "@/lib/home-numbers/format";

describe("compactCount", () => {
  it.each([
    [0, "0", "0"],
    [7, "7", "7"],
    [87, "87", "87"],
    [99, "99", "99"],
    [100, "100", "100"],
    [200, "200", "200"],
    [234, "230+", "more than 230"],
    [999, "990+", "more than 990"],
    [1_000, "1K", "1 thousand"],
    [1_050, "1K+", "more than 1 thousand"],
    [1_234, "1.2K+", "more than 1.2 thousand"],
    [12_999, "12K+", "more than 12 thousand"],
    [500_000, "500K", "500 thousand"],
    [512_345, "510K+", "more than 510 thousand"],
    [999_999, "990K+", "more than 990 thousand"],
    [1_000_000, "1M", "1 million"],
    [4_000_000, "4M", "4 million"],
    [4_321_000, "4.3M+", "more than 4.3 million"],
    [4_399_999, "4.3M+", "more than 4.3 million"],
    [98_700_000, "98M+", "more than 98 million"],
    [2_500_000_000, "2.5B", "2.5 billion"],
  ])("%i → %s", (count, text, spoken) => {
    const result = compactCount(count);
    expect(result.text).toBe(text);
    expect(result.spoken).toBe(spoken);
  });

  it("never shows more than the real count", () => {
    for (let count = 0; count < 200_000; count += 7) {
      const { value, plus } = compactCount(count);
      expect(value).toBeLessThanOrEqual(count);
      expect(plus).toBe(value < count);
    }
    for (const count of [
      1_999_999, 9_999_999, 10_500_001, 123_456_789, 999_999_999,
    ]) {
      expect(compactCount(count).value).toBeLessThanOrEqual(count);
    }
  });

  it("keeps two significant digits", () => {
    expect(floorToTwoDigits(4_321_000)).toBe(4_300_000);
    expect(floorToTwoDigits(1_999)).toBe(1_900);
    expect(floorToTwoDigits(42)).toBe(42);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "refuses %s, so a bad result is never shown",
    (bad) => {
      expect(() => compactCount(bad)).toThrow(RangeError);
    },
  );
});

describe("countUpText", () => {
  it("ends exactly on the final text", () => {
    for (const count of [7, 234, 1_234, 4_321_000, 500_000]) {
      const compact = compactCount(count);
      expect(countUpText(compact, 1)).toBe(compact.text);
      expect(countUpText(compact, 1.2)).toBe(compact.text);
    }
  });

  it("keeps the unit, decimals and plus while counting", () => {
    const compact = compactCount(4_321_000);
    expect(countUpText(compact, 0)).toBe("0.0M+");
    expect(countUpText(compact, 0.5)).toBe("2.1M+");
    expect(countUpText(compact, -1)).toBe("0.0M+");
    expect(countUpText(compactCount(500_000), 0.5)).toBe("250K");
    expect(countUpText(compactCount(87), 0.5)).toBe("43");
  });

  it("is never wider than the final text", () => {
    for (const count of [9, 87, 234, 999, 1_234, 99_999, 4_321_000]) {
      const compact = compactCount(count);
      for (let step = 0; step <= 20; step += 1) {
        expect(countUpText(compact, step / 20).length).toBeLessThanOrEqual(
          compact.text.length,
        );
      }
    }
  });
});
