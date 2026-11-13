import { env } from "@/env";

/**
 * How much of the site a build prerenders. Every route with a dynamic
 * segment keeps `dynamicParams` at its default (true) and lists params
 * through the helpers below, so a URL left out of the build still works: it
 * renders on its first request and is cached from then on (ISR), as long as
 * the route stays static (nothing in it reads cookies(), headers(),
 * searchParams or an uncached fetch). Unknown params call notFound(), so
 * they answer 404 either way.
 *
 * - "english": production, local and CI builds. The English pages and every
 *   route's own list (buildTimeParams); the other languages under app/[lang]
 *   (localeParams), the OG images, the Markdown copies and the generated
 *   image files (onDemandParams) render on request. Prerendering all of them
 *   (about 8,500 paths) ran Vercel's 8 GB Hobby build machine out of memory.
 * - "minimal": Vercel preview builds. Only the pages without a dynamic
 *   segment of their own, in English (the home page, /pricing, /blog...):
 *   previews build fast, and the few people who open one render what they
 *   visit.
 * - "none": `next dev`, where listing paths corrupts the prerender manifest
 *   (buildTimeParams says how).
 */
export type PrerenderScope = "english" | "minimal" | "none";

export function prerenderScope(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  vercelEnv: string | undefined = env.VERCEL_ENV,
): PrerenderScope {
  if (nodeEnv === "development") return "none";
  if (vercelEnv === "preview") return "minimal";
  return "english";
}

/**
 * The list a route's `generateStaticParams` returns: every param in
 * production and local builds, none in preview builds or under `next dev`
 * (prerenderScope).
 *
 * In `next dev`, Next runs generateStaticParams on each request to the route
 * and, when it lists paths, rewrites .next/dev/prerender-manifest.json with
 * an unlocked read-modify-write (next/dist/server/dev/next-dev-server.js).
 * Cold loads of two such routes at once could interleave those writes: a
 * corrupt manifest leaves most pages answering 500 until .next/dev is
 * deleted. With no paths, dev renders each page on request and never writes
 * the manifest.
 *
 * A route using this leaves `dynamicParams` at its default (true), or dev
 * would 404 every page, and calls notFound() for a param that isn't in the
 * list, so production still answers 404 for it.
 */
export function buildTimeParams<T>(params: () => T[]): T[] {
  if (prerenderScope() !== "english") return [];
  return params();
}

/**
 * `generateStaticParams` for a route the build never prerenders: OG images
 * of pages with a dynamic segment, the docs' Markdown copies and the image
 * files the engine draws (/sample-codes, /gallery, /catalog,
 * /api/brand-logos). Each URL renders on its first request and is cached
 * from then on. Returning [] is what keeps that cache: Next caches a
 * dynamic route's request-time renders only when it has
 * generateStaticParams, even an empty one.
 *
 * Each deployment starts with an empty cache, so these render again after
 * every deploy, on their first visit. Measured locally (2026-11-14), all
 * 840 image files together take about 6 CPU seconds, an OG image about
 * 35 ms and a Markdown copy about 6 ms.
 */
export function onDemandParams(): never[] {
  return [];
}
