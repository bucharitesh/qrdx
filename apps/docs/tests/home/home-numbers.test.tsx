// "QRdx in numbers" on the home page: off unless QRDX_HOME_NUMBERS=1, and
// even then rendered only from real counts. A failed read, or counts that
// are all zero, render nothing: never zeros or stand-ins. The database
// query itself is tests/lib/home-numbers-query.test.ts.
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeNumberCounts } from "@/lib/home-numbers/stats";

const state = vi.hoisted(() => ({
  sectionImports: 0,
  cacheOptions: null as null | { revalidate?: number; tags?: string[] },
  cachedFn: null as null | (() => Promise<unknown>),
}));

const queryHomeNumberCounts = vi.fn<() => Promise<HomeNumberCounts>>();

vi.mock("@/lib/home-numbers/query", () => ({ queryHomeNumberCounts }));
// Pass-through cache: Next's own cache keeps the last good value when a
// refresh throws; here we check the function throws rather than caching a
// failure, and the timing it's given.
vi.mock("next/cache", () => ({
  unstable_cache: (
    fn: () => Promise<unknown>,
    _keys: string[],
    options: { revalidate?: number; tags?: string[] },
  ) => {
    state.cachedFn = fn;
    state.cacheOptions = options;
    return fn;
  },
}));
vi.mock(
  "@/components/sections/home/numbers/numbers-section",
  async (importOriginal) => {
    state.sectionImports += 1;
    return importOriginal();
  },
);

const { HomeNumbers } = await import(
  "@/components/sections/home/numbers/home-numbers"
);
const { getHomeNumbers, HOME_NUMBERS_REVALIDATE } = await import(
  "@/lib/home-numbers/load"
);
const { buildHomeNumbers } = await import("@/lib/home-numbers/stats");

const FLAG = "QRDX_HOME_NUMBERS";

const COUNTS: HomeNumberCounts = {
  codes: 4_321_000,
  codesSince: "2026-10",
  scans: 512_345,
  scansSince: "2026-10",
  countries: 87,
  accounts: 234,
  accountsSince: "2026-09",
};

const ZERO: HomeNumberCounts = {
  codes: 0,
  codesSince: null,
  scans: 0,
  scansSince: null,
  countries: 0,
  accounts: 0,
  accountsSince: null,
};

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  queryHomeNumberCounts.mockReset();
  vi.unstubAllEnvs();
  vi.stubEnv("QRDX_BUILD_WITHOUT_DATABASE", "");
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errors.mockRestore();
  vi.unstubAllEnvs();
});

describe("the switch", () => {
  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["0", "0"],
    ["true", "true"],
    ["yes", "yes"],
  ])(
    "%s keeps the section off: no query, no import, nothing rendered",
    async (_name, value) => {
      vi.stubEnv(FLAG, value);
      queryHomeNumberCounts.mockResolvedValue(COUNTS);
      expect(await HomeNumbers()).toBeNull();
      expect(queryHomeNumberCounts).not.toHaveBeenCalled();
      expect(state.sectionImports).toBe(0);
    },
  );

  // The bundler can only drop the section (client code included) from the
  // home page when the import sits in a branch the build turns into dead
  // code: an inline comparison of the build-time define, never a call.
  it("is only imported inside the build-time branch of the gate", () => {
    const docs = path.resolve(__dirname, "../..");
    const read = (file: string) => readFileSync(path.join(docs, file), "utf8");
    const gate = read("components/sections/home/numbers/home-numbers.tsx");
    const home = read("app/(home)/page.tsx");
    const config = read("next.config.ts");

    const branch = gate.match(
      /if \(process\.env\.QRDX_HOME_NUMBERS === "1"\) \{([\s\S]*?)\n {2}\}/,
    )?.[1];
    expect(branch).toContain('await import("./numbers-section")');
    expect(gate.split('import("./numbers-section")')).toHaveLength(2);
    expect(gate).not.toMatch(/from\s+["']\.\/numbers-(section|tabs)["']/);
    expect(home).toContain(
      'from "@/components/sections/home/numbers/home-numbers"',
    );
    expect(home).not.toMatch(/numbers-(section|tabs)/);
    // Defined for server code only (never `compiler.define` or `env`).
    expect(config).toMatch(
      /defineServer: \{[^}]*"process\.env\.QRDX_HOME_NUMBERS": process\.env\.QRDX_HOME_NUMBERS \?\? ""/,
    );
    expect(config).not.toMatch(/\benv: \{[^}]*QRDX_HOME_NUMBERS/);
  });

  it("1 shows it, from the real counts", async () => {
    vi.stubEnv(FLAG, "1");
    queryHomeNumberCounts.mockResolvedValue(COUNTS);
    const element = await HomeNumbers();
    expect(element).not.toBeNull();
    expect(state.sectionImports).toBe(1);
    const html = renderToStaticMarkup(element);
    expect(html).toContain("QRdx in numbers");
    expect(html).toContain("Dynamic QR codes created");
    expect(html).toContain("4.3M+");
  });
});

