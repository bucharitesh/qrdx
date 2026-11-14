// Proving an unproven account's address (packages/auth/unproven-access.ts):
// when an email-code sign-in is about to mark an account made from an
// unverified Google or GitHub address as verified, everything an earlier
// holder could use to get back in, or to keep receiving the account's data
// (webhooks, Slack and Discord alerts, data-out syncs), is removed first. Against in-memory tables
// (tests/support/fake-db.ts) that evaluate the real queries; the hook is
// driven the way Better Auth calls it, and also through a real Better Auth
// email-code sign-in (memory adapter) to check the context it gets.
import { realpathSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);

const {
  beforeAddressProven,
  DATA_OUT_PROVIDERS,
  removeUnprovenAccess,
  unprovenAccessCleanup,
} = await import("@repo/auth/unproven-access");

const USER = "user_holder";
const EMAIL = "ada@qrdx.test";
const OTHER = "user_other";
const SIGN_IN = { path: "/sign-in/email-otp", body: { email: EMAIL } };
const EARLIER = new Date("2026-01-02T03:04:05Z");
const later = new Date(Date.now() + 60 * 60 * 1000);

function seed({ verified = false }: { verified?: boolean } = {}) {
  fakeDb.seed("user", [
    {
      id: USER,
      email: EMAIL,
      emailVerified: verified,
      twoFactorEnabled: true,
      updatedAt: EARLIER,
    },
    {
      id: OTHER,
      email: "grace@qrdx.test",
      emailVerified: true,
      twoFactorEnabled: true,
      updatedAt: EARLIER,
    },
  ]);
  for (const userId of [USER, OTHER]) {
    fakeDb.seed("twoFactor", [
      { id: `tf_${userId}`, userId, secret: "s", backupCodes: "b" },
    ]);
    fakeDb.seed("passkey", [
      { id: `pk1_${userId}`, userId, credentialID: `c1_${userId}` },
      { id: `pk2_${userId}`, userId, credentialID: `c2_${userId}` },
    ]);
    fakeDb.seed("knownDevice", [
      { id: `kd_${userId}`, userId, deviceHash: `h_${userId}` },
    ]);
    fakeDb.seed("session", [
      { id: `s_${userId}`, userId, token: `t_${userId}` },
    ]);
    fakeDb.seed("verification", [
      {
        id: `trust_${userId}`,
        identifier: `trust-device-${userId}`,
        value: userId,
        expiresAt: later,
      },
      {
        id: `confirmed_${userId}`,
        identifier: `qrdx-confirmed-s_${userId}`,
        value: userId,
        expiresAt: later,
      },
    ]);
    fakeDb.seed("apiKey", [
      { id: `key_${userId}`, userId, revokedAt: null, updatedAt: EARLIER },
      {
        id: `old_key_${userId}`,
        userId,
        revokedAt: EARLIER,
        updatedAt: EARLIER,
      },
    ]);
    fakeDb.seed("oauthToken", [
      { id: `tok_${userId}`, userId, revokedAt: null, updatedAt: EARLIER },
      {
        id: `old_tok_${userId}`,
        userId,
        revokedAt: EARLIER,
        updatedAt: EARLIER,
      },
    ]);
    fakeDb.seed("oauthAuthorizationCode", [
      { id: `code_${userId}`, userId, usedAt: null },
      { id: `used_code_${userId}`, userId, usedAt: EARLIER },
    ]);
    fakeDb.seed("webhookEndpoint", [
      { id: `hook_${userId}`, userId, organizationId: null, url: "https://a" },
      {
        id: `team_hook_${userId}`,
        userId,
        organizationId: "org_team",
        url: "https://b",
      },
    ]);
    fakeDb.seed("notificationSetting", [
      { id: `slack_${userId}`, userId, channel: "slack", target: "https://s" },
      {
        id: `discord_${userId}`,
        userId,
        channel: "discord",
        target: "https://d",
      },
      { id: `email_${userId}`, userId, channel: "email", target: "a@b.test" },
    ]);
    fakeDb.seed("integration", [
      ...DATA_OUT_PROVIDERS.map((provider) => ({
        id: `${provider}_${userId}`,
        userId,
        provider,
      })),
      // A content source brings data in: it stays.
      { id: `stripe_${userId}`, userId, provider: "stripe" },
    ]);
  }
  // Workspace content stays: a code in the team workspace.
  fakeDb.seed("qrCode", [
    { id: "code_in_team", userId: USER, organizationId: "org_team" },
  ]);
  // Rows that only look alike stay: someone else's trust record holding
  // another value, and the sign-in code itself.
  fakeDb.seed("verification", [
    {
      id: "code_row",
      identifier: "sign-in-otp-hash",
      value: "123456:0",
      expiresAt: later,
    },
  ]);
}

