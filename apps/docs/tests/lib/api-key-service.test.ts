// The API key service behind Settings → Developers (lib/api-keys/service):
// creating a key stores only its hash and returns the key once; lists show
// a team's keys to owners and admins and only their own to members; only the
// creator, owners and admins revoke; each person has at most MAX_API_KEYS
// active keys per workspace; and before manual-sql/0011 the service reports
// "unavailable" instead of failing. In-memory tables (tests/support/fake-db).
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, repoDatabase } from "../support/fake-db";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const {
  ApiKeysUnavailableError,
  authenticateApiKey,
  createApiKey,
  isMissingTableError,
  listApiKeys,
  revokeApiKey,
} = await import("@/lib/api-keys/service");
const { MAX_API_KEYS } = await import("@/lib/api-keys/shared");

const NOW = new Date("2026-11-02T12:00:00Z");
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const personal = {
  userId: "u_alice",
  organizationId: null,
  role: "owner" as const,
};
const teamOwner = {
  userId: "u_alice",
  organizationId: "org_acme",
  role: "owner" as const,
};
const teamMember = {
  userId: "u_bob",
  organizationId: "org_acme",
  role: "member" as const,
};
const teamAdmin = {
  userId: "u_carol",
  organizationId: "org_acme",
  role: "admin" as const,
};

const input = {
  name: "CI",
  scopes: ["codes:read", "codes:write"] as ("codes:read" | "codes:write")[],
  expiresInDays: null,
};

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique("apiKey", "keyHash");
  fakeDb.seed("user", [
    { id: "u_alice", name: "Alice", banned: false, banExpires: null },
    { id: "u_bob", name: "Bob", banned: false, banExpires: null },
    { id: "u_carol", name: "Carol", banned: false, banExpires: null },
  ]);
  fakeDb.seed("member", [
    { id: "m1", organizationId: "org_acme", userId: "u_alice", role: "owner" },
    { id: "m2", organizationId: "org_acme", userId: "u_bob", role: "member" },
    { id: "m3", organizationId: "org_acme", userId: "u_carol", role: "admin" },
  ]);
});

afterEach(() => vi.restoreAllMocks());

describe("createApiKey", () => {
  it("returns the key once and stores only its hash and start", async () => {
    const { key, apiKey } = await createApiKey(personal, input, NOW);
    expect(key).toMatch(/^qrdx_[0-9A-Za-z]{40}$/);

    const [row] = fakeDb.rows("apiKey");
    expect(row).toMatchObject({
      keyHash: sha256(key),
      start: key.slice(0, 11),
      userId: "u_alice",
      organizationId: null,
      scopes: ["codes:read", "codes:write"],
      expiresAt: null,
      revokedAt: null,
    });
    // The key itself is nowhere in the table.
    expect(JSON.stringify(fakeDb.rows("apiKey"))).not.toContain(key);
    expect(JSON.stringify(fakeDb.rows("apiKey"))).not.toContain(key.slice(11));

    expect(apiKey).toMatchObject({
      name: "CI",
      start: key.slice(0, 11),
      creator: { id: "u_alice", name: "Alice" },
      mine: true,
      canRevoke: true,
      expired: false,
    });
    expect(apiKey).not.toHaveProperty("keyHash");
  });

  it("puts a key made in a team into that team", async () => {
    const { key } = await createApiKey(teamMember, input, NOW);
    expect(fakeDb.rows("apiKey")[0]).toMatchObject({
      userId: "u_bob",
      organizationId: "org_acme",
    });
    expect(await authenticateApiKey(key, NOW)).toMatchObject({
      userId: "u_bob",
      organizationId: "org_acme",
      role: "member",
    });
  });

  it("sets the expiry from the chosen days", async () => {
    await createApiKey(personal, { ...input, expiresInDays: 30 }, NOW);
    expect(fakeDb.rows("apiKey")[0]?.expiresAt).toEqual(
      new Date("2026-12-02T12:00:00Z"),
    );
  });

  it(`caps each person at ${MAX_API_KEYS} active keys per workspace`, async () => {
    for (let i = 0; i < MAX_API_KEYS; i += 1) {
      await createApiKey(personal, input, NOW);
    }
    await expect(createApiKey(personal, input, NOW)).rejects.toMatchObject({
      status: 403,
      code: "LIMIT_REACHED",
    });
    // Other people, and the same person in another workspace, aren't affected.
    await expect(createApiKey(teamOwner, input, NOW)).resolves.toBeTruthy();
    await expect(createApiKey(teamMember, input, NOW)).resolves.toBeTruthy();
    // Revoking (or expiry) frees a slot.
    const [first] = await listApiKeys(personal, NOW);
    await revokeApiKey(personal, first?.id ?? "", NOW);
    await expect(createApiKey(personal, input, NOW)).resolves.toBeTruthy();
  });
});

