// Uploaded files and the public bucket: blocking a file moves its object out
// of its public URL (quarantine) and /api/files answers 410; unblocking
// restores it. Uploads land in staging and only the checked version (by
// ETag) is copied to the served key, so a still-valid presigned PUT can't
// overwrite a ready file. Tables are in memory (tests/support/fake-db.ts) and
// the bucket is a Map: nothing connects to a database or R2.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const bucket = vi.hoisted(() => ({
  objects: new Map<string, { body: string; etag: string }>(),
  copies: [] as { from: string; to: string; ifMatch?: string }[],
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
    limit: async () => ({
      success: true,
      limit: 600,
      remaining: 599,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/storage/r2", () => {
  class ObjectChangedError extends Error {}
  const PUBLIC_BASE = "https://assets.qrdx.dev";
  return {
    isStorageConfigured: true,
    ObjectChangedError,
    headObject: async (key: string) => {
      const object = bucket.objects.get(key);
      return object
        ? {
            size: object.body.length,
            mime: "application/pdf",
            etag: object.etag,
            lastModified: null,
          }
        : null;
    },
    copyObject: async (
      from: string,
      to: string,
      { ifMatch }: { ifMatch?: string } = {},
    ) => {
      bucket.copies.push({ from, to, ifMatch });
      const object = bucket.objects.get(from);
      if (!object) throw new Error("NoSuchKey");
      if (ifMatch && ifMatch !== object.etag) {
        throw new ObjectChangedError(from);
      }
      bucket.objects.set(to, { ...object });
    },
    deleteObject: async (key: string) => {
      bucket.objects.delete(key);
    },
    publicUrl: (key: string) => `${PUBLIC_BASE}/${key}`,
    presignDownload: async (key: string) =>
      `https://test.r2.cloudflarestorage.com/${key}?X-Amz-Signature=x`,
    presignUpload: vi.fn(),
  };
});

const { setFileBlocked } = await import("@/lib/files/admin");
const { deliverFile } = await import("@/lib/files/delivery");
const { promoteUpload } = await import("@/lib/files/service");
const keys = await import("@/lib/files/keys");

const ADMIN = { id: "u_admin", email: "admin@example.com" };
const FILE_ID = "cmvwdh3f80000d2cfbvda2bl3";
const KEY = `u-u_owner/${FILE_ID}/menu.pdf`;

function seedFile(overrides: Record<string, unknown> = {}) {
  fakeDb.seed("fileAsset", [
    {
      id: FILE_ID,
      userId: "u_owner",
      organizationId: null,
      storageKey: KEY,
      filename: "menu.pdf",
      mime: "application/pdf",
      size: 9,
      sha256: "abc",
      status: "ready",
      createdAt: new Date(),
      ...overrides,
    },
  ]);
}

const row = () => fakeDb.find("fileAsset", { id: FILE_ID });
const get = (dest = "document") =>
  deliverFile(
    new Request(`https://qrdx.dev/api/files/${FILE_ID}`, {
      headers: { "sec-fetch-dest": dest },
    }),
    FILE_ID,
  );

beforeEach(() => {
  fakeDb.reset();
  bucket.objects = new Map([[KEY, { body: "%PDF-1.7", etag: '"v1"' }]]);
  bucket.copies = [];
});

describe("storage keys", () => {
  it("stages uploads and maps them to their final key", () => {
    const staged = keys.stagingKey(KEY);
    expect(staged).toBe(`staging/${KEY}`);
    expect(keys.finalKeyFor(staged)).toBe(KEY);
    // Pending uploads from before staging are already at their final key.
    expect(keys.finalKeyFor(KEY)).toBe(KEY);
  });

  it("quarantines under a random token and restores to the original key", () => {
    const first = keys.quarantineKey(KEY);
    const second = keys.quarantineKey(KEY);
    expect(first).not.toBe(second);
    expect(first.startsWith("quarantine/")).toBe(true);
    expect(first.endsWith(`/${KEY}`)).toBe(true);
    expect(keys.isQuarantineKey(first)).toBe(true);
    expect(keys.releasedKey(first)).toBe(KEY);
    expect(keys.releasedKey(KEY)).toBe(KEY);
  });
});

