// Public smoke test of qrdx.dev against the running dev server, signed out
// and driven over the Chrome DevTools Protocol (no Playwright):
//
//   routes  every internal link on the home page (rendered in Chrome, so
//           client-side links count), every URL in /sitemap.xml and every
//           link on a sample of pages returns 200 or an expected redirect;
//           one page per route template loads in Chrome without console
//           errors or exceptions
//   seo     robots.txt, sitemap.xml, llms.txt, llms-full.txt, docs markdown,
//           RSS, Open Graph images and web app manifests
//   image   GET /api/v1/qr returns scannable SVG and PNG and a valid EPS, and
//           named 400s for bad parameters (also through api.qrdx.dev)
//   mcp     the MCP endpoint initializes over POST, lists and calls its
//           tools, sends browsers to /mcp and answers CORS preflights
//   legal   the legal pages render, unknown paths are 404s (never 500s)
//
//   pnpm --filter docs test:e2e:site           (E2E_BASE_URL defaults to :3000)
//   E2E_SUITES=image,mcp pnpm --filter docs test:e2e:site
//
// Skips (exit 0) when no server is running or Chrome isn't installed. It
// never signs in and never writes data. The dev server compiles each route on
// its first hit, so the first run is slow; later runs take a few minutes.
import { readdirSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "../../../packages/qrdx/src/utils/png";
import {
  createImage,
  decodeQR,
  type RasterImage,
  rasterizeSvg,
} from "../../../packages/qrdx/tests/support/raster";
import { xmlProblems } from "../../../packages/qrdx/tests/support/xml";
import { findChrome, launch, serverIsUp } from "./cdp.mjs";

const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const BASE = new URL(BASE_URL);
const APP_DIR = fileURLToPath(new URL("../", import.meta.url));
const HTTP_CONCURRENCY = 4;
// First hits compile the route in dev, which can take a while.
const HTTP_TIMEOUT_MS = 180_000;

/**
 * Real bugs this suite has found, not yet fixed. A matching failure is
 * reported as a known bug instead of failing the run; once the bug is fixed
 * the check passes and the entry should be removed.
 */
/** Failures that are known and tracked; they're reported as "~", not "✗". */
const KNOWN_BUGS: { area: string; name: RegExp; note: string }[] = [];

// ── Results ────────────────────────────────────────────────────────────────

type Result = {
  area: string;
  name: string;
  ok: boolean;
  known?: string;
  detail?: string;
};
const results: Result[] = [];

function record(area: string, name: string, ok: boolean, detail?: string) {
  const known = ok
    ? undefined
    : KNOWN_BUGS.find((bug) => bug.area === area && bug.name.test(name))?.note;
  results.push({ area, name, ok, known, detail });
  const mark = ok ? "  ✓" : known ? "  ~" : "  ✗";
  const suffix = known ? ` — known bug: ${known}` : "";
  console.log(
    `${mark} ${area} › ${name}${detail ? ` — ${detail}` : ""}${suffix}`,
  );
}

const message = (error: unknown) =>
  String(error instanceof Error ? error.message : error);

/** Runs `check`; a thrown error is a failed check. */
async function check(
  area: string,
  name: string,
  fn: () => Promise<[boolean, string?]> | [boolean, string?],
) {
  try {
    const [ok, detail] = await fn();
    record(area, name, ok, detail);
  } catch (error) {
    record(area, name, false, message(error));
  }
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

const url = (path: string) => new URL(path, `${BASE_URL}/`).toString();

function get(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url(path), {
    redirect: "manual",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    ...init,
  });
}

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

/**
 * A request with an explicit Host header (fetch always sends the URL's own
 * host), to reach the api.qrdx.dev and mcp.qrdx.dev routing locally.
 */
function requestWithHost(
  path: string,
  host: string,
  {
    method = "GET",
    headers = {},
    body,
  }: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: BASE.hostname,
        port: BASE.port || 80,
        path,
        method,
        headers: { ...headers, host },
        timeout: HTTP_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timed out")));
    if (body) req.write(body);
    req.end();
  });
}

/** Maps `fn` over `items`, `limit` at a time, keeping order. */
async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await fn(items[index] as T);
      }
    }),
  );
  return out;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const isPng = (bytes: Uint8Array) =>
  PNG_SIGNATURE.every((value, index) => bytes[index] === value);

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (!isPng(bytes) || bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Decodes the QR code in a PNG placed on white paper with a quiet zone. */
async function decodePngQr(bytes: Uint8Array): Promise<string | null> {
  const image = await decodePng(bytes);
  if (!image) return null;
  const pad = Math.round(image.width / 8);
  const paper: RasterImage = createImage(
    image.width + 2 * pad,
    image.height + 2 * pad,
  );
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const from = (y * image.width + x) * 4;
      const to = ((y + pad) * paper.width + x + pad) * 4;
      const alpha = (image.data[from + 3] as number) / 255;
      for (let c = 0; c < 3; c++) {
        paper.data[to + c] =
          (image.data[from + c] as number) * alpha + 255 * (1 - alpha);
      }
    }
  }
  return decodeQR(paper);
}

