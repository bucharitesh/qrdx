// What a QRdx API key unlocks on the public endpoints, as
// content/docs/developers/mcp.mdx and image-api.mdx describe it:
// - MCP save_template saves a design as a theme in the key's workspace (the
//   plan's saved-theme limit, the API's LIMIT_REACHED shape), and without a
//   key it's a clear 401 tool error;
// - logos by uploaded file id in design_qr, generate_qr_code and GET /v1/qr,
//   private and uncached on the image API.
// The key lookup, quota, plan and theme store are mocked: no database.
import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeQR,
  rasterizeSvg,
} from "../../../../packages/qrdx/tests/support/raster";

const FULL = ["profile:read", "themes:read", "codes:read", "codes:write"];
const KEY = `qrdx_${"a".repeat(40)}`;
const READ_ONLY_KEY = `qrdx_${"r".repeat(40)}`;
const TEAM_MEMBER_KEY = `qrdx_${"m".repeat(40)}`;
const FILE_ID = "cm5logo0brand0mark000001";
// A 4×4 opaque PNG: what an uploaded logo reads back as.
const PNG_LOGO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAEklEQVR4nGMQVDL+j4wZSBcAAOAqFlEok64wAAAAAElFTkSuQmCC";

const state = vi.hoisted(() => ({
  themes: [] as {
    id: string;
    userId: string;
    organizationId: string | null;
    name: string;
    style: Record<string, unknown>;
  }[],
  limit: 10,
  logoReads: [] as { scope: unknown; id: string }[],
}));

vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 30_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}));
vi.mock("@/lib/api-keys/service", () => ({
  authenticateApiKey: async (token: string) => {
    if (token === KEY) {
      return {
        keyId: "key_1",
        userId: "u_alice",
        organizationId: ownWorkspaceId("u_alice"),
        role: "owner",
        scopes: FULL,
      };
    }
    if (token === READ_ONLY_KEY) {
      return {
        keyId: "key_2",
        userId: "u_alice",
        organizationId: ownWorkspaceId("u_alice"),
        role: "owner",
        scopes: ["profile:read", "themes:read", "codes:read"],
      };
    }
    if (token === TEAM_MEMBER_KEY) {
      return {
        keyId: "key_3",
        userId: "u_bob",
        organizationId: "org_acme",
        role: "member",
        scopes: FULL,
      };
    }
    return null;
  },
}));
vi.mock("@/lib/api-quota", () => ({
  consumeApiQuota: async () => {},
  withApiQuotaHeaders: <T>(handler: T) => handler,
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => "free",
  getPlan: async () => "free",
}));
vi.mock("@/lib/qr-api/logo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/qr-api/logo")>();
  const read = async (scope: unknown, id: string) => {
    state.logoReads.push({ scope, id });
    if (id !== FILE_ID) {
      const { HttpError } = await import("@/lib/error-response");
      throw new HttpError(
        404,
        "NOT_FOUND",
        "No ready file with that id in this workspace.",
      );
    }
    return PNG_LOGO;
  };
  return {
    ...actual,
    readLogoDataUrl: read,
    resolveLogo: async (
      request: { logoFileId?: string; logoIcon?: string },
      scope: unknown,
      purpose: "render" | "save",
    ) => {
      if (request.logoFileId) {
        if (!scope) throw new actual.LogoKeyRequiredError();
        return purpose === "render"
          ? { drawn: await read(scope, request.logoFileId) }
          : { saved: `http://localhost:3000/api/files/${request.logoFileId}` };
      }
      return actual.resolveLogo(
        request as Parameters<typeof actual.resolveLogo>[0],
        scope as null,
        purpose,
      );
    },
  };
});
vi.mock("@/lib/qr-api/save-template", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/qr-api/save-template")>();
  return {
    ...actual,
    // The data layer, in memory.
    databaseThemeStore: {
      limit: async () => state.limit,
      teamThemes: async () => false,
      teamThemesPlanName: async () => "Business",
      count: async (target: {
        userId: string;
        organizationId: string | null;
      }) =>
        state.themes.filter(
          (row) => row.organizationId === target.organizationId,
        ).length,
      insert: async (
        target: { userId: string; organizationId: string | null },
        theme: { name: string; style: Record<string, unknown> },
      ) => {
        const id = `theme_${state.themes.length + 1}`;
        state.themes.push({ id, ...target, ...theme });
        return { id };
      },
      remove: async () => {},
    },
  };
});

const mcp = await import("@/app/api/mcp/route");
const image = await import("@/app/api/v1/qr/route");

