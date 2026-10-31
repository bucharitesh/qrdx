import { describe, expect, it } from "vitest";
import {
  createBoxClient,
  revokeBoxToken,
} from "../src/integrations/box/client";
import { bodyOf, json, mockFetch, networkError } from "./helpers";

const TOKEN = "box-token";

describe("BoxClient", () => {
  it("lists the root folder with offset paging", async () => {
    const { calls } = mockFetch(
      json({
        entries: [
          { type: "folder", id: "11", name: "Docs" },
          { type: "file", id: "22", name: "menu.pdf", size: 10 },
          { type: "web_link", id: "33", name: "Bookmark" },
        ],
        total_count: 250,
        offset: 0,
        limit: 100,
      })
    );
    const page = await createBoxClient(TOKEN).list();
    const url = new URL(calls[0]?.url ?? "");
    expect(url.pathname).toBe("/2.0/folders/0/items");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(page.items.map((item) => item.id)).toEqual(["11", "22"]);
    expect(page.nextCursor).toBe("3");
  });

  it("searches", async () => {
    const { calls } = mockFetch(json({ entries: [], total_count: 0 }));
    const page = await createBoxClient(TOKEN).list({
      search: "menu",
      cursor: "100",
    });
    const url = new URL(calls[0]?.url ?? "");
    expect(url.pathname).toBe("/2.0/search");
    expect(url.searchParams.get("query")).toBe("menu");
    expect(url.searchParams.get("offset")).toBe("100");
    expect(page.nextCursor).toBeUndefined();
  });

  it("rejects non-numeric ids and cursors", async () => {
    const { fn } = mockFetch();
    const client = createBoxClient(TOKEN);
    await expect(client.list({ folderId: "0/../x" })).rejects.toMatchObject({
      code: "bad_request",
    });
    await expect(client.list({ cursor: "abc" })).rejects.toMatchObject({
      code: "bad_request",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("creates an open shared link with the download url", async () => {
    const { calls } = mockFetch(
      json({
        shared_link: {
          url: "https://app.box.com/s/abc",
          download_url: "https://app.box.com/shared/static/abc.pdf",
          effective_access: "open",
        },
      })
    );
    const result = await createBoxClient(TOKEN).createShareLink({
      id: "22",
      kind: "file",
    });
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toBe(
      "https://api.box.com/2.0/files/22?fields=shared_link"
    );
    expect(bodyOf(calls[0])).toEqual({ shared_link: { access: "open" } });
    expect(result).toMatchObject({
      url: "https://app.box.com/s/abc",
      directUrl: "https://app.box.com/shared/static/abc.pdf",
      access: "public",
    });
  });

  it("uses /folders for folders", async () => {
    const { calls } = mockFetch(
      json({ shared_link: { url: "https://app.box.com/s/f", access: "open" } })
    );
    const result = await createBoxClient(TOKEN).createShareLink({
      id: "11",
      kind: "folder",
    });
    expect(calls[0]?.url).toContain("/2.0/folders/11?");
    expect(result.directUrl).toBeUndefined();
  });

  it("falls back to a company link with a warning", async () => {
    const { calls } = mockFetch(
      json({ code: "access_denied_insufficient_permissions" }, 403),
      json({
        shared_link: {
          url: "https://acme.app.box.com/s/abc",
          effective_access: "company",
        },
      })
    );
    const result = await createBoxClient(TOKEN).createShareLink({
      id: "22",
      kind: "file",
    });
    expect(bodyOf(calls[1])).toEqual({ shared_link: { access: "company" } });
    expect(result.access).toBe("organization");
    expect(result.warning).toContain("company");
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [429, "rate_limited"],
  ] as const)("maps %i to %s", async (status, code) => {
    mockFetch(json({ message: "x" }, status));
    await expect(createBoxClient(TOKEN).getAccount()).rejects.toMatchObject({
      code,
      provider: "box",
    });
  });

  it("maps network failures", async () => {
    mockFetch(networkError());
    await expect(createBoxClient(TOKEN).list()).rejects.toMatchObject({
      code: "network",
    });
  });

  it("revokes with client credentials in a form body", async () => {
    const { calls } = mockFetch(new Response(null, { status: 200 }));
    await revokeBoxToken({
      token: TOKEN,
      clientId: "cid",
      clientSecret: "sec",
    });
    expect(calls[0]?.url).toBe("https://api.box.com/oauth2/revoke");
    expect(calls[0]?.headers["content-type"]).toBe(
      "application/x-www-form-urlencoded"
    );
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toEqual({
      client_id: "cid",
      client_secret: "sec",
      token: TOKEN,
    });
  });
});
