// AI art for developers and agents, as content/docs/developers/ai-art-api.mdx
// describes it: POST /v1/art and the MCP generate_ai_art tool take the app's
// request (or a dynamic code's id in place of `text`), need an API key with
// codes:write, and use the monthly AI art allowance of the key's workspace.
// A fake Vercel AI Gateway sits behind fetch and the tables are in memory:
// the real control image, scan check, blend and credit bookkeeping all run.
import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { NextRequest } from "next/server";
import { decodePNGPixels, scanQRPixels } from "qrdx";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { paintedArt } from "../support/ai-art-images";
import { fakeDb } from "../support/fake-db";
import {
  gatewayError,
  imageModelResult,
  installFakeGateway,
} from "../support/fake-gateway";

const FULL = ["profile:read", "themes:read", "codes:read", "codes:write"];
const KEY = `qrdx_${"a".repeat(40)}`;
const READ_KEY = `qrdx_${"r".repeat(40)}`;
const VIEWER_KEY = `qrdx_${"v".repeat(40)}`;
const UNKNOWN_KEY = `qrdx_${"z".repeat(40)}`;
const ALICE = ownWorkspaceId("u_alice");

const state = vi.hoisted(() => {
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
  return { plan: "free" as "free" | "pro" | "business" };
});

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
// No browser session: every caller is a key or nobody.
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 1000,
      remaining: 999,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shared")>()),
  logError: () => {},
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/lib/api-keys/service", () => ({
  authenticateApiKey: async (token: string) => {
    const owner = (scopes: string[]) => ({
      keyId: "key_1",
      name: "Alice's key",
      userId: "u_alice",
      organizationId: ALICE,
      role: "owner",
      scopes,
    });
    const keys: Record<string, unknown> = {
      [KEY]: owner(FULL),
      [READ_KEY]: owner(["codes:read"]),
      [VIEWER_KEY]: {
        keyId: "key_3",
        name: "Vic's key",
        userId: "u_vic",
        organizationId: "org_acme",
        role: "viewer",
        scopes: FULL,
      },
    };
    return keys[token] ?? null;
  },
}));

const art = await import("@/app/api/v1/art/route");
const mcp = await import("@/app/api/mcp/route");

const ORIGIN = "http://localhost:3000";
const TEXT = "https://qrdx.dev/q/Ab3dE9x";
const gateway = installFakeGateway();
afterAll(() => {
  vi.unstubAllGlobals();
});

/** Answers every model call with art painted over the code it was sent. */
function respondWithArt() {
  gateway.respondWith(async (call) => {
    const control = Buffer.from(
      (call.body.files as { data: string }[])[0]?.data ?? "",
      "base64",
    );
    return imageModelResult([
      await paintedArt(new Uint8Array(control), { keep: 0.75 }),
    ]);
  });
}