const ofUser = (table: string, userId: string) =>
  fakeDb.rows(table).filter((row) => row.userId === userId);

const errors: string[] = [];
const warnings: string[] = [];

beforeEach(() => {
  fakeDb.resetAll();
  errors.length = 0;
  warnings.length = 0;
  vi.spyOn(console, "error").mockImplementation((line: string) => {
    errors.push(String(line));
  });
  vi.spyOn(console, "warn").mockImplementation((line: string) => {
    warnings.push(String(line));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("proving the address of an account made unproven", () => {
  it("turns two-step verification off and deletes its secret, backup codes and trusted devices", async () => {
    seed();
    await beforeAddressProven({ emailVerified: true }, SIGN_IN);
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(false);
    expect(ofUser("twoFactor", USER)).toEqual([]);
    expect(fakeDb.find("verification", { id: `trust_${USER}` })).toBe(
      undefined,
    );
  });

  it("deletes every passkey", async () => {
    seed();
    await beforeAddressProven({ emailVerified: true }, SIGN_IN);
    expect(ofUser("passkey", USER)).toEqual([]);
  });

  it("revokes API keys and keeps their rows; an earlier revocation keeps its date", async () => {
    seed();
    await beforeAddressProven({ emailVerified: true }, SIGN_IN);
    const key = fakeDb.find("apiKey", { id: `key_${USER}` });
    expect(key?.revokedAt).toBeInstanceOf(Date);
    expect((key?.revokedAt as Date | undefined)?.getTime()).toBeGreaterThan(
      EARLIER.getTime(),
    );
    expect(fakeDb.find("apiKey", { id: `old_key_${USER}` })?.revokedAt).toEqual(
      EARLIER,
    );
  });

  it("revokes OAuth app tokens and spends unused authorization codes", async () => {
    seed();
    await beforeAddressProven({ emailVerified: true }, SIGN_IN);
    expect(
      fakeDb.find("oauthToken", { id: `tok_${USER}` })?.revokedAt,
    ).toBeInstanceOf(Date);
    expect(
      fakeDb.find("oauthToken", { id: `old_tok_${USER}` })?.revokedAt,
    ).toEqual(EARLIER);
    expect(
      fakeDb.find("oauthAuthorizationCode", { id: `code_${USER}` })?.usedAt,
    ).toBeInstanceOf(Date);
    expect(
      fakeDb.find("oauthAuthorizationCode", { id: `used_code_${USER}` })
        ?.usedAt,
    ).toEqual(EARLIER);
  });

  it("removes its webhooks, Slack and Discord alerts and data-out syncs; email alerts and workspace content stay", async () => {
    seed();
    await beforeAddressProven({ emailVerified: true }, SIGN_IN);
    expect(ofUser("webhookEndpoint", USER)).toEqual([]);
    expect(ofUser("notificationSetting", USER).map((row) => row.id)).toEqual([
      `email_${USER}`,
    ]);
    expect(ofUser("integration", USER).map((row) => row.id)).toEqual([
      `stripe_${USER}`,
    ]);
    expect(fakeDb.find("qrCode", { id: "code_in_team" })).toBeDefined();
  });

  it("covers every data-out sync there is, and Slack", async () => {
    const { SINK_PROVIDERS } = await import("@repo/integrations");
    expect([...DATA_OUT_PROVIDERS].sort()).toEqual(
      [...SINK_PROVIDERS, "slack"].sort(),
    );
  });

  it("forgets known browsers, confirmations and any session left", async () => {
    seed();
    await beforeAddressProven({ emailVerified: true }, SIGN_IN);
    expect(ofUser("knownDevice", USER)).toEqual([]);
    expect(fakeDb.find("verification", { id: `confirmed_${USER}` })).toBe(
      undefined,
    );
    expect(ofUser("session", USER)).toEqual([]);
  });

  it("leaves everyone else, and unrelated rows, alone", async () => {
    seed();
    await beforeAddressProven({ emailVerified: true }, SIGN_IN);
    expect(fakeDb.find("user", { id: OTHER })?.twoFactorEnabled).toBe(true);
    for (const table of [
      "twoFactor",
      "passkey",
      "knownDevice",
      "session",
      "apiKey",
      "oauthToken",
      "oauthAuthorizationCode",
      "webhookEndpoint",
      "notificationSetting",
      "integration",
    ]) {
      expect(ofUser(table, OTHER).length, table).toBeGreaterThan(0);
    }
    expect(ofUser("passkey", OTHER)).toHaveLength(2);
    expect(fakeDb.find("apiKey", { id: `key_${OTHER}` })?.revokedAt).toBe(null);
    expect(fakeDb.find("oauthToken", { id: `tok_${OTHER}` })?.revokedAt).toBe(
      null,
    );
    for (const id of [`trust_${OTHER}`, `confirmed_${OTHER}`, "code_row"]) {
      expect(fakeDb.find("verification", { id }), id).toBeDefined();
    }
  });

  it("logs what it removed, as counts only", async () => {
    seed();
    await beforeAddressProven({ emailVerified: true }, SIGN_IN);
    expect(warnings).toHaveLength(1);
    expect(JSON.parse(warnings[0])).toEqual({
      event: "auth.unproven_access_removed",
      outcome: "removed",
      twoFactor: 1,
      trustedDevices: 1,
      passkeys: 2,
      apiKeys: 1,
      oauthTokens: 1,
      oauthCodes: 1,
      webhooks: 2,
      chatAlerts: 2,
      dataOut: DATA_OUT_PROVIDERS.length,
      knownDevices: 1,
      confirmations: 1,
      sessions: 1,
    });
    expect(warnings[0]).not.toContain(EMAIL);
    expect(warnings[0]).not.toContain(USER);
  });

  it("matches the address the way the sign-in looks it up (lower-cased)", async () => {
    seed();
    await beforeAddressProven(
      { emailVerified: true },
      { ...SIGN_IN, body: { email: "Ada@QRdx.test" } },
    );
    expect(ofUser("passkey", USER)).toEqual([]);
  });
});

describe("however much there is", () => {
  it("is one statement per table in one batch, not one per row", async () => {
    seed();
    fakeDb.seed(
      "apiKey",
      Array.from({ length: 500 }, (_, i) => ({
        id: `many_${i}`,
        userId: USER,
        revokedAt: null,
        updatedAt: EARLIER,
      })),
    );
    fakeDb.seed(
      "verification",
      Array.from({ length: 300 }, (_, i) => ({
        id: `many_trust_${i}`,
        identifier: `trust-device-many-${i}`,
        value: USER,
        expiresAt: later,
      })),
    );
    const database = (await import("@repo/database")).database as unknown as {
      batch: (statements: unknown[]) => Promise<unknown>;
    };
    const batch = vi.spyOn(database, "batch");
    const removed = await removeUnprovenAccess(USER);
    expect(batch).toHaveBeenCalledOnce();
    expect(batch.mock.calls[0]?.[0]).toHaveLength(13);
    expect(removed.apiKeys).toBe(501);
    expect(removed.trustedDevices).toBe(301);
    expect(
      fakeDb
        .rows("apiKey")
        .filter((row) => row.userId === USER && row.revokedAt === null),
    ).toEqual([]);
  });
});

describe("when nothing is removed", () => {
  it("an account whose address was already proven", async () => {
    seed({ verified: true });
    await beforeAddressProven({ emailVerified: true }, SIGN_IN);
    expect(ofUser("passkey", USER)).toHaveLength(2);
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("a provider marking the address verified on its own callback", async () => {
    seed();
    await beforeAddressProven(
      { emailVerified: true },
      { path: "/callback/:id", body: { email: EMAIL } },
    );
    expect(ofUser("passkey", USER)).toHaveLength(2);
  });

  it("any other update on the sign-in, and no context at all", async () => {
    seed();
    await beforeAddressProven({ name: "Ada" } as never, SIGN_IN);
    await beforeAddressProven({ emailVerified: false }, SIGN_IN);
    await beforeAddressProven({ emailVerified: true }, null);
    await beforeAddressProven(
      { emailVerified: true },
      { path: SIGN_IN.path, body: {} },
    );
    expect(ofUser("passkey", USER)).toHaveLength(2);
    expect(ofUser("session", USER)).toHaveLength(1);
  });

  it("an address with no account", async () => {
    seed();
    await beforeAddressProven(
      { emailVerified: true },
      { ...SIGN_IN, body: { email: "nobody@qrdx.test" } },
    );
    expect(ofUser("passkey", USER)).toHaveLength(2);
  });
});

describe("when it can't finish", () => {
  it("fails the update (so the address stays unproven) and logs without the address", async () => {
    seed();
    const spy = vi
      .spyOn(
        (await import("@repo/database")).database as unknown as {
          batch: (...args: unknown[]) => Promise<unknown>;
        },
        "batch",
      )
      .mockRejectedValue(new Error("connection reset"));
    await expect(
      beforeAddressProven({ emailVerified: true }, SIGN_IN),
    ).rejects.toThrow("connection reset");
    spy.mockRestore();
    expect(ofUser("passkey", USER)).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(JSON.parse(errors[0])).toMatchObject({
      event: "auth.unproven_access_removed",
      outcome: "failed",
      message: "connection reset",
    });
    expect(errors[0]).not.toContain(EMAIL);
  });
});

describe("removeUnprovenAccess on an account with nothing to remove", () => {
  it("still switches two-step verification off and reports zeros", async () => {
    fakeDb.seed("user", [
      { id: USER, email: EMAIL, emailVerified: false, twoFactorEnabled: null },
    ]);
    expect(await removeUnprovenAccess(USER)).toEqual({
      twoFactor: 0,
      trustedDevices: 0,
      passkeys: 0,
      apiKeys: 0,
      oauthTokens: 0,
      oauthCodes: 0,
      webhooks: 0,
      chatAlerts: 0,
      dataOut: 0,
      knownDevices: 0,
      confirmations: 0,
      sessions: 0,
    });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(false);
  });
});

// ─── Inside Better Auth ─────────────────────────────────────────────────────

// apps/app doesn't depend on better-auth itself; load the copy @repo/auth
// uses.
const betterAuthDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/better-auth",
  ),
);

describe("registered on Better Auth", () => {
  it("runs when an email-code sign-in proves an unproven account's address", async () => {
    const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
    const { emailOTP } = await import(
      `${betterAuthDir}/dist/plugins/index.mjs`
    );
    const { memoryAdapter } = await import(
      `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
    );
    const codes = new Map<string, string>();
    const now = new Date();
    // Better Auth's own rows (memory) and the cleanup's tables (fake-db)
    // describe the same account.
    const memory: Record<string, Record<string, unknown>[]> = {
      user: [
        {
          id: USER,
          email: EMAIL,
          name: "Ada",
          emailVerified: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
      session: [],
      account: [
        {
          id: "acc_1",
          userId: USER,
          providerId: "github",
          accountId: "gh_1",
          createdAt: now,
          updatedAt: now,
        },
      ],
      verification: [],
    };
    seed();
    const auth = betterAuth({
      baseURL: "http://localhost:3000",
      secret: "test-secret-at-least-32-characters-long",
      database: memoryAdapter(memory),
      rateLimit: { enabled: false },
      plugins: [
        emailOTP({
          sendVerificationOTP: async ({
            email,
            otp,
          }: {
            email: string;
            otp: string;
          }) => {
            codes.set(email, otp);
          },
        }),
        unprovenAccessCleanup(),
      ],
    });
    const post = (route: string, body: unknown) =>
      auth.handler(
        new Request(`http://localhost:3000/api/auth${route}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://localhost:3000",
          },
          body: JSON.stringify(body),
        }),
      );
    await post("/email-otp/send-verification-otp", {
      email: EMAIL,
      type: "sign-in",
    });
    const reply = await post("/sign-in/email-otp", {
      email: EMAIL,
      otp: codes.get(EMAIL),
    });
    expect(reply.status).toBe(200);
    // Better Auth's part: the GitHub link is gone and the address proven.
    expect(memory.account).toEqual([]);
    expect(memory.user[0].emailVerified).toBe(true);
    // Ours, from the same request.
    expect(ofUser("passkey", USER)).toEqual([]);
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(false);
    expect(ofUser("passkey", OTHER)).toHaveLength(2);

    // Signing in again changes nothing more.
    fakeDb.seed("passkey", [{ id: "pk_new", userId: USER }]);
    await post("/email-otp/send-verification-otp", {
      email: EMAIL,
      type: "sign-in",
    });
    await post("/sign-in/email-otp", { email: EMAIL, otp: codes.get(EMAIL) });
    expect(ofUser("passkey", USER)).toHaveLength(1);
  });
});
