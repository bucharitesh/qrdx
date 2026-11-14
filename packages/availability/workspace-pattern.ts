// Workspace paths as availability rules match them: every workspace's page
// is /dashboard/<slug>/…, so a rule names it once as
// /dashboard/[workspace]/…. Client-safe. apps/app/lib/workspace-paths.ts
// re-exports these with the rest of its workspace URL helpers.

/** Stands for any workspace in path patterns (./rules.ts). */
export const WORKSPACE_PATTERN_PREFIX = "/dashboard/[workspace]";

const SLUG_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

/** The workspace slug a dashboard path names, or null outside one. */
export function workspaceSlugFromPath(pathname: string): string | null {
  const match = /^\/dashboard\/([^/?#]+)/.exec(pathname);
  if (!match?.[1]) return null;
  let segment: string;
  try {
    segment = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return segment.length <= 64 && SLUG_SEGMENT.test(segment) ? segment : null;
}

/** "/dashboard/acme/codes/x" -> "/codes/x"; "" for Home or outside a workspace. */
export function pathInWorkspace(pathname: string): string {
  const match = /^\/dashboard\/[^/?#]+(\/[^?#]*)?/.exec(pathname);
  const rest = match?.[1] ?? "";
  return rest === "/" ? "" : rest;
}

/**
 * "/dashboard/acme/settings/domains" -> "/dashboard/[workspace]/settings/domains",
 * so rules written once match every workspace. Other paths are unchanged.
 */
export function workspacePattern(href: string): string {
  const path = href.split(/[?#]/, 1)[0] ?? href;
  if (!workspaceSlugFromPath(path)) return path;
  return `${WORKSPACE_PATTERN_PREFIX}${pathInWorkspace(path)}`;
}
