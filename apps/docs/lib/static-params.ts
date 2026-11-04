/**
 * The list a route's `generateStaticParams` returns: every param in
 * production builds, none under `next dev`.
 *
 * In `next dev`, Next runs generateStaticParams on each request to the route
 * and, when it lists paths, rewrites .next/dev/prerender-manifest.json with
 * an unlocked read-modify-write (next/dist/server/dev/next-dev-server.js).
 * Cold loads of two such routes at once could interleave those writes: a
 * corrupt manifest leaves most pages answering 500 until .next/dev is
 * deleted. With no paths, dev renders each page on request and never writes
 * the manifest; builds still prerender the full list.
 *
 * A route using this leaves `dynamicParams` at its default (true), or dev
 * would 404 every page, and calls notFound() for a param that isn't in the
 * list, so production still answers 404 for it.
 */
export function buildTimeParams<T>(params: () => T[]): T[] {
  if (process.env.NODE_ENV === "development") return [];
  return params();
}
