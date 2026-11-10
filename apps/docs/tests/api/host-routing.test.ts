// What a customer's custom domain serves (app/dashboard/domains/_lib/
// host-routing.ts, used by proxy.ts), as content/docs/custom-domains.mdx
// describes it: `/<slug>` (generated or a custom back-half) is the short link,
// `/p/<slug>` its hosted page, the page APIs pass through, `/` is a small page
// and nothing else of QRdx is reachable. Runs against in-memory tables.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);

const { routeCustomDomain } = await import(
  "@/app/dashboard/domains/_lib/host-routing"
);

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.seed("customDomain", [
    { id: "dom_brand", hostname: "go.brand.com", verified: true },
  ]);
});

const get = (path: string, host = "go.brand.com") =>
  routeCustomDomain(
    new NextRequest(new URL(path, `https://${host}`), { headers: { host } }),
  );

/** Where a rewrite sends the request (Next's middleware header). */
const rewrittenTo = (response: Response | null) => {
  const target = response?.headers.get("x-middleware-rewrite");
  return target ? new URL(target).pathname : null;
};

describe("a verified custom domain", () => {
  it("sends generated slugs and custom back-halves to the short link", async () => {
    for (const slug of [
      "Ab3xK9q",
      "spring-menu",
      "Spring_Menu",
      "pricing",
      "abc",
    ]) {
      const response = await get(`/${slug}`);
      expect(rewrittenTo(response), slug).toBe(`/q/${slug}`);
      expect(
        response?.headers.get("x-middleware-request-x-qrdx-custom-domain"),
      ).toBe("dom_brand");
    }
  });

  it("sends /p/<slug> to the hosted page", async () => {
    expect(rewrittenTo(await get("/p/spring-menu"))).toBe("/p/spring-menu");
  });

  it("sends GS1 Digital Links to the product page lookup", async () => {
    for (const path of [
      "/01/09506000134352",
      "/01/09506000134352/10/LOT42/21/0007",
    ]) {
      const response = await get(path);
      expect(rewrittenTo(response), path).toBe(`/gs1${path}`);
      expect(
        response?.headers.get("x-middleware-request-x-qrdx-custom-domain"),
      ).toBe("dom_brand");
    }
  });

  it("lets the hosted pages' APIs through untouched", async () => {
    const response = await get("/api/events");
    expect(response?.headers.get("x-middleware-next")).toBe("1");
    expect(rewrittenTo(response)).toBeNull();
  });

  it("serves nothing else of QRdx", async () => {
    for (const path of [
      "/favicon.ico",
      "/robots.txt",
      "/dashboard/codes",
      "/api/v1/codes",
      "/ab",
      "/-menu",
    ]) {
      const response = await get(path);
      expect(rewrittenTo(response), path).toBeNull();
      expect(response?.status, path).toBe(404);
    }
    expect((await get("/"))?.status).toBe(200);
  });
});

describe("QRdx's own hosts", () => {
  it("are left to the app", async () => {
    expect(await get("/spring-menu", "localhost:3000")).toBeNull();
  });
});
