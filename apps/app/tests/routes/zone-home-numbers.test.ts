// /zone/home-numbers.json (app/zone/home-numbers.json/route.ts): whether the
// home page shows "QRdx in numbers", published for QRdx's other deployments
// (the back-office console's numbers page). Static, public and cached, so it
// carries the switch and nothing else.
import {
  HOME_NUMBERS_PATH,
  parseHomeNumbersDocument,
} from "@repo/next-config/home-numbers";
import { afterEach, describe, expect, it, vi } from "vitest";

const FLAG = "QRDX_HOME_NUMBERS";

/** The route, loaded with QRDX_HOME_NUMBERS set to `value` (or unset). */
async function load(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv(FLAG, undefined);
  else vi.stubEnv(FLAG, value);
  return import("@/app/zone/home-numbers.json/route");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe(HOME_NUMBERS_PATH, () => {
  it.each([
    [undefined, false],
    ["0", false],
    ["1", true],
  ])("with %s, says on: %s", async (value, on) => {
    const route = await load(value);
    const response = route.GET();
    const body = await response.json();
    expect(body).toEqual({ version: 1, on });
    expect(parseHomeNumbersDocument(body)).toEqual({ version: 1, on });
  });

  it("is static, cached and never indexed", async () => {
    const route = await load("1");
    expect(route.dynamic).toBe("force-static");
    const response = route.GET();
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("cache-control")).toMatch(/s-maxage=3600/);
  });

  it("names no variable", async () => {
    const text = await (await load("1")).GET().text();
    expect(text).not.toContain(FLAG);
  });

  it("is where the route is", () => {
    expect(HOME_NUMBERS_PATH).toBe("/zone/home-numbers.json");
  });
});

describe("parseHomeNumbersDocument", () => {
  it.each([
    ["an error page", "<html>"],
    ["null", null],
    ["another version", { version: 2, on: true }],
    ["a string switch", { version: 1, on: "1" }],
    ["no switch", { version: 1 }],
  ])("rejects %s", (_name, value) => {
    expect(() => parseHomeNumbersDocument(value)).toThrow(/Home numbers/);
  });

  it("keeps only the switch", () => {
    expect(
      parseHomeNumbersDocument({ version: 1, on: false, extra: "x" }),
    ).toEqual({ version: 1, on: false });
  });
});
