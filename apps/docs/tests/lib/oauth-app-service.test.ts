// Client secrets and ownership in the OAuth app service
// (lib/oauth-apps/service.ts, secrets.ts) against an in-memory oauth_app
// table. The drizzle operators are swapped for predicates the fake table
// evaluates, so the service's real where-clauses decide which rows a
// workspace can change. Nothing connects to a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;
type Column = { table: string; name: string };

const store = vi.hoisted(() => ({
  tables: new Map<string, Row[]>(),
  plan: "free" as "free" | "pro" | "business",
}));

vi.mock("drizzle-orm", () => {
  const value = (row: Row, column: Column) => row[column.name];
  return {
    and:
      (...preds: (Predicate | undefined)[]) =>
      (row: Row) =>
        preds.every((p) => !p || p(row)),
    or:
      (...preds: (Predicate | undefined)[]) =>
      (row: Row) =>
        preds.some((p) => p?.(row)),
    eq: (column: Column, expected: unknown) => (row: Row) =>
      value(row, column) === expected,
    isNull: (column: Column) => (row: Row) => value(row, column) == null,
    gt: (column: Column, than: unknown) => (row: Row) => {
      const v = value(row, column);
      return v != null && (v as number) > (than as number);
    },
    inArray: (column: Column, list: unknown[]) => (row: Row) =>
      list.includes(value(row, column)),
    count: () => ({ aggregate: "count" }),
    countDistinct: (column: Column) => ({ aggregate: "distinct", column }),
    asc: (column: Column) => ({ asc: column }),
  };
});

vi.mock("@repo/database", () => {
  const table = (name: string, columns: string[]) =>
    Object.fromEntries([
      ["__table", name],
      ...columns.map((column) => [column, { table: name, name: column }]),
    ]);
  const rows = (t: { __table: string }) => {
    if (!store.tables.has(t.__table)) store.tables.set(t.__table, []);
    return store.tables.get(t.__table) as Row[];
  };
  type Shape = Record<string, Column | { aggregate: string; column?: Column }>;
  const project = (row: Row, shape?: Shape) =>
    shape
      ? Object.fromEntries(
          Object.entries(shape).map(([key, col]) => [
            key,
            row[(col as Column).name],
          ]),
        )
      : { ...row };

  const select = (shape?: Shape) => ({
    from: (t: { __table: string }) => {
      let where: Predicate = () => true;
      const run = (): Row[] => {
        const matched = rows(t).filter(where);
        const aggregate =
          shape && Object.values(shape).find((v) => "aggregate" in v);
        if (
          aggregate &&
          (aggregate as { aggregate: string }).aggregate === "count"
        ) {
          const key = Object.keys(shape as Shape)[0] as string;
          return [{ [key]: matched.length }];
        }
        return matched.map((row) => project(row, shape));
      };
      const query = {
        where: (p: Predicate) => {
          where = p;
          return query;
        },
        orderBy: () => query,
        limit: async (n: number) => run().slice(0, n),
        groupBy: async () => [],
        // biome-ignore lint/suspicious/noThenProperty: awaitable query builder
        then: (resolve: (rows: Row[]) => unknown) => resolve(run()),
      };
      return query;
    },
  });

  const database = {
    select,
    insert: (t: { __table: string }) => ({
      values: (value: Row) => ({
        returning: async () => {
          rows(t).push({ ...value });
          return [{ ...value }];
        },
      }),
    }),
    update: (t: { __table: string }) => ({
      set: (patch: Row) => ({
        where: (p: Predicate) => ({
          returning: async (shape?: Shape) =>
            rows(t)
              .filter(p)
              .map((row) => {
                Object.assign(row, patch);
                return project(row, shape);
              }),
        }),
      }),
    }),
    delete: (t: { __table: string }) => ({
      where: (p: Predicate) => ({
        returning: async (shape?: Shape) => {
          const all = rows(t);
          const removed = all.filter(p);
          store.tables.set(
            t.__table,
            all.filter((row) => !removed.includes(row)),
          );
          return removed.map((row) => project(row, shape));
        },
      }),
    }),
  };

  return {
    database,
    oauthApp: table("oauth_app", [
      "id",
      "name",
      "description",
      "clientId",
      "clientSecretHash",
      "redirectUris",
      "scopes",
      "isActive",
      "ownerUserId",
      "organizationId",
      "logoUrl",
      "websiteUrl",
      "verified",
      "pkceRequired",
      "secretRotatedAt",
      "createdAt",
      "updatedAt",
    ]),
    oauthToken: table("oauth_token", [
      "appId",
      "userId",
      "revokedAt",
      "accessTokenExpiresAt",
      "refreshTokenExpiresAt",
    ]),
    organization: table("organization", ["id", "name"]),
  };
});

