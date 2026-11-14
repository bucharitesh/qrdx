// The main app's own paths: no other zone's rewrites may take one over. The
// console zone's guard (apps/app/tests/lib/console-zone.test.ts) checks
// these, and the marketing zone's guard will read the same list. Pure.

/**
 * A path and everything under it, or (ending in /*) only what's under it:
 * the index of /templates may move, its pages may not. Short links (/q) and
 * hosted pages (/p) come first: they must never depend on another
 * deployment.
 */
export const CORE_PATHS = [
  "/q",
  "/p",
  "/m",
  "/r",
  "/api",
  "/docs",
  "/playground",
  "/editor",
  "/dashboard",
  "/settings",
  "/admin",
  "/oauth",
  "/invite",
  "/sign-in",
  "/success",
  "/ai",
  "/community",
  "/mcp",
  "/report-abuse",
  "/templates/*",
  "/og/docs",
  "/llms-full.txt",
  "/llms.mdx",
  "/.well-known",
  "/_next",
  "/ingest",
] as const;

/** A sample URL path for each entry of CORE_PATHS, and one below it. */
export function corePathSamples(): string[] {
  return CORE_PATHS.flatMap((path) =>
    path.endsWith("/*")
      ? [`${path.slice(0, -2)}/sample`]
      : [path, `${path}/sample`]
  );
}
