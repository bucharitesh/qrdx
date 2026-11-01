// Every admin server action: the admin check runs first (a non-admin gets
// "Not found" before any query or auth call), successful actions write an
// audit entry with the reason, the rate limit and input checks stop an action
// before it touches anything, and the last sign-in method is never unlinked.
//
// The database is a scripted fake: every query chain is recorded and resolves
// to the next scripted result. Nothing connects to a database or a service.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { root: string; table?: string; steps: [string, unknown[]][] };

const state = vi.hoisted(() => ({
  admin: null as null | {
    id: string;
    email: string;
    name: string;
    role: string;
  },
  calls: [] as Call[],
  results: [] as unknown[],
  auth: [] as string[],
  limited: false,
}));

// A value that absorbs any property access or call (drizzle operators, tables).
const anything = vi.hoisted(() => {
  const make = (label: string): unknown =>
    new Proxy(() => undefined, {
      get: (_target, key) =>
        key === "then"
          ? undefined
          : key === Symbol.toPrimitive
            ? () => label
            : make(`${label}.${String(key)}`),
      apply: () => make(label),
    });
  return make;
});

vi.mock("@/app/admin/_lib/guard", () => ({
  assertAdmin: vi.fn(async () => {
    if (!state.admin) throw new Error("Not found");
    return state.admin;
  }),
  requireAdmin: vi.fn(),
  getAdminUser: vi.fn(async () => state.admin),
}));

vi.mock("@repo/database", () => {
  const tableName = (value: unknown) =>
    typeof value === "object" && value && "__table" in value
      ? String((value as { __table: string }).__table)
      : undefined;
  const chain = (call: Call): unknown =>
    new Proxy(() => undefined, {
      get: (_target, key) => {
        if (key === "then") {
          const result = state.results.length ? state.results.shift() : [];
          return (resolve: (value: unknown) => void) => resolve(result);
        }
        return (...args: unknown[]) => {
          call.steps.push([String(key), args]);
          if (key === "from" || key === "innerJoin") {
            call.table ??= tableName(args[0]);
          }
          return chain(call);
        };
      },
    });
  const start =
    (root: string) =>
    (...args: unknown[]) => {
      const call: Call = { root, table: tableName(args[0]), steps: [] };
      state.calls.push(call);
      return chain(call);
    };
  const database = {
    select: start("select"),
    selectDistinct: start("select"),
    selectDistinctOn: start("select"),
    insert: start("insert"),
    update: start("update"),
    delete: start("delete"),
    execute: start("execute"),
    batch: start("batch"),
  };
  const table = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get: (target, key) =>
          key in target ? target[key as "__table"] : `${name}.${String(key)}`,
      },
    );
  return {
    database,
    abuseReport: table("abuse_report"),
    account: table("account"),
    adminAuditLog: table("admin_audit_log"),
    communityTheme: table("community_theme"),
    fileAsset: table("file_asset"),
    integration: table("integration"),
    invitation: table("invitation"),
    member: table("member"),
    oauthApp: table("oauth_app"),
    organization: table("organization"),
    qrCode: table("qr_code"),
    qrPreset: table("qr_preset"),
    user: table("user"),
    webhookDelivery: table("webhook_delivery"),
    webhookEndpoint: table("webhook_endpoint"),
  };
});

vi.mock("drizzle-orm", () => {
  const op = anything("op");
  return Object.fromEntries(
    [
      "and",
      "count",
      "countDistinct",
      "desc",
      "asc",
      "eq",
      "ne",
      "gt",
      "gte",
      "lt",
      "lte",
      "ilike",
      "inArray",
      "isNull",
      "isNotNull",
      "or",
      "sql",
    ].map((name) => [name, op]),
  );
});

vi.mock("@repo/auth/server", () => ({
  auth: {
    api: new Proxy(
      {},
      {
        get: (_target, key) => async () => {
          state.auth.push(String(key));
          return {};
        },
      },
    ),
  },
}));

vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({
    limit: async () => ({
      success: !state.limited,
      limit: 30,
      remaining: state.limited ? 0 : 29,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
  slidingWindow: () => ({}),
  redis: null,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/connected-accounts/server", () => ({
  revokeStoredToken: vi.fn(async () => false),
}));
vi.mock("@/lib/data-connections/server", () => ({
  cleanupDataConnection: vi.fn(async () => false),
}));
vi.mock("@/lib/events/deliveries", () => ({
  claimDueDeliveries: vi.fn(async () => []),
  processClaimed: vi.fn(async () => ({ succeeded: 0, retrying: 0, failed: 0 })),
}));
vi.mock("@/lib/events/emails", () => ({
  sendTeamInviteEmail: vi.fn(async () => false),
}));
vi.mock("@/lib/migrate/server/repo", () => ({
  JOB_STORE_PROVIDER: "qrdx-import",
}));
vi.mock("@/lib/files/admin", () => ({ setFileBlocked: vi.fn() }));
vi.mock("@/lib/account/deletion-server", () => ({
  AccountDeletionError: class extends Error {},
  executeAccountDeletion: vi.fn(),
  loadDeletionFacts: vi.fn(),
}));
vi.mock("@/lib/account/deletion", () => ({ planAccountDeletion: vi.fn() }));
vi.mock("@/lib/account/export/archive", () => ({
  exportArchiveStream: vi.fn(() => new ReadableStream()),
}));
vi.mock("@/lib/account/export/entries", () => ({
  EXPORT_INTRO: "",
  exportEntries: vi.fn(() => []),
}));
vi.mock("@/lib/shared", () => ({ logError: vi.fn() }));

const modules = {
  "app/admin/actions": () => import("@/app/admin/actions"),
  "app/admin/codes/actions": () => import("@/app/admin/codes/actions"),
  "app/admin/abuse/actions": () => import("@/app/admin/abuse/actions"),
  "app/admin/users/support-actions": () =>
    import("@/app/admin/users/support-actions"),
};

// A plausible, valid input for every action (each also gets a reason).
const sampleInput = {
  userId: "user_target",
  reason: "Ticket 1234",
  communityThemeId: "ct_1",
  codeId: "code_1",
  active: false,
  paused: true,
  reportId: "report_1",
  status: "dismissed",
  fileId: "file_1",
  accountId: "acct_1",
  deliveryId: "delivery_1",
  jobId: "job_1",
  integrationId: "int_1",
  appId: "app_1",
  verified: true,
  suspended: true,
  invitationId: "inv_1",
  role: "user",
  confirmation: "target@example.com",
};

type Action = (input: unknown) => Promise<{ ok: boolean; error?: string }>;

async function allActions(): Promise<[string, Action][]> {
  const found: [string, Action][] = [];
  for (const [path, load] of Object.entries(modules)) {
    const mod = (await load()) as Record<string, unknown>;
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function") {
        found.push([`${path}#${name}`, value as Action]);
      }
    }
  }
  return found;
}

const auditInserts = () =>
  state.calls.filter(
    (call) => call.root === "insert" && call.table === "admin_audit_log",
  );
const auditValues = () =>
  auditInserts().map(
    (call) =>
      call.steps.find(([step]) => step === "values")?.[1][0] as {
        action: string;
        targetType: string;
        targetId: string | null;
        metadata: Record<string, unknown>;
      },
  );

beforeEach(() => {
  state.admin = null;
  state.calls = [];
  state.results = [];
  state.auth = [];
  state.limited = false;
});

describe("admin guard", () => {
  it("covers every exported server action", async () => {
    const actions = await allActions();
    // 5 + 2 + 4 + 10 at the time of writing; new ones are picked up here.
    expect(actions.length).toBeGreaterThanOrEqual(21);
  });

  it("rejects non-admins before any query or auth call", async () => {
    for (const [name, action] of await allActions()) {
      state.calls = [];
      state.auth = [];
      await expect(action(sampleInput), name).rejects.toThrow("Not found");
      await expect(action({}), name).rejects.toThrow("Not found");
      expect(state.calls, name).toEqual([]);
      expect(state.auth, name).toEqual([]);
    }
  });
});

