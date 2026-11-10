// The season bar's pre-paint script (components/seasonal/pre-paint-script.ts)
// is a fixed string: nothing is built into it at runtime. Its query
// parameter and storage key must stay SEASON_PARAM and
// SEASON_OVERRIDE_STORAGE_KEY, so this runs the script against a fake page
// with each one and checks that "off" hides the bar.
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { SEASON_BAR_PRE_PAINT_SCRIPT } from "@/components/seasonal/pre-paint-script";
import { SEASON_OVERRIDE_STORAGE_KEY, SEASON_PARAM } from "@/lib/seasonal";

/** The bar's data-season-bar attribute after the script runs, or null. */
function run({
  search = "",
  stored = {},
}: {
  search?: string;
  stored?: Record<string, string>;
}): string | null {
  const attributes: Record<string, string> = {};
  vm.runInNewContext(SEASON_BAR_PRE_PAINT_SCRIPT, {
    URLSearchParams,
    location: { search },
    sessionStorage: { getItem: (key: string) => stored[key] ?? null },
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          attributes[name] = value;
        },
      },
    },
  });
  return attributes["data-season-bar"] ?? null;
}

describe("season bar pre-paint script", () => {
  it(`reads ?${SEASON_PARAM}=off`, () => {
    expect(run({ search: `?${SEASON_PARAM}=off` })).toBe("off");
    expect(run({ search: `?${SEASON_PARAM}=halloween` })).toBeNull();
    expect(run({ search: "?other=off" })).toBeNull();
  });

  it(`reads the ${SEASON_OVERRIDE_STORAGE_KEY} session override`, () => {
    expect(run({ stored: { [SEASON_OVERRIDE_STORAGE_KEY]: "off" } })).toBe(
      "off",
    );
    expect(run({ stored: { "some-other-key": "off" } })).toBeNull();
  });

  it("does nothing on a plain page load", () => {
    expect(run({})).toBeNull();
  });

  it("names both as JSON string literals, so they match exactly", () => {
    expect(SEASON_BAR_PRE_PAINT_SCRIPT).toContain(
      `.get(${JSON.stringify(SEASON_PARAM)})`,
    );
    expect(SEASON_BAR_PRE_PAINT_SCRIPT).toContain(
      `.getItem(${JSON.stringify(SEASON_OVERRIDE_STORAGE_KEY)})`,
    );
  });
});