const ORIGIN = "http://localhost:3000";
let rpcId = 0;
async function call(name: string, args: Record<string, unknown>, key?: string) {
  const response = await mcp.POST(
    new Request(`${ORIGIN}/api/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++rpcId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  expect(response.status).toBe(200);
  const text = await response.text();
  const json = response.headers.get("content-type")?.includes("event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("")
    : text;
  return JSON.parse(json).result as {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    content: { type: string; text?: string; data?: string }[];
  };
}

const style = { fgColor: "#155DFC", bodyPattern: "rounded", logoIcon: "link" };

beforeEach(() => {
  state.themes = [];
  state.limit = 10;
  state.logoReads = [];
});

describe("save_template", () => {
  it("without a key is a 401-style tool error that says how to add one", async () => {
    const result = await call("save_template", { name: "Brand", style });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(result.content[0]?.text).toContain("Authorization: Bearer qrdx_");
    expect(state.themes).toHaveLength(0);
  });

  it("refuses an unknown key and a read-only key", async () => {
    const unknown = await call(
      "save_template",
      { name: "Brand", style },
      `qrdx_${"z".repeat(40)}`,
    );
    expect(unknown.structuredContent).toMatchObject({
      code: "INVALID_TOKEN",
      status: 401,
    });
    const readOnly = await call(
      "save_template",
      { name: "Brand", style },
      READ_ONLY_KEY,
    );
    expect(readOnly.structuredContent).toMatchObject({
      code: "INSUFFICIENT_SCOPE",
      status: 403,
    });
    expect(state.themes).toHaveLength(0);
  });

  it("saves the design to the key's own workspace as the editor stores it", async () => {
    const result = await call("save_template", { name: "Brand", style }, KEY);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain('Saved "Brand" to your themes');
    expect(JSON.parse(result.content[1]?.text ?? "{}")).toMatchObject({
      id: "theme_1",
      where: "own",
      editorUrl: `${ORIGIN}/playground/theme_1?ref=mcp`,
    });
    expect(state.themes[0]).toMatchObject({
      userId: "u_alice",
      organizationId: ownWorkspaceId("u_alice"),
      name: "Brand",
      style: {
        fgColor: "#155DFC",
        bodyPattern: "rounded",
        showLogo: true,
        customLogo: expect.stringContaining("data-qrdx-icon%3D%22link%22"),
      },
    });
  });

  it("returns the app's LIMIT_REACHED shape at the plan's saved-theme limit", async () => {
    state.limit = 1;
    await call("save_template", { name: "One", style: {} }, KEY);
    const result = await call("save_template", { name: "Two", style: {} }, KEY);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      code: "LIMIT_REACHED",
      message: expect.stringContaining("1 saved themes"),
      status: 402,
    });
    expect(JSON.parse(result.content[1]?.text ?? "{}")).toEqual(
      result.structuredContent,
    );
    expect(state.themes).toHaveLength(1);
  });

  it("refuses a team member's key and an invalid style", async () => {
    const member = await call(
      "save_template",
      { name: "Team", style },
      TEAM_MEMBER_KEY,
    );
    expect(member.structuredContent).toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    const invalid = await call(
      "save_template",
      { name: "Bad", style: { customLogo: "https://evil.example/l.png" } },
      KEY,
    );
    expect(invalid.structuredContent).toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(state.themes).toHaveLength(0);
  });

  it("keeps an uploaded logo as its file link", async () => {
    await call(
      "save_template",
      { name: "Logo", style: { logoFileId: FILE_ID } },
      KEY,
    );
    expect(state.themes[0]?.style).toMatchObject({
      showLogo: true,
      customLogo: `${ORIGIN}/api/files/${FILE_ID}`,
    });
  });
});

describe("logos by uploaded file id", () => {
  it("design_qr draws the logo, scores it and keeps it out of the playground link", async () => {
    const result = await call(
      "design_qr",
      {
        content: { type: "url", url: "https://qrdx.dev/logo" },
        logo_file_id: FILE_ID,
        include_svg: true,
      },
      KEY,
    );
    expect(result.isError).toBeFalsy();
    expect(state.logoReads).toMatchObject([
      {
        id: FILE_ID,
        scope: { userId: "u_alice", organizationId: ownWorkspaceId("u_alice") },
      },
    ]);
    const design = JSON.parse(result.content[1]?.text ?? "{}");
    expect(design.qrdxStyle).toMatchObject({
      showLogo: true,
      logoFileId: FILE_ID,
    });
    expect(design.playgroundLeftOut).toContain("logo");
    const svg = result.content.at(-1)?.text ?? "";
    expect(svg).toContain(PNG_LOGO);
    expect(decodeQR(rasterizeSvg(svg, { width: 480, pad: 24 }))).toBe(
      "https://qrdx.dev/logo",
    );
  });

  it("design_qr without a key says the logo needs one", async () => {
    const result = await call("design_qr", {
      content: { type: "url", url: "https://qrdx.dev" },
      logo_file_id: FILE_ID,
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ status: 401 });
    expect(state.logoReads).toHaveLength(0);
  });

  it("generate_qr_code draws it with error correction raised for the logo, and gives no public URL", async () => {
    const result = await call(
      "generate_qr_code",
      {
        data: "https://qrdx.dev/gen",
        size: 320,
        logoFileId: FILE_ID,
        include_svg: true,
      },
      KEY,
    );
    expect(result.isError).toBeFalsy();
    const summary = result.content[0]?.text ?? "";
    expect(summary).toContain("No public image URL");
    expect(summary).not.toContain("SVG URL:");
    const svg = result.content.at(-1)?.text ?? "";
    expect(svg).toContain(PNG_LOGO);
    expect(decodeQR(rasterizeSvg(svg, { width: 480, pad: 24 }))).toBe(
      "https://qrdx.dev/gen",
    );
  });

  it("GET /v1/qr draws it for the owner's key only, privately and uncached", async () => {
    const url = `${ORIGIN}/api/v1/qr?data=${encodeURIComponent("https://qrdx.dev/img")}&logoFileId=${FILE_ID}`;
    const anonymous = await image.GET(new NextRequest(url));
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("no-store");

    const keyed = await image.GET(
      new NextRequest(url, { headers: { authorization: `Bearer ${KEY}` } }),
    );
    expect(keyed.status).toBe(200);
    expect(keyed.headers.get("cache-control")).toBe("private, no-store");
    expect(keyed.headers.get("vary")).toBe("Authorization");
    const svg = await keyed.text();
    expect(svg).toContain(PNG_LOGO);

    const notMine = await image.GET(
      new NextRequest(url.replace(FILE_ID, "cm5someone0elses0file001"), {
        headers: { authorization: `Bearer ${KEY}` },
      }),
    );
    expect(notMine.status).toBe(404);
  });
});
