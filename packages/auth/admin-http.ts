import type { BetterAuthPlugin } from "better-auth";

// Better Auth's admin plugin (./server.ts) is only used from the app's own
// admin panel, server-side through auth.api, after its own admin check, rate
// limit, reason and audit log (apps/app/app/admin/_lib/action.ts). No
// browser code calls it. Over HTTP its endpoints would let a stolen admin
// cookie change any account directly, skipping all of that: set an email
// (marked verified), turn two-step verification off, ban, delete.
//
// So none of them are reachable over HTTP:
// - every endpoint the plugin has today is listed in `disabledPaths`
//   (ADMIN_HTTP_PATHS; a test checks the list against the plugin's own), and
// - adminHttpOff() refuses any other path under /admin/ as well, so an
//   endpoint a future version adds is never open by default.
// auth.api calls don't go through the HTTP router, so the panel keeps
// working.

/** Every endpoint of Better Auth 1.7.14's admin plugin. */
export const ADMIN_HTTP_PATHS = [
  "/admin/ban-user",
  "/admin/create-user",
  "/admin/get-user",
  "/admin/has-permission",
  "/admin/impersonate-user",
  "/admin/list-user-sessions",
  "/admin/list-users",
  "/admin/remove-user",
  "/admin/revoke-user-session",
  "/admin/revoke-user-sessions",
  "/admin/set-role",
  "/admin/set-user-password",
  "/admin/stop-impersonating",
  "/admin/unban-user",
  "/admin/update-user",
];

const ADMIN_PREFIX = "/admin/";

// This runs on every request to the auth API, so no regular expressions on
// the path: two single linear passes instead, whatever the input looks like.

/** Runs of "/" collapsed into one. */
function collapseSlashes(value: string): string {
  let out = "";
  let previousSlash = false;
  for (const char of value) {
    const slash = char === "/";
    if (!(slash && previousSlash)) out += char;
    previousSlash = slash;
  }
  return out;
}

/** Without trailing "/". */
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}

/**
 * Whether a request path, relative to the auth base path, is under /admin/.
 * Decoded and lower-cased, so an encoded slash or different case can't slip
 * past.
 */
export function isAdminHttpPath(pathname: string, basePath: string): boolean {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // Keep it as sent: it can't route anywhere then.
  }
  path = collapseSlashes(path.toLowerCase());
  const base = trimTrailingSlashes(basePath.toLowerCase());
  if (base && path.startsWith(base)) path = path.slice(base.length);
  return path.startsWith(ADMIN_PREFIX) || path === "/admin";
}

export const adminHttpOff = () =>
  ({
    id: "qrdx-admin-http-off",
    onRequest(request, ctx) {
      const { pathname } = new URL(request.url);
      if (!isAdminHttpPath(pathname, ctx.options.basePath ?? "/api/auth")) {
        return Promise.resolve();
      }
      return Promise.resolve({
        response: new Response("Not Found", { status: 404 }),
      });
    },
  }) satisfies BetterAuthPlugin;
