// Support's turn-off of two-step verification waits 7 days
// (lib/account/two-factor-reset-server.ts, packages/auth/two-factor-reset.ts):
// support schedules it (admin user page, strong confirmation, never an
// admin's account or their own), the address is told the day, the person can
// cancel it in Settings ("Confirm it's you") or by confirming with their
// second step, support can cancel it, and the daily cron completes the due
// ones: off, every session signed out, "turned off by support" notice,
// audited. Against in-memory tables (tests/support/fake-db.ts) with the
// notices and the audit log recorded; nothing connects to a database.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIRMATION_REQUIRED } from "@/lib/account/confirmation";
import { fakeDb } from "../support/fake-db";

const USER = "user_1";
const EMAIL = "ada@qrdx.test";
const ADMIN = { id: "admin_1", email: "admin@qrdx.test", name: "Admin" };
const DAY = 86_400_000;

const state = vi.hoisted(() => ({
  /** Whose browser the requests come from */
  sessionUser: "admin_1",
  sessionId: "admin_session",
  admin: null as null | { id: string; email: string; name: string },
  notices: [] as { kind: string; email: string; extra?: unknown }[],
  audit: [] as {
    action: string;
    actor: { id: string; email: string };
    metadata?: Record<string, unknown>;
  }[],
  failReset: false,
  info: [] as string[],
  errors: [] as string[],
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ host: "localhost:3000", "user-agent": "test" }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({
  after: (run: () => unknown) => {
    void run();
  },
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/auth/passkey", () => ({ cookiesToSet: () => [] }));
vi.mock("@repo/auth/passkey-rp", () => ({
  passkeyRelyingParty: () => ({ rpID: "localhost", origin: "x" }),
  isPasskeyOrigin: () => true,
}));
vi.mock("@repo/auth/server", async () => {
  const { fakeDb: db } = await import("../support/fake-db");
  return {
    auth: {
      api: {
        getSession: async () => {
          const user = db.find("user", { id: state.sessionUser });
          return user
            ? {
                user: { id: user.id, email: user.email },
                session: { id: state.sessionId, createdAt: new Date() },
              }
            : null;
        },
      },
    },
  };
});
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: () => true,
}));
vi.mock("@/lib/account/reauth", () => ({ signInCodesAvailable: () => true }));
vi.mock("@/lib/account/linked-sign-ins-server", () => ({
  linkedSignInsFor: async () => [],
  configuredSocialProviders: () => [],
}));
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => false,
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async () => ({ sent: true }),
}));
vi.mock("@/lib/shared", () => ({
  logError: (error: Error) => state.errors.push(error.message),
}));
vi.mock("@/lib/account/two-factor-notice-server", () => ({
  sendTwoFactorNotice: async (
    kind: string,
    email: string,
    options?: { extra?: unknown },
  ) => {
    state.notices.push({ kind, email, extra: options?.extra });
  },
  sendBackupCodeUsedNotice: async () => {},
}));
vi.mock("@/lib/account/two-factor-server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/account/two-factor-server")>();
  return {
    ...actual,
    resetTwoFactor: (...args: Parameters<typeof actual.resetTwoFactor>) => {
      if (state.failReset) return Promise.reject(new Error("database away"));
      return actual.resetTwoFactor(...args);
    },
  };
});
vi.mock("@/app/admin/_lib/guard", () => ({
  assertAdmin: async () => {
    if (!state.admin) throw new Error("Not found");
    return state.admin;
  },
  requireAdmin: async () => state.admin,
  getAdminUser: async () => state.admin,
}));
vi.mock("@/app/admin/_lib/audit", () => ({
  writeAuditLog: async (entry: (typeof state.audit)[number]) => {
    state.audit.push(entry);
  },
}));
vi.mock("@/lib/request-guards", () => ({ enforceRateLimits: async () => {} }));
vi.mock("@/lib/connected-accounts/server", () => ({
  revokeStoredToken: async () => false,
}));
vi.mock("@/lib/data-connections/server", () => ({
  cleanupDataConnection: async () => false,
}));
vi.mock("@/lib/events/deliveries", () => ({
  claimDueDeliveries: async () => [],
  processClaimed: async () => ({ succeeded: 0, retrying: 0, failed: 0 }),
}));
vi.mock("@/lib/migrate/server/repo", () => ({
  JOB_STORE_PROVIDER: "qrdx-import",
}));
vi.mock("@/lib/account/email-change-server", () => ({
  afterEmailChanged: async () => {},
}));

