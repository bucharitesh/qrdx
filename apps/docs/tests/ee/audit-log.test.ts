// The workspace audit log (ee/audit-log): the catalogue, what a row may
// hold, the recorder (entitled workspaces only, never throws, who did it
// from the request), who may read and export it, the CSV, paging and
// filters, the 365-day purge in batches, and that API key and webhook
// events never carry a secret. The real services run against in-memory
// tables (tests/support/fake-db.ts); `after` is captured so each test can
// wait for the writes it caused.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb, type Row } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "business" as "free" | "pro" | "business",
  headers: new Headers(),
  tasks: [] as Promise<unknown>[],
  afterUnavailable: false,
  errors: [] as { error: unknown; context?: Record<string, unknown> }[],
  session: null as null | { userId: string },
  dns: new Map<string, string[]>([["hooks.example.com", ["93.184.216.34"]]]),
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    if (state.afterUnavailable) throw new Error("outside a request");
    state.tasks.push(Promise.resolve().then(task));
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getOwnerPlanForOrganization: async () => state.plan,
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/lib/log-error", () => ({
  logError: (error: unknown, context?: Record<string, unknown>) => {
    state.errors.push({ error, context });
  },
}));
vi.mock("@/lib/shared", () => ({
  logError: (error: unknown, context?: Record<string, unknown>) => {
    state.errors.push({ error, context });
  },
}));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () =>
        state.session
          ? {
              user: {
                id: state.session.userId,
                email: `${state.session.userId}@acme.test`,
              },
              session: { activeOrganizationId: null },
            }
          : null,
    },
  },
}));
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
vi.mock("node:dns/promises", () => {
  const lookup = async (hostname: string) =>
    (state.dns.get(hostname) ?? []).map((address) => ({ address, family: 4 }));
  return { lookup, default: { lookup } };
});

const catalogue = await import("@/ee/audit-log/catalogue");
const { csvCell, auditCsvLine, AUDIT_CSV_HEADERS } = await import(
  "@/ee/audit-log/csv"
);
const { sanitizeAuditMetadata, changedFields } = await import(
  "@/ee/audit-log/metadata"
);
const { recordAuditEvent, writeAuditEvents } = await import(
  "@/ee/audit-log/record"
);
const { requireAuditLogAccess } = await import("@/ee/audit-log/access");
const { listAuditEvents, auditExportRows } = await import(
  "@/ee/audit-log/queries"
);
const { parseAuditFilter } = await import("@/ee/audit-log/filter");
const { purgeAuditEvents, deleteWorkspaceAuditEvents } = await import(
  "@/ee/audit-log/retention"
);
const { createApiKey, revokeApiKey } = await import("@/lib/api-keys/service");
const { createEndpoint, rotateSecret, updateEndpoint, deleteEndpoint } =
  await import("@/lib/events/endpoints");
const { GET: exportCsv } = await import(
  "@/app/dashboard/[workspace]/settings/audit-log/export/route"
);

const ORG = "org_acme";
const NOW = new Date("2026-11-09T12:00:00Z");
const DAY = 86_400_000;
const owner = { userId: "u_ana", organizationId: ORG, role: "owner" as const };
const rows = () => fakeDb.rows("workspaceAuditLog");

/** Waits for every write scheduled with `after`, including nested ones. */
async function flush() {
  while (state.tasks.length > 0) {
    await Promise.all(state.tasks.splice(0));
  }
}

function seedRows(count: number, make: (index: number) => Partial<Row>) {
  fakeDb.seed(
    "workspaceAuditLog",
    Array.from({ length: count }, (_, index) => ({
      id: `log_${String(index).padStart(5, "0")}`,
      organizationId: ORG,
      actorType: "user",
      actorUserId: "u_ana",
      actorLabel: "Ana Diaz <ana@acme.test>",
      apiKeyId: null,
      oauthAppId: null,
      action: "code.created",
      targetType: "code",
      targetId: `code_${index}`,
      targetLabel: `Code ${index}`,
      metadata: null,
      ip: null,
      device: null,
      createdAt: new Date(NOW.getTime() - index * 60_000),
      ...make(index),
    })),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  state.plan = "business";
  state.headers = new Headers();
  state.tasks = [];
  state.afterUnavailable = false;
  state.errors = [];
  state.session = null;
  fakeDb.seed("organization", [
    { id: ORG, name: "Acme", slug: "acme", logo: null, createdAt: new Date(0) },
  ]);
  fakeDb.seed("user", [
    {
      id: "u_ana",
      name: "Ana Diaz",
      email: "ana@acme.test",
      banned: false,
      banExpires: null,
    },
    {
      id: "u_ben",
      name: "Ben",
      email: "ben@acme.test",
      banned: false,
      banExpires: null,
    },
  ]);
  fakeDb.seed("member", [
    { id: "m_ana", organizationId: ORG, userId: "u_ana", role: "owner" },
    { id: "m_ben", organizationId: ORG, userId: "u_ben", role: "member" },
  ]);
});

