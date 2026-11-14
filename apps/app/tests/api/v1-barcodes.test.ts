// The barcode endpoints, as apps/docs/content/docs/developers/barcode-api.mdx describes
// them:
// - GET /v1/barcode: keyless images in every file type, the format's value
//   rules as 400s naming `data`, the QR image API's caching, CORS and
//   per-IP limit; POST takes the same fields as JSON, uncached;
// - /v1/barcodes: saved barcodes with an API key, scoped to the key's
//   workspace, with the codes scopes, the daily quota's X-RateLimit headers,
//   the plan's saved-barcode limit, the trash and the audit log.
// The routes run the real barcode service against in-memory tables; the key
// lookup, plan and audit log writer are stubbed.
import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const FULL = ["profile:read", "themes:read", "codes:read", "codes:write"];
const KEY = `qrdx_${"a".repeat(40)}`;
const READ_KEY = `qrdx_${"r".repeat(40)}`;
const BOB_KEY = `qrdx_${"b".repeat(40)}`;
const ALICE_TEAM_KEY = `qrdx_${"t".repeat(40)}`;

const state = vi.hoisted(() => ({
  rateLimited: false,
  plan: "free" as "free" | "pro" | "business",
  audit: [] as { action: string; target?: { id?: string | null } }[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
// No browser session in these tests: every caller is a key or nobody.
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: !state.rateLimited,
      limit: 1000,
      remaining: state.rateLimited ? 0 : 999,
      reset: Date.now() + 42_000,
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
vi.mock("@/ee/audit-log/record", () => ({
  recordAuditEvent: (
    _scope: unknown,
    events:
      | { action: string; target?: { id?: string | null } }
      | { action: string; target?: { id?: string | null } }[],
  ) => {
    state.audit.push(...(Array.isArray(events) ? events : [events]));
  },
}));
vi.mock("@/lib/api-keys/service", () => ({
  authenticateApiKey: async (token: string) => {
    const keys: Record<string, unknown> = {
      [KEY]: {
        keyId: "key_1",
        name: "Alice's key",
        userId: "u_alice",
        organizationId: ownWorkspaceId("u_alice"),
        role: "owner",
        scopes: FULL,
      },
      [READ_KEY]: {
        keyId: "key_2",
        name: "Read only",
        userId: "u_alice",
        organizationId: ownWorkspaceId("u_alice"),
        role: "owner",
        scopes: ["codes:read"],
      },
      [BOB_KEY]: {
        keyId: "key_3",
        name: "Bob's team key",
        userId: "u_bob",
        organizationId: "org_acme",
        role: "member",
        scopes: FULL,
      },
      [ALICE_TEAM_KEY]: {
        keyId: "key_4",
        name: "Alice's team key",
        userId: "u_alice",
        organizationId: "org_acme",
        role: "owner",
        scopes: FULL,
      },
    };
    return keys[token] ?? null;
  },
}));

const image = await import("@/app/api/v1/barcode/route");
const list = await import("@/app/api/v1/barcodes/route");
const one = await import("@/app/api/v1/barcodes/[id]/route");
const saved = await import("@/app/api/v1/barcodes/[id]/image/route");

const ORIGIN = "http://localhost:3000";

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.seed("organization", [
    { id: "org_acme", name: "Acme", slug: "acme", createdAt: new Date(0) },
  ]);
  fakeDb.seed("folder", [
    {
      id: "fold_alice",
      userId: "u_alice",
      organizationId: ownWorkspaceId("u_alice"),
      parentId: null,
      name: "Retail",
      position: 0,
    },
  ]);
  fakeDb.defaults("barcode", () => ({
    folderId: null,
    title: null,
    options: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  state.rateLimited = false;
  state.plan = "free";
  state.audit = [];
});

function request(
  method: string,
  path: string,
  {
    token,
    body,
    headers = {},
  }: {
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  const all: Record<string, string> = { ...headers };
  if (token) all.authorization = `Bearer ${token}`;
  if (body !== undefined) all["content-type"] ??= "application/json";
  return new NextRequest(new URL(path, ORIGIN), {
    method,
    headers: all,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const getImage = (query: string) =>
  image.GET(request("GET", `/api/v1/barcode?${query}`));

interface ErrorBody {
  code: string;
  message: string;
  data?: { details: { param?: string; path?: string; message: string }[] };
}

// ─── GET /v1/barcode ─────────────────────────────────────────────────────────

describe("GET /v1/barcode", () => {
  it("draws an EAN-13 as SVG, adding the check digit, cached for a year", async () => {
    const response = await getImage("format=ean13&data=590123412345");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "image/svg+xml; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="ean13-5901234123457.svg"',
    );
    expect(await response.text()).toMatch(/^<svg width="[\d.]+mm"/);
  });

  it.each([
    ["png", "image/png", "png"],
    ["jpg", "image/jpeg", "jpeg"],
    ["jpeg", "image/jpeg", "jpeg"],
    ["webp", "image/webp", "webp"],
    ["avif", "image/avif", "heif"],
  ])("type=%s is %s", async (type, mime, sharpFormat) => {
    const response = await getImage(
      `format=code128&data=QRDX-42&type=${type}&scale=2`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(mime);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect((await sharp(bytes).metadata()).format).toBe(sharpFormat);
  });

  it("type=pdf and type=eps are vector files; EPS downloads", async () => {
    const pdf = await getImage("format=datamatrix&data=SN-42&type=pdf");
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(
      Buffer.from(await pdf.arrayBuffer())
        .subarray(0, 8)
        .toString(),
    ).toBe("%PDF-1.4");
    const eps = await getImage("format=itf14&data=1540014128876&type=eps");
    expect(eps.headers.get("content-type")).toBe("application/postscript");
    expect(eps.headers.get("content-disposition")).toBe(
      'attachment; filename="itf14-15400141288763.eps"',
    );
    expect(await eps.text()).toMatch(/^%!PS-Adobe-3\.0 EPSF-3\.0/);
  });

  it("takes the format as people write it", async () => {
    for (const format of ["EAN-13", "ean_13", "Ean13"]) {
      expect(
        (await getImage(`format=${format}&data=590123412345`)).status,
      ).toBe(200);
    }
    expect((await getImage("format=Code-128&data=x")).status).toBe(200);
    expect((await getImage("format=azteccode&data=x")).status).toBe(200);
  });

  it("applies the style parameters", async () => {
    const response = await getImage(
      "format=code128&data=SHELF-A12&fg=1e3a8a&bg=fffbeb&text=false&rotate=90&height=10&quietZone=12",
    );
    const svg = await response.text();
    expect(svg).toContain("#1e3a8a");
    expect(svg).toContain("#fffbeb");
    const [, width, height] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg) ?? [];
    // Turned a quarter: taller than wide.
    expect(Number(height)).toBeGreaterThan(Number(width));
  });

  // Each format's value rules, as 400s that name `data`.
  it.each([
    ["ean13", "5901234123458", /check digit should be 7, not 8/],
    ["ean13", "59012341", /EAN-13 needs 12 or 13 digits; this has 8 digits/],
    ["ean13", "59012341234A", /takes digits only/],
    ["ean8", "96385075", /check digit should be 4, not 5/],
    ["upca", "03600029145", undefined],
    ["upca", "0360002914", /UPC-A needs 11 or 12 digits/],
    ["upce", "065432", undefined],
    ["upce", "2654321", /starts with number system 0 or 1/],
    ["upce", "012345678905", /has no UPC-E form/],
    ["itf14", "15400141288760", /check digit should be 3, not 0/],
    ["gs1-128", "01095011015300", /Start with an Application Identifier/],
    ["gs1-128", "(01)09501101530004", /AI \(01\).*check digit should be 3/],
    ["gs1-128", "(10)", /AI \(10\) has no value/],
    ["code128", "café", /plain ASCII.*Not allowed: é/],
    ["code128", "A".repeat(81), /up to 80 characters; this has 81/],
    ["code39", "qrdx", /no lowercase letters/],
    ["code39", "QRDX#1", /Not allowed: #/],
    ["datamatrix", "x".repeat(1001), /at most 1000 characters/],
  ])("%s %j", async (format, data, error) => {
    const response = await getImage(
      `format=${format}&data=${encodeURIComponent(data)}`,
    );
    if (!error) {
      expect(response.status).toBe(200);
      return;
    }
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await response.json()) as ErrorBody;
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.message).toBe("Invalid query parameters");
    expect(body.data?.details[0]?.param).toBe("data");
    expect(body.data?.details[0]?.message).toMatch(error);
  });

  it("names each bad parameter", async () => {
    const cases: [string, string][] = [
      ["format=qr&data=x", "format"],
      ["data=x", "format"],
      ["format=ean13", "data"],
      ["format=ean13&data=590123412345&type=gif", "type"],
      ["format=ean13&data=590123412345&scale=11", "scale"],
      ["format=ean13&data=590123412345&height=2", "height"],
      ["format=ean13&data=590123412345&rotate=45", "rotate"],
      ["format=ean13&data=590123412345&fg=blue", "fg"],
      ["format=datamatrix&data=x&quietZone=12", "quietZone"],
      [`format=code128&data=${"A".repeat(80)}&scale=10&type=png`, "scale"],
    ];
    for (const [query, param] of cases) {
      const response = await getImage(query);
      expect(response.status, query).toBe(400);
      const body = (await response.json()) as ErrorBody;
      expect(
        body.data?.details.map((detail) => detail.param),
        query,
      ).toContain(param);
    }
  });

  it("is rate limited per IP address like the QR image API", async () => {
    state.rateLimited = true;
    const response = await getImage("format=ean13&data=590123412345");
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await response.json()) as ErrorBody).code).toBe("RATE_LIMITED");
  });
});

describe("POST /v1/barcode", () => {
  it("takes the same fields as JSON and isn't cached", async () => {
    const response = await image.POST(
      request("POST", "/api/v1/barcode", {
        body: {
          format: "datamatrix",
          data: "Internal note 42",
          type: "png",
          scale: 3,
          text: false,
          rotate: 180,
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a body that isn't JSON, and bad fields by name", async () => {
    const form = await image.POST(
      new NextRequest(new URL("/api/v1/barcode", ORIGIN), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "format=ean13&data=1",
      }),
    );
    expect(form.status).toBe(415);
    const bad = await image.POST(
      request("POST", "/api/v1/barcode", {
        body: { format: "ean13", data: "5901234123458", text: "yes" },
      }),
    );
    expect(bad.status).toBe(400);
    const body = (await bad.json()) as ErrorBody;
    expect(body.message).toBe("Invalid request body");
    expect(body.data?.details.map((detail) => detail.param)).toEqual(["text"]);
  });
});

// ─── /v1/barcodes ────────────────────────────────────────────────────────────

interface BarcodeJson {
  id: string;
  title: string | null;
  format: string;
  value: string;
  options: Record<string, unknown>;
  folderId: string | null;
  imageUrl: string;
  deletedAt: string | null;
  organizationId: string | null;
}

const create = (body: unknown, token = KEY) =>
  list.POST(request("POST", "/api/v1/barcodes", { token, body }));
const getList = (query = "", token = KEY) =>
  list.GET(request("GET", `/api/v1/barcodes${query}`, { token }));
const getOne = (id: string, token = KEY) =>
  one.GET(request("GET", `/api/v1/barcodes/${id}`, { token }), ctx(id));
const patch = (id: string, body: unknown, token = KEY) =>
  one.PATCH(
    request("PATCH", `/api/v1/barcodes/${id}`, { token, body }),
    ctx(id),
  );
const remove = (id: string, query = "", token = KEY) =>
  one.DELETE(
    request("DELETE", `/api/v1/barcodes/${id}${query}`, { token }),
    ctx(id),
  );

async function createOne(body: unknown, token = KEY): Promise<BarcodeJson> {
  const response = await create(body, token);
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: BarcodeJson }).data;
}

describe("/v1/barcodes", () => {
  it("needs a key, and codes:write to change anything", async () => {
    const anonymous = await list.GET(request("GET", "/api/v1/barcodes"));
    expect(anonymous.status).toBe(401);
    expect(((await anonymous.json()) as ErrorBody).code).toBe("UNAUTHORIZED");

    expect((await getList("", READ_KEY)).status).toBe(200);
    const refused = await create(
      { format: "ean13", value: "590123412345" },
      READ_KEY,
    );
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as ErrorBody).code).toBe(
      "INSUFFICIENT_SCOPE",
    );
    expect(fakeDb.rows("barcode")).toHaveLength(0);
  });

  it("saves a barcode with its check digit and the format's defaults", async () => {
    const response = await create({
      format: "ean13",
      value: "590123412345",
      title: "Spring box",
      folderId: "fold_alice",
    });
    expect(response.status).toBe(201);
    // The daily quota's headers, like every counted /v1 request.
    expect(response.headers.get("x-ratelimit-limit")).toBe("1000");
    expect(response.headers.get("x-ratelimit-remaining")).toBe("999");
    expect(response.headers.get("x-ratelimit-reset")).toMatch(/^\d+$/);
    const { data } = (await response.json()) as { data: BarcodeJson };
    expect(data).toMatchObject({
      title: "Spring box",
      format: "ean13",
      value: "5901234123457",
      folderId: "fold_alice",
      deletedAt: null,
      organizationId: ownWorkspaceId("u_alice"),
      options: {
        foreground: "#000000",
        background: "#ffffff",
        showText: true,
        barHeightMm: 23,
        quietZone: 11,
        scale: 4,
        rotation: 0,
      },
    });
    expect(data.imageUrl).toBe(
      "http://localhost:3000/api/v1/barcode?format=ean13&data=5901234123457",
    );
    // Only what differs from the defaults is stored.
    expect(fakeDb.rows("barcode")[0]?.options).toEqual({});
    expect(state.audit).toEqual([
      expect.objectContaining({
        action: "barcode.created",
        target: expect.objectContaining({ id: data.id, label: "Spring box" }),
      }),
    ]);
  });

  it("checks the value and options like the image API", async () => {
    const bad = await create({ format: "upca", value: "03600029145X" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as ErrorBody).message).toMatch(
      /UPC-A takes digits only/,
    );
    const zone = await create({
      format: "aztec",
      value: "x",
      options: { quietZone: 15 },
    });
    expect(zone.status).toBe(400);
    const folder = await create({
      format: "aztec",
      value: "x",
      folderId: "fold_nobody",
    });
    expect(folder.status).toBe(400);
    expect(fakeDb.rows("barcode")).toHaveLength(0);
  });

  it("keeps each workspace's barcodes to itself", async () => {
    const mine = await createOne({ format: "code128", value: "MINE" });
    const team = await createOne({ format: "code128", value: "TEAM" }, BOB_KEY);
    const listed = (await (await getList()).json()) as {
      data: BarcodeJson[];
    };
    expect(listed.data.map((row) => row.value)).toEqual(["MINE"]);
    // Another workspace's barcode looks exactly like a missing one.
    expect((await getOne(team.id)).status).toBe(404);
    expect((await patch(team.id, { title: "x" })).status).toBe(404);
    expect((await remove(team.id)).status).toBe(404);
    expect((await getOne(mine.id, BOB_KEY)).status).toBe(404);
    expect(
      (
        await saved.GET(
          request("GET", `/api/v1/barcodes/${team.id}/image`, { token: KEY }),
          ctx(team.id),
        )
      ).status,
    ).toBe(404);
  });

  it("filters by search, format, folder and the trash", async () => {
    await createOne({ format: "ean13", value: "590123412345", title: "Box" });
    await createOne({
      format: "code128",
      value: "SHELF-1",
      folderId: "fold_alice",
    });
    const values = async (query: string) =>
      (
        (await (await getList(query)).json()) as { data: BarcodeJson[] }
      ).data.map((row) => row.value);
    expect(await values("?q=shelf")).toEqual(["SHELF-1"]);
    expect(await values("?q=box")).toEqual(["5901234123457"]);
    expect(await values("?format=ean13")).toEqual(["5901234123457"]);
    expect(await values("?folderId=fold_alice")).toEqual(["SHELF-1"]);
    expect(await values("?folderId=none")).toEqual(["5901234123457"]);
    expect(await values("?status=trash")).toEqual([]);
  });

  it("updates title, value and options; a new format starts from its defaults", async () => {
    const barcode = await createOne({
      format: "code128",
      value: "OLD",
      options: { foreground: "1e3a8a", scale: 6 },
    });
    state.audit = [];
    const response = await patch(barcode.id, { value: "NEW", title: "Label" });
    expect(response.status).toBe(200);
    const { data } = (await response.json()) as { data: BarcodeJson };
    expect(data).toMatchObject({ value: "NEW", title: "Label" });
    expect(data.options).toMatchObject({ foreground: "#1e3a8a", scale: 6 });
    expect(state.audit.map((event) => event.action)).toEqual([
      "barcode.updated",
    ]);

    const switched = (await (
      await patch(barcode.id, { format: "ean8", value: "9638507" })
    ).json()) as { data: BarcodeJson };
    expect(switched.data).toMatchObject({ format: "ean8", value: "96385074" });
    expect(switched.data.options).toMatchObject({
      foreground: "#000000",
      quietZone: 7,
      scale: 4,
    });

    const empty = await patch(barcode.id, {});
    expect(empty.status).toBe(400);
  });

  it("DELETE moves to the trash; permanent=true deletes for good", async () => {
    const barcode = await createOne({ format: "code39", value: "BIN-7" });
    state.audit = [];
    const trashed = await remove(barcode.id);
    expect(trashed.status).toBe(200);
    expect(await trashed.json()).toEqual({
      data: { id: barcode.id, deleted: false, trashed: true },
    });
    const inTrash = (await (await getList("?status=trash")).json()) as {
      data: BarcodeJson[];
    };
    expect(inTrash.data.map((row) => row.id)).toEqual([barcode.id]);
    expect((await getOne(barcode.id)).status).toBe(200);

    const gone = await remove(barcode.id, "?permanent=true");
    expect(await gone.json()).toEqual({
      data: { id: barcode.id, deleted: true },
    });
    expect(fakeDb.rows("barcode")).toHaveLength(0);
    expect(state.audit.map((event) => event.action)).toEqual([
      "barcode.trashed",
      "barcode.deleted",
    ]);
  });

  it("lets team members delete only their own", async () => {
    const owners = await createOne(
      { format: "code128", value: "OWNER" },
      ALICE_TEAM_KEY,
    );
    const response = await remove(owners.id, "", BOB_KEY);
    expect(response.status).toBe(403);
    expect(fakeDb.rows("barcode")[0]?.deletedAt).toBeNull();
  });

  it("stops at the plan's saved-barcode limit, not counting the trash", async () => {
    const { getPlanLimits } = await import("@/lib/plans");
    const limit = getPlanLimits("free").savedBarcodes;
    fakeDb.seed(
      "barcode",
      Array.from({ length: limit }, (_, index) => ({
        id: `bc_${index}`,
        userId: "u_alice",
        organizationId: ownWorkspaceId("u_alice"),
        format: "code128",
        value: `V${index}`,
        deletedAt: index === 0 ? new Date() : null,
      })),
    );
    expect(
      (await create({ format: "code128", value: "ONE-MORE" })).status,
    ).toBe(201);
    const over = await create({ format: "code128", value: "TOO-MANY" });
    expect(over.status).toBe(402);
    expect(((await over.json()) as ErrorBody).code).toBe("LIMIT_REACHED");
  });

  it("GET /{id}/image draws the saved barcode privately", async () => {
    const barcode = await createOne({
      format: "pdf417",
      value: "Boarding pass",
      options: { scale: 2 },
    });
    const response = await saved.GET(
      request("GET", `/api/v1/barcodes/${barcode.id}/image?type=webp`, {
        token: READ_KEY,
      }),
      ctx(barcode.id),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-ratelimit-limit")).toBe("1000");

    const bad = await saved.GET(
      request("GET", `/api/v1/barcodes/${barcode.id}/image?type=gif`, {
        token: KEY,
      }),
      ctx(barcode.id),
    );
    expect(bad.status).toBe(400);
  });
});