describe("when the counts can't be shown", () => {
  beforeEach(() => vi.stubEnv(FLAG, "1"));

  it("a failed query renders nothing and is logged", async () => {
    queryHomeNumberCounts.mockRejectedValue(
      new Error("canceling statement due to statement timeout"),
    );
    expect(await getHomeNumbers()).toBeNull();
    expect(await HomeNumbers()).toBeNull();
    expect(errors).toHaveBeenCalled();
  });

  it("the cached function throws instead of caching the failure", async () => {
    queryHomeNumberCounts.mockRejectedValue(new Error("database down"));
    await getHomeNumbers();
    await expect(state.cachedFn?.()).rejects.toThrow("database down");
  });

  it("all-zero counts render nothing (never zeros)", async () => {
    queryHomeNumberCounts.mockResolvedValue(ZERO);
    expect(await getHomeNumbers()).toBeNull();
    expect(await HomeNumbers()).toBeNull();
  });

  it("a zero count is left out, the rest still show", async () => {
    queryHomeNumberCounts.mockResolvedValue({ ...COUNTS, countries: 0 });
    const numbers = await getHomeNumbers();
    expect(numbers?.items.map((item) => item.id)).toEqual([
      "codes",
      "scans",
      "accounts",
    ]);
  });

  it("a build without a database skips the query", async () => {
    vi.stubEnv("QRDX_BUILD_WITHOUT_DATABASE", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await HomeNumbers()).toBeNull();
    expect(queryHomeNumberCounts).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("caching", () => {
  it("reads the database at most every 12 hours, by timer", async () => {
    vi.stubEnv(FLAG, "1");
    queryHomeNumberCounts.mockResolvedValue(COUNTS);
    await getHomeNumbers();
    expect(HOME_NUMBERS_REVALIDATE).toBe(12 * 60 * 60);
    expect(state.cacheOptions?.revalidate).toBe(HOME_NUMBERS_REVALIDATE);
    expect(HOME_NUMBERS_REVALIDATE).toBeGreaterThanOrEqual(6 * 60 * 60);
  });
});

describe("the section", () => {
  const numbers = buildHomeNumbers(COUNTS, "2026-11-10T00:00:00.000Z");
  if (!numbers) throw new Error("expected numbers");

  async function render() {
    vi.stubEnv(FLAG, "1");
    queryHomeNumberCounts.mockResolvedValue(COUNTS);
    return renderToStaticMarkup(await HomeNumbers());
  }

  it("labels say exactly what is counted, with the window", () => {
    expect(
      numbers.items.map(({ label, count, since }) => [
        label,
        count.text,
        since,
      ]),
    ).toEqual([
      ["Dynamic QR codes created", "4.3M+", "Since Oct 2026"],
      ["Scans of dynamic QR codes", "510K+", "Since Oct 2026"],
      ["Countries with scans", "87", "Since Oct 2026"],
      ["Accounts created", "230+", "Since Sep 2026"],
    ]);
  });

  it("is a vertical tab list with one selected tab and its panel", async () => {
    const html = await render();
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-labelledby="home-numbers-heading"');
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/aria-selected="false"/g)).toHaveLength(3);
    expect(html.match(/tabindex="0"/g)?.length).toBe(2); // the tab + panel
    expect(html.match(/tabindex="-1"/g)).toHaveLength(3);
    const firstTab = html.match(/id="([^"]+)" type="button" role="tab"/)?.[1];
    expect(html).toContain(`role="tabpanel" aria-labelledby="${firstTab}"`);
  });

  it("gives screen readers the final values, never in-between ones", async () => {
    const html = await render();
    for (const item of numbers.items) {
      expect(html).toContain(
        `<span class="sr-only">${item.count.spoken}</span>`,
      );
    }
    // Server HTML (and no-JS visitors) show the final text, not a count-up.
    expect(html).not.toMatch(/>0(\.0)?[KM]?\+?</);
    // Digits that animate are hidden from assistive tech.
    expect(html).toMatch(
      /aria-hidden="true" class="col-start-1 row-start-1">4\.3M\+</,
    );
  });

  it("shows no pause control until the browser allows motion", async () => {
    const html = await render();
    expect(html).not.toContain("Pause the numbers");
  });
});