afterEach(async () => {
  await flush();
  vi.useRealTimers();
});

describe("the catalogue", () => {
  it("gives every action a category and a sentence", () => {
    expect(catalogue.AUDIT_ACTION_IDS.length).toBeGreaterThan(0);
    for (const action of catalogue.AUDIT_ACTION_IDS) {
      const info = catalogue.AUDIT_ACTIONS[action];
      expect(catalogue.AUDIT_CATEGORIES, action).toContain(info.category);
      expect(info.sentence.trim().length, action).toBeGreaterThan(3);
      expect(info.sentence.split("{target}").length, action).toBeLessThan(3);
      expect(info.sentence, action).not.toMatch(/TBD|TODO|\[\[/);
    }
  });

  it("has actions in every category, and labels for them", () => {
    for (const category of catalogue.AUDIT_CATEGORIES) {
      expect(catalogue.actionsInCategory(category).length).toBeGreaterThan(0);
      expect(catalogue.AUDIT_CATEGORY_LABELS[category]).toBeTruthy();
    }
  });

  it("reads a row as a sentence, naming the target", () => {
    expect(
      catalogue.auditSentence("code.destination_changed", {
        type: "code",
        label: "Spring menu",
      }),
    ).toBe("Changed the destination of Spring menu");
    expect(
      catalogue.auditSentenceParts("code.deleted", { type: "code", label: "" }),
    ).toEqual([
      { text: "Deleted the code " },
      { target: "a code" },
      { text: " for good" },
    ]);
    expect(
      catalogue.auditSentence("member.left", { type: "member", label: "x" }),
    ).toBe("Left the workspace");
    // An action from another version of the app reads as its id.
    expect(
      catalogue.auditSentence("code.teleported", { type: null, label: null }),
    ).toBe("code.teleported");
  });
});

describe("metadata", () => {
  it("never keeps a secret, whatever the caller passes", () => {
    const clean = sanitizeAuditMetadata({
      secret: "whsec_abc",
      clientSecret: "shh",
      token: "t",
      password: "hunter2",
      passwordHash: "$2b$10$x",
      keyHash: "abc",
      apiKey: "qrdx_live",
      key: "qrdx_abc",
      note: "qrdx_AAAAAAAAAAAAAAAAAAAA",
      signing: "whsec_123",
      passwordSet: "On",
      scopes: ["codes:read", "qrdx_hidden"],
      before: { url: "https://a.example", secret: "old" },
      after: { url: "https://b.example", token: "new" },
    });
    expect(clean).toEqual({
      passwordSet: "On",
      scopes: ["codes:read"],
      before: { url: "https://a.example" },
      after: { url: "https://b.example" },
    });
  });

  it("cuts long values and keeps only flat ones", () => {
    const clean = sanitizeAuditMetadata({
      url: `https://example.com/${"a".repeat(5000)}`,
      nested: { deep: true },
      when: new Date("2026-01-01T00:00:00Z"),
    });
    expect(String(clean?.url).length).toBeLessThanOrEqual(2048);
    expect(clean).not.toHaveProperty("nested");
    expect(clean?.when).toBe("2026-01-01T00:00:00.000Z");
    expect(sanitizeAuditMetadata({})).toBeNull();
  });

  it("keeps the before and after of changed fields only", () => {
    expect(
      changedFields(
        { title: "Menu", destinationUrl: "https://a.example" },
        { title: "Menu", destinationUrl: "https://b.example" },
      ),
    ).toEqual({
      before: { destinationUrl: "https://a.example" },
      after: { destinationUrl: "https://b.example" },
    });
  });
});

describe("the CSV", () => {
  it("neutralises cells a spreadsheet would run as a formula", () => {
    expect(csvCell('=HYPERLINK("https://evil.example")')).toBe(
      '"\'=HYPERLINK(""https://evil.example"")"',
    );
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("\rcmd")).toBe('"\'\rcmd"');
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
  });

  it("writes one escaped line per row", () => {
    const line = auditCsvLine({
      createdAt: NOW,
      action: "code.renamed",
      actorType: "api_key",
      actorLabel: "=cmd|' /C calc'!A0",
      apiKeyId: "key_1",
      oauthAppId: null,
      targetType: "code",
      targetId: "code_1",
      targetLabel: "@menu",
      metadata: { before: { title: "a" }, after: { title: "b" } },
      ip: "203.0.113.7",
      device: "curl",
    });
    expect(line.endsWith("\r\n")).toBe(true);
    expect(line).toContain("2026-11-09T12:00:00.000Z,Codes,code.renamed,");
    expect(line).toContain("Renamed the code @menu");
    expect(line).toContain("API key,'=cmd|' /C calc'!A0,key_1");
    expect(line).toContain(",code,'@menu,code_1,");
    expect(AUDIT_CSV_HEADERS[0]).toBe("Time (UTC)");
  });
});

describe("recording", () => {
  const event = {
    action: "code.created" as const,
    target: { type: "code" as const, id: "code_1", label: "Spring menu" },
  };

  it("stores who, what, the IP address and the device", async () => {
    state.headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 10.0.0.1",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    });
    recordAuditEvent(owner, event);
    expect(rows()).toHaveLength(0); // written after the response
    await flush();
    expect(rows()).toEqual([
      expect.objectContaining({
        organizationId: ORG,
        actorType: "user",
        actorUserId: "u_ana",
        actorLabel: "Ana Diaz <ana@acme.test>",
        action: "code.created",
        targetType: "code",
        targetId: "code_1",
        targetLabel: "Spring menu",
        ip: "203.0.113.7",
        device: "Chrome on macOS",
        createdAt: NOW,
      }),
    ]);
  });

  it("records nothing for a workspace without the plan", async () => {
    for (const plan of ["free", "pro"] as const) {
      state.plan = plan;
      recordAuditEvent(owner, event);
      await flush();
      expect(await writeAuditEvents(owner, [event])).toBe(0);
    }
    expect(rows()).toHaveLength(0);
  });

  it("doesn't build the events of a workspace without the plan", async () => {
    state.plan = "free";
    const build = vi.fn(() => [event]);
    recordAuditEvent(owner, build);
    await flush();
    expect(build).not.toHaveBeenCalled();
  });

  it("never throws, and logs what went wrong", async () => {
    expect(() =>
      recordAuditEvent(owner, () => {
        throw new Error("lookup failed");
      }),
    ).not.toThrow();
    await flush();
    expect(rows()).toHaveLength(0);
    expect(state.errors).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({ action: "audit-log.record" }),
      }),
    ]);
  });

  it("treats a missing table as nothing to record", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const missing = () => {
      throw Object.assign(new Error("relation does not exist"), {
        cause: { code: "42P01" },
      });
    };
    await expect(writeAuditEvents(owner, missing)).resolves.toBe(0);
    await expect(writeAuditEvents(owner, missing)).resolves.toBe(0);
    expect(state.errors).toEqual([]);
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });

  it("writes at once outside a request", async () => {
    state.afterUnavailable = true;
    recordAuditEvent(owner, event);
    await vi.waitFor(() => expect(rows()).toHaveLength(1));
  });

  it("names the API key the request authenticated with, and whose it is", async () => {
    state.headers = new Headers({ "user-agent": "curl/8.7.1" });
    recordAuditEvent(
      {
        userId: "u_ben",
        organizationId: ORG,
        credential: { type: "api_key", id: "key_ci", name: "CI deploy" },
      },
      event,
    );
    await flush();
    expect(rows()[0]).toMatchObject({
      actorType: "api_key",
      actorUserId: "u_ben",
      actorLabel: "CI deploy",
      apiKeyId: "key_ci",
      oauthAppId: null,
      device: "curl",
      // A snapshot of the person, so the row reads right after they change.
      metadata: { actingFor: "Ben <ben@acme.test>" },
    });
  });

  it("names the OAuth app the request authenticated with", async () => {
    recordAuditEvent(
      {
        ...owner,
        credential: { type: "oauth_app", id: "app_zap", name: "Zapier" },
      },
      event,
    );
    await flush();
    expect(rows()[0]).toMatchObject({
      actorType: "oauth_app",
      actorUserId: "u_ana",
      actorLabel: "Zapier",
      oauthAppId: "app_zap",
      apiKeyId: null,
    });
  });

  it("never trusts an Authorization header the API layer didn't authenticate", async () => {
    // A teammate's (even revoked) key, or any app's token, sent along with a
    // dashboard change: the change is still the signed-in person's.
    const { hashApiKey } = await import("@/lib/api-keys/crypto");
    const key = `qrdx_${"A".repeat(40)}`;
    fakeDb.seed("apiKey", [
      {
        id: "key_ben",
        name: "Ben's key",
        keyHash: hashApiKey(key),
        userId: "u_ben",
        organizationId: ORG,
        revokedAt: new Date(0),
      },
    ]);
    fakeDb.seed("oauthApp", [{ id: "app_zap", name: "Zapier" }]);
    fakeDb.seed("oauthToken", [
      {
        id: "tok_1",
        appId: "app_zap",
        userId: "u_ben",
        accessTokenHash: createHash("sha256").update("tok").digest("hex"),
      },
    ]);
    for (const authorization of [`Bearer ${key}`, "Bearer tok"]) {
      state.headers = new Headers({ authorization });
      recordAuditEvent(owner, event);
    }
    await flush();
    expect(rows().map((row) => [row.actorType, row.actorUserId])).toEqual([
      ["user", "u_ana"],
      ["user", "u_ana"],
    ]);
  });

  it("records thousands of events in INSERTs of at most 500 rows", async () => {
    const { database } = (await import("@repo/database")) as unknown as {
      database: {
        insert: (table: unknown) => { values: (rows: unknown[]) => unknown };
      };
    };
    const insert = database.insert.bind(database);
    const sizes: number[] = [];
    const spy = vi.spyOn(database, "insert").mockImplementation((table) => {
      const query = insert(table);
      const values = query.values.bind(query);
      query.values = (batch: unknown[]) => {
        sizes.push(batch.length);
        return values(batch);
      };
      return query;
    });
    const many = Array.from({ length: 5_000 }, (_, index) => ({
      action: "code.deleted" as const,
      target: {
        type: "code" as const,
        id: `c${index}`,
        label: `Code ${index}`,
      },
    }));
    // 5,000 rows × 15 columns would be 75,000 parameters in one INSERT.
    expect(await writeAuditEvents(owner, many)).toBe(5_000);
    spy.mockRestore();
    expect(rows()).toHaveLength(5_000);
    expect(sizes).toHaveLength(10);
    expect(Math.max(...sizes) * 15).toBeLessThan(65_535);
  });

  it("records system events without a person, IP or device", async () => {
    state.headers = new Headers({ "x-forwarded-for": "198.51.100.1" });
    recordAuditEvent(
      { userId: null, organizationId: ORG },
      {
        action: "workspace.plan_changed",
        metadata: { before: { plan: "Pro" }, after: { plan: "Business" } },
      },
      { system: { label: "Billing" } },
    );
    await flush();
    expect(rows()[0]).toMatchObject({
      actorType: "system",
      actorUserId: null,
      actorLabel: "Billing",
      ip: null,
      device: null,
      metadata: { before: { plan: "Pro" }, after: { plan: "Business" } },
    });
  });

  it("names a member target from their account", async () => {
    recordAuditEvent(owner, {
      action: "member.removed",
      target: { type: "member", id: "u_ben" },
    });
    await flush();
    expect(rows()[0]?.targetLabel).toBe("Ben <ben@acme.test>");
  });
});

