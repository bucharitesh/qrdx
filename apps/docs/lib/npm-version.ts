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
 * The version on npm's `latest` tag, refreshed hourly, or null when the
 * registry is slow, down or answers with something that isn't a version.
 */
export async function getPublishedVersion(
  name: PublishedPackage,
): Promise<string | null> {
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
    // Timed out or offline.
  }
  return null;
}

/**
 * The version npm installs for `name` (its `latest` tag), refreshed hourly.
 * The repo's package.json is only the fallback when the registry is slow or
 * down: it is bumped before a release is published, so it can be ahead.
 */
export async function getLatestVersion(
  name: PublishedPackage,
): Promise<string> {
  return (await getPublishedVersion(name)) ?? REPO_VERSIONS[name];
}

/** Compares the numeric x.y.z parts: negative when `a` is older than `b`. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[-+]/)[0].split(".").map(Number);
  const pb = b.split(/[-+]/)[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

/** npm is behind: `published` is what `npm install` gets, `upcoming` isn't out yet. */
export interface NpmLag {
  name: PublishedPackage;
  published: string;
  upcoming: string;
}

/**
 * Set only when npm is known to be behind `version` (default: the repo's
 * package.json). Null once npm has it, and also when the registry can't be
 * reached: then the site makes no claim either way instead of guessing.
 */
export async function getNpmLag(
  name: PublishedPackage,
  version: string = REPO_VERSIONS[name],
): Promise<NpmLag | null> {
  if (!SEMVER.test(version)) return null;
  const published = await getPublishedVersion(name);
  if (!published || compareVersions(published, version) >= 0) return null;
  return { name, published, upcoming: version };
}