describe("listApiKeys", () => {
  beforeEach(async () => {
    await createApiKey(personal, { ...input, name: "Alice personal" }, NOW);
    await createApiKey(
      teamOwner,
      { ...input, name: "Alice team" },
      new Date(NOW.getTime() + 1),
    );
    await createApiKey(
      teamMember,
      { ...input, name: "Bob team" },
      new Date(NOW.getTime() + 2),
    );
  });
  const names = async (scope: Parameters<typeof listApiKeys>[0]) =>
    (await listApiKeys(scope, NOW)).map((key) => key.name);

  it("shows the personal workspace's keys only there", async () => {
    expect(await names(personal)).toEqual(["Alice personal"]);
  });

  it("shows owners and admins every team key, newest first", async () => {
    expect(await names(teamOwner)).toEqual(["Bob team", "Alice team"]);
    expect(await names(teamAdmin)).toEqual(["Bob team", "Alice team"]);
  });

  it("shows members only their own team keys", async () => {
    expect(await names(teamMember)).toEqual(["Bob team"]);
  });

  it("hides revoked keys and marks expired ones", async () => {
    const [bob] = await listApiKeys(teamMember, NOW);
    await revokeApiKey(teamMember, bob?.id ?? "", NOW);
    expect(await names(teamOwner)).toEqual(["Alice team"]);

    await createApiKey(
      personal,
      { ...input, name: "Short", expiresInDays: 30 },
      NOW,
    );
    const later = new Date(NOW.getTime() + 31 * 24 * 3600_000);
    const keys = await listApiKeys(personal, later);
    expect(keys.find((key) => key.name === "Short")?.expired).toBe(true);
  });

  it("never returns hashes", async () => {
    const keys = await listApiKeys(teamOwner, NOW);
    for (const key of keys) {
      expect(Object.keys(key).sort()).toEqual(
        [
          "canRevoke",
          "createdAt",
          "creator",
          "expired",
          "expiresAt",
          "id",
          "lastUsedAt",
          "mine",
          "name",
          "scopes",
          "start",
        ].sort(),
      );
    }
  });
});

describe("revokeApiKey", () => {
  it("lets the creator, owners and admins revoke; not other members", async () => {
    const alice = await createApiKey(teamOwner, input, NOW);
    const bob = await createApiKey(teamMember, input, NOW);

    await expect(
      revokeApiKey(teamMember, alice.apiKey.id, NOW),
    ).rejects.toMatchObject({
      status: 404,
    });
    expect(await authenticateApiKey(alice.key, NOW)).not.toBeNull();

    await revokeApiKey(teamAdmin, bob.apiKey.id, NOW);
    expect(await authenticateApiKey(bob.key, NOW)).toBeNull();
    await revokeApiKey(teamOwner, alice.apiKey.id, NOW);
    expect(await authenticateApiKey(alice.key, NOW)).toBeNull();
  });

  it("can't reach another workspace's keys", async () => {
    const mine = await createApiKey(personal, input, NOW);
    await expect(
      revokeApiKey(teamOwner, mine.apiKey.id, NOW),
    ).rejects.toMatchObject({
      status: 404,
    });
    const outsider = {
      userId: "u_dave",
      organizationId: null,
      role: "owner" as const,
    };
    await expect(
      revokeApiKey(outsider, mine.apiKey.id, NOW),
    ).rejects.toMatchObject({
      status: 404,
    });
    expect(await authenticateApiKey(mine.key, NOW)).not.toBeNull();
  });

  it("treats an already revoked key as gone", async () => {
    const { apiKey } = await createApiKey(personal, input, NOW);
    await revokeApiKey(personal, apiKey.id, NOW);
    await expect(revokeApiKey(personal, apiKey.id, NOW)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("before the api_key table exists", () => {
  beforeEach(() => {
    const missing = Object.assign(new Error("Failed query"), {
      cause: Object.assign(new Error('relation "api_key" does not exist'), {
        code: "42P01",
      }),
    });
    const database = repoDatabase.database as {
      select: () => unknown;
      insert: () => unknown;
    };
    const fail = () => {
      throw missing;
    };
    vi.spyOn(database, "select").mockImplementation(fail);
    vi.spyOn(database, "insert").mockImplementation(fail);
  });

  it("reports keys as unavailable instead of failing", async () => {
    await expect(listApiKeys(personal, NOW)).rejects.toBeInstanceOf(
      ApiKeysUnavailableError,
    );
    await expect(createApiKey(personal, input, NOW)).rejects.toBeInstanceOf(
      ApiKeysUnavailableError,
    );
    await expect(revokeApiKey(personal, "key_1", NOW)).rejects.toBeInstanceOf(
      ApiKeysUnavailableError,
    );
    expect(await authenticateApiKey(`qrdx_${"a".repeat(40)}`, NOW)).toBeNull();
  });
});

describe("isMissingTableError", () => {
  it("finds Postgres's 42P01 however deeply it is wrapped, and nothing else", () => {
    const pg = { code: "42P01" };
    expect(isMissingTableError(pg)).toBe(true);
    expect(isMissingTableError({ cause: pg })).toBe(true);
    expect(isMissingTableError({ cause: { cause: pg } })).toBe(true);
    expect(isMissingTableError({ code: "42703" })).toBe(false);
    expect(isMissingTableError(new Error("timeout"))).toBe(false);
    expect(isMissingTableError(null)).toBe(false);
  });
});