const decodeSvgQr = (svg: string) =>
  decodeQR(rasterizeSvg(svg, { width: 360, pad: 24 }));

// ── routes ─────────────────────────────────────────────────────────────────

/** Redirects a signed-out visitor is expected to get; anything else fails. */
const EXPECTED_REDIRECTS: {
  from: RegExp;
  to: RegExp;
  status: number[];
  why: string;
}[] = [
  {
    from: /^\/(?:dashboard(?:\/.*)?|settings(?:\/.*)?|success|editor\/theme\/[^/]+)$/,
    to: /^\/playground$/,
    status: [307],
    why: "proxy.ts sends signed-out visitors to the sign-in entry point",
  },
  {
    from: /^\/integrations\/[^/]+$/,
    to: /^\/(?!integrations\/)[^?#]*/,
    status: [308],
    why: "AI assistants, developer tools and plugins moved to their own pages (getCatalogRedirect)",
  },
  {
    from: /^\/templates\/[^/]+$/,
    to: /^\/templates#[\w%-]+$/,
    status: [308],
    why: "/templates/<type> has no page; it opens that type's gallery section",
  },
  {
    from: /^\/m\/[^/]+$/,
    to: /^(?:https?:\/\/|\/)/,
    status: [307],
    why: "decorative easter-egg codes (lib/easter-eggs.ts)",
  },
];

/** Same-origin page paths worth checking (no build assets or auth API). */
function internalPath(href: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(href, `${BASE_URL}/`);
  } catch {
    return null;
  }
  if (parsed.origin !== BASE.origin) return null;
  if (!/^https?:$/.test(parsed.protocol)) return null;
  const path = parsed.pathname.replace(/(.)\/$/, "$1");
  if (/^\/(?:_next|api\/auth|ingest)(?:\/|$)/.test(path)) return null;
  // Static files (icons, images, sounds) aren't pages.
  if (
    /\.(?:png|jpe?g|svg|ico|webp|gif|mp3|mp4|webm|lottie|json|js|css)$/i.test(
      path,
    )
  )
    return null;
  return path + parsed.search;
}

interface RouteCheck {
  path: string;
  /** From the sitemap: must be a 200 HTML page, never a redirect */
  inSitemap: boolean;
}

async function checkRoute({ path, inSitemap }: RouteCheck) {
  await check("routes", path, async () => {
    const response = await get(path);
    const type = response.headers.get("content-type") ?? "";
    await response.body?.cancel();
    if (response.status === 200) {
      if (inSitemap && !type.includes("text/html")) {
        return [false, `200 but ${type || "no content type"} (sitemap URL)`];
      }
      return [true];
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      const target = new URL(location, url(path));
      const targetPath =
        target.origin === BASE.origin
          ? target.pathname + target.search + target.hash
          : target.toString();
      if (inSitemap) {
        return [
          false,
          `${response.status} → ${targetPath} (sitemaps must list final URLs)`,
        ];
      }
      const rule = EXPECTED_REDIRECTS.find((r) =>
        r.from.test(path.split("?")[0] as string),
      );
      if (
        !(rule?.status.includes(response.status) && rule.to.test(targetPath))
      ) {
        return [false, `unexpected ${response.status} → ${targetPath}`];
      }
      // The target must work too (internal targets only).
      if (target.origin === BASE.origin) {
        const final = await get(target.pathname + target.search);
        await final.body?.cancel();
        if (final.status !== 200) {
          return [
            false,
            `${response.status} → ${targetPath} → ${final.status}`,
          ];
        }
      }
      return [true, `${response.status} → ${targetPath}`];
    }
    return [false, `${response.status}${location ? ` → ${location}` : ""}`];
  });
}

async function sitemapPaths(): Promise<string[]> {
  const response = await get("/sitemap.xml");
  const xml = await response.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].flatMap((match) => {
    // The sitemap uses the public base URL; check the same paths here.
    const loc = new URL((match[1] as string).trim());
    return [loc.pathname.replace(/(.)\/$/, "$1") + loc.search];
  });
}

/**
 * Console noise that isn't a bug in the page. Each entry says why.
 */
const CONSOLE_NOISE: { pattern: RegExp; why: string }[] = [
  {
    // The dev server's HMR socket can drop while another agent edits files;
    // production has no HMR.
    pattern: /webpack-hmr|turbopack-hmr|\/_next\/webpack-hmr|HMR/i,
    why: "dev-only hot reload connection",
  },
];

type Page = Awaited<ReturnType<typeof launch>>;

// In-page function sources are strings: tsx would otherwise wrap functions in
// helpers that don't exist in the page.
const PAGE_LINKS = `() => [...document.querySelectorAll("a[href]")].map((a) => a.href)`;

