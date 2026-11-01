// Folders, tags, trash and duplicates for dynamic codes
// (app/dashboard/codes/_lib/organize.ts), as content/docs/dynamic-qr-codes.mdx
// and teams.mdx describe them: everything is per workspace; team members
// delete only what they created; trashed codes free their plan slot and
// restoring needs one; duplicates copy destination, design, folder, tags and
// notes but never scans. Runs the real service on in-memory tables.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "free" as "free" | "pro" | "business",
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
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
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

const organize = await import("@/app/dashboard/codes/_lib/organize");
const { HttpError } = await import("@/lib/error-response");
const { ValidationError } = await import("@/types/errors");

type Scope = Parameters<typeof organize.createFolder>[0];
const alice: Scope = { userId: "u_alice", organizationId: null, role: "owner" };
const bob: Scope = { userId: "u_bob", organizationId: null, role: "owner" };
const teamOwner: Scope = {
  userId: "u_alice",
  organizationId: "org_acme",
  role: "owner",
};
const teamMember: Scope = {
  userId: "u_bob",
  organizationId: "org_acme",
  role: "member",
};
const NOW = new Date("2026-11-01T12:00:00Z");

let seq = 0;
function seedCode(overrides: Record<string, unknown> = {}) {
  seq += 1;
  const row = {
    id: `code_${seq}`,
    userId: "u_alice",
    organizationId: null,
    slug: `Slug${String(seq).padStart(3, "0")}`,
    destinationUrl: `https://example.com/${seq}`,
    title: `Code ${seq}`,
    ...overrides,
  };
  fakeDb.seed("qrCode", [row]);
  return row.id;
}

const code = (id: string) => fakeDb.find("qrCode", { id });
const tagsOf = (codeId: string) =>
  fakeDb
    .rows("qrCodeTag")
    .filter((row) => row.qrCodeId === codeId)
    .map((row) => row.tagId)
    .sort();