function post(
  body: unknown,
  {
    token = KEY,
    query = "",
    headers = {},
  }: {
    token?: string | null;
    query?: string;
    headers?: Record<string, string>;
  } = {},
) {
  return art.POST(
    new NextRequest(`${ORIGIN}/api/v1/art${query}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

const body = (overrides: Record<string, unknown> = {}) => ({
  text: TEXT,
  prompt: "a zen garden",
  seed: 11,
  ...overrides,
});

const usage = () => fakeDb.rows("aiUsage");
const today = Math.floor(Date.now() / 86_400_000).toString();
const usageRows = (count: number, userId = "u_alice") =>
  Array.from({ length: count }, (_, i) => ({
    id: `used_${userId}_${i}`,
    userId,
    modelId: "openai/gpt-image-2",
    daysSinceEpoch: today,
    createdAt: new Date(),
  }));

async function scansTo(imageUrl: string, text: string) {
  const pixels = await decodePNGPixels(
    new Uint8Array(Buffer.from(imageUrl.split(",")[1] ?? "", "base64")),
  );
  expect(pixels).not.toBeNull();
  return (await scanQRPixels(pixels!, text)).passed;
}

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.seed("organization", [
    { id: "org_acme", name: "Acme", slug: "acme", createdAt: new Date(0) },
  ]);
  fakeDb.defaults("qrCode", () => ({
    slugScope: "",
    contentType: "url",
    style: null,
    title: null,
    domainId: null,
    isActive: true,
    archivedAt: null,
    scanCount: 0,
    lastScannedAt: null,
    kind: "redirect",
    pageId: null,
    folderId: null,
    notes: null,
    isFavorite: false,
    pausedAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  fakeDb.seed("qrCode", [
    {
      id: "code_alice",
      userId: "u_alice",
      organizationId: ALICE,
      slug: "Menu042",
      destinationUrl: "https://example.com/menu",
    },
    {
      id: "code_acme",
      userId: "u_bob",
      organizationId: "org_acme",
      slug: "Acme001",
      destinationUrl: "https://example.com/acme",
    },
  ]);
  state.plan = "free";
  gateway.reset();
});

// ─── POST /v1/art ────────────────────────────────────────────────────────────

describe("who may call POST /v1/art", () => {
  it("needs an API key: none is 401 UNAUTHORIZED, an unknown one INVALID_TOKEN", async () => {
    const none = await post(body(), { token: null });
    expect(none.status).toBe(401);
    expect((await none.json()).code).toBe("UNAUTHORIZED");
    const unknown = await post(body(), { token: UNKNOWN_KEY });
    expect(unknown.status).toBe(401);
    expect((await unknown.json()).code).toBe("INVALID_TOKEN");
    expect(gateway.calls).toHaveLength(0);
    expect(usage()).toHaveLength(0);
  });

  it("needs codes:write: a read-only key is 403 INSUFFICIENT_SCOPE", async () => {
    const response = await post(body(), { token: READ_KEY });
    expect(response.status).toBe(403);
    const error = await response.json();
    expect(error.code).toBe("INSUFFICIENT_SCOPE");
    expect(error.message).toContain("codes:write");
    expect(gateway.calls).toHaveLength(0);
  });

  it("refuses a workspace viewer's key with 403 FORBIDDEN", async () => {
    const response = await post(body(), { token: VIEWER_KEY });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe("FORBIDDEN");
    expect(gateway.calls).toHaveLength(0);
  });

  it("takes JSON only", async () => {
    const response = await post(body(), {
      headers: { "content-type": "text/plain" },
    });
    expect(response.status).toBe(415);
    expect((await response.json()).code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });
});

describe("POST /v1/art", () => {
  it("returns a scannable image as JSON and uses one of the workspace's credits", async () => {
    respondWithArt();
    const response = await post(body());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    // The daily API quota's headers, like every keyed endpoint.
    expect(response.headers.get("x-ratelimit-limit")).toBeTruthy();
    const { data, credits } = await response.json();

    expect(data).toMatchObject({
      width: 1024,
      height: 1024,
      seed: 11,
      mode: "code",
      text: TEXT,
      code: null,
      visibility: 50,
      creativity: 45,
    });
    expect(["none", "least", "image-qr"]).toContain(data.blend);
    expect(typeof data.blendStrength).toBe("number");
    expect(data.imageUrl).toMatch(/^data:image\/png;base64,/);
    expect(await scansTo(data.imageUrl, TEXT)).toBe(true);
    expect(credits).toMatchObject({
      plan: "free",
      limit: 3,
      used: 1,
      remaining: 2,
      pooled: false,
    });
    expect(gateway.calls).toHaveLength(1);
    expect(usage()).toMatchObject([
      { userId: "u_alice", modelId: "openai/gpt-image-2" },
    ]);
  });

  it("returns the PNG's bytes for ?format=png or Accept: image/png, details in headers", async () => {
    respondWithArt();
    const calls = [
      { query: "?format=png", remaining: "2" },
      { headers: { accept: "image/png" }, remaining: "1" },
    ];
    for (const { remaining, ...call } of calls) {
      const response = await post(body(), call);
      expect(response.headers.get("x-qrdx-credits-remaining")).toBe(remaining);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("x-qrdx-seed")).toBe("11");
      expect(response.headers.get("x-qrdx-mode")).toBe("code");
      expect(response.headers.get("x-qrdx-blend")).toMatch(
        /^(none|least|image-qr)$/,
      );
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect([...bytes.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
    }
    expect(usage()).toHaveLength(2);
  });

  it("paints a dynamic code's short link, by the code's id", async () => {
    respondWithArt();
    const response = await post({
      code: "code_alice",
      prompt: "a bistro chalkboard",
    });
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.code).toEqual({
      id: "code_alice",
      shortLink: data.text,
    });
    expect(data.text).toMatch(/\/q\/Menu042$/);
    expect(await scansTo(data.imageUrl, data.text)).toBe(true);
  });

  it("answers 404 for a code in another workspace, before any credit or model call", async () => {
    respondWithArt();
    for (const code of ["code_acme", "code_missing"]) {
      const response = await post({ code, prompt: "a bistro chalkboard" });
      expect(response.status).toBe(404);
      expect((await response.json()).code).toBe("NOT_FOUND");
    }
    expect(gateway.calls).toHaveLength(0);
    expect(usage()).toHaveLength(0);
  });

  it("wants exactly one of text and code", async () => {
    for (const request of [
      { prompt: "a zen garden" },
      { text: TEXT, code: "code_alice", prompt: "a zen garden" },
    ]) {
      const response = await post(request);
      expect(response.status).toBe(400);
      const error = await response.json();
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.data.details[0]).toMatchObject({ path: "text" });
      expect(error.data.details[0].message).toMatch(/exactly one of text/);
    }
  });

  it("checks the request with the app's rules", async () => {
    const response = await post(
      body({ visibility: 500, photo: "data:image/png;base64,AAAA" }),
    );
    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.code).toBe("VALIDATION_ERROR");
    const paths = error.data.details.map((d: { path: string }) => d.path);
    expect(paths).toContain("visibility");
    // A photo only goes with photo mode.
    expect(paths).toContain("photo");
    expect(gateway.calls).toHaveLength(0);
  });

  it("names text that's too long for art AI_ART_TEXT_TOO_LONG, pointing at code", async () => {
    const response = await post(
      body({ text: `https://x.dev/${"a".repeat(400)}` }),
    );
    expect(response.status).toBe(400);
    const error = await response.json();
    expect(error.code).toBe("AI_ART_TEXT_TOO_LONG");
    expect(error.message).toMatch(/at most 300 characters/);
    expect(error.message).toMatch(/code/);
  });

  it("names an image over the size limit AI_ART_IMAGE_TOO_LARGE (413)", async () => {
    const big = `data:image/png;base64,${Buffer.alloc(620 * 1024, 7).toString("base64")}`;
    const response = await post(body({ reference: big }));
    expect(response.status).toBe(413);
    const error = await response.json();
    expect(error.code).toBe("AI_ART_IMAGE_TOO_LARGE");
    expect(error.message).toMatch(/^reference: /);
    expect(gateway.calls).toHaveLength(0);
  });

  it("is AI_ART_CREDITS_EXHAUSTED when the month's images are used: 402 on Free", async () => {
    fakeDb.seed("aiUsage", usageRows(3));
    respondWithArt();
    const response = await post(body());
    expect(response.status).toBe(402);
    const error = await response.json();
    expect(error.code).toBe("AI_ART_CREDITS_EXHAUSTED");
    expect(error.message).toMatch(/used all 3 AI art images/);
    expect(gateway.calls).toHaveLength(0);
    expect(usage()).toHaveLength(3);
  });

  it("and 429 on Business, which has nothing to upgrade to", async () => {
    state.plan = "business";
    fakeDb.seed("aiUsage", usageRows(150));
    respondWithArt();
    const response = await post(body());
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe("AI_ART_CREDITS_EXHAUSTED");
    expect(gateway.calls).toHaveLength(0);
  });

  it("keeps the app's daily cap: AI_ART_DAILY_LIMIT", async () => {
    state.plan = "pro";
    fakeDb.seed("aiUsage", usageRows(25));
    respondWithArt();
    const response = await post(body());
    expect(response.status).toBe(429);
    expect((await response.json()).code).toBe("AI_ART_DAILY_LIMIT");
    expect(gateway.calls).toHaveLength(0);
    expect(usage()).toHaveLength(25);
  });

  it("refunds the credit when the model fails", async () => {
    gateway.respondWith(() =>
      gatewayError(500, "internal_server_error", "upstream exploded"),
    );
    const response = await post(body());
    expect(response.status).toBe(502);
    const error = await response.json();
    expect(error.code).toBe("AI_ART_FAILED");
    expect(error.message).toMatch(/No AI credit was used/);
    expect(usage()).toHaveLength(0);
  });
});