/** Console errors, exceptions and failed loads seen since the last reset. */
function watchConsole(page: Page) {
  const errors: string[] = [];
  page.cdp.on((event: { method: string; params: Record<string, unknown> }) => {
    const params = event.params as {
      exceptionDetails?: {
        exception?: { description?: string };
        text?: string;
      };
      type?: string;
      args?: { value?: unknown; description?: string }[];
      entry?: { level?: string; source?: string; text?: string; url?: string };
    };
    if (event.method === "Runtime.exceptionThrown") {
      errors.push(
        `exception: ${params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? "?"}`,
      );
    } else if (
      event.method === "Runtime.consoleAPICalled" &&
      params.type === "error"
    ) {
      errors.push(
        `console.error: ${(params.args ?? []).map((a) => String(a.value ?? a.description ?? "")).join(" ")}`,
      );
    } else if (
      event.method === "Log.entryAdded" &&
      params.entry?.level === "error"
    ) {
      errors.push(
        `${params.entry.source}: ${params.entry.text}${params.entry.url ? ` (${params.entry.url})` : ""}`,
      );
    }
  });
  return {
    reset: () => {
      errors.length = 0;
    },
    take: () =>
      errors
        .splice(0)
        .filter((text) => !CONSOLE_NOISE.some((n) => n.pattern.test(text))),
  };
}