const rules = await import("@repo/auth/two-factor-reset");
const reset = await import("@/lib/account/two-factor-reset-server");
const confirmation = await import("@/lib/account/confirmation-server");
const support = await import("@/app/admin/users/support-actions");
const settings = await import(
  "@/app/settings/account/_lib/two-factor-reset-actions"
);

/** The account (2FA on with an app), its sessions, a trusted device, an admin. */
function seed({ on = true, adminTwoFactor = true } = {}) {
  fakeDb.seed("user", [
    { id: USER, email: EMAIL, twoFactorEnabled: on, role: "user" },
    {
      id: ADMIN.id,
      email: ADMIN.email,
      twoFactorEnabled: adminTwoFactor,
      role: "admin",
    },
    { id: "admin_2", email: "other-admin@qrdx.test", role: "admin" },
  ]);
  if (on) {
    fakeDb.seed("twoFactor", [
      { id: "tf_1", userId: USER, secret: "s", backupCodes: "c" },
    ]);
  }
  const session = (id: string, userId: string) => ({
    id,
    token: `${id}_token`,
    userId,
    createdAt: new Date(Date.now() - DAY),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 6 * DAY),
  });
  fakeDb.seed("session", [
    session("s_1", USER),
    session("s_2", USER),
    session("admin_session", ADMIN.id),
  ]);
  fakeDb.seed("verification", [
    {
      id: "v_trust",
      identifier: "trust-device-abc",
      value: USER,
      expiresAt: new Date(Date.now() + 20 * DAY),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
}

/** The admin's browser confirmed it's them with a second factor. */
const adminConfirms = () =>
  confirmation.recordConfirmation(
    { userId: ADMIN.id, sessionId: "admin_session" },
    { strong: "code" },
  );

const pendingRow = () =>
  fakeDb.find("verification", {
    identifier: rules.twoFactorResetIdentifier(USER),
  });
const sessionsOf = (userId: string) =>
  fakeDb.rows("session").filter((row) => row.userId === userId);
const startInput = { userId: USER, reason: "Ticket 1234: lost phone" };

beforeEach(() => {
  fakeDb.reset();
  state.sessionUser = ADMIN.id;
  state.sessionId = "admin_session";
  state.admin = ADMIN;
  state.notices = [];
  state.audit = [];
  state.failReset = false;
  state.errors = [];
  state.info = [];
  vi.spyOn(console, "info").mockImplementation((line: unknown) => {
    state.info.push(String(line));
  });
  vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    state.errors.push(String(line));
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── The rules ──────────────────────────────────────────────────────────────

describe("the wait", () => {
  it("is due at the start of the first UTC day at least 7 days later", () => {
    const due = (iso: string) =>
      rules.twoFactorResetDueAt(new Date(iso)).toISOString();
    expect(rules.TWO_FACTOR_RESET_WAIT_DAYS).toBe(7);
    expect(due("2026-11-08T15:20:00.000Z")).toBe("2026-11-16T00:00:00.000Z");
    expect(due("2026-11-08T00:00:00.000Z")).toBe("2026-11-15T00:00:00.000Z");
    expect(due("2026-11-08T23:59:59.000Z")).toBe("2026-11-16T00:00:00.000Z");
    // Never less than the full 7 days.
    for (const iso of [
      "2026-11-08T00:00:01.000Z",
      "2026-12-31T12:00:00.000Z",
      "2027-02-27T22:00:00.000Z",
    ]) {
      const start = new Date(iso);
      const wait = rules.twoFactorResetDueAt(start).getTime() - start.getTime();
      expect(wait).toBeGreaterThanOrEqual(7 * DAY);
      expect(wait).toBeLessThan(8 * DAY);
    }
  });

  it("keeps the row a month past the due day, so pruning can't drop it first", () => {
    const due = new Date("2026-11-16T00:00:00.000Z");
    expect(rules.twoFactorResetKeepUntil(due).toISOString()).toBe(
      "2026-12-16T00:00:00.000Z",
    );
  });

  it("reads only its own records", () => {
    const record = {
      dueAt: "2026-11-16T00:00:00.000Z",
      requestedAt: "2026-11-08T15:20:00.000Z",
      requestedBy: { id: "admin_1", email: "admin@qrdx.test" },
    };
    expect(rules.parseTwoFactorReset(JSON.stringify(record))).toEqual(record);
    for (const value of [
      "user_1",
      "{}",
      JSON.stringify({ ...record, dueAt: "soon" }),
      JSON.stringify({ ...record, requestedBy: { id: 1 } }),
    ]) {
      expect(rules.parseTwoFactorReset(value), value).toBeNull();
    }
  });

  it("formats the day in UTC", () => {
    expect(
      reset.formatTwoFactorResetDate(new Date("2026-11-16T00:00:00.000Z")),
    ).toBe("November 16, 2026");
  });
});

describe("the notices", () => {
  it("say the day, that nothing changes until then, and how to stop it", async () => {
    const template = await import("@/lib/email/templates/two-factor-notice");
    const lines = template.twoFactorNoticeLines("support-reset-scheduled", {
      dueDate: "November 16, 2026",
    });
    expect(lines.join("\n")).toContain("on November 16, 2026 (UTC)");
    expect(lines.join("\n")).toContain("Until then, nothing changes.");
    expect(lines.join("\n")).toMatch(
      /sign in to QRdx with your authenticator app or a backup code: that cancels it/,
    );
    // A passkey doesn't cancel it (it may be on the lost device).
    expect(lines.join("\n")).not.toMatch(/passkey/);
    expect(lines.join("\n")).toContain("reply to this email");
    expect(template.twoFactorNoticeSubject("support-reset-scheduled")).toBe(
      "QRdx support will turn off two-step verification",
    );
    for (const by of ["person", "sign-in", "support"] as const) {
      const cancelled = template.twoFactorNoticeLines(
        "support-reset-cancelled",
        { cancelledBy: by },
      );
      expect(cancelled[1], by).toMatch(/stays on/);
    }
    expect(
      template.twoFactorNoticeLines("support-reset-cancelled", {
        cancelledBy: "sign-in",
      })[0],
    ).toMatch(/You signed in with your authenticator app or a backup code/);
    // Support's notices don't say "if this was you, there's nothing to do".
    expect(template.SUPPORT_KINDS.has("support-reset-scheduled")).toBe(true);
    expect(template.SUPPORT_KINDS.has("support-reset-cancelled")).toBe(true);
  });
});

// ─── Support starts it ──────────────────────────────────────────────────────

describe("support starting a reset", () => {
  it("needs the admin's own strong confirmation first", async () => {
    seed();
    expect(await support.resetTwoFactorAction(startInput)).toEqual({
      ok: false,
      error: CONFIRMATION_REQUIRED,
    });
    expect(pendingRow()).toBeUndefined();
    expect(state.notices).toEqual([]);
  });

  it("needs two-step verification on the admin's own account", async () => {
    seed({ adminTwoFactor: false });
    await adminConfirms();
    expect(await support.resetTwoFactorAction(startInput)).toEqual({
      ok: false,
      error: "Turn on two-step verification for your own account first.",
    });
    expect(pendingRow()).toBeUndefined();
  });

  it("never for the admin's own account or another admin's", async () => {
    seed();
    await adminConfirms();
    fakeDb.seed("twoFactor", [
      { id: "tf_admin", userId: "admin_2", secret: "s", backupCodes: "c" },
    ]);
    Object.assign(fakeDb.find("user", { id: "admin_2" }) ?? {}, {
      twoFactorEnabled: true,
    });
    for (const userId of [ADMIN.id, "admin_2"]) {
      const result = await support.resetTwoFactorAction({
        userId,
        reason: "Ticket 1234",
      });
      expect(result.ok, userId).toBe(false);
    }
    expect(
      fakeDb
        .rows("verification")
        .filter((row) => String(row.identifier).startsWith("qrdx-2fa-reset-")),
    ).toEqual([]);
  });

  it("schedules it for 7 days on, changes nothing yet, and tells the address", async () => {
    seed();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-08T15:20:00.000Z"));
    await adminConfirms();

    const result = await support.resetTwoFactorAction(startInput);
    expect(result).toEqual({
      ok: true,
      data: { dueAt: "2026-11-16T00:00:00.000Z" },
    });

    // Nothing changes yet.
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(true);
    expect(fakeDb.rows("twoFactor")).toHaveLength(1);
    expect(sessionsOf(USER)).toHaveLength(2);
    expect(fakeDb.find("verification", { id: "v_trust" })).toBeDefined();

    // The record, kept a month past due.
    const row = pendingRow();
    expect(row?.expiresAt).toEqual(new Date("2026-12-16T00:00:00.000Z"));
    expect(rules.parseTwoFactorReset(String(row?.value))).toEqual({
      dueAt: "2026-11-16T00:00:00.000Z",
      requestedAt: "2026-11-08T15:20:00.000Z",
      requestedBy: { id: ADMIN.id, email: ADMIN.email },
    });
    expect(await reset.loadPendingTwoFactorReset(USER)).toEqual({
      dueAt: new Date("2026-11-16T00:00:00.000Z"),
      requestedAt: new Date("2026-11-08T15:20:00.000Z"),
      requestedBy: { id: ADMIN.id, email: ADMIN.email },
    });

    expect(state.notices).toEqual([
      {
        kind: "support-reset-scheduled",
        email: EMAIL,
        extra: { dueDate: "November 16, 2026" },
      },
    ]);
    expect(state.audit).toMatchObject([
      {
        action: "user.reset_two_factor",
        actor: { id: ADMIN.id },
        metadata: {
          dueAt: "2026-11-16T00:00:00.000Z",
          reason: "Ticket 1234: lost phone",
          subjectUserId: USER,
        },
      },
    ]);
  });

  it("refuses a second one while one waits, and when it's already off", async () => {
    seed();
    await adminConfirms();
    expect((await support.resetTwoFactorAction(startInput)).ok).toBe(true);
    expect(await support.resetTwoFactorAction(startInput)).toEqual({
      ok: false,
      error: "A reset is already waiting for this account.",
    });

    fakeDb.reset();
    seed({ on: false });
    await adminConfirms();
    expect(await support.resetTwoFactorAction(startInput)).toEqual({
      ok: false,
      error: "Two-step verification is already off.",
    });
  });
});

// ─── Cancelling ─────────────────────────────────────────────────────────────

describe("cancelling it", () => {
  async function scheduled() {
    seed();
    await reset.scheduleTwoFactorReset({ userId: USER, admin: ADMIN });
    state.notices = [];
    state.audit = [];
  }

  it("support can, and the address is told", async () => {
    await scheduled();
    expect(
      await support.cancelTwoFactorResetAction({
        userId: USER,
        reason: "Owner replied: not them",
      }),
    ).toEqual({ ok: true });
    expect(pendingRow()).toBeUndefined();
    expect(state.notices).toEqual([
      {
        kind: "support-reset-cancelled",
        email: EMAIL,
        extra: { cancelledBy: "support" },
      },
    ]);
    // One entry, by the admin (runAdminAction's), not a second by the person.
    expect(state.audit).toMatchObject([
      {
        action: "user.reset_two_factor_cancel",
        actor: { id: ADMIN.id },
        metadata: { by: "support" },
      },
    ]);
    expect(
      await support.cancelTwoFactorResetAction({
        userId: USER,
        reason: "again",
      }),
    ).toEqual({ ok: false, error: "No reset is waiting for this account." });
  });

  it("the person can in Settings, once they confirm it's them", async () => {
    await scheduled();
    state.sessionUser = USER;
    state.sessionId = "s_1";

    expect(await settings.cancelSupportTwoFactorReset()).toEqual({
      ok: false,
      error: CONFIRMATION_REQUIRED,
    });
    expect(pendingRow()).toBeDefined();
    expect(state.notices).toEqual([]);

    // Confirming with an authenticator or backup code (the dialog) already
    // cancels it…
    await confirmation.recordConfirmation(
      { userId: USER, sessionId: "s_1" },
      { strong: "code" },
    );
    expect(pendingRow()).toBeUndefined();
    // …and the action, tried again, finds it done.
    expect(await settings.cancelSupportTwoFactorReset()).toEqual({ ok: true });
    expect(state.notices).toEqual([
      {
        kind: "support-reset-cancelled",
        email: EMAIL,
        extra: { cancelledBy: "person" },
      },
    ]);
    expect(state.audit).toMatchObject([
      {
        action: "user.reset_two_factor_cancel",
        actor: { id: USER, email: EMAIL },
        metadata: { by: "person", requestedBy: ADMIN.email },
      },
    ]);
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(true);
  });

  it("the person can when this session confirmed in the last 10 minutes", async () => {
    await scheduled();
    state.sessionUser = USER;
    state.sessionId = "s_2";
    // A confirmation recorded before the reset was scheduled (no cancel then).
    await confirmation.recordConfirmation({ userId: USER, sessionId: "s_2" });
    expect(await settings.cancelSupportTwoFactorReset()).toEqual({ ok: true });
    expect(pendingRow()).toBeUndefined();
    expect(state.notices.map((n) => n.kind)).toEqual([
      "support-reset-cancelled",
    ]);
  });

  it("isn't cancelled by confirming with a passkey alone; Cancel still works", async () => {
    await scheduled();
    state.sessionUser = USER;
    state.sessionId = "s_1";
    await confirmation.recordConfirmation(
      { userId: USER, sessionId: "s_1" },
      { strong: "passkey" },
    );
    // Still waiting: the passkey may be on the lost device.
    expect(pendingRow()).toBeDefined();
    expect(state.notices).toEqual([]);
    // That confirmation lets the person press Cancel in Settings.
    expect(await settings.cancelSupportTwoFactorReset()).toEqual({ ok: true });
    expect(pendingRow()).toBeUndefined();
    expect(state.notices.map((n) => n.kind)).toEqual([
      "support-reset-cancelled",
    ]);
  });

  it("isn't cancelled by an emailed-code confirmation (not the second step)", async () => {
    await scheduled();
    await confirmation.recordConfirmation({ userId: USER, sessionId: "s_1" });
    expect(pendingRow()).toBeDefined();
    expect(state.notices).toEqual([]);
  });

  it("a sign-in with the second step: the notifier emails and audits", async () => {
    await scheduled();
    const record = rules.parseTwoFactorReset(String(pendingRow()?.value));
    await reset.notifyTwoFactorResetCancelled({
      user: { id: USER, email: EMAIL },
      record,
      headers: new Headers({ "user-agent": "test" }),
    });
    expect(state.notices).toEqual([
      {
        kind: "support-reset-cancelled",
        email: EMAIL,
        extra: { cancelledBy: "sign-in" },
      },
    ]);
    expect(state.audit).toMatchObject([
      {
        action: "user.reset_two_factor_cancel",
        actor: { id: USER },
        metadata: { by: "sign-in", requestedBy: ADMIN.email },
      },
    ]);
  });
});

// ─── The daily cron completes it ────────────────────────────────────────────

describe("completing it", () => {
  const scheduleAt = async (iso: string, userId = USER) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    await reset.scheduleTwoFactorReset({ userId, admin: ADMIN });
    vi.useRealTimers();
    state.notices = [];
  };

  it("waits until the due day", async () => {
    seed();
    await scheduleAt("2026-11-08T15:20:00.000Z");
    expect(
      await reset.completeDueTwoFactorResets(
        new Date("2026-11-15T23:59:59.000Z"),
      ),
    ).toEqual({ completed: 0, dropped: 0, failed: 0 });
    expect(pendingRow()).toBeDefined();
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(true);
  });

  it("then turns it off, signs out every session of the account, tells the address and audits", async () => {
    seed();
    await scheduleAt("2026-11-08T15:20:00.000Z");
    expect(
      await reset.completeDueTwoFactorResets(
        new Date("2026-11-16T04:00:00.000Z"),
      ),
    ).toEqual({ completed: 1, dropped: 0, failed: 0 });

    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(false);
    expect(fakeDb.rows("twoFactor")).toHaveLength(0);
    expect(fakeDb.find("verification", { id: "v_trust" })).toBeUndefined();
    expect(sessionsOf(USER)).toEqual([]);
    // Nobody else's.
    expect(sessionsOf(ADMIN.id)).toHaveLength(1);
    expect(pendingRow()).toBeUndefined();
    expect(state.notices).toEqual([
      { kind: "support-off", email: EMAIL, extra: undefined },
    ]);
    expect(state.audit).toMatchObject([
      {
        action: "user.reset_two_factor_complete",
        actor: { id: ADMIN.id, email: ADMIN.email },
        metadata: {
          subjectUserId: USER,
          requestedAt: "2026-11-08T15:20:00.000Z",
        },
      },
    ]);
  });

  it("drops one whose account turned it off meanwhile, or is gone", async () => {
    seed();
    await scheduleAt("2026-11-01T10:00:00.000Z");
    await scheduleAt("2026-11-01T10:00:00.000Z", "user_gone");
    Object.assign(fakeDb.find("user", { id: USER }) ?? {}, {
      twoFactorEnabled: false,
    });
    expect(
      await reset.completeDueTwoFactorResets(
        new Date("2026-11-16T04:00:00.000Z"),
      ),
    ).toEqual({ completed: 0, dropped: 2, failed: 0 });
    expect(
      fakeDb
        .rows("verification")
        .filter((row) => String(row.identifier).startsWith("qrdx-2fa-reset-")),
    ).toEqual([]);
    expect(state.notices).toEqual([]);
    expect(sessionsOf(USER)).toHaveLength(2);
  });

  it("puts one back for tomorrow when the reset fails", async () => {
    seed();
    await scheduleAt("2026-11-01T10:00:00.000Z");
    state.failReset = true;
    expect(
      await reset.completeDueTwoFactorResets(
        new Date("2026-11-16T04:00:00.000Z"),
      ),
    ).toEqual({ completed: 0, dropped: 0, failed: 1 });
    expect(pendingRow()).toBeDefined();
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(true);
    expect(state.notices).toEqual([]);
    expect(state.errors.join("\n")).toContain("complete-failed");

    state.failReset = false;
    expect(
      await reset.completeDueTwoFactorResets(
        new Date("2026-11-17T04:00:00.000Z"),
      ),
    ).toMatchObject({ completed: 1 });
  });

  it("never completes one that was cancelled", async () => {
    seed();
    await scheduleAt("2026-11-01T10:00:00.000Z");
    await reset.cancelTwoFactorReset({ id: USER, email: EMAIL }, "person");
    expect(
      await reset.completeDueTwoFactorResets(
        new Date("2026-11-16T04:00:00.000Z"),
      ),
    ).toEqual({ completed: 0, dropped: 0, failed: 0 });
    expect(fakeDb.find("user", { id: USER })?.twoFactorEnabled).toBe(true);
    expect(sessionsOf(USER)).toHaveLength(2);
  });
});
