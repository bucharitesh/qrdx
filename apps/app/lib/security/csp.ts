// The app's Content-Security-Policy options. The builder lives in
// @repo/next-config/csp (packages/next-config/csp.ts), so QRdx's other apps
// send the same policy; proxy.ts and the tests import it from there and take
// the options from here, which add the site's media host to the storage
// origins. next.config.ts passes the same host itself: Next.js compiles the
// config with `@repo/*` paths rewritten for the app's root, which breaks a
// package import made from a file below it.

import { cspOptionsFromEnv as cspOptionsFor } from "@repo/next-config/csp";
import mediaManifest from "../media-manifest.json";

/** Options from the environment, with the site's media origin. */
export function cspOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
) {
  return cspOptionsFor(env, { mediaOrigin: mediaManifest.origin });
}