/** One URL per route template: top-level pages all, deeper ones once. */
function sampleByTemplate(paths: string[]): string[] {
  const seen = new Set<string>();
  const sample: string[] = [];
  for (const path of paths) {
    if (path.includes("?")) continue;
    const segments = path.split("/").filter(Boolean);
    const key =
      segments.length <= 1
        ? path
        : `${segments[0]}/${segments.length > 2 ? segments[1] : "*"}/${segments.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sample.push(path);
  }
  return sample;
}

async function testRoutes(page: Page) {
  const watch = watchConsole(page);
  await page.cdp.send("Log.enable");

  const fromSitemap = await sitemapPaths();
  record(
    "routes",
    "sitemap lists URLs",
    fromSitemap.length > 50,
    `${fromSitemap.length} URLs`,
  );

  // The home page as a browser renders it, client-side links included.
  watch.reset();
  await page.goto(url("/"), { wait: 3000 });
  const homeLinks: string[] = await page.evaluate(PAGE_LINKS);
  const homeErrors = watch.take();
  record(
    "routes",
    "browser: / has no console errors",
    homeErrors.length === 0,
    homeErrors.slice(0, 3).join(" | ") || `${homeLinks.length} links`,
  );
  // The watcher itself must work, or every page would pass vacuously.
  await page.evaluate(`() => console.error("Error: e2e watcher self-check")`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const selfCheck = watch.take();
  record(
    "routes",
    "browser: console watcher catches errors",
    selfCheck.some((text) => text.includes("e2e watcher self-check")),
  );

  const checked = new Set<string>();
  const queue = (paths: string[], inSitemap: boolean): RouteCheck[] =>
    paths.flatMap((path) => {
      if (checked.has(path)) return [];
      checked.add(path);
      return [{ path, inSitemap }];
    });

  const homePaths = homeLinks.flatMap((href) => internalPath(href) ?? []);
  await pool(
    [...queue(fromSitemap, true), ...queue(homePaths, false)],
    HTTP_CONCURRENCY,
    checkRoute,
  );

  // One page per route template in Chrome; their links are checked too.
  const sample = sampleByTemplate([...new Set([...fromSitemap, ...homePaths])])
    .filter((path) => path !== "/")
    .filter((path) => {
      const found = results.find((r) => r.area === "routes" && r.name === path);
      return found?.ok && !found.detail?.includes("→");
    });
  const linked: string[] = [];
  for (const path of sample) {
    await check(
      "routes",
      `browser: ${path} has no console errors`,
      async () => {
        watch.reset();
        await page.goto(url(path), { wait: 2500 });
        const title: string = await page.evaluate("() => document.title");
        const links: string[] = await page.evaluate(PAGE_LINKS);
        for (const href of links) {
          const internal = internalPath(href);
          if (internal) linked.push(internal);
        }
        const errors = watch.take();
        if (!title.trim()) return [false, "no document title"];
        return [errors.length === 0, errors.slice(0, 3).join(" | ") || title];
      },
    );
  }
  await pool(queue([...new Set(linked)], false), HTTP_CONCURRENCY, checkRoute);
}

// ── seo ────────────────────────────────────────────────────────────────────

async function testSeo() {
  await check("seo", "robots.txt", async () => {
    const response = await get("/robots.txt");
    const text = await response.text();
    const problems: string[] = [];
    if (response.status !== 200) problems.push(`status ${response.status}`);
    if (!response.headers.get("content-type")?.includes("text/plain"))
      problems.push("not text/plain");
    if (!/^user-agent: \*$/im.test(text)) problems.push("no User-Agent: *");
    for (const path of ["/api/", "/dashboard", "/settings", "/q/"]) {
      if (!text.includes(`Disallow: ${path}`))
        problems.push(`doesn't disallow ${path}`);
    }
    const sitemap = text.match(/^sitemap: (\S+)$/im)?.[1];
    if (!sitemap?.match(/^https?:\/\/[^/]+\/sitemap\.xml$/))
      problems.push(`sitemap line: ${sitemap ?? "missing"}`);
    return [problems.length === 0, problems.join(", ") || undefined];
  });

  await check("seo", "sitemap.xml", async () => {
    const response = await get("/sitemap.xml");
    const xml = await response.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
      (m[1] as string).trim(),
    );
    const problems = [...xmlProblems(xml)];
    if (response.status !== 200) problems.push(`status ${response.status}`);
    if (!response.headers.get("content-type")?.includes("xml"))
      problems.push("not XML");
    if (!xml.includes("<urlset")) problems.push("no <urlset>");
    const origins = new Set(
      locs.map((loc) => (/^https?:\/\//.test(loc) ? new URL(loc).origin : loc)),
    );
    if (origins.size !== 1)
      problems.push(`origins: ${[...origins].join(", ")}`);
    if (new Set(locs).size !== locs.length) problems.push("duplicate URLs");
    const paths = new Set(locs.map((loc) => new URL(loc).pathname));
    for (const path of ["/", "/playground", "/pricing", "/docs", "/blog"]) {
      if (!paths.has(path)) problems.push(`missing ${path}`);
    }
    return [
      problems.length === 0,
      problems.slice(0, 5).join(", ") || `${locs.length} URLs`,
    ];
  });

  let llmsLength = 0;
  const llmsLinks: string[] = [];
  await check("seo", "llms.txt", async () => {
    const response = await get("/llms.txt");
    const text = await response.text();
    llmsLength = text.length;
    for (const match of text.matchAll(/\]\((\S+?)\)/g)) {
      const path = internalPath(
        new URL(match[1] as string, url("/")).toString(),
      );
      if (path) llmsLinks.push(path);
    }
    return [
      response.status === 200 &&
        (response.headers.get("content-type") ?? "").includes("text/plain") &&
        text.startsWith("# ") &&
        text.length > 1000,
      `${response.status}, ${text.length} chars, ${llmsLinks.length} internal links`,
    ];
  });

  await check("seo", "llms-full.txt", async () => {
    const response = await get("/llms-full.txt");
    const text = await response.text();
    return [
      response.status === 200 &&
        (response.headers.get("content-type") ?? "").includes("text/plain") &&
        text.length > llmsLength,
      `${response.status}, ${text.length} chars`,
    ];
  });

  // Every page llms.txt points AI assistants to must exist.
  const broken = (
    await pool([...new Set(llmsLinks)], HTTP_CONCURRENCY, async (path) => {
      const response = await get(path.replace(/#.*/, ""));
      await response.body?.cancel();
      return response.status === 200 ? null : `${path} (${response.status})`;
    })
  ).filter(Boolean);
  record(
    "seo",
    "llms.txt links resolve",
    broken.length === 0,
    broken.slice(0, 5).join(", ") || `${new Set(llmsLinks).size} links`,
  );

  for (const path of ["/docs/dynamic-qr-codes", "/docs/developers/rest-api"]) {
    await check("seo", `docs markdown ${path}.mdx`, async () => {
      const response = await get(`${path}.mdx`);
      const text = await response.text();
      return [
        response.status === 200 &&
          !(response.headers.get("content-type") ?? "").includes("text/html") &&
          text.trimStart().startsWith("#"),
        `${response.status} ${response.headers.get("content-type")}`,
      ];
    });
  }

  await check("seo", "blog RSS", async () => {
    const response = await get("/blog/rss.xml");
    const xml = await response.text();
    const items = xml.match(/<item>/g)?.length ?? 0;
    const links = [...xml.matchAll(/<link>([^<]+)<\/link>/g)].map(
      (m) => m[1] as string,
    );
    const problems = xmlProblems(xml);
    if (response.status !== 200) problems.push(`status ${response.status}`);
    if (!response.headers.get("content-type")?.includes("rss+xml"))
      problems.push("not application/rss+xml");
    if (items === 0) problems.push("no items");
    if (links.some((link) => !/^https?:\/\//.test(link)))
      problems.push("relative item links");
    return [problems.length === 0, problems.join(", ") || `${items} items`];
  });

  // Open Graph images as pages declare them, plus the root routes.
  const blogPost = (await sitemapPaths()).find((p) =>
    /^\/blog\/(?!category\/|author)[^/]+$/.test(p),
  );
  const ogPages = ["/", "/pricing", "/plugins", "/docs/dynamic-qr-codes"];
  if (blogPost) ogPages.push(blogPost);
  for (const pagePath of ogPages) {
    await check("seo", `og:image ${pagePath}`, async () => {
      const html = await (await get(pagePath)).text();
      const og = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
      const twitter = html.match(
        /<meta name="twitter:image" content="([^"]+)"/,
      )?.[1];
      if (!og) return [false, "no og:image"];
      if (!twitter) return [false, "no twitter:image"];
      const problems: string[] = [];
      for (const image of new Set([og, twitter])) {
        const target = new URL(image.replaceAll("&amp;", "&"));
        const response = await get(target.pathname + target.search);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const size = pngSize(bytes);
        const type = response.headers.get("content-type") ?? "";
        if (response.status !== 200 || !type.startsWith("image/")) {
          problems.push(`${target.pathname}: ${response.status} ${type}`);
        } else if (bytes.length < 5000) {
          problems.push(`${target.pathname}: only ${bytes.length} bytes`);
        } else if (
          type === "image/png" &&
          !(size?.width === 1200 && size.height === 630)
        ) {
          problems.push(`${target.pathname}: ${size?.width}×${size?.height}`);
        }
      }
      return [
        problems.length === 0,
        problems.join(", ") || new URL(og).pathname,
      ];
    });
  }
  for (const path of ["/opengraph-image", "/twitter-image"]) {
    await check("seo", path, async () => {
      const response = await get(path);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const size = pngSize(bytes);
      return [
        response.status === 200 &&
          response.headers.get("content-type") === "image/png" &&
          size?.width === 1200 &&
          size.height === 630,
        `${response.status} ${bytes.length} bytes ${size?.width}×${size?.height}`,
      ];
    });
  }

  for (const path of ["/site.webmanifest", "/scan/manifest.webmanifest"]) {
    await check("seo", `manifest ${path}`, async () => {
      const response = await get(path);
      const manifest = (await response.json()) as {
        name?: string;
        icons?: { src: string }[];
      };
      const problems: string[] = [];
      if (response.status !== 200) problems.push(`status ${response.status}`);
      if (!response.headers.get("content-type")?.includes("manifest+json"))
        problems.push("not application/manifest+json");
      if (!manifest.name) problems.push("no name");
      if (!manifest.icons?.length) problems.push("no icons");
      for (const icon of manifest.icons ?? []) {
        const iconResponse = await get(new URL(icon.src, url(path)).pathname);
        const bytes = new Uint8Array(await iconResponse.arrayBuffer());
        if (iconResponse.status !== 200 || !isPng(bytes)) {
          problems.push(`icon ${icon.src}: ${iconResponse.status}`);
        }
      }
      return [problems.length === 0, problems.join(", ") || manifest.name];
    });
  }
}

// ── image API ──────────────────────────────────────────────────────────────

const QR_DATA = "https://qrdx.dev/pricing?plan=pro&ref=e2e#faq";

async function testImageApi() {
  const query = (params: Record<string, string>) =>
    `/api/v1/qr?${new URLSearchParams({ data: QR_DATA, ...params })}`;

  await check("image", "SVG", async () => {
    const response = await get(query({ size: "256" }));
    const svg = await response.text();
    const problems = xmlProblems(svg);
    if (response.status !== 200) problems.push(`status ${response.status}`);
    if (response.headers.get("content-type") !== "image/svg+xml")
      problems.push(`type ${response.headers.get("content-type")}`);
    if (!svg.trimStart().startsWith("<svg")) problems.push("not an <svg>");
    if (!/width="256"/.test(svg)) problems.push("width isn't 256");
    if (response.headers.get("access-control-allow-origin") !== "*")
      problems.push("no CORS");
    if (!response.headers.get("cache-control")?.includes("immutable"))
      problems.push("not cached as immutable");
    if (
      !response.headers
        .get("content-security-policy")
        ?.includes("default-src 'none'")
    )
      problems.push("no CSP");
    const decoded = decodeSvgQr(svg);
    if (decoded !== QR_DATA)
      problems.push(`decodes to ${JSON.stringify(decoded)}`);
    return [
      problems.length === 0,
      problems.join(", ") || `${svg.length} bytes`,
    ];
  });

  await check("image", "PNG", async () => {
    const response = await get(query({ format: "png", size: "300" }));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const size = pngSize(bytes);
    const problems: string[] = [];
    if (response.status !== 200) problems.push(`status ${response.status}`);
    if (response.headers.get("content-type") !== "image/png")
      problems.push(`type ${response.headers.get("content-type")}`);
    if (!isPng(bytes)) problems.push("no PNG signature");
    if (!(size?.width === 300 && size.height === 300))
      problems.push(`${size?.width}×${size?.height}`);
    const decoded = await decodePngQr(bytes);
    if (decoded !== QR_DATA)
      problems.push(`decodes to ${JSON.stringify(decoded)}`);
    return [
      problems.length === 0,
      problems.join(", ") || `${bytes.length} bytes`,
    ];
  });

  await check("image", "EPS", async () => {
    const response = await get(query({ format: "eps", size: "144" }));
    const eps = await response.text();
    const problems: string[] = [];
    if (response.status !== 200) problems.push(`status ${response.status}`);
    if (response.headers.get("content-type") !== "application/postscript")
      problems.push(`type ${response.headers.get("content-type")}`);
    if (!response.headers.get("content-disposition")?.includes("qr-code.eps"))
      problems.push("not a qr-code.eps download");
    if (!eps.startsWith("%!PS-Adobe-3.0 EPSF-3.0"))
      problems.push("no EPS header");
    if (!/^%%BoundingBox: 0 0 144 144$/m.test(eps))
      problems.push("BoundingBox isn't 0 0 144 144");
    if (!eps.trimEnd().endsWith("%%EOF")) problems.push("no %%EOF");
    return [
      problems.length === 0,
      problems.join(", ") || `${eps.length} bytes`,
    ];
  });

  await check("image", "same query, same bytes", async () => {
    const path = query({ format: "png", size: "128", fg: "155dfc" });
    const [a, b] = await Promise.all([get(path), get(path)]);
    const [x, y] = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
    return [Buffer.from(x).equals(Buffer.from(y)), `${x.byteLength} bytes`];
  });

  await check("image", "styled shapes and case-insensitive enums", async () => {
    const response = await get(
      query({
        body: "rounded",
        eye: "rounded",
        dot: "rounded",
        level: "h",
        format: "SVG",
        fg: "155dfc",
        bg: "fff",
      }),
    );
    const svg = await response.text();
    const decoded = response.status === 200 ? decodeSvgQr(svg) : null;
    return [
      response.status === 200 &&
        xmlProblems(svg).length === 0 &&
        decoded === QR_DATA,
      `${response.status}, decodes to ${JSON.stringify(decoded)}`,
    ];
  });

  await check("image", "frame template", async () => {
    const response = await get(query({ template: "arrow" }));
    const svg = await response.text();
    return [
      response.status === 200 && xmlProblems(svg).length === 0,
      `${response.status} ${svg.length} bytes`,
    ];
  });

  const invalid: [string, string, string][] = [
    ["size too small", `/api/v1/qr?data=hi&size=10`, "size"],
    ["no data", `/api/v1/qr?format=png`, "data"],
    ["unknown format", `/api/v1/qr?data=hi&format=gif`, "format"],
    ["bad color", `/api/v1/qr?data=hi&fg=zzz`, "fg"],
    [
      "data too long for the level",
      `/api/v1/qr?${new URLSearchParams({ data: "x".repeat(2000), level: "H" })}`,
      "data",
    ],
  ];
  for (const [name, path, param] of invalid) {
    await check("image", `400: ${name}`, async () => {
      const response = await get(path);
      const body = (await response.json()) as {
        code?: string;
        data?: { details?: { param: string }[] };
      };
      const params = body.data?.details?.map((d) => d.param) ?? [];
      return [
        response.status === 400 &&
          body.code === "VALIDATION_ERROR" &&
          params.includes(param) &&
          response.headers.get("access-control-allow-origin") === "*",
        `${response.status} ${body.code} [${params.join(", ")}]`,
      ];
    });
  }

  await check("image", "CORS preflight", async () => {
    const response = await get("/api/v1/qr", { method: "OPTIONS" });
    return [
      response.status === 204 &&
        response.headers.get("access-control-allow-origin") === "*" &&
        (response.headers.get("access-control-allow-methods") ?? "").includes(
          "GET",
        ),
      String(response.status),
    ];
  });

  await check("image", "api.qrdx.dev/v1/qr", async () => {
    const response = await requestWithHost(
      `/v1/qr?${new URLSearchParams({ data: QR_DATA, format: "png", size: "200" })}`,
      "api.qrdx.dev",
    );
    const decoded =
      response.status === 200
        ? await decodePngQr(new Uint8Array(response.body))
        : null;
    return [
      response.status === 200 &&
        response.headers["content-type"] === "image/png" &&
        decoded === QR_DATA,
      `${response.status} ${response.headers["content-type"]}`,
    ];
  });

  await check(
    "image",
    "api.qrdx.dev outside /v1 goes to the REST docs",
    async () => {
      const response = await requestWithHost("/", "api.qrdx.dev");
      const location = String(response.headers.location ?? "");
      return [
        response.status >= 300 &&
          response.status < 400 &&
          location === "https://qrdx.dev/docs/developers/rest-api",
        `${response.status} → ${location}`,
      ];
    },
  );
}

// ── mcp ────────────────────────────────────────────────────────────────────

const MCP_PROTOCOL_VERSION = "2025-06-18";

interface JsonRpcResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

/** One JSON-RPC call over Streamable HTTP (JSON or SSE responses). */
async function mcpCall(
  method: string,
  params: Record<string, unknown> = {},
  id: number | null = 1,
): Promise<{ status: number; message: JsonRpcResponse | null }> {
  const response = await get("/api/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      ...(id === null ? {} : { id }),
    }),
  });
  const text = await response.text();
  if (!text.trim()) return { status: response.status, message: null };
  if (
    (response.headers.get("content-type") ?? "").includes("text/event-stream")
  ) {
    const messages = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5)) as JsonRpcResponse);
    return {
      status: response.status,
      message: messages.find((m) => m.id === id) ?? messages[0] ?? null,
    };
  }
  return { status: response.status, message: JSON.parse(text) };
}

