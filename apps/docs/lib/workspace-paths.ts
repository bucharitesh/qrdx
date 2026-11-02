// Workspace URLs, client-safe. Everything a workspace holds lives under
// /dashboard/<workspace slug>/...; account pages (profile, preferences,
// notifications, integrations) stay under /settings. Links in emails carry
// the slug; docs and messages that can't know it use dashboardEntry(), which
// /dashboard resolves to the reader's default workspace.

/** Request header proxy.ts sets from the URL (lib/scope.ts reads it). */
export const WORKSPACE_HEADER = "x-qrdx-workspace";

/** Stands for any workspace in path patterns (lib/feature-availability-rules). */
export const WORKSPACE_PATTERN_PREFIX = "/dashboard/[workspace]";

const SLUG_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

/** `/dashboard/<slug><path>`; `path` starts with "/" (or is empty for Home). */
export function workspaceHref(slug: string, path = ""): string {
  return `/dashboard/${encodeURIComponent(slug)}${path}`;
}

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
 * The same section in another workspace, as Dub's switcher does: detail
 * pages (a code, a page, a webhook) go to their list, and the query is
 * dropped, since filters and ids belong to the workspace left behind.
 */
export function switchWorkspaceHref(pathname: string, slug: string): string {
  const [first, second] = pathInWorkspace(pathname).split("/").filter(Boolean);
  if (!first) return workspaceHref(slug);
  if (first === "settings") {
    return workspaceHref(slug, second ? `/settings/${second}` : "/settings");
  }
  return workspaceHref(slug, `/${first}`);
}

/** Sections a slug-free link (dashboardEntry) may open. */
const ENTRY_SECTIONS = new Set([
  "codes",
  "pages",
  "analytics",
  "files",
  "themes",
  "settings",
]);
const ENTRY_PATH = /^[a-z0-9-]+(?:\/[a-z0-9-]+){0,3}$/;

/**
 * A link into the reader's default workspace when the slug isn't known (docs,
 * API error messages, the integrations catalog): `/dashboard?to=settings/developers`.
 * Extra query parameters are passed on.
 */
export function dashboardEntry(
  section: string,
  query?: Record<string, string>,
): string {
  const params = new URLSearchParams({ to: section, ...query });
  return `/dashboard?${params.toString().replace(/%2F/g, "/")}`;
}

/**
 * A link to `path` inside workspace `slug`, or, when the slug isn't known,
 * through /dashboard?to=… to the reader's default workspace. `path` may
 * carry a query and a hash ("/codes/x?tab=settings#utm").
 */
export function workspaceLink(slug: string | null, path = ""): string {
  if (slug) return workspaceHref(slug, path);
  const [beforeHash, hash] = path.split("#", 2);
  const [pathname, query] = (beforeHash ?? "").split("?", 2);
  const section = (pathname ?? "").replace(/^\/+/, "");
  const link = section
    ? dashboardEntry(
        section,
        query ? Object.fromEntries(new URLSearchParams(query)) : undefined,
      )
    : "/dashboard";
  return hash ? `${link}#${hash}` : link;
}

/**
 * Where /dashboard?to=<section> goes inside the default workspace ("" for
 * Home), or null when `to` isn't a known section path (then Home).
 */
export function entryPath(to: string | string[] | undefined): string | null {
  const value = Array.isArray(to) ? to[0] : to;
  if (!value) return null;
  const path = value.replace(/^\/+|\/+$/g, "");
  if (path.length > 100 || !ENTRY_PATH.test(path)) return null;
  const [section] = path.split("/");
  return section && ENTRY_SECTIONS.has(section) ? `/${path}` : null;
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
