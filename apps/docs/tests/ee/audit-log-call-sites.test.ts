// The audit log's call sites, run for real: the REST API's codes routes
// (the same codes service the dashboard uses) with an API key, and the
// folder and tag services, write the rows Settings → Audit log shows, with
// the key as the actor and the old and new values. Side systems (URL safety,
// domains, version history, webhooks) are stubbed as in tests/api/v1-*.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "business" as "free" | "pro" | "business",
  headers: new Headers(),
  tasks: [] as Promise<unknown>[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    state.tasks.push(Promise.resolve().then(task));
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
}));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  fixedWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 1000,
      remaining: 999,
      reset: Date.now() + 42_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
  getOwnerPlanForOrganization: async () => state.plan,
}));
vi.mock("@/app/dashboard/domains/_lib/domains", () => ({
  getDomainRefs: async () => new Map(),
  assertBindableDomains: async () => {},
}));
vi.mock("@/app/dashboard/themes/_lib/queries", () => ({
  getDefaultThemeStyle: async () => null,
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
vi.mock("@/lib/log-error", () => ({ logError: () => {} }));

const list = await import("@/app/api/v1/codes/route");
const one = await import("@/app/api/v1/codes/[id]/route");
const organize = await import("@/app/dashboard/codes/_lib/organize");

const ORG = "org_acme";
const NOW = new Date("2026-11-09T12:00:00Z");
const KEY = `qrdx_${"Ci".repeat(20)}`;
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const rows = () => fakeDb.rows("workspaceAuditLog");

async function flush() {
  while (state.tasks.length > 0) await Promise.all(state.tasks.splice(0));
}

function api(method: string, path: string, body?: unknown) {
  const headers = {
    authorization: `Bearer ${KEY}`,
    "content-type": "application/json",
    "user-agent": "curl/8.7.1",
    "x-forwarded-for": "203.0.113.9",
  };
  state.headers = new Headers(headers);
  return new NextRequest(`http://localhost:3000/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  state.plan = "business";
  state.tasks = [];
  state.headers = new Headers();
  fakeDb.seed("organization", [
    { id: ORG, name: "Acme", slug: "acme", createdAt: new Date(0) },
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
  fakeDb.unique("qrCode", "slugScope", "slug");
  fakeDb.seed("user", [
    {
      id: "u_ana",
      name: "Ana Diaz",
      email: "ana@acme.test",
      image: null,
      banned: false,
      banExpires: null,
    },
  ]);
  fakeDb.seed("member", [
    { id: "m_ana", organizationId: ORG, userId: "u_ana", role: "owner" },
  ]);
  fakeDb.seed("apiKey", [
    {
      id: "key_ci",
      name: "CI deploy",
      keyHash: sha256(KEY),
      start: KEY.slice(0, 11),
      userId: "u_ana",
      organizationId: ORG,
      scopes: ["codes:read", "codes:write"],
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
});

afterEach(async () => {
  await flush();
  vi.useRealTimers();
});

describe("codes through the REST API", () => {
  it("records creating, editing, archiving and deleting, as the API key", async () => {
    const created = await list.POST(
      api("POST", "/codes", {
        destinationUrl: "https://example.com/menu",
        title: "Spring menu",
      }),
    );
    expect(created.status).toBe(201);
    const { id } = ((await created.json()) as { data: { id: string } }).data;

    const patched = await one.PATCH(
      api("PATCH", `/codes/${id}`, {
        destinationUrl: "https://example.com/summer",
        title: "Summer menu",
      }),
      ctx(id),
    );
    expect(patched.status).toBe(200);
    await one.PATCH(api("PATCH", `/codes/${id}`, { archived: true }), ctx(id));
    await one.DELETE(api("DELETE", `/codes/${id}`), ctx(id));
    await flush();

    expect(rows().map((row) => row.action)).toEqual([
      "code.created",
      "code.destination_changed",
      "code.renamed",
      "code.archived",
      "code.deleted",
    ]);
    for (const row of rows()) {
      expect(row).toMatchObject({
        organizationId: ORG,
        actorType: "api_key",
        actorUserId: "u_ana",
        actorLabel: "CI deploy",
        apiKeyId: "key_ci",
        targetType: "code",
        targetId: id,
        ip: "203.0.113.9",
        device: "curl",
      });
    }
    expect(rows()[1]?.metadata).toEqual({
      before: { destinationUrl: "https://example.com/menu" },
      after: { destinationUrl: "https://example.com/summer" },
    });
    expect(rows()[2]?.metadata).toEqual({
      before: { title: "Spring menu" },
      after: { title: "Summer menu" },
    });
  });

  it("records nothing for a workspace without Business", async () => {
    state.plan = "pro";
    const created = await list.POST(
      api("POST", "/codes", { destinationUrl: "https://example.com/a" }),
    );
    expect(created.status).toBe(201);
    await flush();
    expect(rows()).toHaveLength(0);
  });
});

describe("folders, tags and bulk changes", () => {
  const scope = {
    userId: "u_ana",
    organizationId: ORG,
    role: "owner" as const,
  };

  it("records folders and tags created, renamed and deleted", async () => {
    fakeDb.defaults("folder", () => ({ createdAt: new Date() }));
    fakeDb.defaults("tag", () => ({ createdAt: new Date() }));
    const folder = await organize.createFolder(scope, {
      name: "Events",
      parentId: null,
    });
    await organize.renameFolder(scope, { id: folder.id, name: "Events 2026" });
    await organize.deleteFolder(scope, folder.id);
    const tag = await organize.createTag(scope, {
      name: "print",
      color: "blue",
    });
    await organize.updateTag(scope, { id: tag.id, color: "green" });
    await organize.updateTag(scope, { id: tag.id, name: "posters" });
    await organize.deleteTag(scope, tag.id);
    await flush();
    expect(
      rows().map((row) => [row.action, row.targetLabel, row.metadata]),
    ).toEqual([
      ["folder.created", "Events", null],
      [
        "folder.renamed",
        "Events 2026",
        { before: { name: "Events" }, after: { name: "Events 2026" } },
      ],
      ["folder.deleted", "Events 2026", null],
      ["tag.created", "print", null],
      // A colour change isn't recorded; a new name is.
      [
        "tag.renamed",
        "posters",
        { before: { name: "print" }, after: { name: "posters" } },
      ],
      ["tag.deleted", "posters", null],
    ]);
  });

  it("records each code a bulk change touched", async () => {
    fakeDb.seed("qrCode", [
      {
        id: "c1",
        userId: "u_ana",
        organizationId: ORG,
        slug: "aaa1111",
        title: "One",
      },
      {
        id: "c2",
        userId: "u_ana",
        organizationId: ORG,
        slug: "bbb2222",
        title: null,
      },
    ]);
    await organize.setPaused(scope, ["c1", "c2"], true);
    await organize.trashCodes(scope, ["c1"]);
    await organize.restoreCodes(scope, ["c1"]);
    await flush();
    expect(rows().map((row) => [row.action, row.targetLabel])).toEqual([
      ["code.paused", "One"],
      ["code.paused", "bbb2222"],
      ["code.trashed", "One"],
      ["code.restored", "One"],
    ]);
  });
});