async function failsWith(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected ${code}`).toBeInstanceOf(Error);
  if (code === "VALIDATION_ERROR") {
    expect(error).toBeInstanceOf(ValidationError);
  } else {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as InstanceType<typeof HttpError>).code).toBe(code);
  }
  return error as Error;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  fakeDb.defaults("qrCode", () => ({
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
    passwordHash: null,
    startsAt: null,
    expiresAt: null,
    scanLimit: null,
    fallbackUrl: null,
    routing: null,
    utm: null,
    pixels: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  fakeDb.unique("qrCode", "slug");
  fakeDb.unique("qrCodeTag", "qrCodeId", "tagId");
  state.plan = "free";
  seq = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Folders ────────────────────────────────────────────────────────────────

describe("folders", () => {
  it("are per workspace, with code counts that skip archived and trashed codes", async () => {
    const menus = await organize.createFolder(alice, {
      name: "Menus",
      parentId: null,
    });
    await organize.createFolder(bob, { name: "Bob's", parentId: null });
    seedCode({ folderId: menus.id });
    seedCode({ folderId: menus.id, archivedAt: NOW });
    seedCode({ folderId: menus.id, deletedAt: NOW });

    const folders = await organize.listFolders(alice);
    expect(folders).toEqual([
      expect.objectContaining({ name: "Menus", codeCount: 1, parentId: null }),
    ]);
    expect((await organize.listFolders(bob)).map((f) => f.name)).toEqual([
      "Bob's",
    ]);
  });

  it("keep sibling names unique, ignoring case", async () => {
    await organize.createFolder(alice, { name: "Events", parentId: null });
    await failsWith(
      organize.createFolder(alice, { name: "events", parentId: null }),
      "VALIDATION_ERROR",
    );
    // The same name is fine elsewhere, or in another workspace.
    const parent = await organize.createFolder(alice, {
      name: "2026",
      parentId: null,
    });
    await organize.createFolder(alice, { name: "Events", parentId: parent.id });
    await organize.createFolder(bob, { name: "Events", parentId: null });
  });

  it("nest at most 5 levels deep", async () => {
    let parentId: string | null = null;
    for (let depth = 1; depth <= 5; depth++) {
      parentId = (
        await organize.createFolder(alice, {
          name: `Level ${depth}`,
          parentId,
        })
      ).id;
    }
    const error = await failsWith(
      organize.createFolder(alice, { name: "Level 6", parentId }),
      "VALIDATION_ERROR",
    );
    expect(error.message).toBe("Folders can be nested up to 5 levels deep.");
  });

  it("can't be moved into themselves or their subfolders", async () => {
    const top = await organize.createFolder(alice, {
      name: "Top",
      parentId: null,
    });
    const child = await organize.createFolder(alice, {
      name: "Child",
      parentId: top.id,
    });
    await failsWith(
      organize.moveFolder(alice, { id: top.id, parentId: child.id }),
      "VALIDATION_ERROR",
    );
    await failsWith(
      organize.moveFolder(alice, { id: top.id, parentId: top.id }),
      "VALIDATION_ERROR",
    );
  });

  it("don't accept another workspace's parent", async () => {
    const bobs = await organize.createFolder(bob, {
      name: "Bob's",
      parentId: null,
    });
    await failsWith(
      organize.createFolder(alice, { name: "Sneaky", parentId: bobs.id }),
      "NOT_FOUND",
    );
  });

  it("when deleted, hand their codes and subfolders to the parent", async () => {
    const top = await organize.createFolder(alice, {
      name: "Top",
      parentId: null,
    });
    const mid = await organize.createFolder(alice, {
      name: "Mid",
      parentId: top.id,
    });
    const leaf = await organize.createFolder(alice, {
      name: "Leaf",
      parentId: mid.id,
    });
    const inMid = seedCode({ folderId: mid.id });
    const bobsCode = seedCode({ userId: "u_bob", folderId: mid.id });

    expect(await organize.deleteFolder(alice, mid.id)).toEqual({
      parentId: top.id,
    });
    expect(code(inMid)?.folderId).toBe(top.id);
    expect(fakeDb.find("folder", { id: leaf.id })?.parentId).toBe(top.id);
    expect(fakeDb.find("folder", { id: mid.id })).toBeUndefined();
    // Codes outside the workspace are never touched.
    expect(code(bobsCode)?.folderId).toBe(mid.id);
  });

  it("can only be renamed or deleted by their creator, or a team owner or admin", async () => {
    const owners = await organize.createFolder(teamOwner, {
      name: "Owner's",
      parentId: null,
    });
    await failsWith(
      organize.renameFolder(teamMember, { id: owners.id, name: "Mine now" }),
      "FORBIDDEN",
    );
    await failsWith(organize.deleteFolder(teamMember, owners.id), "FORBIDDEN");

    const members = await organize.createFolder(teamMember, {
      name: "Member's",
      parentId: null,
    });
    await organize.renameFolder(teamMember, {
      id: members.id,
      name: "Renamed",
    });
    await organize.renameFolder(teamOwner, {
      id: members.id,
      name: "By owner",
    });
    expect(fakeDb.find("folder", { id: members.id })?.name).toBe("By owner");
  });

  it("validate names", () => {
    const parse = (value: string) => organize.folderNameSchema.safeParse(value);
    expect(parse("  Spring   menus  ").data).toBe("Spring menus");
    expect(parse("").success).toBe(false);
    expect(parse("a/b").success).toBe(false);
    expect(parse("x".repeat(61)).success).toBe(false);
  });

  it("resolve import paths, creating only what's missing", async () => {
    const marketing = await organize.createFolder(alice, {
      name: "Marketing",
      parentId: null,
    });
    const ids = await organize.resolveFolderPaths(alice, [
      ["marketing", "Spring"],
      ["Marketing"],
    ]);
    expect(ids.get("marketing")).toBe(marketing.id);
    const spring = ids.get("marketing/spring");
    expect(fakeDb.find("folder", { id: spring })).toMatchObject({
      name: "Spring",
      parentId: marketing.id,
    });
    expect(fakeDb.rows("folder")).toHaveLength(2);
  });
});

// ─── Tags ───────────────────────────────────────────────────────────────────

describe("tags", () => {
  it("are unique per workspace, ignoring case", async () => {
    await organize.createTag(alice, { name: "Print", color: "blue" });
    await failsWith(
      organize.createTag(alice, { name: "print", color: "red" }),
      "VALIDATION_ERROR",
    );
    await organize.createTag(bob, { name: "Print", color: "red" });
  });

  it("tag and untag several codes at once, only in the workspace", async () => {
    const print = await organize.createTag(alice, {
      name: "Print",
      color: "blue",
    });
    const promo = await organize.createTag(alice, {
      name: "Promo",
      color: "red",
    });
    const a = seedCode();
    const b = seedCode();
    const bobs = seedCode({ userId: "u_bob" });

    expect(
      await organize.tagCodes(alice, [a, b, bobs], {
        add: [print.id, promo.id],
      }),
    ).toEqual({ updated: 2 });
    expect(tagsOf(a)).toEqual([print.id, promo.id].sort());
    expect(tagsOf(bobs)).toEqual([]);

    // Adding again is harmless; removing takes effect.
    await organize.tagCodes(alice, [a], {
      add: [print.id],
      remove: [promo.id],
    });
    expect(tagsOf(a)).toEqual([print.id]);

    const tags = await organize.listTags(alice);
    expect(tags.map((t) => [t.name, t.codeCount])).toEqual([
      ["Print", 2],
      ["Promo", 1],
    ]);
  });

  it("refuse another workspace's tags", async () => {
    const bobsTag = await organize.createTag(bob, {
      name: "Bob",
      color: "gray",
    });
    const mine = seedCode();
    await failsWith(
      organize.tagCodes(alice, [mine], { add: [bobsTag.id] }),
      "NOT_FOUND",
    );
    await failsWith(
      organize.setCodeTags(alice, mine, [bobsTag.id]),
      "NOT_FOUND",
    );
    expect(tagsOf(mine)).toEqual([]);
  });

  it("allow at most 10 per code", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 11; i++) {
      ids.push(
        (await organize.createTag(alice, { name: `T${i}`, color: "gray" })).id,
      );
    }
    const mine = seedCode();
    await organize.setCodeTags(alice, mine, ids.slice(0, 10));
    expect(tagsOf(mine)).toHaveLength(10);
    await failsWith(
      organize.tagCodes(alice, [mine], { add: [ids[10] as string] }),
      "VALIDATION_ERROR",
    );
    await failsWith(organize.setCodeTags(alice, mine, ids), "VALIDATION_ERROR");
    // Replacing with fewer works, and an empty list clears them.
    await organize.setCodeTags(alice, mine, [ids[0] as string]);
    expect(tagsOf(mine)).toEqual([ids[0]]);
    await organize.setCodeTags(alice, mine, []);
    expect(tagsOf(mine)).toEqual([]);
  });

  it("validate names", () => {
    const parse = (value: string) => organize.tagNameSchema.safeParse(value);
    expect(parse(" summer   2026 ").data).toBe("summer 2026");
    for (const bad of ["", "a,b", "a;b", "a|b", "x".repeat(33)]) {
      expect(parse(bad).success, bad).toBe(false);
    }
  });

  it("resolve import names, reusing existing tags", async () => {
    const print = await organize.createTag(alice, {
      name: "Print",
      color: "blue",
    });
    const ids = await organize.resolveTagNames(alice, ["print", "New", "new"]);
    expect(ids.get("print")).toBe(print.id);
    expect(
      fakeDb
        .rows("tag")
        .map((t) => t.name)
        .sort(),
    ).toEqual(["New", "Print"]);
  });
});

// ─── Moving, pausing, archiving ─────────────────────────────────────────────

describe("bulk actions on codes", () => {
  it("move codes into a folder, and back out", async () => {
    const folder = await organize.createFolder(alice, {
      name: "Menus",
      parentId: null,
    });
    const a = seedCode();
    const bobs = seedCode({ userId: "u_bob" });
    expect(await organize.moveCodes(alice, [a, bobs], folder.id)).toEqual({
      updated: 1,
    });
    expect(code(a)?.folderId).toBe(folder.id);
    expect(code(bobs)?.folderId).toBeNull();
    await organize.moveCodes(alice, [a], null);
    expect(code(a)?.folderId).toBeNull();
    await failsWith(organize.moveCodes(alice, [a], "folder_nope"), "NOT_FOUND");
  });

  it("pause on every plan and report only what changed", async () => {
    const a = seedCode();
    const b = seedCode({ pausedAt: NOW });
    expect(await organize.setPaused(alice, [a, b], true)).toEqual({
      updated: 1,
    });
    expect(code(a)?.pausedAt).toEqual(NOW);
    expect(await organize.setPaused(alice, [a, b], false)).toEqual({
      updated: 2,
    });
  });

  it("unarchive only into free slots (Free: 10 active codes)", async () => {
    for (let i = 0; i < 9; i++) seedCode();
    const shelved = [
      seedCode({ archivedAt: NOW }),
      seedCode({ archivedAt: NOW }),
    ];
    await failsWith(
      organize.setArchived(alice, shelved, false),
      "LIMIT_REACHED",
    );
    expect(shelved.every((id) => code(id)?.archivedAt)).toBe(true);
    expect(
      await organize.setArchived(alice, [shelved[0] as string], false),
    ).toEqual({ updated: 1 });
  });
});

// ─── Trash ──────────────────────────────────────────────────────────────────

describe("trash", () => {
  it("frees the slot; restoring needs one", async () => {
    const ids = Array.from({ length: 10 }, () => seedCode());
    const [first] = ids as [string];
    expect(await organize.trashCodes(alice, [first])).toEqual({
      updated: 1,
      skipped: 0,
    });
    expect(code(first)?.deletedAt).toEqual(NOW);
    expect(await organize.countTrash(alice)).toBe(1);

    seedCode(); // the freed slot is used again
    await failsWith(organize.restoreCodes(alice, [first]), "LIMIT_REACHED");
    expect(code(first)?.deletedAt).toEqual(NOW);

    state.plan = "pro";
    expect(await organize.restoreCodes(alice, [first])).toEqual({ updated: 1 });
    expect(code(first)?.deletedAt).toBeNull();
  });

  it("restores archived codes without needing a slot", async () => {
    for (let i = 0; i < 10; i++) seedCode();
    const archivedInTrash = seedCode({ archivedAt: NOW, deletedAt: NOW });
    expect(await organize.restoreCodes(alice, [archivedInTrash])).toEqual({
      updated: 1,
    });
  });

  it("purges only trashed codes, permanently", async () => {
    const live = seedCode();
    const trashed = seedCode({ deletedAt: NOW });
    expect(await organize.purgeCodes(alice, [live, trashed])).toEqual({
      updated: 1,
      skipped: 1,
    });
    expect(code(trashed)).toBeUndefined();
    expect(code(live)).toBeDefined();
  });

  it("lets team members trash and purge only their own codes", async () => {
    const owners = seedCode({ organizationId: "org_acme", userId: "u_alice" });
    const members = seedCode({ organizationId: "org_acme", userId: "u_bob" });
    expect(await organize.trashCodes(teamMember, [owners, members])).toEqual({
      updated: 1,
      skipped: 1,
    });
    expect(code(owners)?.deletedAt).toBeNull();

    await organize.trashCodes(teamOwner, [owners]);
    expect(await organize.purgeCodes(teamMember, [owners, members])).toEqual({
      updated: 1,
      skipped: 1,
    });
    expect(code(owners)).toBeDefined();
    expect(await organize.emptyTrash(teamMember)).toEqual({ updated: 0 });
    expect(await organize.emptyTrash(teamOwner)).toEqual({ updated: 1 });
    expect(code(owners)).toBeUndefined();
  });

  it("never reaches into another workspace", async () => {
    const bobs = seedCode({ userId: "u_bob", deletedAt: NOW });
    expect(await organize.purgeCodes(alice, [bobs])).toEqual({
      updated: 0,
      skipped: 1,
    });
    expect(await organize.emptyTrash(alice)).toEqual({ updated: 0 });
    expect(code(bobs)).toBeDefined();
  });
});

// ─── Duplicates ─────────────────────────────────────────────────────────────

describe("duplicating a code", () => {
  it("copies destination, design, folder, tags and notes, but not scans or the slug", async () => {
    const folder = await organize.createFolder(alice, {
      name: "Menus",
      parentId: null,
    });
    const print = await organize.createTag(alice, {
      name: "Print",
      color: "blue",
    });
    const source = seedCode({
      title: "Spring menu",
      style: { fgColor: "#111111" },
      folderId: folder.id,
      notes: "Table tents",
      scanCount: 120,
      lastScannedAt: NOW,
    });
    await organize.setCodeTags(alice, source, [print.id]);

    const copy = await organize.duplicateCode(alice, source);
    expect(copy.id).not.toBe(source);
    expect(copy.slug).not.toBe(code(source)?.slug);
    expect(copy.title).toBe("Spring menu (copy)");
    expect(copy.destinationUrl).toBe(code(source)?.destinationUrl);
    expect(copy.scanCount).toBe(0);
    expect(code(copy.id)).toMatchObject({
      folderId: folder.id,
      notes: "Table tents",
      style: { fgColor: "#111111" },
      scanCount: 0,
      lastScannedAt: null,
    });
    expect(tagsOf(copy.id)).toEqual([print.id]);
  });

  it("keeps link controls only on plans that include them", async () => {
    const source = seedCode({
      scanLimit: 50,
      fallbackUrl: "https://example.com/over",
    });
    const freeCopy = await organize.duplicateCode(alice, source);
    expect(code(freeCopy.id)).toMatchObject({
      scanLimit: null,
      fallbackUrl: null,
    });

    state.plan = "pro";
    const proCopy = await organize.duplicateCode(alice, source);
    expect(code(proCopy.id)).toMatchObject({
      scanLimit: 50,
      fallbackUrl: "https://example.com/over",
    });
  });

  it("counts against the plan like a new code", async () => {
    const ids = Array.from({ length: 10 }, () => seedCode());
    await failsWith(
      organize.duplicateCode(alice, ids[0] as string),
      "LIMIT_REACHED",
    );
  });

  it("shortens long titles to fit", async () => {
    const source = seedCode({ title: "x".repeat(100) });
    const copy = await organize.duplicateCode(alice, source);
    expect(copy.title?.length).toBeLessThanOrEqual(100);
    expect(copy.title?.endsWith("… (copy)")).toBe(true);
  });

  it("can't copy another workspace's code", async () => {
    const bobs = seedCode({ userId: "u_bob" });
    await failsWith(organize.duplicateCode(alice, bobs), "NOT_FOUND");
  });
});
