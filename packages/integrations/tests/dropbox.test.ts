import { describe, expect, it } from "vitest";
import {
  createDropboxClient,
  revokeDropboxToken,
  toDropboxDirectUrl,
} from "../src/integrations/dropbox/client";
import { bodyOf, json, mockFetch, networkError } from "./helpers";

const TOKEN = "sl.dropbox-token";
const FILE = {
  ".tag": "file",
  id: "id:abc123",
  name: "menu.pdf",
  path_display: "/Restaurant/menu.pdf",
  size: 1024,
  server_modified: "2026-01-01T00:00:00Z",
};
const FOLDER = { ".tag": "folder", id: "id:fold1", name: "Restaurant" };
const LINK_URL = "https://www.dropbox.com/scl/fi/xyz/menu.pdf?rlkey=k&dl=0";

describe("DropboxClient", () => {
  it("lists the root with a Bearer token, folders first", async () => {
    const { calls } = mockFetch(
      json({ entries: [FILE, FOLDER], cursor: "c1", has_more: true })
    );
    const page = await createDropboxClient(TOKEN).list();
    expect(calls[0]?.url).toBe(
      "https://api.dropboxapi.com/2/files/list_folder"
    );
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(bodyOf(calls[0])).toEqual({ path: "", limit: 100 });
    expect(page.items.map((item) => item.kind)).toEqual(["folder", "file"]);
    expect(page.items[1]).toMatchObject({
      id: "id:abc123",
      path: "/Restaurant/menu.pdf",
      size: 1024,
    });
    expect(page.nextCursor).toBe("l:c1");
  });

  it("opens a folder by id and continues with the cursor", async () => {
    const { calls } = mockFetch(
      json({ entries: [], cursor: "c2", has_more: false }),
      json({ entries: [FILE], cursor: "c3", has_more: false })
    );
    const client = createDropboxClient(TOKEN);
    await client.list({ folderId: "id:fold1" });
    expect(bodyOf(calls[0])).toEqual({ path: "id:fold1", limit: 100 });
    const page = await client.list({ cursor: "l:c2" });
    expect(calls[1]?.url).toContain("/files/list_folder/continue");
    expect(bodyOf(calls[1])).toEqual({ cursor: "c2" });
    expect(page.nextCursor).toBeUndefined();
  });

  it("searches with search_v2", async () => {
    const { calls } = mockFetch(
      json({
        matches: [{ metadata: { ".tag": "metadata", metadata: FILE } }],
        has_more: true,
        cursor: "s1",
      })
    );
    const page = await createDropboxClient(TOKEN).list({ search: "menu" });
    expect(calls[0]?.url).toContain("/files/search_v2");
    expect(bodyOf(calls[0])).toMatchObject({ query: "menu" });
    expect(page.items[0]?.name).toBe("menu.pdf");
    expect(page.nextCursor).toBe("s:s1");
  });

  it("rejects paths that aren't Dropbox ids", async () => {
    const { fn } = mockFetch();
    await expect(
      createDropboxClient(TOKEN).list({ folderId: "/secret" })
    ).rejects.toMatchObject({ code: "bad_request" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("creates a public shared link with a raw direct link", async () => {
    const { calls } = mockFetch(
      json({
        url: LINK_URL,
        name: "menu.pdf",
        link_permissions: { resolved_visibility: { ".tag": "public" } },
      })
    );
    const result = await createDropboxClient(TOKEN).createShareLink({
      id: "id:abc123",
      kind: "file",
    });
    expect(calls[0]?.url).toContain(
      "/sharing/create_shared_link_with_settings"
    );
    expect(bodyOf(calls[0])).toEqual({ path: "id:abc123" });
    expect(result.url).toBe(LINK_URL);
    expect(result.access).toBe("public");
    expect(result.warning).toBeUndefined();
    expect(result.directUrl).toBe(
      "https://www.dropbox.com/scl/fi/xyz/menu.pdf?rlkey=k&raw=1"
    );
  });

  it("reuses the existing link from the 409 metadata", async () => {
    const { calls } = mockFetch(
      json(
        {
          error_summary: "shared_link_already_exists/metadata/..",
          error: {
            ".tag": "shared_link_already_exists",
            shared_link_already_exists: { metadata: { url: LINK_URL } },
          },
        },
        409
      )
    );
    const result = await createDropboxClient(TOKEN).createShareLink({
      id: "id:abc123",
      kind: "file",
    });
    expect(calls).toHaveLength(1);
    expect(result.url).toBe(LINK_URL);
  });

  it("falls back to list_shared_links when the 409 has no metadata", async () => {
    const { calls } = mockFetch(
      json({ error_summary: "shared_link_already_exists/.." }, 409),
      json({
        links: [
          {
            url: LINK_URL,
            link_permissions: { resolved_visibility: { ".tag": "team_only" } },
          },
        ],
      })
    );
    const result = await createDropboxClient(TOKEN).createShareLink({
      id: "id:abc123",
      kind: "file",
    });
    expect(calls[1]?.url).toContain("/sharing/list_shared_links");
    expect(bodyOf(calls[1])).toEqual({ path: "id:abc123", direct_only: true });
    expect(result.access).toBe("organization");
    expect(result.warning).toContain("team");
  });

  it("explains other 409 errors", async () => {
    mockFetch(json({ error_summary: "email_not_verified/.." }, 409));
    await expect(
      createDropboxClient(TOKEN).createShareLink({ id: "id:a", kind: "file" })
    ).rejects.toMatchObject({
      code: "conflict",
      message: "Dropbox: verify your Dropbox email address before sharing.",
    });
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [429, "rate_limited"],
  ] as const)("maps %i to %s", async (status, code) => {
    mockFetch(json({ error_summary: "expired_access_token/" }, status));
    await expect(createDropboxClient(TOKEN).list()).rejects.toMatchObject({
      code,
      provider: "dropbox",
    });
  });

  it("maps network failures", async () => {
    mockFetch(networkError());
    await expect(createDropboxClient(TOKEN).getAccount()).rejects.toMatchObject(
      { code: "network" }
    );
  });

  it("revokes the token", async () => {
    const { calls } = mockFetch(json(null));
    await revokeDropboxToken(TOKEN);
    expect(calls[0]?.url).toBe(
      "https://api.dropboxapi.com/2/auth/token/revoke"
    );
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("builds raw links", () => {
    expect(toDropboxDirectUrl("https://www.dropbox.com/s/a/b.pdf?dl=0")).toBe(
      "https://www.dropbox.com/s/a/b.pdf?raw=1"
    );
  });
});