describe("who can read it", () => {
  const as = (role: "owner" | "admin" | "member" | "billing" | "viewer") => ({
    organizationId: ORG,
    role,
  });

  it("lets owners and admins in", async () => {
    await expect(requireAuditLogAccess(as("owner"))).resolves.toMatchObject({
      entitled: true,
      canView: true,
    });
    await expect(requireAuditLogAccess(as("admin"))).resolves.toMatchObject({
      canView: true,
    });
  });

  it("refuses members, viewers and billing members", async () => {
    for (const role of ["member", "viewer", "billing"] as const) {
      await expect(requireAuditLogAccess(as(role))).rejects.toMatchObject({
        status: 403,
        code: "FORBIDDEN",
      });
    }
  });

  it("refuses a workspace without the plan", async () => {
    state.plan = "pro";
    await expect(requireAuditLogAccess(as("owner"))).rejects.toMatchObject({
      status: 403,
      code: "PLAN_REQUIRED",
    });
  });
});

describe("reading the log", () => {
  it("pages 50 at a time, newest first, without gaps or repeats", async () => {
    seedRows(120, () => ({}));
    const workspace = { organizationId: ORG, slug: "acme" };
    const filter = parseAuditFilter({});
    const first = await listAuditEvents(workspace, filter);
    const second = await listAuditEvents(workspace, filter, first.nextCursor);
    const third = await listAuditEvents(workspace, filter, second.nextCursor);
    expect([first, second, third].map((page) => page.events.length)).toEqual([
      50, 50, 20,
    ]);
    expect(third.nextCursor).toBeNull();
    const ids = [first, second, third].flatMap((page) =>
      page.events.map((event) => event.id),
    );
    expect(new Set(ids).size).toBe(120);
    const times = [first, second, third].flatMap((page) =>
      page.events.map((event) => event.createdAt),
    );
    expect([...times].sort().reverse()).toEqual(times);
  });

  it("filters by person, category and UTC days", async () => {
    seedRows(6, (index) => ({
      actorUserId: index % 2 ? "u_ben" : "u_ana",
      action: index < 3 ? "member.invited" : "code.created",
      createdAt: new Date(NOW.getTime() - index * DAY),
    }));
    const workspace = { organizationId: ORG, slug: "acme" };
    const ids = async (query: Record<string, string>) =>
      (await listAuditEvents(workspace, parseAuditFilter(query))).events.map(
        (event) => event.id,
      );
    expect(await ids({ category: "team" })).toEqual([
      "log_00000",
      "log_00001",
      "log_00002",
    ]);
    expect(await ids({ actor: "u_ben" })).toEqual([
      "log_00001",
      "log_00003",
      "log_00005",
    ]);
    expect(await ids({ from: "2026-11-07", to: "2026-11-08" })).toEqual([
      "log_00001",
      "log_00002",
    ]);
    // Malformed values are ignored, not trusted.
    expect(
      parseAuditFilter({ category: "nope", from: "2026-02-30", actor: "a b" }),
    ).toEqual({ actor: null, category: null, from: null, to: null });
  });

  it("links a target only while it still exists", async () => {
    fakeDb.seed("qrCode", [{ id: "code_0", organizationId: ORG }]);
    seedRows(2, () => ({}));
    const { events } = await listAuditEvents(
      { organizationId: ORG, slug: "acme" },
      parseAuditFilter({}),
    );
    expect(events.map((event) => event.target.href)).toEqual([
      "/dashboard/acme/codes/code_0",
      null,
    ]);
  });

  it("caps an export and reads it in batches", async () => {
    seedRows(30, () => ({}));
    const batches: number[] = [];
    for await (const batch of auditExportRows(ORG, parseAuditFilter({}), 25)) {
      batches.push(batch.length);
    }
    expect(batches.reduce((sum, size) => sum + size, 0)).toBe(25);
  });
});