vi.mock("@/lib/plans", () => ({
  getPlanForScope: async () => store.plan,
  getPlanLimits: (plan: "free" | "pro" | "business") => ({
    oauthApps: { free: 1, pro: 5, business: 25 }[plan],
  }),
}));

vi.mock("@/lib/shared", () => ({ logError: vi.fn() }));

const { verifySecret } = await import("@/lib/oauth");
const secrets = await import("@/lib/oauth-apps/secrets");
const service = await import("@/lib/oauth-apps/service");
const { HttpError } = await import("@/lib/error-response");

const alice = { userId: "alice", organizationId: null, role: "owner" as const };
const bob = { userId: "bob", organizationId: null, role: "owner" as const };
const acmeOwner = {
  userId: "carol",
  organizationId: "acme",
  role: "owner" as const,
};
const acmeAdmin = {
  userId: "dave",
  organizationId: "acme",
  role: "admin" as const,
};

const input = {
  name: "Acme Sync",
  description: null,
  logoUrl: null,
  websiteUrl: "https://acme.com/",
  redirectUris: ["https://acme.com/cb"],
  scopes: ["profile:read" as const],
  pkceRequired: true,
};

const appRows = () => store.tables.get("oauth_app") ?? [];

async function rejectsWith(promise: Promise<unknown>, status: number) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HttpError);
  expect((error as InstanceType<typeof HttpError>).status).toBe(status);
}

beforeEach(() => {
  store.tables.clear();
  store.plan = "free";
});