type ToolContent = {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
};

async function testMcp() {
  await check("mcp", "initialize", async () => {
    const { status, message } = await mcpCall("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "qrdx-e2e", version: "1.0.0" },
    });
    const result = message?.result as
      | {
          protocolVersion?: string;
          serverInfo?: { name?: string };
          capabilities?: { tools?: unknown };
          instructions?: string;
        }
      | undefined;
    return [
      status === 200 &&
        result?.serverInfo?.name === "qrdx" &&
        result.protocolVersion === MCP_PROTOCOL_VERSION &&
        Boolean(result.capabilities?.tools) &&
        Boolean(result.instructions),
      `${status} ${JSON.stringify(result?.serverInfo ?? message?.error)}`,
    ];
  });

  await check("mcp", "initialized notification", async () => {
    const { status } = await mcpCall("notifications/initialized", {}, null);
    return [status === 202 || status === 200, String(status)];
  });

  // The tools this server registers, read from its source.
  const registered = [
    ...readFileSync(join(APP_DIR, "app/api/mcp/tools.ts"), "utf8").matchAll(
      /registerTool\(\s*"([^"]+)"/g,
    ),
  ].map((m) => m[1] as string);

  await check("mcp", "tools/list", async () => {
    const { message } = await mcpCall("tools/list", {}, 2);
    const tools = (message?.result?.tools ?? []) as {
      name: string;
      inputSchema?: unknown;
    }[];
    const names = tools.map((t) => t.name).sort();
    return [
      registered.length > 0 &&
        JSON.stringify(names) === JSON.stringify([...registered].sort()) &&
        tools.every((t) => t.inputSchema),
      names.join(", ") || JSON.stringify(message?.error),
    ];
  });

  await check("mcp", "tools/call generate_qr_code", async () => {
    const { message } = await mcpCall(
      "tools/call",
      { name: "generate_qr_code", arguments: { data: QR_DATA, size: 256 } },
      3,
    );
    const result = message?.result as
      | { content?: ToolContent[]; isError?: boolean }
      | undefined;
    const image = result?.content?.find((c) => c.type === "image");
    const text = result?.content?.find((c) => c.type === "text")?.text ?? "";
    const problems: string[] = [];
    if (!result || result.isError)
      problems.push(JSON.stringify(message?.error ?? result));
    if (image?.mimeType !== "image/png" || !image.data) problems.push("no PNG");
    else {
      const decoded = await decodePngQr(
        new Uint8Array(Buffer.from(image.data, "base64")),
      );
      if (decoded !== QR_DATA)
        problems.push(`PNG decodes to ${JSON.stringify(decoded)}`);
    }
    // The SVG URL it hands out must render the same code.
    const svgUrl = text.match(/SVG URL: (\S+)/)?.[1];
    if (svgUrl) {
      const parsed = new URL(svgUrl);
      const response = await get(`/api/v1/qr${parsed.search}`);
      const svg = await response.text();
      if (response.status !== 200 || decodeSvgQr(svg) !== QR_DATA)
        problems.push(`SVG URL gives ${response.status}`);
    } else {
      problems.push("no SVG URL");
    }
    return [problems.length === 0, problems.join(", ") || svgUrl];
  });

  await check("mcp", "tools/call qr_payload_wifi", async () => {
    const { message } = await mcpCall(
      "tools/call",
      {
        name: "qr_payload_wifi",
        arguments: {
          ssid: "E2E Café",
          password: "pa;ss:word",
          security: "WPA",
        },
      },
      4,
    );
    const result = message?.result as { content?: ToolContent[] } | undefined;
    const text = result?.content?.[0]?.text ?? "";
    return [
      text.startsWith("WIFI:") &&
        text.includes("S:E2E Café") &&
        text.includes("P:pa\\;ss\\:word"),
      text || JSON.stringify(message?.error ?? result),
    ];
  });

  await check(
    "mcp",
    "tools/call with data too long is a tool error",
    async () => {
      const { message } = await mcpCall(
        "tools/call",
        {
          name: "generate_qr_code",
          arguments: { data: "x".repeat(2000), level: "H" },
        },
        5,
      );
      const result = message?.result as
        | { isError?: boolean; content?: ToolContent[] }
        | undefined;
      return [
        result?.isError === true || Boolean(message?.error),
        result?.content?.[0]?.text?.slice(0, 80) ?? message?.error?.message,
      ];
    },
  );

  await check("mcp", "browser visit redirects to /mcp", async () => {
    const response = await get("/api/mcp", {
      headers: { accept: "text/html" },
    });
    const location = response.headers.get("location") ?? "";
    return [
      response.status === 307 &&
        new URL(location, url("/")).pathname === "/mcp",
      `${response.status} → ${location}`,
    ];
  });

  await check("mcp", "CORS preflight", async () => {
    const response = await get("/api/mcp", { method: "OPTIONS" });
    const allowHeaders = (
      response.headers.get("access-control-allow-headers") ?? ""
    ).toLowerCase();
    return [
      response.status === 204 &&
        response.headers.get("access-control-allow-origin") === "*" &&
        allowHeaders.includes("mcp-session-id") &&
        allowHeaders.includes("mcp-protocol-version"),
      String(response.status),
    ];
  });

  await check("mcp", "mcp.qrdx.dev/mcp is the endpoint", async () => {
    const response = await requestWithHost("/mcp", "mcp.qrdx.dev", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 9,
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "qrdx-e2e", version: "1.0.0" },
        },
      }),
    });
    const text = response.body.toString("utf8");
    return [
      response.status === 200 && text.includes('"serverInfo":{"name":"qrdx"'),
      String(response.status),
    ];
  });

  await check(
    "mcp",
    "mcp.qrdx.dev elsewhere goes to the connect page",
    async () => {
      const response = await requestWithHost("/anything", "mcp.qrdx.dev");
      const location = String(response.headers.location ?? "");
      return [
        response.status >= 300 &&
          response.status < 400 &&
          location === "https://qrdx.dev/mcp",
        `${response.status} → ${location}`,
      ];
    },
  );
}

