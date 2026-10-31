import "server-only";

import cliPackage from "../../../packages/cli/package.json";
import qrdxPackage from "../../../packages/qrdx/package.json";

/** Packages QRdx publishes to npm, with the version in this repo. */
const REPO_VERSIONS = {
  qrdx: qrdxPackage.version,
  "@qrdx/cli": cliPackage.version,
} as const;

export type PublishedPackage = keyof typeof REPO_VERSIONS;

const REGISTRY = "https://registry.npmjs.org";
const TIMEOUT_MS = 3000;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * The version npm installs for `name` (its `latest` tag), refreshed hourly.
 * The repo's package.json is only the fallback when the registry is slow or
 * down: it is bumped before a release is published, so it can be ahead.
 */
export async function getLatestVersion(
  name: PublishedPackage,
): Promise<string> {
  try {
    const response = await fetch(
      `${REGISTRY}/${encodeURIComponent(name)}/latest`,
      {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (response.ok) {
      const { version } = (await response.json()) as { version?: unknown };
      if (typeof version === "string" && SEMVER.test(version)) {
        return version;
      }
    }
  } catch {
    // Timed out or offline: use the repo's version below.
  }
  return REPO_VERSIONS[name];
}
