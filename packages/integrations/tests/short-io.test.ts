import { describe, expect, it } from "vitest";
import type { IntegrationApiError } from "../src/core/http-client";
import { createShortIoClient } from "../src/integrations/short-io/client";
import { bodyOf, json, mockFetch, networkError } from "./helpers";

const KEY = "sk_short_123";
const LINK = {
  idString: "lnk_1",
  shortURL: "http://go.acme.com/menu",
  secureShortURL: "https://go.acme.com/menu",
  originalURL: "https://acme.com/menu",
  path: "menu",
  title: "Menu",
  tags: ["print"],
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("ShortIoClient", () => {
  it("sends the raw secret key as Authorization", async () => {
    const { calls } = mockFetch(json([{ id: 12, hostname: "go.acme.com" }]));
    const domains = await createShortIoClient(KEY).listDomains();
    expect(calls[0]?.url).toBe("https://api.short.io/api/domains");
    expect(calls[0]?.headers.authorization).toBe(KEY);
    expect(domains).toEqual([
      { id: "12", hostname: "go.acme.com", branded: true },
    ]);
  });

  it("lists links on the saved domain with pageToken", async () => {
    const { calls } = mockFetch(
      json({ links: [LINK], count: 1, nextPageToken: "tok2" })
    );
    const page = await createShortIoClient(KEY, {
      defaultDomain: { id: "12", hostname: "go.acme.com" },
    }).listLinks({ cursor: "tok1", limit: 500 });
    const url = new URL(calls[0]?.url ?? "");
    expect(url.pathname).toBe("/api/links");
    expect(url.searchParams.get("domain_id")).toBe("12");
    expect(url.searchParams.get("limit")).toBe("150");
    expect(url.searchParams.get("pageToken")).toBe("tok1");
    expect(page.nextCursor).toBe("tok2");
    expect(page.links[0]).toMatchObject({
      id: "lnk_1",
      shortUrl: "https://go.acme.com/menu",
      domain: "go.acme.com",
      tags: ["print"],
    });
  });

  it("falls back to the first domain when none is saved", async () => {
    const { calls } = mockFetch(
      json([{ id: 7, hostname: "x.link" }]),
      json({ links: [], nextPageToken: null })
    );
    const page = await createShortIoClient(KEY).listLinks();
    expect(calls[1]?.url).toContain("domain_id=7");
    expect(page.nextCursor).toBeUndefined();
  });

  it("creates a link on the domain hostname with a path", async () => {
    const { calls } = mockFetch(json(LINK));
    const link = await createShortIoClient(KEY).createLink({
      longUrl: "https://acme.com/menu",
      domain: { id: "12", hostname: "go.acme.com" },
      slug: "menu",
      title: "Menu",
    });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://api.short.io/links");
    expect(bodyOf(calls[0])).toEqual({
      domain: "go.acme.com",
      originalURL: "https://acme.com/menu",
      path: "menu",
      title: "Menu",
    });
    expect(link.shortUrl).toBe("https://go.acme.com/menu");
  });

  it("errors clearly when the account has no domain", async () => {
    mockFetch(json([]));
    await expect(
      createShortIoClient(KEY).createLink({ longUrl: "https://a.test" })
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("updates a destination", async () => {
    const { calls } = mockFetch(
      json({ ...LINK, originalURL: "https://new.test" })
    );
    const link = await createShortIoClient(KEY).updateLinkDestination(
      "lnk_1",
      "https://new.test"
    );
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://api.short.io/links/lnk_1");
    expect(bodyOf(calls[0])).toEqual({ originalURL: "https://new.test" });
    expect(link.longUrl).toBe("https://new.test");
  });

  it("explains a plan restriction on update", async () => {
    mockFetch(json({ error: "Upgrade" }, 402));
    const error = (await createShortIoClient(KEY)
      .updateLinkDestination("lnk_1", "https://new.test")
      .catch((e: unknown) => e)) as IntegrationApiError;
    expect(error.code).toBe("upgrade_required");
  });

  it("rejects a forged domain id", async () => {
    const { fn } = mockFetch();
    await expect(
      createShortIoClient(KEY).listLinks({ domainId: "1&x=2" })
    ).rejects.toMatchObject({ code: "bad_request" });
    expect(fn).not.toHaveBeenCalled();
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [429, "rate_limited"],
  ] as const)("maps %i to %s", async (status, code) => {
    mockFetch(json({ error: "Unauthorized" }, status));
    await expect(createShortIoClient(KEY).listDomains()).rejects.toMatchObject({
      code,
      provider: "short-io",
    });
  });

  it("maps network failures", async () => {
    mockFetch(networkError());
    await expect(createShortIoClient(KEY).listDomains()).rejects.toMatchObject({
      code: "network",
    });
  });
});