describe("with an admin", () => {
  beforeEach(() => {
    state.admin = {
      id: "admin_1",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
    };
  });

  it("stops at the rate limit before touching anything", async () => {
    state.limited = true;
    const { markEmailVerifiedAction } = await import(
      "@/app/admin/users/support-actions"
    );
    const result = await markEmailVerifiedAction({
      userId: "user_target",
      reason: "Ticket 1234",
    });
    expect(result).toEqual({
      ok: false,
      error: "Rate limit exceeded. Please try again later.",
    });
    expect(state.calls).toEqual([]);
  });

  it("requires a reason for support actions", async () => {
    const { markEmailVerifiedAction } = await import(
      "@/app/admin/users/support-actions"
    );
    const result = await markEmailVerifiedAction({
      userId: "user_target",
    } as never);
    expect(result.ok).toBe(false);
    expect(state.calls).toEqual([]);
  });

  it("writes an audit entry with the reason", async () => {
    const { markEmailVerifiedAction } = await import(
      "@/app/admin/users/support-actions"
    );
    state.results = [
      [
        {
          id: "user_target",
          email: "target@example.com",
          emailVerified: false,
        },
      ],
      [], // the update
      [], // the audit insert
    ];
    const result = await markEmailVerifiedAction({
      userId: "user_target",
      reason: "Replied from the address, ticket 1234",
    });
    expect(result).toEqual({ ok: true });
    expect(
      state.calls.some(
        (call) => call.root === "update" && call.table === "user",
      ),
    ).toBe(true);
    expect(auditValues()).toEqual([
      expect.objectContaining({
        actorUserId: "admin_1",
        action: "user.mark_email_verified",
        targetType: "user",
        targetId: "user_target",
        metadata: expect.objectContaining({
          actorEmail: "admin@example.com",
          reason: "Replied from the address, ticket 1234",
          subjectUserId: "user_target",
          targetEmail: "target@example.com",
        }),
      }),
    ]);
  });

  it("writes no entry when nothing changed", async () => {
    const { markEmailVerifiedAction } = await import(
      "@/app/admin/users/support-actions"
    );
    state.results = [
      [{ id: "user_target", email: "target@example.com", emailVerified: true }],
    ];
    const result = await markEmailVerifiedAction({
      userId: "user_target",
      reason: "Ticket 1234",
    });
    expect(result).toEqual({ ok: true });
    expect(auditInserts()).toEqual([]);
  });

  it("never unlinks the last sign-in method", async () => {
    const { unlinkSignInMethodAction } = await import(
      "@/app/admin/users/support-actions"
    );
    state.results = [
      [{ id: "user_target", email: "target@example.com", emailVerified: true }],
      [{ id: "acct_1", providerId: "github" }],
    ];
    const result = await unlinkSignInMethodAction({
      userId: "user_target",
      accountId: "acct_1",
      reason: "User asked",
    });
    expect(result.ok).toBe(false);
    expect(state.calls.some((call) => call.root === "delete")).toBe(false);
    expect(auditInserts()).toEqual([]);
  });

  it("unlinks one of several and logs which", async () => {
    const { unlinkSignInMethodAction } = await import(
      "@/app/admin/users/support-actions"
    );
    state.results = [
      [{ id: "user_target", email: "target@example.com", emailVerified: true }],
      [
        { id: "acct_1", providerId: "github" },
        { id: "acct_2", providerId: "google" },
      ],
      [], // delete
      [], // audit
    ];
    const result = await unlinkSignInMethodAction({
      userId: "user_target",
      accountId: "acct_1",
      reason: "Lost access to GitHub",
    });
    expect(result).toEqual({ ok: true });
    expect(
      state.calls.some(
        (call) => call.root === "delete" && call.table === "account",
      ),
    ).toBe(true);
    expect(auditValues()[0]).toMatchObject({
      action: "user.unlink_sign_in",
      metadata: { provider: "github", reason: "Lost access to GitHub" },
    });
  });

  it("logs ban through Better Auth with the reason", async () => {
    const { banUserAction } = await import("@/app/admin/actions");
    state.results = [
      [{ id: "user_target", email: "target@example.com", role: null }],
    ];
    const result = await banUserAction({
      userId: "user_target",
      reason: "Phishing codes",
      expiresInDays: 7,
    });
    expect(result).toEqual({ ok: true });
    expect(state.auth).toEqual(["banUser"]);
    expect(auditValues()[0]).toMatchObject({
      action: "user.ban",
      metadata: { reason: "Phishing codes", expiresInDays: 7 },
    });
  });

  it("refuses to ban yourself", async () => {
    const { banUserAction } = await import("@/app/admin/actions");
    const result = await banUserAction({
      userId: "admin_1",
      reason: "Testing",
    });
    expect(result.ok).toBe(false);
    expect(state.auth).toEqual([]);
  });

  it("names the code action after what happened", async () => {
    const { setDynamicCodeActiveAction } = await import(
      "@/app/admin/codes/actions"
    );
    state.results = [
      [
        {
          slug: "Ab12Cd3",
          kind: "redirect",
          destinationUrl: "https://example.com",
          isActive: true,
          pausedAt: null,
          ownerId: "user_target",
          ownerEmail: "target@example.com",
          organizationId: null,
        },
      ],
    ];
    const result = await setDynamicCodeActiveAction({
      codeId: "code_1",
      active: false,
      reason: "Phishing report",
    });
    expect(result).toEqual({ ok: true });
    expect(auditValues()[0]).toMatchObject({
      action: "qr_code.disable",
      targetType: "qr_code",
      targetId: "code_1",
      metadata: { subjectUserId: "user_target", reason: "Phishing report" },
    });
  });

  it("deletes only with the email typed back", async () => {
    const { deleteUserAccountAction } = await import(
      "@/app/admin/users/support-actions"
    );
    state.results = [
      [{ id: "user_target", email: "target@example.com", role: null }],
    ];
    const result = await deleteUserAccountAction({
      userId: "user_target",
      confirmation: "someone@else.com",
      reason: "GDPR request 77",
    });
    expect(result.ok).toBe(false);
    expect(state.calls.some((call) => call.root === "delete")).toBe(false);
  });

  it("never deletes the acting admin", async () => {
    const { deleteUserAccountAction } = await import(
      "@/app/admin/users/support-actions"
    );
    const result = await deleteUserAccountAction({
      userId: "admin_1",
      confirmation: "admin@example.com",
      reason: "Testing",
    });
    expect(result.ok).toBe(false);
    expect(state.calls).toEqual([]);
  });
});

