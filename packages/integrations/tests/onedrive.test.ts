import { describe, expect, it } from "vitest";
import {
  createOneDriveClient,
  isSafeGraphNextLink,
} from "../src/integrations/onedrive/client";
import { bodyOf, json, mockFetch, networkError } from "./helpers";

const TOKEN = "graph-token";
const GRAPH = "https://graph.microsoft.com/v1.0";

describe("OneDriveClient", () => {
  it("lists root children with a Bearer token, folders first", async () => {
    const { calls } = mockFetch(
      json({
        value: [
          { id: "F1", name: "a.pdf", file: { mimeType: "application/pdf" } },
          { id: "D1", name: "Docs", folder: { childCount: 2 } },
          { id: "N1", name: "Notebook", package: { type: "oneNote" } },
        ],
        "@odata.nextLink": `${GRAPH}/me/drive/root/children?$skiptoken=x`,
      })
    );
    const page = await createOneDriveClient(TOKEN).list();
    expect(calls[0]?.url.startsWith(`${GRAPH}/me/drive/root/children?`)).toBe(
      true
    );
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(page.items.map((item) => item.id)).toEqual(["D1", "F1"]);
    expect(page.nextCursor).toBe(
      `${GRAPH}/me/drive/root/children?$skiptoken=x`
    );
  });

  it("opens folders and escapes search quotes", async () => {
    const { calls } = mockFetch(json({ value: [] }), json({ value: [] }));
    const client = createOneDriveClient(TOKEN);
    await client.list({ folderId: "ABC!123" });
    expect(calls[0]?.url).toContain("/me/drive/items/ABC!123/children");
    await client.list({ search: "bob's" });
    // OData doubles single quotes inside the string literal
    expect(calls[1]?.url).toContain("search(q='bob''s')");
  });

  it("refuses next links outside the user's Graph drive", async () => {
    const { fn } = mockFetch();
    await expect(
      createOneDriveClient(TOKEN).list({
        cursor: "https://evil.test/v1.0/me/drive/x",
      })
    ).rejects.toMatchObject({ code: "bad_request" });
    await expect(
      createOneDriveClient(TOKEN).list({ folderId: ".." })
    ).rejects.toMatchObject({ code: "bad_request" });
    expect(fn).not.toHaveBeenCalled();
    expect(isSafeGraphNextLink(`${GRAPH}/me/drive/root/children`)).toBe(true);
    expect(isSafeGraphNextLink(`${GRAPH}/users/x/drive`)).toBe(false);
  });

  it("creates a view-only anonymous link", async () => {
    const { calls } = mockFetch(
      json(
        { link: { webUrl: "https://1drv.ms/b/abc", scope: "anonymous" } },
        201
      )
    );
    const result = await createOneDriveClient(TOKEN).createShareLink({
      id: "F1",
      kind: "file",
    });
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.url).toBe(`${GRAPH}/me/drive/items/F1/createLink`);
    expect(bodyOf(calls[0])).toEqual({ type: "view", scope: "anonymous" });
    expect(result).toEqual({
      url: "https://1drv.ms/b/abc",
      access: "public",
      warning: undefined,
    });
  });

  it("falls back to an organization link when anonymous links are off", async () => {
    const { calls } = mockFetch(
      json({ error: { code: "invalidRequest", message: "disabled" } }, 400),
      json({ link: { webUrl: "https://acme.sharepoint.com/:b:/x" } })
    );
    const result = await createOneDriveClient(TOKEN).createShareLink({
      id: "F1",
      kind: "file",
    });
    expect(bodyOf(calls[1])).toEqual({ type: "view", scope: "organization" });
    expect(result.access).toBe("organization");
    expect(result.warning).toContain("organization");
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [429, "rate_limited"],
  ] as const)("maps %i to %s", async (status, code) => {
    mockFetch(
      json({ error: { code: "x", message: "y" } }, status, {
        "retry-after": "5",
      })
    );
    await expect(createOneDriveClient(TOKEN).list()).rejects.toMatchObject({
      code,
      provider: "onedrive",
    });
  });

  it("does not retry createLink on 401", async () => {
    const { calls } = mockFetch(json({}, 401));
    await expect(
      createOneDriveClient(TOKEN).createShareLink({ id: "F1", kind: "file" })
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(calls).toHaveLength(1);
  });

  it("maps network failures", async () => {
    mockFetch(networkError());
    await expect(
      createOneDriveClient(TOKEN).getAccount()
    ).rejects.toMatchObject({ code: "network" });
  });

  it("reads the account from the drive owner", async () => {
    mockFetch(
      json({
        id: "drv",
        driveType: "business",
        owner: { user: { displayName: "Ana", email: "ana@acme.com" } },
      })
    );
    await expect(createOneDriveClient(TOKEN).getAccount()).resolves.toEqual({
      id: "drv",
      name: "Ana",
      email: "ana@acme.com",
    });
  });
});
