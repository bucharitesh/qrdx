// The audit log's event helpers that actions call in one line: plan changes
// from the billing webhook (a system event, with old and new plan), team
// and join-link changes, the workspace's name and URL, single sign-on (the
// credential replaced, never its value) and OAuth apps (recorded in the
// person's own workspace). They run against in-memory tables.
import { ownWorkspaceId } from "@repo/auth/own-workspace-id";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => {
  // lib/pricing.ts reads the product ids when it loads.
  process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID = "prod_pro";
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID = "prod_business";
  return {
    plan: "business" as "free" | "pro" | "business",
    tasks: [] as Promise<unknown>[],
  };
});

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock(
  "@repo/database/schema",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    state.tasks.push(Promise.resolve().then(task));
  },
}));
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getOwnerPlanForOrganization: async () => state.plan,
}));
vi.mock("@/lib/log-error", () => ({ logError: () => {} }));

const { plansBeforeBillingChange, recordPlanChanges } = await import(
  "@/ee/audit-log/plan-change"
);
const team = await import("@/ee/audit-log/team-events");
const {
  auditSso,
  auditSsoJoinRole,
  auditOAuthApp,
  auditSsoRequirement,
  auditTwoFactorRequirement,
} = await import("@/ee/audit-log/security-events");

const ORG = "org_acme";
const NOW = new Date("2026-11-09T12:00:00Z");
const scope = { userId: "u_ana", organizationId: ORG };
const rows = () => fakeDb.rows("workspaceAuditLog");

async function flush() {
  while (state.tasks.length > 0) await Promise.all(state.tasks.splice(0));
}

