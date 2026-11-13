// The Files list and the file library load a page at a time, newest first,
// with a cursor (lib/files/service.ts listFilesPage). Files uploaded in the
// same instant show up exactly once, a kind or "ready only" holds on every
// page, a cursor from elsewhere starts at the top, and the kind tabs count
// the whole workspace (not just the rows loaded so far). The picker's
// GET /api/files returns { data, nextCursor }. Runs the real queries
// against in-memory tables.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  scope: { userId: "u_ana", organizationId: "org_acme", role: "owner" },
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@repo/auth/server", () => ({ auth: { api: {} } }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({ success: true, pending: Promise.resolve() }),
  }),
}));
vi.mock("@/lib/storage/r2", () => ({
  isStorageConfigured: true,
  publicUrl: (key: string) => `https://assets.example/${key}`,
}));
vi.mock("@/lib/files/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/files/http")>()),
  resolveUploadScope: async () => state.scope,
}));

const { countFilesByKind, listFilesPage } = await import("@/lib/files/service");
const route = await import("@/app/api/files/route");

const ORG = "org_acme";
const SCOPE = { userId: "u_ana", organizationId: ORG, role: "owner" as const };
const SAME = new Date("2026-11-13T09:00:00.000Z");
const MIMES = ["application/pdf", "image/png", "audio/mpeg", "video/mp4"];

/** 0..count-1 scrambled, so only the id tie-breaker can order equal times. */
const scrambled = (count: number) =>
  Array.from({ length: count }, (_, index) => (index * 37) % count);
const fileId = (index: number) => `f${String(index).padStart(4, "0")}`;

function seedFiles(
  count: number,
  at: (index: number) => Record<string, unknown> = () => ({}),
) {
  fakeDb.seed(
    "fileAsset",
    scrambled(count).map((index) => ({
      id: fileId(index),
      userId: "u_ana",
      organizationId: ORG,
      storageKey: `org/${fileId(index)}`,
      filename: `file-${index}.pdf`,
      mime: "application/pdf",
      size: 1000,
      status: "ready",
      createdAt: SAME,
      ...at(index),
    })),
  );
}

async function readAll(
  options: Parameters<typeof listFilesPage>[1],
): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | null = null;
  for (let pages = 0; pages < 100; pages++) {
    const page = await listFilesPage(SCOPE, { ...options, cursor });
    seen.push(...page.items.map((file) => file.id));
    cursor = page.nextCursor;
    if (!cursor) return seen;
  }
  throw new Error("never reached the last page");
}

beforeEach(() => {
  fakeDb.resetAll();
});

describe("listFilesPage", () => {
  it("shows files uploaded in the same instant exactly once, newest id first", async () => {
    seedFiles(130);
    const first = await listFilesPage(SCOPE, { limit: 50 });
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();
    const all = await readAll({ limit: 50 });
    expect(all).toEqual(
      Array.from({ length: 130 }, (_, index) => fileId(129 - index)),
    );
  });

  it("orders by time first, then id", async () => {
    seedFiles(6, (index) => ({
      createdAt: new Date(SAME.getTime() + (index % 3) * 1000),
    }));
    expect(await readAll({ limit: 2 })).toEqual([
      "f0005",
      "f0002",
      "f0004",
      "f0001",
      "f0003",
      "f0000",
    ]);
  });

  it("keeps a kind and ready-only on every page", async () => {
    seedFiles(40, (index) => ({
      mime: MIMES[index % 4],
      status: index % 5 === 0 ? "blocked" : "ready",
    }));
    const images = await readAll({ kind: "image", limit: 3 });
    expect(images).toHaveLength(10);
    const readyImages = await readAll({
      kind: "image",
      readyOnly: true,
      limit: 3,
    });
    // Images are 1, 5, 9, …; 5, 25 are blocked.
    expect(readyImages).toHaveLength(8);
    expect(readyImages).not.toContain(fileId(5));
  });

  it("leaves out pending files and other workspaces' files", async () => {
    seedFiles(3);
    seedFiles(2, (index) => ({
      id: `pending${index}`,
      status: "pending",
    }));
    seedFiles(2, (index) => ({
      id: `other${index}`,
      organizationId: "org_other",
    }));
    expect(await readAll({})).toEqual(["f0002", "f0001", "f0000"]);
  });

  it("starts at the top for a cursor it didn't make", async () => {
    seedFiles(3);
    for (const cursor of ["junk", "1.' or 1=1", "-1.f0001"]) {
      const page = await listFilesPage(SCOPE, { cursor });
      expect(page.items.map((file) => file.id)).toEqual([
        "f0002",
        "f0001",
        "f0000",
      ]);
    }
  });

  it("bounds the page size", async () => {
    seedFiles(5);
    expect((await listFilesPage(SCOPE, { limit: 0 })).items).toHaveLength(1);
    expect((await listFilesPage(SCOPE, { limit: 1e9 })).items).toHaveLength(5);
  });
});

describe("countFilesByKind", () => {
  it("counts every ready and blocked file by kind", async () => {
    seedFiles(9, (index) => ({
      mime: MIMES[index % 4],
      status: index === 8 ? "pending" : "ready",
    }));
    expect(await countFilesByKind(SCOPE)).toEqual({
      pdf: 2,
      image: 2,
      audio: 2,
      video: 2,
    });
  });
});

describe("GET /api/files", () => {
  const get = async (query = "") => {
    const response = await route.GET(
      new Request(`http://localhost:3000/api/files${query}`),
    );
    return {
      status: response.status,
      body: (await response.json()) as {
        data: { id: string }[];
        nextCursor: string | null;
      },
    };
  };

  it("pages ready files with nextCursor", async () => {
    seedFiles(5, (index) => ({ status: index === 0 ? "blocked" : "ready" }));
    const first = await get("?limit=2");
    expect(first.status).toBe(200);
    expect(first.body.data.map((file) => file.id)).toEqual(["f0004", "f0003"]);
    const second = await get(
      `?limit=2&cursor=${encodeURIComponent(first.body.nextCursor ?? "")}`,
    );
    expect(second.body.data.map((file) => file.id)).toEqual(["f0002", "f0001"]);
    // f0000 is blocked: the picker never offers it.
    expect(second.body.nextCursor).toBeNull();
  });

  it("refuses a page size out of range", async () => {
    expect((await get("?limit=500")).status).toBe(400);
  });
});
