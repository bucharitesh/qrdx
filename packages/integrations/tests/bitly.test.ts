import { describe, expect, it } from "vitest";
import type { IntegrationApiError } from "../src/core/http-client";
import { createBitlyClient } from "../src/integrations/bitly/client";
import { bodyOf, json, mockFetch, networkError } from "./helpers";

const TOKEN = "bitly-token-123";
const BITLINK = {
  id: "go.acme.com/3xYz",
  link: "https://go.acme.com/3xYz",
  long_url: "https://acme.com/spring",
  title: "Spring",
  tags: ["print"],
  created_at: "2026-01-01T00:00:00+0000",
};

describe("BitlyClient", () => {
  it("sends the token as a Bearer header", async () => {
    const { calls } = mockFetch(
      json({ login: "ana", name: "Ana", default_group_guid: "Bg1" })
    );
    const account = await createBitlyClient(TOKEN).getAccount();
    expect(calls[0]?.url).toBe("https://api-ssl.bitly.com/v4/user");
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(account).toEqual({ id: "ana", name: "Ana", email: undefined });
  });

  it("lists branded domains before bit.ly", async () => {
    mockFetch(json({ bsds: ["go.acme.com"] }));
    const domains = await createBitlyClient(TOKEN).listDomains();
    expect(domains).toEqual([
      { id: "go.acme.com", hostname: "go.acme.com", branded: true },
      { id: "bit.ly", hostname: "bit.ly", isDefault: true },
    ]);
  });

  it("lists groups", async () => {
    mockFetch(
      json({
        groups: [
          { guid: "Bg1", name: "Main" },
          { guid: "Bg2", name: "Old", is_active: false },
        ],
      })
    );
    await expect(createBitlyClient(TOKEN).listGroups()).resolves.toEqual([
      { id: "Bg1", name: "Main" },
    ]);
  });

  it("pages links with search_after and searches with query", async () => {
    const { calls } = mockFetch(
      json({ links: [BITLINK], pagination: { search_after: "cur2" } })
    );
    const page = await createBitlyClient(TOKEN, { groupGuid: "Bg1" }).listLinks(
      { search: "spring", cursor: "cur1", limit: 25 }
    );
    const url = new URL(calls[0]?.url ?? "");
    expect(url.pathname).toBe("/v4/groups/Bg1/bitlinks");
    expect(url.searchParams.get("size")).toBe("25");
    expect(url.searchParams.get("search_after")).toBe("cur1");
    expect(url.searchParams.get("query")).toBe("spring");
    expect(page.nextCursor).toBe("cur2");
    expect(page.links[0]).toMatchObject({
      id: "go.acme.com/3xYz",
      shortUrl: "https://go.acme.com/3xYz",
      longUrl: "https://acme.com/spring",
      domain: "go.acme.com",
      tags: ["print"],
    });
  });

  it("looks up the default group when none is saved", async () => {
    const { calls } = mockFetch(
      json({ login: "ana", default_group_guid: "Bg9" }),
      json({ links: [], pagination: {} })
    );
    const page = await createBitlyClient(TOKEN).listLinks();
    expect(calls[1]?.url).toContain("/groups/Bg9/bitlinks");
    expect(page.nextCursor).toBeUndefined();
  });

  it("creates a link on the picked domain in the group", async () => {
    const { calls } = mockFetch(json(BITLINK, 201));
    const link = await createBitlyClient(TOKEN, {
      groupGuid: "Bg1",
    }).createLink({
      longUrl: "https://acme.com/spring",
      domain: { id: "go.acme.com", hostname: "go.acme.com" },
      title: "Spring",
      slug: "ignored",
    });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe("https://api-ssl.bitly.com/v4/bitlinks");
    expect(calls[0]?.headers["content-type"]).toBe("application/json");
    expect(bodyOf(calls[0])).toEqual({
      long_url: "https://acme.com/spring",
      domain: "go.acme.com",
      group_guid: "Bg1",
      title: "Spring",
    });
    expect(link.shortUrl).toBe("https://go.acme.com/3xYz");
  });

  it("defaults to bit.ly", async () => {
    const { calls } = mockFetch(json({ ...BITLINK, id: "bit.ly/a" }));
    await createBitlyClient(TOKEN, { groupGuid: "Bg1" }).createLink({
      longUrl: "https://acme.com",
    });
    expect((bodyOf(calls[0]) as { domain: string }).domain).toBe("bit.ly");
  });

  it("updates a destination with PATCH", async () => {
    const { calls } = mockFetch(
      json({ ...BITLINK, long_url: "https://new.test" })
    );
    const link = await createBitlyClient(TOKEN).updateLinkDestination(
      "go.acme.com/3xYz",
      "https://new.test"
    );
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.url).toBe(
      "https://api-ssl.bitly.com/v4/bitlinks/go.acme.com/3xYz"
    );
    expect(bodyOf(calls[0])).toEqual({ long_url: "https://new.test" });
    expect(link.longUrl).toBe("https://new.test");
  });

  it("explains when the plan can't edit destinations", async () => {
    mockFetch(json({ message: "UPGRADE_REQUIRED" }, 402));
    const error = (await createBitlyClient(TOKEN)
      .updateLinkDestination("bit.ly/a", "https://x.test")
      .catch((e: unknown) => e)) as IntegrationApiError;
    expect(error.code).toBe("upgrade_required");
    expect(error.message).toContain("paid plans");
  });

  it("rejects malformed link ids before calling Bitly", async () => {
    const { fn } = mockFetch();
    await expect(
      createBitlyClient(TOKEN).updateLinkDestination(
        "../user",
        "https://x.test"
      )
    ).rejects.toMatchObject({ code: "bad_request" });
    expect(fn).not.toHaveBeenCalled();
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [429, "rate_limited"],
  ] as const)("maps %i to %s", async (status, code) => {
    mockFetch(json({ message: "FORBIDDEN", description: "No access" }, status));
    await expect(createBitlyClient(TOKEN).getUser()).rejects.toMatchObject({
      code,
      provider: "bitly",
    });
  });

  it("maps network failures", async () => {
    mockFetch(networkError());
    await expect(createBitlyClient(TOKEN).getUser()).rejects.toMatchObject({
      code: "network",
    });
  });

  it("never puts the token in error messages", async () => {
    mockFetch(json({ message: "FORBIDDEN" }, 403));
    const error = (await createBitlyClient(TOKEN)
      .getUser()
      .catch((e: unknown) => e)) as Error;
    expect(error.message).not.toContain(TOKEN);
  });
});
