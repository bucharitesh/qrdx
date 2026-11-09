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
const { auditSso, auditSsoJoinRole, auditOAuthApp } = await import(
  "@/ee/audit-log/security-events"
);

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

describe("team and workspace", () => {
  it("records role changes, removals and people leaving, by name", async () => {
    team.auditRoleChanged(scope, { userId: "u_ben", role: "member" }, "admin");
    team.auditRoleChanged(scope, { userId: "u_ben", role: "admin" }, "admin");
    team.auditMemberRemoved(scope, { userId: "u_ben", role: "admin" });
    team.auditMemberRemoved(scope, null);
    team.auditMemberLeft("u_ben", ORG);
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
      ["member.left", "u_ben", "Ben <ben@acme.test>", null],
    ]);
  });

  it("records joining, with how and the role", async () => {
    team.auditMemberJoined("u_ben", ORG, "join link", "viewer");
    team.auditMemberJoined("u_ben", ORG, "invitation");
    await flush();
    expect(rows().map((row) => row.metadata)).toEqual([
      { via: "Join link", role: "Viewer" },
      { via: "Invitation", role: "Member" },
    ]);
  });

  it("records invitations and their revocation with the email", async () => {
    fakeDb.seed("invitation", [
      {
        id: "inv_1",
        email: "cy@acme.test",
        role: "admin",
        organizationId: ORG,
      },
    ]);
    team.auditInvited(scope, {
      id: "inv_1",
      email: "cy@acme.test",
      role: "admin",
    });
    team.auditInvitationRevoked(scope, "inv_1");
    await flush();
    expect(
      rows().map((row) => [row.action, row.targetLabel, row.metadata]),
    ).toEqual([
      ["member.invited", "cy@acme.test", { role: "Admin" }],
      ["invitation.revoked", "cy@acme.test", { role: "Admin" }],
    ]);
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

  it("records a rename and a new URL as two events", async () => {
    const before = await team.workspaceBefore(ORG);
    team.auditWorkspaceUpdated(scope, before, {
      name: "Acme Inc",
      slug: "acme-inc",
    });
    team.auditWorkspaceUpdated(scope, before, { name: "Acme" });
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