// ── legal ──────────────────────────────────────────────────────────────────

const decodeEntities = (html: string) =>
  html
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

async function testLegal() {
  const legalDir = join(APP_DIR, "content/legal");
  for (const file of readdirSync(legalDir).filter((f) => f.endsWith(".mdx"))) {
    const slug = file.replace(/\.mdx$/, "");
    const title = readFileSync(join(legalDir, file), "utf8").match(
      /^title:\s*(.+)$/m,
    )?.[1];
    await check("legal", `/legal/${slug}`, async () => {
      const response = await get(`/legal/${slug}`);
      const html = await response.text();
      const h1 = decodeEntities(
        html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, "") ??
          "",
      );
      return [
        response.status === 200 &&
          Boolean(title) &&
          h1?.trim() === title?.trim(),
        `${response.status} "${h1?.trim()}"`,
      ];
    });
  }

  await check("legal", "/report-abuse", async () => {
    const response = await get("/report-abuse");
    await response.body?.cancel();
    return [response.status === 200, String(response.status)];
  });

  const unknown: [string, string][] = [
    ["unknown page", "/e2e-this-page-does-not-exist"],
    ["unknown docs page", "/docs/e2e-does-not-exist"],
    ["unknown blog post", "/blog/e2e-does-not-exist"],
    ["unknown legal page", "/legal/e2e-does-not-exist"],
    ["unknown short link", "/q/E2E0000"],
  ];
  for (const [name, path] of unknown) {
    await check("legal", `404: ${name}`, async () => {
      const response = await get(path);
      const html = await response.text();
      return [
        response.status === 404 &&
          (response.headers.get("content-type") ?? "").includes("text/html") &&
          html.length > 0,
        String(response.status),
      ];
    });
  }

  await check("legal", "unknown easter-egg code goes home", async () => {
    const response = await get("/m/e2e-unknown");
    const location = response.headers.get("location") ?? "";
    return [
      response.status === 307 && new URL(location, url("/")).pathname === "/",
      `${response.status} → ${location}`,
    ];
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  if (!(await serverIsUp(BASE_URL))) {
    console.log(
      `SKIP: no dev server at ${BASE_URL} (start it, or set E2E_BASE_URL)`,
    );
    return 0;
  }
  const selected = process.env.E2E_SUITES?.split(",").map((s) => s.trim());
  const wants = (name: string) => !selected || selected.includes(name);
  if (wants("routes") && !findChrome()) {
    console.log("SKIP: Chrome not found (set CHROME_PATH)");
    return 0;
  }

  const suites: [string, () => Promise<void>][] = [
    ["seo", testSeo],
    ["image", testImageApi],
    ["mcp", testMcp],
    ["legal", testLegal],
    [
      "routes",
      async () => {
        const page = await launch();
        try {
          await testRoutes(page);
        } finally {
          await page.close();
        }
      },
    ],
  ];
  const started = Date.now();
  for (const [name, run] of suites) {
    if (!wants(name)) continue;
    console.log(`\n${name}`);
    try {
      await run();
    } catch (error) {
      record(name, "suite", false, message(error));
    }
  }

  const failed = results.filter((r) => !(r.ok || r.known));
  const known = results.filter((r) => r.known);
  console.log(
    `\n${results.length - failed.length - known.length} passed, ${failed.length} failed, ${known.length} known bugs (${results.length} checks, ${Math.round((Date.now() - started) / 1000)}s)`,
  );
  for (const r of failed) {
    console.log(`  ✗ ${r.area} › ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  return failed.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
