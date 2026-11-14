// Pages that moved (lib/moved-pages.ts) answer a permanent redirect from
// next.config.ts, on QRdx's own hosts only: a custom domain's short link with
// the same path is never taken over. Flam's story moved from the blog to
// /customers/flam after it had been live there.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CUSTOMERS, customerStoryHref } from "@/lib/customers";
import { MOVED_PAGES } from "@/lib/moved-pages";

// Next's own copy of the matcher it applies to next.config.ts (no types).
const { pathToRegexp } = createRequire(import.meta.url)(
  "next/dist/compiled/path-to-regexp",
) as {
  pathToRegexp: (
    source: string,
    keys: unknown[],
    options: { strict: boolean },
  ) => RegExp;
};
const matches = (source: string, value: string) =>
  pathToRegexp(source, [], { strict: true }).test(value);

const APP = join(import.meta.dirname, "../..");

interface Redirect {
  source: string;
  destination: string;
  permanent?: boolean;
  has?: { type: string; value?: string }[];
}

describe("next.config.ts redirects for moved pages", () => {
  const saved = { ...process.env };
  let rules: Redirect[];

  beforeAll(async () => {
    vi.resetModules();
    // As in tests/lib/csp.test.ts: createMDX() rewrites .source/*.ts in the
    // background, which raced other suites. Redirects don't need MDX.
    vi.doMock("fumadocs-mdx/next", () => ({
      createMDX: () => (config: unknown) => config,
    }));
    const config = (await import("@/next.config")).default;
    rules = ((await config.redirects?.()) ?? []) as Redirect[];
  }, 60_000);

  afterAll(() => {
    process.env = saved;
  });

  /** The rule Next applies first to `path` on `host`. */
  const firstRule = (host: string, path: string) =>
    rules.find(
      (rule) =>
        matches(rule.source, path) &&
        (rule.has ?? []).every(
          (condition) =>
            condition.type === "host" &&
            new RegExp(`^${condition.value}$`).test(host),
        ),
    );

  it("sends /blog/flam-branded-qr-codes to /customers/flam with a 308", () => {
    const rule = firstRule("qrdx.dev", "/blog/flam-branded-qr-codes");
    expect(rule).toMatchObject({
      source: "/blog/flam-branded-qr-codes",
      destination: "/customers/flam",
      permanent: true,
    });
  });

  it.each(MOVED_PAGES)("serves $source on QRdx's own hosts only", (page) => {
    const rule = rules.find((r) => r.source === page.source);
    const host = rule?.has?.find((condition) => condition.type === "host");
    expect(host?.value).toBeDefined();
    const hosts = new RegExp(`^${host?.value}$`);
    for (const own of ["qrdx.dev", "www.qrdx.dev", "localhost"]) {
      expect(hosts.test(own), own).toBe(true);
    }
    expect(hosts.test("go.example.com")).toBe(false);
    // On a custom domain the path is left to its short links.
    expect(firstRule("go.example.com", page.source)).toBeUndefined();
  });

  it("matches the old path exactly, never a neighbor", () => {
    const [rule] = MOVED_PAGES;
    for (const other of [
      "/blog/flam-branded-qr-codes/extra",
      "/blog/flam-branded-qr-codes-2",
      "/blog",
    ]) {
      expect(matches(rule?.source ?? "", other), other).toBe(false);
    }
  });
});

describe("moved pages", () => {
  it("leave nothing behind at the old URL", () => {
    for (const page of MOVED_PAGES) {
      const blog = /^\/blog\/([^/]+)$/.exec(page.source)?.[1];
      if (blog) {
        expect(existsSync(join(APP, "content/blog", `${blog}.mdx`))).toBe(
          false,
        );
      }
    }
  });

  it("land on a published customer story when they go to /customers", () => {
    const stories = CUSTOMERS.filter((c) => c.published).map(customerStoryHref);
    for (const page of MOVED_PAGES) {
      if (page.destination.startsWith("/customers/")) {
        expect(stories).toContain(page.destination);
      }
    }
  });
});
