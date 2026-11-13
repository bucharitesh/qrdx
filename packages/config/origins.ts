import { keys as core } from "@repo/next-config/keys";
import { keys } from "./keys";

// The origins that depend on the environment, read through validated keys so
// a self-hosted copy gets its own. Imported as "@repo/config/origins", apart
// from the constants, so tools that compile next.config.ts and the docs
// source config only ever see plain values.

/** The running app's origin, from NEXT_PUBLIC_APP_URL. */
export function appOrigin(): string {
  return new URL(core().NEXT_PUBLIC_APP_URL).origin;
}

/**
 * The origin default short links use (`<origin>/q/<slug>`):
 * NEXT_PUBLIC_SHORT_LINK_BASE_URL, else `fallback` (the site's own origin).
 */
export function shortLinkOrigin(fallback: string | URL): string {
  return new URL(keys().NEXT_PUBLIC_SHORT_LINK_BASE_URL ?? fallback).origin;
}
