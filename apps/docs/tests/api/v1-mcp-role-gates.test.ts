// The REST API's and the MCP server's write gates, called through the real
// route handlers with real API keys: a key acts with its creator's role in
// the key's workspace, read on every request, so a viewer's or a billing
// member's key can never write, and a member demoted to viewer loses write
// access through their old key at once.
//
// Real: the route handlers, Bearer parsing, lib/api-keys (hash lookup,
// membership join, role), resolveApiCaller / optionalApiKeyCaller, the
// daily quota, the codes service and save_template. Mocked: the database
// (in-memory tables, tests/support/fake-db), the rate limiter and side
// systems a refused request never reaches (webhooks, URL screening).
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID =
    "prod_business_monthly";
});

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock(
  "@repo/database/schema",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({
  // No browser session in these requests: only the Bearer key counts.
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({
  unstable_cache: <T>(fn: T) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}));
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
vi.mock("@/app/dashboard/domains/_lib/domains", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/app/dashboard/domains/_lib/domains")
  >()),
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/lib/code-versions", () => ({ snapshotCodeVersion: async () => {} }));
vi.mock("@/lib/safety/destinations", () => ({
  screenNewCodes: async (_scope: unknown, rows: unknown[]) => rows,
  screenUrlChange: async () => false,
}));
vi.mock("@/lib/events/emit", () => ({
  emitCodesCreated: () => {},
  emitCodeUpdated: () => {},
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const list = await import("@/app/api/v1/codes/route");
const one = await import("@/app/api/v1/codes/[id]/route");
const mcp = await import("@/app/api/mcp/route");

const ORIGIN = "http://localhost:3000";
const NOW = new Date("2026-11-05T12:00:00Z");
const FULL = ["themes:read", "profile:read", "codes:read", "codes:write"];
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const keyFor = (label: string) => `qrdx_${label.padEnd(40, "0").slice(0, 40)}`;

const ROLES = ["owner", "admin", "member", "billing", "viewer"] as const;
type Role = (typeof ROLES)[number];
const KEY: Record<Role, string> = {
  owner: keyFor("ownerKey"),
  admin: keyFor("adminKey"),
  member: keyFor("memberKey"),
  billing: keyFor("billingKey"),
  viewer: keyFor("viewerKey"),
};
const USER = (role: Role) => `u_${role}`;

beforeEach(() => {
  fakeDb.resetAll();
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
  fakeDb.unique("qrCode", "slug");
  fakeDb.unique("qrCode", "slugScope", "slug");
  fakeDb.unique("qrCode", "domainId", "slug");
  fakeDb.unique("apiKey", "keyHash");
  fakeDb.seed("organization", [
    { id: "org_acme", name: "Acme", slug: "acme", createdAt: new Date(0) },
  ]);
  fakeDb.seed(
    "user",
    ROLES.map((role) => ({
      id: USER(role),
      name: role,
      email: `${role}@example.com`,
      banned: false,
      banExpires: null,
    })),
  );
  fakeDb.seed(
    "member",
    ROLES.map((role) => ({
      id: `m_${role}`,
      organizationId: "org_acme",
      userId: USER(role),
      role,
      createdAt: NOW,
    })),
  );
  // The owner pays for Business: shared themes are allowed, codes unlimited.
  fakeDb.seed("subscription", [
    {
      id: "sub_owner",
      userId: USER("owner"),
      productId: "prod_business_monthly",
      status: "active",
      createdAt: NOW,
    },
  ]);
  fakeDb.seed(
    "apiKey",
    ROLES.map((role) => ({
      id: `key_${role}`,
      name: `${role} key`,
      keyHash: sha256(KEY[role]),
      start: KEY[role].slice(0, 11),
      userId: USER(role),
      organizationId: "org_acme",
      scopes: FULL,
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    })),
  );
  // One code of the team, made by its owner.
  fakeDb.seed("qrCode", [
    {
      id: "code_1",
      userId: USER("owner"),
      organizationId: "org_acme",
      slug: "Acme001",
      destinationUrl: "https://example.com/1",
      title: "Spring menu",
    },
  ]);
});

function request(method: string, path: string, token: string, body?: unknown) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(new URL(path, ORIGIN), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const create = (role: Role) =>
  list.POST(
    request("POST", "/api/v1/codes", KEY[role], {
      destinationUrl: "https://example.com/new",
      title: `By ${role}`,
    }),
  );
const patch = (role: Role) =>
  one.PATCH(
    request("PATCH", "/api/v1/codes/code_1", KEY[role], {
      title: `Renamed by ${role}`,
    }),
    ctx("code_1"),
  );
const remove = (role: Role) =>
  one.DELETE(
    request("DELETE", "/api/v1/codes/code_1", KEY[role]),
    ctx("code_1"),
  );

async function saveTemplate(role: Role) {
  const response = await mcp.POST(
    new NextRequest(new URL("/api/mcp", ORIGIN), {
      method: "POST",
      headers: {
        authorization: `Bearer ${KEY[role]}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "save_template",
          arguments: {
            name: `Brand by ${role}`,
            style: { fgColor: "#111111", bgColor: "#ffffff" },
          },
        },
      }),
    }),
  );
  expect(response.status).toBe(200);
  const text = await response.text();
  // JSON, or a single server-sent event carrying the JSON-RPC reply.
  const payload = text.startsWith("{")
    ? text
    : (text.match(/^data: (.*)$/m)?.[1] ?? "{}");
  return (
    JSON.parse(payload) as {
      result: {
        isError?: boolean;
        structuredContent?: { code?: string; status?: number };
        content: { text: string }[];
      };
    }
  ).result;
}

const forbidden = async (response: Response) => {
  expect(response.status).toBe(403);
  const body = (await response.json()) as { code: string; message: string };
  expect(body.code).toBe("FORBIDDEN");
  return body.message;
};

const code1 = () => fakeDb.find("qrCode", { id: "code_1" });

describe("REST /v1/codes with a read-only creator's key", () => {
  for (const role of ["viewer", "billing"] as const) {
    it(`refuses POST, PATCH and DELETE for a ${role}'s key, and changes nothing`, async () => {
      const before = JSON.stringify(fakeDb.rows("qrCode"));

      expect(await forbidden(await create(role))).toMatch(
        role === "viewer" ? /^You're a viewer here\./ : /^Your billing role/,
      );
      await forbidden(await patch(role));
      await forbidden(await remove(role));

      expect(JSON.stringify(fakeDb.rows("qrCode"))).toBe(before);
      expect(code1()?.title).toBe("Spring menu");
    });

    it(`still lets a ${role}'s key read`, async () => {
      const response = await list.GET(
        request("GET", "/api/v1/codes", KEY[role]),
      );
      expect(response.status).toBe(200);
    });
  }

  it("lets owners, admins and members write (the gate isn't closed for everyone)", async () => {
    expect((await create("member")).status).toBe(201);
    expect((await patch("member")).status).toBe(200);
    expect(code1()?.title).toBe("Renamed by member");
    expect((await patch("admin")).status).toBe(200);
    expect((await remove("owner")).status).toBe(200);
    expect(code1()).toBeUndefined();
  });
});

describe("MCP save_template with a read-only creator's key", () => {
  for (const role of ["viewer", "billing"] as const) {
    it(`refuses a ${role}'s key with the permission error`, async () => {
      const result = await saveTemplate(role);
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      });
      expect(fakeDb.rows("qrPreset")).toHaveLength(0);
    });
  }

  it("saves a shared theme with an admin's key", async () => {
    const result = await saveTemplate("admin");
    expect(result.isError, JSON.stringify(result)).toBeFalsy();
    expect(fakeDb.rows("qrPreset")).toHaveLength(1);
    expect(fakeDb.rows("qrPreset")[0]).toMatchObject({
      organizationId: "org_acme",
      userId: USER("admin"),
    });
  });
});

describe("where a key's role comes from", () => {
  it("is read on every request: a member demoted to viewer loses writes at once", async () => {
    const membership = fakeDb.find("member", { id: "m_member" });
    if (!membership) throw new Error("missing member row");

    expect((await patch("member")).status).toBe(200);

    membership.role = "viewer";
    await forbidden(await patch("member"));
    await forbidden(await create("member"));
    expect((await saveTemplate("member")).structuredContent).toMatchObject({
      code: "FORBIDDEN",
    });

    // Promoted again: the same old key writes again.
    membership.role = "member";
    expect((await patch("member")).status).toBe(200);
  });

  it("stores no role on the key itself", () => {
    const [row] = fakeDb.rows("apiKey");
    expect(Object.keys(row ?? {})).not.toContain("role");
  });
});