describe("export route", () => {
  const post = async (body: string, origin = "http://localhost:3000") => {
    const { POST } = await import("@/app/admin/users/[userId]/export/route");
    const { NextRequest } = await import("next/server");
    const request = new NextRequest(
      "http://localhost:3000/admin/users/user_target/export",
      {
        method: "POST",
        body,
        headers: {
          origin,
          host: "localhost:3000",
          "content-type": "application/x-www-form-urlencoded",
        },
      },
    );
    return POST(request, {
      params: Promise.resolve({ userId: "user_target" }),
    });
  };

  it("is a 404 for non-admins, before any query", async () => {
    const response = await post("reason=Ticket+1234");
    expect(response.status).toBe(404);
    expect(state.calls).toEqual([]);
  });

  it("needs a same-origin request and a reason", async () => {
    state.admin = {
      id: "admin_1",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
    };
    expect(
      (await post("reason=Ticket+1234", "https://evil.example")).status,
    ).toBe(403);
    expect((await post("reason=")).status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("logs the export, then streams the ZIP", async () => {
    state.admin = {
      id: "admin_1",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
    };
    state.results = [[{ id: "user_target", email: "target@example.com" }]];
    const response = await post("reason=Data+access+request");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(auditValues()[0]).toMatchObject({
      action: "user.export",
      targetId: "user_target",
      metadata: { reason: "Data access request", subjectUserId: "user_target" },
    });
  });
});
