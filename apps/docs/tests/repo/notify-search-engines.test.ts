// scripts/notify-search-engines.mjs, which tells IndexNow and Bing about
// changed pages after a deploy (.github/workflows/notify-search-engines.yml).
// Only the pure parts run here; nothing is sent anywhere.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  changedUrls,
  IMPORTANT_PATHS,
  INDEXNOW_KEY,
  inSitemap,
  main,
  normalizeUrl,
  parseSitemap,
  pickBingSite,
} from "../../../../scripts/notify-search-engines.mjs";

const APP = join(import.meta.dirname, "../..");
const REPO = join(APP, "../..");

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
<url>
<loc>https://qrdx.dev</loc>
<xhtml:link rel="alternate" hreflang="en" href="https://qrdx.dev" />
<changefreq>monthly</changefreq>
</url>
<url>
<loc>https://qrdx.dev/pricing</loc>
<lastmod>2026-11-10T10:00:00.000Z</lastmod>
</url>
<url>
<loc>https://qrdx.dev/docs/a?x=1&amp;y=2</loc>
<lastmod>2026-11-01T00:00:00.000Z</lastmod>
</url>
</urlset>`;

describe("IndexNow key", () => {
  it("is served from public/<key>.txt with the same key", () => {
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/);
    const file = join(APP, "public", `${INDEXNOW_KEY}.txt`);
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8").trim()).toBe(INDEXNOW_KEY);
  });

  it("has no Bing verification file or tag next to it", () => {
    // The owner verifies Bing by DNS.
    expect(existsSync(join(APP, "public", "BingSiteAuth.xml"))).toBe(false);
    const layouts = ["lib/root-metadata.ts", "lib/metadata.ts"].map((file) =>
      readFileSync(join(APP, file), "utf8"),
    );
    for (const text of layouts) expect(text).not.toContain("msvalidate");
  });
});

describe("parseSitemap", () => {
  it("reads each URL and its lastmod, decoding entities", () => {
    expect(parseSitemap(SITEMAP)).toEqual([
      { url: "https://qrdx.dev", lastmod: undefined },
      { url: "https://qrdx.dev/pricing", lastmod: "2026-11-10T10:00:00.000Z" },
      {
        url: "https://qrdx.dev/docs/a?x=1&y=2",
        lastmod: "2026-11-01T00:00:00.000Z",
      },
    ]);
  });
});

describe("changedUrls", () => {
  const before = parseSitemap(SITEMAP);

  it("finds new URLs and new lastmods, and nothing else", () => {
    const after = [
      ...before.slice(0, 1),
      { url: "https://qrdx.dev/pricing", lastmod: "2026-11-13T09:00:00.000Z" },
      before[2],
      { url: "https://qrdx.dev/qr-code-api", lastmod: undefined },
    ];
    expect(changedUrls(before, after)).toEqual([
      "https://qrdx.dev/pricing",
      "https://qrdx.dev/qr-code-api",
    ]);
    expect(changedUrls(before, before)).toEqual([]);
  });
});

describe("inSitemap", () => {
  const live = parseSitemap(SITEMAP).map((entry) => entry.url);

  it("keeps paths and URLs in the sitemap, as the sitemap writes them", () => {
    const { kept, dropped } = inSitemap(
      ["/", "/pricing/", "https://qrdx.dev/pricing", "/nope", "", "::"],
      live,
    );
    expect(kept).toEqual(["https://qrdx.dev", "https://qrdx.dev/pricing"]);
    expect(dropped).toEqual(["/nope", "::"]);
  });

  it("leaves out important pages that don't exist yet", () => {
    expect(inSitemap(IMPORTANT_PATHS, live).kept).toEqual([
      "https://qrdx.dev",
      "https://qrdx.dev/pricing",
    ]);
  });
});

describe("normalizeUrl", () => {
  it("compares URLs with or without a trailing slash", () => {
    expect(normalizeUrl("https://qrdx.dev")).toBe("https://qrdx.dev/");
    expect(normalizeUrl("https://qrdx.dev/a/")).toBe("https://qrdx.dev/a");
  });
});

describe("pickBingSite", () => {
  it("uses the verified site's URL exactly as Bing has it", () => {
    expect(
      pickBingSite([
        { Url: "https://example.com/", IsVerified: true },
        { Url: "http://qrdx.dev/", IsVerified: true },
        { Url: "https://qrdx.dev/", IsVerified: true },
      ]),
    ).toBe("https://qrdx.dev/");
  });

  it("finds nothing for an unverified or missing site", () => {
    expect(
      pickBingSite([{ Url: "https://qrdx.dev/", IsVerified: false }]),
    ).toBeUndefined();
    expect(pickBingSite([])).toBeUndefined();
    expect(pickBingSite(undefined)).toBeUndefined();
  });
});

describe("arguments", () => {
  it("wants exactly one mode", async () => {
    expect(await main([])).toBe(2);
    expect(await main(["--all", "--check"])).toBe(2);
    expect(await main(["--nope"])).toBe(2);
  });
});

describe("workflow", () => {
  const workflow = readFileSync(
    join(REPO, ".github/workflows/notify-search-engines.yml"),
    "utf8",
  );

  it("never fails main, and checks the setup on pull requests", () => {
    expect(workflow).toContain("continue-on-error: true");
    expect(workflow).toContain("--check");
    expect(workflow).toContain("scripts/notify-search-engines.mjs");
  });

  it("passes the Bing key only through the environment", () => {
    expect(workflow).toMatch(
      /BING_WEBMASTER_API_KEY: \$\{\{ secrets\.BING_WEBMASTER_API_KEY \}\}/,
    );
    expect(workflow).not.toMatch(/run:.*secrets\./);
  });
});
