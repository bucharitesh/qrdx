// The abuse limits (lib/safety/limits.ts): today's values by default, and the
// SAFETY_* variables (env.ts) that let a deployment set its own without
// publishing them. Whole numbers above 0; anything else stops the app at
// start, naming the variable.
import { afterEach, describe, expect, it, vi } from "vitest";

const NAMES = [
  "SAFETY_YOUNG_ACCOUNT_DAYS",
  "SAFETY_YOUNG_ACCOUNT_DYNAMIC_PER_HOUR",
  "SAFETY_RECHECK_BATCH",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A fresh env.ts and limits.ts with only `values` among the SAFETY_* set. */
async function load(values: Partial<Record<(typeof NAMES)[number], string>>) {
  vi.resetModules();
  for (const name of NAMES) {
    vi.stubEnv(name, values[name]);
  }
  const { env } = await import("@/env");
  const { safetyLimits } = await import("@/lib/safety/limits");
  return { env, limits: safetyLimits() };
}

describe("abuse limit defaults", () => {
  it("are 7 days, 30 dynamic codes an hour and 500 per recheck pass", async () => {
    const { SAFETY_LIMIT_DEFAULTS } = await import("@/lib/safety/limits");
    expect(SAFETY_LIMIT_DEFAULTS).toEqual({
      youngAccountDays: 7,
      youngAccountDynamicPerHour: 30,
      recheckBatch: 500,
    });
  });

  it("apply when nothing is set", async () => {
    const { env, limits } = await load({});
    for (const name of NAMES) {
      expect(env[name]).toBeUndefined();
    }
    expect(limits).toEqual({
      youngAccountDays: 7,
      youngAccountDynamicPerHour: 30,
      recheckBatch: 500,
    });
  });

  it("apply when a value is empty", async () => {
    const { limits } = await load({
      SAFETY_YOUNG_ACCOUNT_DAYS: "",
      SAFETY_YOUNG_ACCOUNT_DYNAMIC_PER_HOUR: "",
      SAFETY_RECHECK_BATCH: "",
    });
    expect(limits).toEqual({
      youngAccountDays: 7,
      youngAccountDynamicPerHour: 30,
      recheckBatch: 500,
    });
  });

  it("fill in whatever isn't set", async () => {
    const { safetyLimits } = await import("@/lib/safety/limits");
    expect(safetyLimits({ SAFETY_YOUNG_ACCOUNT_DAYS: "3" })).toEqual({
      youngAccountDays: 3,
      youngAccountDynamicPerHour: 30,
      recheckBatch: 500,
    });
  });
});

describe("SAFETY_* variables", () => {
  it("are read as whole numbers above 0", async () => {
    const { env, limits } = await load({
      SAFETY_YOUNG_ACCOUNT_DAYS: "14",
      SAFETY_YOUNG_ACCOUNT_DYNAMIC_PER_HOUR: "12",
      SAFETY_RECHECK_BATCH: "200",
    });
    // env keeps every value a string, as the rest of the app expects.
    expect(env.SAFETY_YOUNG_ACCOUNT_DAYS).toBe("14");
    expect(env.SAFETY_YOUNG_ACCOUNT_DYNAMIC_PER_HOUR).toBe("12");
    expect(env.SAFETY_RECHECK_BATCH).toBe("200");
    expect(limits).toEqual({
      youngAccountDays: 14,
      youngAccountDynamicPerHour: 12,
      recheckBatch: 200,
    });
  });

  it.each(
    NAMES.flatMap((name) =>
      [
        "0",
        "-3",
        "1.5",
        "07",
        " 7",
        "seven",
        "7 days",
        "1e3",
        "9999999999",
      ].map((value) => [name, value]),
    ),
  )("refuses %s=%s at start and names it", async (name, value) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(load({ [name]: value })).rejects.toThrow(name);
  });
});
