// Logos by uploaded file id (lib/qr-api/logo.ts): only a ready PNG or JPEG
// of the caller's workspace, up to 1 MB, read from QRdx's own storage through
// a short-lived signed GET, and drawn only when its first bytes are what its
// type says. Storage and the file table are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HttpError } from "@/lib/error-response";

const state = vi.hoisted(() => ({
  configured: true,
  files: new Map<
    string,
    { id: string; mime: string; size: number; storageKey: string; org: string }
  >(),
  presigned: [] as string[],
}));

vi.mock("@/lib/storage/r2", () => ({
  get isStorageConfigured() {
    return state.configured;
  },
  presignDownload: async (key: string) => {
    state.presigned.push(key);
    return `https://r2.example/${key}?signed`;
  },
}));
vi.mock("@/lib/files/service", async () => {
  const { HttpError: Http } = await import("@/lib/error-response");
  return {
    fileUrl: (id: string) => `http://localhost:3000/api/files/${id}`,
    getReadyFile: async (scope: { organizationId: string }, id: string) => {
      const file = state.files.get(id);
      if (!file || file.org !== scope.organizationId) {
        throw new Http(404, "NOT_FOUND", "File not found.");
      }
      return file;
    },
  };
});

const { readLogoDataUrl, logoFileLink, resolveLogo, LOGO_MAX_BYTES } =
  await import("@/lib/qr-api/logo");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR4nGMQVDL+j4wZSBcAAOAqFlEok64wAAAAAElFTkSuQmCC",
  "base64",
);
const scope = {
  userId: "u_alice",
  organizationId: "org_alice",
  role: "owner" as const,
};
const fetchMock = vi.fn();

beforeEach(() => {
  state.configured = true;
  state.presigned = [];
  state.files = new Map([
    [
      "cm5logo0png0000000000001",
      {
        id: "cm5logo0png0000000000001",
        mime: "image/png",
        size: PNG.length,
        storageKey: "files/o-org_alice/logo.png",
        org: "org_alice",
      },
    ],
    [
      "cm5logo0fake000000000001",
      {
        id: "cm5logo0fake000000000001",
        mime: "image/png",
        size: 10,
        storageKey: "files/o-org_alice/fake.png",
        org: "org_alice",
      },
    ],
    [
      "cm5logo0gif0000000000001",
      {
        id: "cm5logo0gif0000000000001",
        mime: "image/gif",
        size: 10,
        storageKey: "files/o-org_alice/a.gif",
        org: "org_alice",
      },
    ],
    [
      "cm5logo0huge000000000001",
      {
        id: "cm5logo0huge000000000001",
        mime: "image/png",
        size: LOGO_MAX_BYTES + 1,
        storageKey: "files/o-org_alice/huge.png",
        org: "org_alice",
      },
    ],
    [
      "cm5logo0bob0000000000001",
      {
        id: "cm5logo0bob0000000000001",
        mime: "image/png",
        size: PNG.length,
        storageKey: "files/o-org_bob/logo.png",
        org: "org_bob",
      },
    ],
  ]);
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async (url: string) =>
      new Response(url.includes("fake") ? Buffer.from("<svg onload=x>") : PNG),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("logos by file id", () => {
  it("reads the workspace's PNG from its own storage as a data URL", async () => {
    const url = await readLogoDataUrl(scope, "cm5logo0png0000000000001");
    expect(url).toBe(`data:image/png;base64,${PNG.toString("base64")}`);
    expect(state.presigned).toEqual(["files/o-org_alice/logo.png"]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://r2.example/files/o-org_alice/logo.png?signed",
    );
  });

  it("refuses other workspaces' files, other types, big files and bytes that aren't the declared type", async () => {
    const fails = async (id: string) =>
      readLogoDataUrl(scope, id).then(
        () => null,
        (error: unknown) => error as HttpError,
      );
    expect(await fails("cm5logo0bob0000000000001")).toMatchObject({
      status: 404,
    });
    expect(await fails("cm5logo0gif0000000000001")).toMatchObject({
      status: 400,
      message: expect.stringContaining("PNG or JPEG"),
    });
    expect(await fails("cm5logo0huge000000000001")).toMatchObject({
      status: 400,
    });
    expect(await fails("cm5logo0fake000000000001")).toMatchObject({
      status: 400,
      message: expect.stringContaining("isn't a PNG or JPEG"),
    });
    // Only the files that passed every check were read.
    expect(state.presigned).toEqual(["files/o-org_alice/fake.png"]);
  });

  it("says when storage isn't set up, and when there's no key", async () => {
    state.configured = false;
    await expect(
      readLogoDataUrl(scope, "cm5logo0png0000000000001"),
    ).rejects.toMatchObject({ status: 503, code: "STORAGE_NOT_CONFIGURED" });
    state.configured = true;
    await expect(
      resolveLogo({ logoFileId: "cm5logo0png0000000000001" }, null, "render"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("keeps the stable file link for saved styles, and draws quick icons itself", async () => {
    expect(await logoFileLink(scope, "cm5logo0png0000000000001")).toBe(
      "http://localhost:3000/api/files/cm5logo0png0000000000001",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    const icon = await resolveLogo({ logoIcon: "wifi" }, null, "render");
    expect(icon?.drawn).toMatch(/^data:image\/svg\+xml,/);
    expect(icon?.drawn).toContain("data-qrdx-icon%3D%22wifi%22");
  });
});
