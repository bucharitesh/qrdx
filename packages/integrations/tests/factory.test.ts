import { describe, expect, it } from "vitest";
import {
  createFilePickerClient,
  createShortLinkClient,
  fetchConnectedAccountMetadata,
  getDefaultShortLinkDomain,
  revokeProviderToken,
  verifyShortLinkCredentials,
} from "../src/capabilities/factory";
import { BitlyClient } from "../src/integrations/bitly/client";
import { BoxClient } from "../src/integrations/box/client";
import { DropboxClient } from "../src/integrations/dropbox/client";
import { NotionClient } from "../src/integrations/notion/client";
import { OneDriveClient } from "../src/integrations/onedrive/client";
import { RebrandlyClient } from "../src/integrations/rebrandly/client";
import { ShortIoClient } from "../src/integrations/short-io/client";
import { json, mockFetch } from "./helpers";

describe("capability factory", () => {
  it("creates the right clients", () => {
    expect(createShortLinkClient("bitly", { accessToken: "t" })).toBeInstanceOf(
      BitlyClient
    );
    expect(
      createShortLinkClient("rebrandly", { accessToken: "t" })
    ).toBeInstanceOf(RebrandlyClient);
    expect(
      createShortLinkClient("short-io", { accessToken: "t" })
    ).toBeInstanceOf(ShortIoClient);
    expect(createFilePickerClient("dropbox", "t")).toBeInstanceOf(
      DropboxClient
    );
    expect(createFilePickerClient("onedrive", "t")).toBeInstanceOf(
      OneDriveClient
    );
    expect(createFilePickerClient("box", "t")).toBeInstanceOf(BoxClient);
    expect(createFilePickerClient("notion", "t")).toBeInstanceOf(NotionClient);
  });

  it("uses the saved Short.io domain", async () => {
    const { calls } = mockFetch(json({ links: [] }));
    await createShortLinkClient("short-io", {
      accessToken: "k",
      metadata: { defaultDomain: { id: "99", hostname: "go.acme.com" } },
    }).listLinks();
    expect(calls[0]?.url).toContain("domain_id=99");
    expect(
      getDefaultShortLinkDomain({ defaultDomain: { id: 1, hostname: "x" } })
    ).toBeUndefined();
  });

  it("verifies API keys and returns metadata to store", async () => {
    mockFetch(json({ login: "ana", name: "Ana", default_group_guid: "Bg1" }));
    await expect(verifyShortLinkCredentials("bitly", "t")).resolves.toEqual({
      login: "ana",
      name: "Ana",
      groupGuid: "Bg1",
      connectedWith: "token",
    });

    mockFetch(json([{ id: 5, hostname: "go.acme.com" }]));
    await expect(verifyShortLinkCredentials("short-io", "k")).resolves.toEqual({
      domainCount: 1,
      defaultDomain: { id: "5", hostname: "go.acme.com" },
    });

    mockFetch(json({ message: "Not authorized" }, 401));
    await expect(
      verifyShortLinkCredentials("rebrandly", "bad")
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("reads Notion account details from the token response", async () => {
    const { fn } = mockFetch();
    await expect(
      fetchConnectedAccountMetadata("notion", "t", {
        workspace_id: "w1",
        workspace_name: "Acme",
        owner: { user: { name: "Ana", person: { email: "ana@acme.com" } } },
      })
    ).resolves.toEqual({
      workspaceId: "w1",
      name: "Acme",
      email: "ana@acme.com",
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it("reads file picker account details from the API", async () => {
    mockFetch(json({ id: "7", name: "Ana", login: "ana@acme.com" }));
    await expect(fetchConnectedAccountMetadata("box", "t")).resolves.toEqual({
      accountId: "7",
      name: "Ana",
      email: "ana@acme.com",
    });
    await expect(fetchConnectedAccountMetadata("dub", "t")).resolves.toBeNull();
  });

  it("revokes where supported", async () => {
    const { calls } = mockFetch(json(null), new Response(null), json({}));
    const client = { clientId: "id", clientSecret: "secret" };
    await expect(
      revokeProviderToken("dropbox", { accessToken: "a" })
    ).resolves.toBe(true);
    await expect(
      revokeProviderToken("box", { accessToken: "a" }, client)
    ).resolves.toBe(true);
    await expect(
      revokeProviderToken("notion", { accessToken: "a" }, client)
    ).resolves.toBe(true);
    expect(calls.map((call) => new URL(call.url).hostname)).toEqual([
      "api.dropboxapi.com",
      "api.box.com",
      "api.notion.com",
    ]);
    await expect(
      revokeProviderToken("bitly", { accessToken: "a" })
    ).resolves.toBe(false);
    await expect(
      revokeProviderToken("box", { accessToken: "a" })
    ).resolves.toBe(false);
  });
});
