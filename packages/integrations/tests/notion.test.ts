import { describe, expect, it } from "vitest";
import {
  createNotionClient,
  NOTION_NOT_PUBLISHED_WARNING,
  revokeNotionToken,
} from "../src/integrations/notion/client";
import { bodyOf, json, mockFetch, networkError } from "./helpers";

const TOKEN = "ntn_token";
const PAGE_ID = "59833787-2cf9-4fdf-8782-e53db20768a5";
const PAGE = {
  object: "page",
  id: PAGE_ID,
  url: "https://www.notion.so/Menu-598337872cf94fdf8782e53db20768a5",
  public_url: null,
  last_edited_time: "2026-01-01T00:00:00.000Z",
  icon: { type: "emoji", emoji: "🍕" },
  properties: { title: { type: "title", title: [{ plain_text: "Menu" }] } },
};

describe("NotionClient", () => {
  it("searches pages with the Notion-Version header", async () => {
    const { calls } = mockFetch(
      json({ results: [PAGE], has_more: true, next_cursor: PAGE_ID })
    );
    const page = await createNotionClient(TOKEN).list({ search: "menu" });
    expect(calls[0]?.url).toBe("https://api.notion.com/v1/search");
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.headers["notion-version"]).toBe("2022-06-28");
    expect(bodyOf(calls[0])).toMatchObject({
      query: "menu",
      filter: { property: "object", value: "page" },
      page_size: 50,
    });
    expect(page.items[0]).toEqual({
      id: PAGE_ID,
      name: "Menu",
      kind: "page",
      modifiedAt: PAGE.last_edited_time,
      emoji: "🍕",
    });
    expect(page.nextCursor).toBe(PAGE_ID);
  });

  it("passes start_cursor and drops archived pages", async () => {
    const { calls } = mockFetch(
      json({
        results: [PAGE, { ...PAGE, id: "x", archived: true }],
        has_more: false,
        next_cursor: null,
      })
    );
    const page = await createNotionClient(TOKEN).list({ cursor: PAGE_ID });
    expect(bodyOf(calls[0])).toMatchObject({ start_cursor: PAGE_ID });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeUndefined();
  });

  it("uses the public URL of a published page", async () => {
    mockFetch(
      json({ ...PAGE, public_url: "https://acme.notion.site/Menu-5983" })
    );
    const result = await createNotionClient(TOKEN).createShareLink({
      id: PAGE_ID,
      kind: "page",
    });
    expect(result).toEqual({
      url: "https://acme.notion.site/Menu-5983",
      access: "public",
      name: "Menu",
    });
  });

  it("warns when the page isn't published", async () => {
    const { calls } = mockFetch(json(PAGE));
    const result = await createNotionClient(TOKEN).createShareLink({
      id: PAGE_ID,
      kind: "page",
    });
    expect(calls[0]?.url).toBe(`https://api.notion.com/v1/pages/${PAGE_ID}`);
    expect(result.access).toBe("restricted");
    expect(result.url).toBe(PAGE.url);
    expect(result.warning).toBe(NOTION_NOT_PUBLISHED_WARNING);
  });

  it("rejects ids that aren't UUIDs", async () => {
    const { fn } = mockFetch();
    await expect(
      createNotionClient(TOKEN).createShareLink({
        id: "../users",
        kind: "page",
      })
    ).rejects.toMatchObject({ code: "bad_request" });
    expect(fn).not.toHaveBeenCalled();
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [429, "rate_limited"],
  ] as const)("maps %i to %s", async (status, code) => {
    mockFetch(json({ object: "error", message: "x" }, status));
    await expect(createNotionClient(TOKEN).list()).rejects.toMatchObject({
      code,
      provider: "notion",
    });
  });

  it("maps network failures", async () => {
    mockFetch(networkError());
    await expect(createNotionClient(TOKEN).getAccount()).rejects.toMatchObject({
      code: "network",
    });
  });

  it("revokes with Basic auth and a JSON body", async () => {
    const { calls } = mockFetch(json({ request_id: "r" }));
    await revokeNotionToken({
      token: TOKEN,
      clientId: "cid",
      clientSecret: "sec",
    });
    expect(calls[0]?.url).toBe("https://api.notion.com/v1/oauth/revoke");
    expect(calls[0]?.headers.authorization).toBe(
      `Basic ${Buffer.from("cid:sec").toString("base64")}`
    );
    expect(bodyOf(calls[0])).toEqual({ token: TOKEN });
  });
});
