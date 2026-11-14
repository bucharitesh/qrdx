// The Content-Security-Policy builder lives in @repo/next-config/csp
// (packages/next-config/csp.ts), so QRdx's other apps send the same policy.
// This path stays for the app's imports (proxy.ts, the tests) and adds the
// app's media host to the storage origins. next.config.ts imports the
// package directly: Next.js compiles the config with `@repo/*` paths
// rewritten for the app's root, which breaks a package import made from a
// file below it.

import { cspOptionsFromEnv as cspOptionsFor } from "@repo/next-config/csp";
import mediaManifest from "../media-manifest.json";

export * from "@repo/next-config/csp";

/** Options from the environment, with the site's media origin. */
export function cspOptionsFromEnv(
  env: Record<string, string | undefined> = process.env,
) {
  return cspOptionsFor(env, { mediaOrigin: mediaManifest.origin });
}