function subscribe(id: string, userId: string, productId: string) {
  fakeDb.seed("subscription", [
    { id, userId, productId, status: "active", createdAt: new Date() },
  ]);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  state.plan = "business";
  state.tasks = [];
  fakeDb.seed("organization", [
    { id: ORG, name: "Acme", slug: "acme", createdAt: new Date(0) },
  ]);
  fakeDb.seed("user", [
    { id: "u_ana", name: "Ana Diaz", email: "ana@acme.test" },
    { id: "u_ben", name: "Ben", email: "ben@acme.test" },
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

describe("plan changes from billing", () => {
  it("records the upgrade to Business as a system event", async () => {
    const before = await plansBeforeBillingChange("u_ana");
    expect(before?.get(ORG)).toBe("free");
    subscribe("sub_1", "u_ana", "prod_business");
    await recordPlanChanges("u_ana", before);
    await flush();
    expect(rows()).toEqual([
      expect.objectContaining({
        organizationId: ORG,
        action: "workspace.plan_changed",
        actorType: "system",
        actorUserId: null,
        actorLabel: "Billing",
        metadata: { before: { plan: "Free" }, after: { plan: "Business" } },
      }),
    ]);
  });

  it("records nothing when the plan didn't change, or left Business", async () => {
    subscribe("sub_1", "u_ana", "prod_pro");
    const before = await plansBeforeBillingChange("u_ana");
    await recordPlanChanges("u_ana", before); // Pro → Pro
    fakeDb.rows("subscription")[0].productId = "prod_business";
    const business = await plansBeforeBillingChange("u_ana");
    fakeDb.rows("subscription")[0].status = "canceled";
    await recordPlanChanges("u_ana", business); // Business → Free
    await flush();
    expect(rows()).toEqual([]);
  });

  it("ignores events without a person", async () => {
    expect(await plansBeforeBillingChange(null)).toBeNull();
    await recordPlanChanges(undefined, new Map());
    await flush();
    expect(rows()).toEqual([]);
  });
});

describe("team and workspace changes from the organization plugin", () => {
  const record = team.recordWorkspaceChange;

  it("records role changes, removals and people leaving, by name", async () => {
    const base = { organizationId: ORG, actorUserId: "u_ana" };
    record({
      ...base,
      kind: "role_changed",
      userId: "u_ben",
      from: "member",
      to: "admin",
    });
    // The same role again isn't a change.
    record({
      ...base,
      kind: "role_changed",
      userId: "u_ben",
      from: "admin",
      to: "admin",
    });
    record({ ...base, kind: "removed", userId: "u_ben", role: "admin" });
    record({
      kind: "left",
      organizationId: ORG,
      userId: "u_ben",
      role: "member",
    });
    await flush();
    expect(
      rows().map((row) => [
        row.action,
        row.actorUserId,
        row.targetLabel,
        row.metadata,
      ]),
    ).toEqual([
      [
        "member.role_changed",
        "u_ana",
        "Ben <ben@acme.test>",
        { before: { role: "Member" }, after: { role: "Admin" } },
      ],
      ["member.removed", "u_ana", "Ben <ben@acme.test>", { role: "Admin" }],
      ["member.left", "u_ben", "Ben <ben@acme.test>", { role: "Member" }],
    ]);
  });

  it("records joining, with how and the role", async () => {
    const joined = {
      kind: "joined",
      organizationId: ORG,
      userId: "u_ben",
    } as const;
    record({ ...joined, role: "viewer", via: "added" });
    record({ ...joined, role: "member", via: "invitation" });
    record({ ...joined, role: "member", via: "sso" });
    await flush();
    expect(rows().map((row) => [row.actorUserId, row.metadata])).toEqual([
      ["u_ben", { via: "Join link", role: "Viewer" }],
      ["u_ben", { via: "Invitation", role: "Member" }],
      ["u_ben", { via: "Single sign-on", role: "Member" }],
    ]);
  });

  it("records invitations and their revocation with the email", async () => {
    const invitation = { id: "inv_1", email: "cy@acme.test", role: "admin" };
    record({
      kind: "invited",
      organizationId: ORG,
      actorUserId: "u_ana",
      invitation,
    });
    record({
      kind: "invitation_cancelled",
      organizationId: ORG,
      actorUserId: "u_ana",
      invitation,
    });
    await flush();
    expect(
      rows().map((row) => [row.action, row.targetLabel, row.metadata]),
    ).toEqual([
      ["member.invited", "cy@acme.test", { role: "Admin" }],
      ["invitation.revoked", "cy@acme.test", { role: "Admin" }],
    ]);
  });

  it("records a rename and a new URL as two events, and nothing else", async () => {
    const update = {
      kind: "updated",
      organizationId: ORG,
      actorUserId: "u_ana",
      before: { name: "Acme", slug: "acme" },
    } as const;
    record({ ...update, after: { name: "Acme Inc", slug: "acme-inc" } });
    // A logo or settings change keeps the name and URL.
    record({ ...update, after: { name: "Acme", slug: "acme" } });
    await flush();
    expect(rows().map((row) => [row.action, row.metadata])).toEqual([
      [
        "workspace.renamed",
        { before: { name: "Acme" }, after: { name: "Acme Inc" } },
      ],
      [
        "workspace.slug_changed",
        { before: { slug: "acme" }, after: { slug: "acme-inc" } },
      ],
    ]);
  });

  it("deletes a deleted workspace's rows only once it's gone", async () => {
    fakeDb.seed("workspaceAuditLog", [
      {
        id: "a",
        organizationId: ORG,
        actorType: "user",
        action: "code.created",
        createdAt: NOW,
      },
    ]);
    record({ kind: "deleted", organizationId: ORG, actorUserId: "u_ana" });
    await flush();
    expect(rows()).toHaveLength(1); // the workspace still exists
    fakeDb.rows("organization").splice(0);
    record({ kind: "deleted", organizationId: ORG, actorUserId: "u_ana" });
    await flush();
    expect(rows()).toHaveLength(0);
  });

  it("records the join link turned on, changed and off", async () => {
    team.auditJoinLink(scope, "join_link.created", "member");
    team.auditJoinLinkRole(scope, "member", "viewer");
    team.auditJoinLink(scope, "join_link.disabled");
    await flush();
    expect(rows().map((row) => [row.action, row.metadata])).toEqual([
      ["join_link.created", { role: "Member" }],
      [
        "join_link.role_changed",
        { before: { role: "Member" }, after: { role: "Viewer" } },
      ],
      ["join_link.disabled", null],
    ]);
  });
});

describe("single sign-on and OAuth apps", () => {
  it("records which credential was replaced, never its value", async () => {
    const oidc = { providerId: "sso-1", domain: "acme.com", samlConfig: null };
    auditSso(scope, "sso.created", oidc);
    auditSso(scope, "sso.updated", oidc, "oidc");
    auditSso(scope, "sso.updated", { ...oidc, samlConfig: "{}" }, "saml");
    auditSsoJoinRole(scope, "member", "viewer");
    auditSsoJoinRole(scope, "member", "member");
    await flush();
    expect(
      rows().map((row) => [row.action, row.targetLabel, row.metadata]),
    ).toEqual([
      ["sso.created", "acme.com", { protocol: "OIDC" }],
      [
        "sso.updated",
        "acme.com",
        { protocol: "OIDC", replaced: "Client secret" },
      ],
      [
        "sso.updated",
        "acme.com",
        { protocol: "SAML", replaced: "Signing certificate" },
      ],
      [
        "sso.join_role_changed",
        null,
        { before: { role: "Member" }, after: { role: "Viewer" } },
      ],
    ]);
  });

  it("records apps in the person's own workspace", async () => {
    fakeDb.seed("oauthApp", [{ id: "app_zap", name: "Zapier" }]);
    auditOAuthApp(
      "u_ana",
      "oauth_app.authorized",
      { id: "app_zap", name: "Zapier" },
      ["codes:read"],
    );
    auditOAuthApp("u_ana", "oauth_app.revoked", { id: "app_zap" });
    await flush();
    expect(
      rows().map((row) => [
        row.organizationId,
        row.action,
        row.targetLabel,
        row.metadata,
      ]),
    ).toEqual([
      [
        ownWorkspaceId("u_ana"),
        "oauth_app.authorized",
        "Zapier",
        { scopes: ["codes:read"] },
      ],
      [ownWorkspaceId("u_ana"), "oauth_app.revoked", "Zapier", null],
    ]);
  });
});

describe("sign-in requirements", () => {
  it("records Require two-step verification turned on and off, only when it changed", async () => {
    auditTwoFactorRequirement(scope, false, true);
    auditTwoFactorRequirement(scope, true, true); // saved again: no change
    auditTwoFactorRequirement(scope, true, false);
    await flush();
    expect(
      rows().map((row) => [row.action, row.actorUserId, row.targetType]),
    ).toEqual([
      ["two_factor_requirement.turned_on", "u_ana", "workspace"],
      ["two_factor_requirement.turned_off", "u_ana", "workspace"],
    ]);
  });

  it("records Require single sign-on turned on and off, with what it signed out", async () => {
    const connection = { providerId: "sso-1", domain: "acme.com" };
    auditSsoRequirement(scope, connection, false, true, { signedOut: 3 });
    auditSsoRequirement(scope, connection, true, true);
    auditSsoRequirement(scope, connection, true, false);
    auditSsoRequirement(scope, connection, true, false, {
      via: "Connection removed",
    });
    await flush();
    expect(
      rows().map((row) => [row.action, row.targetLabel, row.metadata]),
    ).toEqual([
      ["sso_requirement.turned_on", "acme.com", { signedOut: 3 }],
      ["sso_requirement.turned_off", "acme.com", null],
      ["sso_requirement.turned_off", "acme.com", { via: "Connection removed" }],
    ]);
    const { auditSentence } = await import("@/ee/audit-log/catalogue");
    expect(
      auditSentence("sso_requirement.turned_on", {
        type: "sso",
        label: "acme.com",
      }),
    ).toBe("Turned on “Require single sign-on” for acme.com");
  });
});
