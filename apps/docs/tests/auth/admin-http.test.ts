// Better Auth's admin plugin is used only server-side, through auth.api, from
// the app's admin panel (its own admin check, rate limit, reason and audit
// log). Over HTTP every admin endpoint answers 404 (packages/auth/admin-http.ts):
// otherwise a stolen admin cookie could change any account directly, for
// example set an email marked verified or turn two-step verification off.
// The list is checked against the plugin's own endpoints, so an upgrade that
// adds one fails here, and any other /admin/ path is refused too.
import { ADMIN_HTTP_PATHS, isAdminHttpPath } from "@repo/auth/admin-http";
import { auth } from "@repo/auth/server";
import { describe, expect, it } from "vitest";

const ORIGIN = "http://localhost:3000";
const BASE = "/api/auth";

const registered = () =>
  Object.values(auth.api as Record<string, { path?: string }>)
    .map((endpoint) => endpoint.path)
    .filter((path): path is string => typeof path === "string");

async function call(method: "GET" | "POST", path: string) {
  return auth.handler(
    new Request(`${ORIGIN}${BASE}${path}`, {
      method,
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        cookie: "better-auth.session_token=stolen.cookie",
      },
      body: method === "POST" ? JSON.stringify({ userId: "u_1" }) : undefined,
    }),
  );
}

describe("the admin plugin over HTTP", () => {
  it("lists every admin endpoint the plugin registers", () => {
    const admin = registered().filter((path) => path.startsWith("/admin/"));
    expect(admin.length).toBeGreaterThan(0);
    expect([...admin].sort()).toEqual([...ADMIN_HTTP_PATHS].sort());
    const disabled = new Set(
      (auth as unknown as { options: { disabledPaths?: string[] } }).options
        .disabledPaths,
    );
    for (const path of admin) expect(disabled.has(path), path).toBe(true);
  });

  it("answers 404 for each of them, GET or POST", async () => {
    for (const path of ADMIN_HTTP_PATHS) {
      for (const method of ["GET", "POST"] as const) {
        expect((await call(method, path)).status, `${method} ${path}`).toBe(
          404,
        );
      }
    }
  });

  it("refuses any other path under /admin/, however it's written", async () => {
    for (const path of [
      "/admin/a-future-endpoint",
      "/Admin/update-user",
      "/admin%2Fupdate-user",
      "//admin/update-user",
    ]) {
      expect((await call("POST", path)).status, path).toBe(404);
    }
  });

  it("leaves the rest of the auth API alone", async () => {
    expect((await call("GET", "/ok")).status).toBe(200);
    expect(isAdminHttpPath(`${BASE}/get-session`, BASE)).toBe(false);
    expect(isAdminHttpPath(`${BASE}/administrator-notes`, BASE)).toBe(false);
    expect(isAdminHttpPath(`${BASE}/admin/list-users`, BASE)).toBe(true);
  });
});
