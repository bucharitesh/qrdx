// Signed-out visitors to signed-in pages go to /sign-in?next=<path> and come
// back after signing in (proxy.ts, the page guards, app/(app)/(auth)/sign-in).
// `next` is untrusted, so lib/safe-redirect only accepts same-origin paths.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NEXT_PATH,
  SIGN_IN_PATH,
  safeNextPath,
  signInPath,
} from "@/lib/safe-redirect";

const state = vi.hoisted(() => ({ signedIn: false }));

vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.signedIn ? { user: { id: "u1" }, session: {} } : null,
    },
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("@/app/(app)/dashboard/domains/_lib/host-routing", () => ({
  routeCustomDomain: async () => null,
}));

beforeEach(() => {
  state.signedIn = false;
});

describe("safeNextPath", () => {
  it("keeps same-origin paths, with their query and hash", () => {
    for (const path of [
      "/dashboard",
      "/settings/developers",
      "/dashboard/webhooks?tab=log",
      "/settings/account?linked=github#sign-in",
      "/oauth/authorize?client_id=abc&scope=codes%3Aread",
      "/",
    ]) {
      expect(safeNextPath(path)).toBe(path);
    }
  });

  it("rejects other origins and anything a browser could read as one", () => {
    for (const value of [
      "https://evil.example/dashboard",
      "http:/evil.example",
      "//evil.example",
      "//evil.example/settings",
      "/\\evil.example",
      "\\\\evil.example",
      "/dashboard\\..\\x",
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r\n//evil.example",
      "/ /evil.example",
      "/\u0000x",
      "/\u007fx",
      "javascript:alert(1)",
      "data:text/html,hi",
      "dashboard",
      "",
      `/${"a".repeat(2048)}`,
    ]) {
      expect(safeNextPath(value)).toBe(DEFAULT_NEXT_PATH);
    }
  });

  it("rejects non-strings and the sign-in page itself (a loop)", () => {
    expect(safeNextPath(undefined)).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath(["/dashboard"])).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath(42)).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/sign-in")).toBe(DEFAULT_NEXT_PATH);
    expect(safeNextPath("/sign-in?next=/dashboard")).toBe(DEFAULT_NEXT_PATH);
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//evil.example", "")).toBe("");
    expect(safeNextPath(null, "/playground")).toBe("/playground");
  });
});

describe("signInPath", () => {
  it("encodes `next`", () => {
    expect(signInPath("/dashboard/acme/settings/webhooks?tab=log")).toBe(
      "/sign-in?next=%2Fdashboard%2Facme%2Fsettings%2Fwebhooks%3Ftab%3Dlog",
    );
  });

  it("drops an unsafe or missing `next`", () => {
    expect(signInPath("//evil.example")).toBe(SIGN_IN_PATH);
    expect(signInPath()).toBe(SIGN_IN_PATH);
  });
});

describe("proxy.ts", () => {
  it("sends signed-out visitors to sign in, returning to the page and query", async () => {
    const proxy = (await import("@/proxy")).default;
    for (const path of [
      "/settings/account",
      "/dashboard/acme/settings/webhooks?tab=log",
      "/dashboard",
      "/dashboard?to=settings/developers&new=1",
    ]) {
      const response = await proxy(
        new NextRequest(`http://localhost:3000${path}`),
      );
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location") ?? "");
      expect(location.pathname).toBe("/sign-in");
      expect(location.searchParams.get("next")).toBe(path);
    }
  });

  it("has no redirects for old dashboard links (they 404 as workspace slugs)", async () => {
    state.signedIn = true;
    const proxy = (await import("@/proxy")).default;
    for (const path of [
      "/dashboard",
      "/dashboard?q=menu&folder=f1",
      "/dashboard/codes",
      "/dashboard/team",
    ]) {
      const response = await proxy(
        new NextRequest(`http://localhost:3000${path}`),
      );
      expect(response.headers.get("location"), path).toBeNull();
    }
  });

  // NextResponse.next({ request: { headers } }) passes request headers on as
  // x-middleware-request-<name>, listed in x-middleware-override-headers.
  const forwarded = (response: Response, name: string) =>
    response.headers.get(`x-middleware-request-${name}`);

  it("tells the page and its server actions which workspace the URL names", async () => {
    state.signedIn = true;
    const proxy = (await import("@/proxy")).default;
    for (const method of ["GET", "POST"]) {
      const response = await proxy(
        new NextRequest("http://localhost:3000/dashboard/acme/codes/c1", {
          method,
          headers: { "x-qrdx-workspace": "someone-else" },
        }),
      );
      expect(forwarded(response, "x-qrdx-workspace"), method).toBe("acme");
    }
  });

  it("drops a workspace header the browser sends to other app pages", async () => {
    state.signedIn = true;
    const proxy = (await import("@/proxy")).default;
    const response = await proxy(
      new NextRequest("http://localhost:3000/settings/account", {
        headers: { "x-qrdx-workspace": "someone-else" },
      }),
    );
    expect(response.headers.get("location")).toBeNull();
    expect(
      response.headers.get("x-middleware-override-headers") ?? "",
    ).not.toContain("x-qrdx-workspace");
    expect(forwarded(response, "x-qrdx-workspace")).toBeNull();
  });

  it("lets signed-in visitors through", async () => {
    state.signedIn = true;
    const proxy = (await import("@/proxy")).default;
    const response = await proxy(
      new NextRequest("http://localhost:3000/settings/developers"),
    );
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("/sign-in", () => {
  const render = async (next?: string | string[]) => {
    const { default: SignInPage } = await import(
      "@/app/(app)/(auth)/sign-in/page"
    );
    return SignInPage({ searchParams: Promise.resolve({ next }) });
  };

  it("sends signed-in visitors straight to `next`", async () => {
    state.signedIn = true;
    await expect(render("/settings/developers")).rejects.toThrow(
      "redirect /settings/developers",
    );
  });

  it("never redirects signed-in visitors off the site", async () => {
    state.signedIn = true;
    await expect(render("//evil.example")).rejects.toThrow(
      `redirect ${DEFAULT_NEXT_PATH}`,
    );
  });

  it("asks signed-out visitors to sign in, keeping only a safe `next`", async () => {
    const page = await render("/dashboard/webhooks");
    expect((page.props as { next: string }).next).toBe("/dashboard/webhooks");
    const evil = await render(["https://evil.example", "/dashboard"]);
    expect((evil.props as { next: string }).next).toBe(DEFAULT_NEXT_PATH);
  });
});