describe("Export CSV", () => {
  const request = (query = "") =>
    new Request(
      `http://localhost:3000/dashboard/acme/settings/audit-log/export${query}`,
      { headers: { "x-qrdx-workspace": "acme" } },
    );

  it("refuses a member", async () => {
    state.session = { userId: "u_ben" };
    const response = await exportCsv(request());
    expect(response.status).toBe(403);
    await flush();
    expect(rows()).toHaveLength(0);
  });

  it("refuses a workspace without the plan", async () => {
    state.session = { userId: "u_ana" };
    state.plan = "pro";
    expect((await exportCsv(request())).status).toBe(403);
  });

  it("gives an owner the filtered rows as CSV, and records the export", async () => {
    state.session = { userId: "u_ana" };
    seedRows(4, (index) => ({
      action: index < 2 ? "member.invited" : "code.created",
      targetLabel: index === 0 ? "=2+5" : `Target ${index}`,
    }));
    const response = await exportCsv(request("?category=team"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toMatch(
      /attachment; filename="qrdx-acme-audit-log-2026-11-09\.csv"/,
    );
    const text = await response.text();
    const lines = text.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(AUDIT_CSV_HEADERS.join(","));
    expect(lines).toHaveLength(3);
    // The target's own cell starts with "=", so it's prefixed; the sentence
    // around it starts with a word and stays as it is.
    expect(lines[1]).toContain(",member.invited,Invited =2+5,");
    expect(lines[1]).toContain(",code,'=2+5,code_0,");
    expect(lines[2]).toContain("Invited Target 1");
    await flush();
    expect(rows().filter((row) => row.action === "audit_log.exported")).toEqual(
      [
        expect.objectContaining({
          actorUserId: "u_ana",
          metadata: { category: "Team" },
        }),
      ],
    );
  });
});

describe("retention", () => {
  it("purges rows past 365 days in bounded batches", async () => {
    seedRows(2345, (index) => ({
      createdAt: new Date(NOW.getTime() - 366 * DAY - index * 1000),
    }));
    fakeDb.seed("workspaceAuditLog", [
      {
        id: "recent",
        organizationId: ORG,
        actorType: "user",
        action: "code.created",
        createdAt: new Date(NOW.getTime() - 364 * DAY),
      },
    ]);
    // Two batches of 1,000 in this run; the rest goes in the next one.
    expect(await purgeAuditEvents({ batch: 1000, maxBatches: 2 })).toBe(2000);
    expect(rows()).toHaveLength(346);
    expect(await purgeAuditEvents({ batch: 1000 })).toBe(345);
    expect(rows().map((row) => row.id)).toEqual(["recent"]);
  });

  it("deletes rows of workspaces that no longer exist, once a day old", async () => {
    seedRows(4, (index) => ({
      organizationId: index < 2 ? "org_gone" : ORG,
      createdAt: new Date(NOW.getTime() - (index === 0 ? 0 : 2 * DAY)),
    }));
    // The fresh orphan (a workspace still being set up, say) stays for now.
    expect(await purgeAuditEvents()).toBe(1);
    expect(rows().map((row) => row.id)).toEqual([
      "log_00000",
      "log_00002",
      "log_00003",
    ]);
  });

  it("stops at its deadline and leaves the rest for the next run", async () => {
    seedRows(30, (index) => ({
      createdAt: new Date(NOW.getTime() - 400 * DAY - index * 1000),
    }));
    expect(
      await purgeAuditEvents({ batch: 10, deadline: Date.now() - 1 }),
    ).toBe(0);
    expect(rows()).toHaveLength(30);
    expect(await purgeAuditEvents({ batch: 10 })).toBe(30);
  });

  it("deletes a deleted workspace's rows, and no one else's", async () => {
    seedRows(5, (index) => ({
      organizationId: index < 3 ? "org_team" : ORG,
    }));
    expect(await deleteWorkspaceAuditEvents("org_team", { batch: 2 })).toBe(3);
    expect(rows().every((row) => row.organizationId === ORG)).toBe(true);
    // A workspace that still exists keeps its rows.
    expect(await deleteWorkspaceAuditEvents(ORG)).toBe(0);
    expect(rows()).toHaveLength(2);
  });
});

describe("API key and webhook events", () => {
  const scope = owner;

  it("keep names and scopes, never the key", async () => {
    fakeDb.defaults("apiKey", () => ({ revokedAt: null }));
    const { key, apiKey } = await createApiKey(scope, {
      name: "CI deploy",
      scopes: ["codes:write"],
      expiresInDays: null,
    });
    await revokeApiKey(scope, apiKey.id);
    await flush();
    expect(rows().map((row) => [row.action, row.targetLabel])).toEqual([
      ["api_key.created", "CI deploy"],
      ["api_key.revoked", "CI deploy"],
    ]);
    expect(rows()[0]?.metadata).toEqual({
      scopes: ["codes:write"],
      expiresInDays: null,
    });
    const stored = JSON.stringify(rows());
    expect(stored).not.toContain(key);
    expect(stored).not.toContain(key.slice(5, 20));
  });

  it("keep the URL and events, never the signing secret", async () => {
    fakeDb.defaults("webhookEndpoint", () => ({ createdAt: new Date() }));
    const url = "https://hooks.example.com/qrdx";
    const { endpoint, secret } = await createEndpoint(scope, {
      url,
      events: ["code.created"],
    });
    await updateEndpoint(scope, endpoint.id, { events: ["code.updated"] });
    const rotated = await rotateSecret(scope, endpoint.id);
    await deleteEndpoint(scope, endpoint.id);
    await flush();
    expect(rows().map((row) => row.action)).toEqual([
      "webhook.created",
      "webhook.updated",
      "webhook.updated",
      "webhook.deleted",
    ]);
    expect(rows()[1]?.metadata).toEqual({
      before: { events: ["code.created"] },
      after: { events: ["code.updated"] },
    });
    expect(rows()[2]?.metadata).toEqual({ replaced: "Signing secret" });
    const stored = JSON.stringify(rows());
    expect(stored).not.toContain(secret);
    expect(stored).not.toContain(rotated);
    expect(stored).not.toMatch(/whsec_/);
  });
});