describe("blocking a file", () => {
  it("takes the object off its public URL and answers 410", async () => {
    seedFile();
    expect((await get()).status).toBe(302);

    const view = await setFileBlocked(ADMIN, FILE_ID, true, {
      reason: "Abuse report r_1",
    });
    expect(view.status).toBe("blocked");

    const stored = row();
    expect(stored?.status).toBe("blocked");
    expect(keys.isQuarantineKey(String(stored?.storageKey))).toBe(true);
    // The old public key is gone; a copy is kept under quarantine.
    expect(bucket.objects.has(KEY)).toBe(false);
    expect(bucket.objects.has(String(stored?.storageKey))).toBe(true);

    for (const dest of ["document", "image", "video"]) {
      const response = await get(dest);
      expect(response.status, dest).toBe(410);
      expect(response.headers.get("location")).toBeNull();
    }

    const audit = fakeDb.rows("adminAuditLog");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "file.block" });
    expect(audit[0]?.metadata).toMatchObject({ quarantined: true });
  });

  it("restores the object to its URL when unblocked", async () => {
    seedFile();
    await setFileBlocked(ADMIN, FILE_ID, true);
    const quarantined = String(row()?.storageKey);

    const view = await setFileBlocked(ADMIN, FILE_ID, false);
    expect(view.status).toBe("ready");
    expect(row()?.storageKey).toBe(KEY);
    expect(bucket.objects.has(KEY)).toBe(true);
    expect(bucket.objects.has(quarantined)).toBe(false);
    const response = await get();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `https://assets.qrdx.dev/${KEY}`,
    );
  });

  it("quarantines files blocked before quarantine existed, once", async () => {
    // Blocked earlier: the object still sits at its public key.
    seedFile({ status: "blocked" });
    await setFileBlocked(ADMIN, FILE_ID, true);
    const key = String(row()?.storageKey);
    expect(keys.isQuarantineKey(key)).toBe(true);
    expect(bucket.objects.has(KEY)).toBe(false);

    // Blocking again changes nothing and writes no second audit entry.
    await setFileBlocked(ADMIN, FILE_ID, true);
    expect(row()?.storageKey).toBe(key);
    expect(fakeDb.rows("adminAuditLog")).toHaveLength(1);
  });

  it("can't restore a file whose content is gone", async () => {
    seedFile({ status: "blocked" });
    bucket.objects.clear();
    await expect(setFileBlocked(ADMIN, FILE_ID, false)).rejects.toMatchObject({
      status: 409,
      code: "NOT_RESTORABLE",
    });
  });

  it("deletes the content for good with deleteContent", async () => {
    seedFile();
    await setFileBlocked(ADMIN, FILE_ID, true, { deleteContent: true });
    expect(bucket.objects.size).toBe(0);
    expect(row()?.status).toBe("blocked");
  });
});

describe("finalizing a staged upload", () => {
  const STAGED = `staging/${KEY}`;
  const pending = () =>
    ({
      id: FILE_ID,
      userId: "u_owner",
      organizationId: null,
      storageKey: STAGED,
      filename: "menu.pdf",
      mime: "application/pdf",
      size: 9,
      sha256: null,
      status: "pending",
      createdAt: new Date(),
    }) as Parameters<typeof promoteUpload>[0];

  beforeEach(() => {
    bucket.objects = new Map([[STAGED, { body: "%PDF-1.7", etag: '"v1"' }]]);
  });

  it("copies exactly the checked version to the served key", async () => {
    const finalKey = await promoteUpload(pending(), '"v1"');
    expect(finalKey).toBe(KEY);
    expect(bucket.copies).toEqual([{ from: STAGED, to: KEY, ifMatch: '"v1"' }]);
    expect(bucket.objects.has(KEY)).toBe(true);
    // The presigned PUT can only ever write staging, which is now empty.
    expect(bucket.objects.has(STAGED)).toBe(false);
  });

  it("refuses an upload swapped after it was checked", async () => {
    fakeDb.seed("fileAsset", [pending() as unknown as Record<string, unknown>]);
    // Re-PUT through the still-valid presigned URL: a new version.
    bucket.objects.set(STAGED, { body: "<html>", etag: '"v2"' });
    await expect(promoteUpload(pending(), '"v1"')).rejects.toMatchObject({
      status: 409,
      code: "UPLOAD_CHANGED",
    });
    expect(bucket.objects.has(KEY)).toBe(false);
    expect(bucket.objects.has(STAGED)).toBe(false);
    expect(row()).toBeUndefined();
  });

  it("leaves uploads from before staging where they are", async () => {
    bucket.objects = new Map([[KEY, { body: "%PDF-1.7", etag: '"v1"' }]]);
    const finalKey = await promoteUpload(
      { ...pending(), storageKey: KEY },
      '"v1"',
    );
    expect(finalKey).toBe(KEY);
    expect(bucket.copies).toEqual([]);
  });
});
