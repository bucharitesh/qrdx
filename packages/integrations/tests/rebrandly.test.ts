import { describe, expect, it } from "vitest";
import type { IntegrationApiError } from "../src/core/http-client";
import { createRebrandlyClient } from "../src/integrations/rebrandly/client";
import { bodyOf, json, mockFetch, networkError } from "./helpers";

const KEY = "rb-key-123";
const LINK = {
  id: "abc123",
  title: "Menu",
  slashtag: "menu",
  destination: "https://acme.com/menu",
  shortUrl: "go.acme.com/menu",
  createdAt: "2026-01-01T00:00:00.000Z",
  clicks: 42,
  domain: { id: "d1", fullName: "go.acme.com" },
};

describe("RebrandlyClient", () => {
  it("authenticates with the apikey header", async () => {
    const { calls } = mockFetch(
      json({
        id: "u1",
        username: "ana",
        email: "ana@acme.com",
        fullName: "Ana",
      })
    );
    const account = await createRebrandlyClient(KEY).getAccount();
    expect(calls[0]?.url).toBe("https://api.rebrandly.com/v1/account");
    expect(calls[0]?.headers.apikey).toBe(KEY);
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(account).toEqual({ id: "u1", name: "Ana", email: "ana@acme.com" });
  });

  it("lists branded domains first", async () => {
    mockFetch(
      json([
        { id: "s1", fullName: "rebrand.ly", type: "service" },
        { id: "d1", fullName: "go.acme.com", type: "user" },
      ])
    );
    const domains = await createRebrandlyClient(KEY).listDomains();
    expect(domains.map((d) => d.hostname)).toEqual([
      "go.acme.com",
      "rebrand.ly",
    ]);
    expect(domains[1]?.isDefault).toBe(true);
  });

  it("pages with `last` and maps clicks and https", async () => {
    const { calls } = mockFetch(json([LINK, { ...LINK, id: "abc124" }]));
    const page = await createRebrandlyClient(KEY).listLinks({
      limit: 2,
      cursor: "zzz",
      domainId: "d1",
    });
    const url = new URL(calls[0]?.url ?? "");
    expect(url.searchParams.get("limit")).toBe("2");
    expect(url.searchParams.get("last")).toBe("zzz");
    expect(url.searchParams.get("domain.id")).toBe("d1");
    expect(page.nextCursor).toBe("abc124");
    expect(page.links[0]).toMatchObject({
      shortUrl: "https://go.acme.com/menu",
      longUrl: "https://acme.com/menu",
      clicks: 42,
      domain: "go.acme.com",
    });
  });

  it("filters the page by search and stops on a short page", async () => {
    mockFetch(
      json([
        LINK,
        {
          ...LINK,
          id: "x",
          title: "Other",
          slashtag: "o",
          shortUrl: "go.acme.com/o",
          destination: "https://b.test",
        },
      ])
    );
    const page = await createRebrandlyClient(KEY).listLinks({ search: "menu" });
    expect(page.links).toHaveLength(1);
    expect(page.nextCursor).toBeUndefined();
  });

  it("creates a link with slashtag and domain id", async () => {
    const { calls } = mockFetch(json(LINK));
    const link = await createRebrandlyClient(KEY).createLink({
      longUrl: "https://acme.com/menu",
      slug: "menu",
      title: "Menu",
      domain: { id: "d1", hostname: "go.acme.com" },
    });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://api.rebrandly.com/v1/links");
    expect(bodyOf(calls[0])).toEqual({
      destination: "https://acme.com/menu",
      slashtag: "menu",
      title: "Menu",
      domain: { id: "d1" },
    });
    expect(link.shortUrl).toBe("https://go.acme.com/menu");
  });

  it("updates a destination keeping the title", async () => {
    const { calls } = mockFetch(
      json(LINK),
      json({ ...LINK, destination: "https://new.test" })
    );
    const link = await createRebrandlyClient(KEY).updateLinkDestination(
      "abc123",
      "https://new.test"
    );
    expect(calls[1]?.method).toBe("POST");
    expect(calls[1]?.url).toBe("https://api.rebrandly.com/v1/links/abc123");
    expect(bodyOf(calls[1])).toEqual({
      destination: "https://new.test",
      title: "Menu",
    });
    expect(link.longUrl).toBe("https://new.test");
  });

  it("explains a plan restriction on update", async () => {
    mockFetch(json(LINK), json({ code: "AccessDenied" }, 403));
    const error = (await createRebrandlyClient(KEY)
      .updateLinkDestination("abc123", "https://new.test")
      .catch((e: unknown) => e)) as IntegrationApiError;
    expect(error.code).toBe("upgrade_required");
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [429, "rate_limited"],
  ] as const)("maps %i to %s", async (status, code) => {
    mockFetch(json({ message: "Not authorized" }, status));
    await expect(createRebrandlyClient(KEY).getAccount()).rejects.toMatchObject(
      {
        code,
        provider: "rebrandly",
      }
    );
  });

  it("maps network failures", async () => {
    mockFetch(networkError());
    await expect(
      createRebrandlyClient(KEY).listDomains()
    ).rejects.toMatchObject({ code: "network" });
  });
});