describe("client secrets", () => {
  it("are prefixed, random and short enough for bcrypt (72 bytes)", () => {
    const a = secrets.generateClientSecret();
    const b = secrets.generateClientSecret();
    expect(a).toMatch(/^qrdx_secret_[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(Buffer.byteLength(a)).toBeLessThanOrEqual(72);
    expect(secrets.generateClientId()).toMatch(/^qrdx_app_[0-9a-f]{24}$/);
  });

  it("are stored only as a bcrypt hash that verifies", async () => {
    const { secret, hash } = await secrets.createClientSecret();
    expect(hash).not.toContain(secret);
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifySecret(secret, hash)).toBe(true);
    expect(await verifySecret(`${secret}x`, hash)).toBe(false);
  });
});

describe("createOAuthApp", () => {
  it("returns the secret once, stores its hash and never exposes it", async () => {
    const { app, clientSecret } = await service.createOAuthApp(alice, input);
    const [row] = appRows();

    expect(row?.clientSecretHash).not.toBe(clientSecret);
    expect(
      await verifySecret(clientSecret, row?.clientSecretHash as string),
    ).toBe(true);
    expect(JSON.stringify(app)).not.toContain(row?.clientSecretHash as string);
    expect(app).not.toHaveProperty("clientSecretHash");
    expect(row).toMatchObject({
      ownerUserId: "alice",
      organizationId: null,
      verified: false,
      pkceRequired: true,
      isActive: true,
    });
  });

  it("puts team apps in the team and only lets owners create them", async () => {
    await rejectsWith(service.createOAuthApp(acmeAdmin, input), 403);
    store.plan = "pro";
    await service.createOAuthApp(acmeOwner, input);
    expect(appRows()[0]).toMatchObject({
      ownerUserId: "carol",
      organizationId: "acme",
    });
  });

  it("enforces the plan's app limit per workspace", async () => {
    await service.createOAuthApp(alice, input);
    await rejectsWith(service.createOAuthApp(alice, input), 402);
    // Another person's workspace has its own allowance.
    await service.createOAuthApp(bob, input);
    store.plan = "pro";
    await service.createOAuthApp(alice, input);
    expect(appRows()).toHaveLength(3);
  });
});

describe("ownership", () => {
  it("hides other workspaces' apps as missing (404)", async () => {
    const { app } = await service.createOAuthApp(alice, input);
    await rejectsWith(service.getOAuthApp(bob, app.id), 404);
    await rejectsWith(service.getOAuthApp(acmeOwner, app.id), 404);
    await rejectsWith(service.updateOAuthApp(bob, app.id, input), 404);
    await rejectsWith(service.regenerateOAuthAppSecret(bob, app.id), 404);
    await rejectsWith(service.deleteOAuthApp(bob, app.id), 404);
    expect(appRows()).toHaveLength(1);
  });

  it("lets team admins look but not change", async () => {
    store.plan = "pro";
    const { app } = await service.createOAuthApp(acmeOwner, input);
    expect((await service.getOAuthApp(acmeAdmin, app.id)).id).toBe(app.id);
    await rejectsWith(service.updateOAuthApp(acmeAdmin, app.id, input), 403);
    await rejectsWith(service.setOAuthAppActive(acmeAdmin, app.id, false), 403);
    await rejectsWith(service.regenerateOAuthAppSecret(acmeAdmin, app.id), 403);
    await rejectsWith(service.deleteOAuthApp(acmeAdmin, app.id), 403);
  });

  it("never touches first-party apps", async () => {
    store.tables.set("oauth_app", [
      {
        id: "zapier",
        name: "Zapier",
        clientSecretHash: "hash",
        ownerUserId: null,
        organizationId: null,
        redirectUris: [],
        scopes: [],
      },
    ]);
    await rejectsWith(service.getOAuthApp(alice, "zapier"), 404);
    await rejectsWith(service.deleteOAuthApp(alice, "zapier"), 404);
    expect(await service.listOAuthApps(alice)).toEqual([]);
  });
});

describe("regenerateOAuthAppSecret", () => {
  it("replaces the hash: the new secret works, the old one doesn't", async () => {
    const { app, clientSecret: first } = await service.createOAuthApp(
      alice,
      input,
    );
    const { clientSecret: second, secretRotatedAt } =
      await service.regenerateOAuthAppSecret(alice, app.id);
    const hash = appRows()[0]?.clientSecretHash as string;

    expect(second).not.toBe(first);
    expect(await verifySecret(second, hash)).toBe(true);
    expect(await verifySecret(first, hash)).toBe(false);
    expect(appRows()[0]?.secretRotatedAt).toEqual(secretRotatedAt);
  });
});

describe("updateOAuthApp", () => {
  it("drops the verified badge when the public details change", async () => {
    const { app } = await service.createOAuthApp(alice, input);
    Object.assign(appRows()[0] as Row, { verified: true });

    await service.updateOAuthApp(alice, app.id, {
      ...input,
      redirectUris: ["https://acme.com/cb", "https://acme.com/cb2"],
    });
    expect(appRows()[0]?.verified).toBe(true);

    await service.updateOAuthApp(alice, app.id, { ...input, name: "Acme 2" });
    expect(appRows()[0]?.verified).toBe(false);
  });
});

describe("deleteOAuthApp", () => {
  it("deletes the owner's app", async () => {
    const { app } = await service.createOAuthApp(alice, input);
    await service.deleteOAuthApp(alice, app.id);
    expect(appRows()).toEqual([]);
  });
});