// ─── MCP generate_ai_art ────────────────────────────────────────────────────

let rpcId = 0;
async function tool(args: Record<string, unknown>, key?: string) {
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
        params: { name: "generate_ai_art", arguments: args },
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
    content: {
      type: string;
      text?: string;
      data?: string;
      mimeType?: string;
    }[];
  };
}

describe("MCP generate_ai_art", () => {
  it("without a key is a 401 tool error that says how to add one", async () => {
    const result = await tool(body());
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "UNAUTHORIZED",
      status: 401,
    });
    expect(result.content[0]?.text).toContain("Authorization: Bearer qrdx_");
    expect(gateway.calls).toHaveLength(0);
  });

  it("refuses a read-only key", async () => {
    const result = await tool(body(), READ_KEY);
    expect(result.structuredContent).toMatchObject({
      code: "INSUFFICIENT_SCOPE",
      status: 403,
    });
    expect(gateway.calls).toHaveLength(0);
  });

  it("returns the PNG, what it scans to and the credits left", async () => {
    respondWithArt();
    const result = await tool(body(), KEY);
    expect(result.isError).toBeFalsy();
    const [summary, details, image] = result.content;
    expect(summary?.text).toContain(`It scans to ${TEXT}`);
    expect(summary?.text).toContain("2 of 3 AI art images left this month");
    expect(JSON.parse(details?.text ?? "{}")).toMatchObject({
      seed: 11,
      mode: "code",
      text: TEXT,
      credits: { limit: 3, used: 1, remaining: 2 },
    });
    expect(JSON.parse(details?.text ?? "{}").imageUrl).toBeUndefined();
    expect(image).toMatchObject({ type: "image", mimeType: "image/png" });
    expect(await scansTo(`data:image/png;base64,${image?.data}`, TEXT)).toBe(
      true,
    );
    expect(usage()).toHaveLength(1);
  });

  it("encodes a dynamic code by id, and only the key's workspace's", async () => {
    respondWithArt();
    const own = await tool({ code: "code_alice", prompt: "a menu board" }, KEY);
    expect(own.isError).toBeFalsy();
    expect(own.content[0]?.text).toMatch(
      /\/q\/Menu042 \(the short link of code code_alice\)/,
    );
    const other = await tool(
      { code: "code_acme", prompt: "a menu board" },
      KEY,
    );
    expect(other.structuredContent).toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
    expect(gateway.calls).toHaveLength(1);
  });

  it("explains a request the app's rules reject", async () => {
    const result = await tool({ prompt: "a zen garden" }, KEY);
    expect(result.structuredContent).toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
    });
    expect(result.content[0]?.text).toMatch(/text: Send exactly one of text/);
  });

  it("says when the month's images are used up", async () => {
    fakeDb.seed("aiUsage", usageRows(3));
    const result = await tool(body(), KEY);
    expect(result.structuredContent).toMatchObject({
      code: "AI_ART_CREDITS_EXHAUSTED",
      status: 402,
    });
    expect(gateway.calls).toHaveLength(0);
  });
});
