// Teams as content/docs/teams.mdx and plans-and-limits.mdx describe them:
// creating a team needs Pro or Business; a team's seats (members, owner
// included, plus pending invitations) follow the best plan among its owners
// (Pro 3, Business unlimited); revoking an invitation frees its seat; a
// downgrade keeps members but blocks new invitations; and only owners and
// admins manage people. The server actions (actions/organizations.ts) and the
// plan lookup (lib/plans.ts, lib/subscription.ts) run for real against
// in-memory tables. Better Auth's organization API is replaced by a small fake
// that records calls and keeps the invitation table, as the plugin does.
//
// Not covered here: the plugin's own seat callbacks in packages/auth/server.ts
// (membershipLimit/invitationLimit), since that package can't be imported
// under Vitest (it resolves @repo/database through the app's bundler).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => {
  // lib/pricing.ts reads the product ids when it loads.
  process.env.NEXT_PUBLIC_QRDX_PRO_MONTHLY_PRODUCT_ID = "prod_pro_monthly";
  process.env.NEXT_PUBLIC_QRDX_BUSINESS_MONTHLY_PRODUCT_ID =
    "prod_business_monthly";
  return {
    session: null as null | { userId: string; organizationId: string | null },
    rateLimited: false,
    calls: [] as { method: string; body: Record<string, unknown> }[],
    apiError: null as null | { method: string; code: string; message?: string },
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
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  slidingWindow: () => ({}),
  createRateLimiter: () => ({
    limit: async () => ({
      success: !state.rateLimited,
      limit: 30,
      remaining: state.rateLimited ? 0 : 29,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    }),
  }),
}));
vi.mock("@/lib/events/emails", () => ({
  sendTeamInviteEmail: async () => false,
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

// Better Auth's organization endpoints, reduced to what these actions rely on.
vi.mock("@repo/auth/server", async () => {
  const { fakeDb: db } = await import("../support/fake-db");
  const apiError = (code: string, message = code) =>
    Object.assign(new Error(message), {
      statusCode: 400,
      body: { code, message },
    });
  const call =
    (method: string, run?: (body: Record<string, unknown>) => unknown) =>
    async ({ body }: { body: Record<string, unknown> }) => {
      state.calls.push({ method, body });
      if (state.apiError?.method === method) {
        throw apiError(state.apiError.code, state.apiError.message);
      }
      return run?.(body) ?? {};
    };
  let seq = 0;
  return {
    auth: {
      api: {
        getSession: async () =>
          state.session
            ? {
                // Better Auth's session user carries the name and email.
                user: {
                  ...db.find("user", { id: state.session.userId }),
                  id: state.session.userId,
                },
                session: {
                  activeOrganizationId: state.session.organizationId,
                },
              }
            : null,
        createOrganization: call("createOrganization", (body) => {
          const id = `org_${++seq}`;
          db.seed("organization", [
            { id, name: body.name, slug: body.slug, createdAt: new Date() },
          ]);
          db.seed("member", [
            {
              id: `mem_${seq}`,
              organizationId: id,
              userId: state.session?.userId,
              role: "owner",
              createdAt: new Date(),
            },
          ]);
          return { id, slug: body.slug };
        }),
        createInvitation: call("createInvitation", (body) => {
          const existing = db
            .rows("invitation")
            .find(
              (row) =>
                row.organizationId === body.organizationId &&
                row.email === body.email &&
                row.status === "pending",
            );
          const expiresAt = new Date(Date.now() + 48 * 3_600_000);
          if (existing) {
            existing.expiresAt = expiresAt;
            return existing;
          }
          const row = {
            id: `inv_${++seq}`,
            organizationId: body.organizationId,
            email: body.email,
            role: body.role,
            status: "pending",
            expiresAt,
            inviterId: state.session?.userId,
          };
          db.seed("invitation", [row]);
          return row;
        }),
        cancelInvitation: call("cancelInvitation", (body) => {
          const row = db.find("invitation", { id: body.invitationId });
          if (row) row.status = "canceled";
          return row;
        }),
        updateMemberRole: call("updateMemberRole"),
        updateOrganization: call("updateOrganization", (body) => {
          const data = body.data as { name?: string; slug?: string };
          const row = db.find("organization", { id: body.organizationId });
          if (row) Object.assign(row, data);
          return row;
        }),
        setActiveOrganization: call("setActiveOrganization"),
        removeMember: call("removeMember"),
        leaveOrganization: call("leaveOrganization"),
        deleteOrganization: call("deleteOrganization"),
        acceptInvitation: call("acceptInvitation", (body) => ({
          member: {
            organizationId: db.find("invitation", { id: body.invitationId })
              ?.organizationId,
          },
        })),
        rejectInvitation: call("rejectInvitation"),
      },
    },
  };
});

const teams = await import("@/actions/organizations");
const { getActiveScope, WorkspaceNotFoundError } = await import("@/lib/scope");
const { ownWorkspaceId, ownWorkspaceMemberId } = await import(
  "@repo/auth/own-workspace-id"
);
const { getOwnerPlanForOrganization } = await import("@/lib/plans");
const { UnauthorizedError } = await import("@/types/errors");

const NOW = new Date("2026-11-01T12:00:00Z");
const HOUR = 3_600_000;

// ─── Fixtures ───────────────────────────────────────────────────────────────

function subscribe(
  userId: string,
  plan: "pro" | "business",
  status = "active",
) {
  fakeDb.seed("subscription", [
    {
      id: `sub_${userId}_${plan}_${status}`,
      userId,
      productId: plan === "pro" ? "prod_pro_monthly" : "prod_business_monthly",
      status,
      createdAt: NOW,
    },
  ]);
}

let memberSeq = 0;
function join(organizationId: string, userId: string, role: string) {
  memberSeq += 1;
  fakeDb.seed("member", [
    {
      id: `m_${memberSeq}`,
      organizationId,
      userId,
      role,
      createdAt: NOW,
    },
  ]);
  return `m_${memberSeq}`;
}

function invite(
  organizationId: string,
  email: string,
  overrides: Record<string, unknown> = {},
) {
  const id = `seed_inv_${fakeDb.rows("invitation").length + 1}`;
  fakeDb.seed("invitation", [
    {
      id,
      organizationId,
      email,
      role: "member",
      status: "pending",
      expiresAt: new Date(NOW.getTime() + 24 * HOUR),
      inviterId: "u_owner",
      ...overrides,
    },
  ]);
  return id;
}

/** "Acme", owned by u_owner, open in u_owner's session. */
function acme() {
  fakeDb.seed("organization", [
    { id: "org_acme", name: "Acme", slug: "acme", createdAt: NOW },
  ]);
  join("org_acme", "u_owner", "owner");
  signIn("u_owner", "org_acme");
}

function signIn(userId: string, organizationId: string | null = null) {
  state.session = { userId, organizationId };
}

const calls = (method: string) =>
  state.calls.filter((entry) => entry.method === method);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fakeDb.resetAll();
  state.session = null;
  state.rateLimited = false;
  state.calls = [];
  state.apiError = null;
  memberSeq = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Creating a workspace ───────────────────────────────────────────────────

describe("creating a workspace", () => {
  it("needs Pro or Business (everyone already has their own), and offers the upgrade", async () => {
    signIn("u_free");
    expect(await teams.createWorkspace({ name: "Acme", slug: "acme" })).toEqual(
      {
        ok: false,
        error: "More workspaces are part of Pro and Business.",
        upgrade: true,
      },
    );
    expect(calls("createOrganization")).toHaveLength(0);
  });

  it("doesn't count lapsed subscriptions", async () => {
    for (const status of ["canceled", "past_due", "unpaid", "incomplete"]) {
      subscribe("u_lapsed", "pro", status);
    }
    signIn("u_lapsed");
    const result = await teams.createWorkspace({ name: "Acme", slug: "acme" });
    expect(result).toMatchObject({ ok: false, upgrade: true });
  });

  it("creates the workspace on Pro (and trials), normalizing the URL", async () => {
    subscribe("u_pro", "pro", "trialing");
    signIn("u_pro");
    const result = await teams.createWorkspace({
      name: "  Acme Corp ",
      slug: " Acme-Corp ",
    });
    expect(result).toEqual({
      ok: true,
      data: { id: expect.any(String), slug: "acme-corp" },
    });
    expect(calls("createOrganization")[0]?.body).toEqual({
      name: "Acme Corp",
      slug: "acme-corp",
    });
  });

  it("creates the workspace on Business", async () => {
    subscribe("u_biz", "business");
    signIn("u_biz");
    expect(
      (await teams.createWorkspace({ name: "Acme", slug: "acme" })).ok,
    ).toBe(true);
  });

  it("validates the name and the 3-48 character workspace URL, refusing reserved words", async () => {
    subscribe("u_pro", "pro");
    signIn("u_pro");
    expect(await teams.createWorkspace({ name: "A", slug: "acme" })).toEqual({
      ok: false,
      error: "Workspace name is too short.",
    });
    for (const slug of [
      "ab",
      "-acme",
      "acme-",
      "ac me",
      "a".repeat(49),
      "acmé",
    ]) {
      expect(await teams.createWorkspace({ name: "Acme", slug }), slug).toEqual(
        {
          ok: false,
          error: "Use 3-48 lowercase letters, numbers and dashes.",
        },
      );
    }
    // Old dashboard sections can never become someone's workspace URL.
    for (const slug of ["codes", "settings", "team", "personal", "api"]) {
      expect(await teams.createWorkspace({ name: "Acme", slug }), slug).toEqual(
        { ok: false, error: "That URL is reserved. Pick another one." },
      );
    }
    expect(
      (await teams.createWorkspace({ name: "Acme", slug: "a".repeat(48) })).ok,
    ).toBe(true);
    expect(calls("createOrganization")).toHaveLength(1);
  });

  it("explains a taken workspace URL", async () => {
    subscribe("u_pro", "pro");
    signIn("u_pro");
    state.apiError = {
      method: "createOrganization",
      code: "ORGANIZATION_ALREADY_EXISTS",
    };
    expect(await teams.createWorkspace({ name: "Acme", slug: "acme" })).toEqual(
      {
        ok: false,
        error: "That workspace URL is already taken.",
      },
    );
  });

  it("asks signed-out visitors to sign in, and rate limits", async () => {
    expect(await teams.createWorkspace({ name: "Acme", slug: "acme" })).toEqual(
      {
        ok: false,
        error: "Sign in to manage workspaces.",
      },
    );
    subscribe("u_pro", "pro");
    signIn("u_pro");
    state.rateLimited = true;
    expect(await teams.createWorkspace({ name: "Acme", slug: "acme" })).toEqual(
      {
        ok: false,
        error: "Too many requests. Please wait a minute and try again.",
      },
    );
  });
});

// ─── Seats ──────────────────────────────────────────────────────────────────

describe("team seats: members (owner included) plus pending invitations", () => {
  it("gives a Pro team 3 seats", async () => {
    subscribe("u_owner", "pro");
    acme();
    join("org_acme", "u_bob", "member");

    const third = await teams.inviteMember({
      email: "carol@example.com",
      role: "member",
    });
    expect(third).toMatchObject({
      ok: true,
      data: { email: "carol@example.com", role: "member", emailed: false },
    });

    const fourth = await teams.inviteMember({
      email: "dave@example.com",
      role: "member",
    });
    expect(fourth).toEqual({
      ok: false,
      error:
        "This workspace has used all 3 seats (members plus pending invitations). Revoke an invitation, or upgrade a workspace owner to Business for unlimited members.",
      upgrade: true,
    });
    expect(calls("createInvitation")).toHaveLength(1);
  });

  it("lets a pending invitation be sent again without another seat", async () => {
    subscribe("u_owner", "pro");
    acme();
    join("org_acme", "u_bob", "member");
    invite("org_acme", "carol@example.com");
    const resent = await teams.inviteMember({
      email: "Carol@Example.com ",
      role: "member",
    });
    expect(resent.ok).toBe(true);
    expect(calls("createInvitation")[0]?.body).toMatchObject({
      email: "carol@example.com",
      resend: true,
    });
    expect(
      fakeDb.rows("invitation").filter((row) => row.status === "pending"),
    ).toHaveLength(1);
  });

  it("frees the seat when an invitation is revoked", async () => {
    subscribe("u_owner", "pro");
    acme();
    join("org_acme", "u_bob", "member");
    const pending = invite("org_acme", "carol@example.com");
    expect(
      (await teams.inviteMember({ email: "dave@example.com", role: "member" }))
        .ok,
    ).toBe(false);

    expect(await teams.cancelInvitation({ invitationId: pending })).toEqual({
      ok: true,
      data: null,
    });
    expect(
      (await teams.inviteMember({ email: "dave@example.com", role: "member" }))
        .ok,
    ).toBe(true);
  });

  it("doesn't hold seats for expired, accepted or declined invitations", async () => {
    subscribe("u_owner", "pro");
    acme();
    join("org_acme", "u_bob", "member");
    invite("org_acme", "old@example.com", {
      expiresAt: new Date(NOW.getTime() - HOUR),
    });
    invite("org_acme", "gone@example.com", { status: "canceled" });
    invite("org_acme", "no@example.com", { status: "rejected" });
    expect(
      (await teams.inviteMember({ email: "carol@example.com", role: "member" }))
        .ok,
    ).toBe(true);
  });

  it("has no member limit on Business", async () => {
    subscribe("u_owner", "business");
    acme();
    for (let i = 0; i < 40; i++) join("org_acme", `u_${i}`, "member");
    for (let i = 0; i < 10; i++) invite("org_acme", `pending${i}@example.com`);
    expect(
      (await teams.inviteMember({ email: "next@example.com", role: "admin" }))
        .ok,
    ).toBe(true);
  });

  it("uses the best plan among the owners, never the members'", async () => {
    acme();
    join("org_acme", "u_coowner", "admin,owner");
    join("org_acme", "u_rich_member", "member");
    subscribe("u_rich_member", "business");
    expect(await getOwnerPlanForOrganization("org_acme")).toBe("free");

    subscribe("u_coowner", "business");
    expect(await getOwnerPlanForOrganization("org_acme")).toBe("business");
    // A role that merely contains the word isn't an owner.
    fakeDb.rows("member").splice(0);
    join("org_acme", "u_coowner", "co-owner-ish");
    expect(await getOwnerPlanForOrganization("org_acme")).toBe("free");
  });

  it("keeps members after a downgrade but blocks new invitations", async () => {
    subscribe("u_owner", "pro");
    acme();
    join("org_acme", "u_bob", "member");
    join("org_acme", "u_carol", "member");
    const sub = fakeDb.rows("subscription")[0];
    if (sub) sub.status = "canceled";

    const result = await teams.inviteMember({
      email: "dave@example.com",
      role: "member",
    });
    expect(result).toEqual({
      ok: false,
      error: "Adding members needs a workspace owner on Pro or Business.",
      upgrade: true,
    });
    expect(calls("removeMember")).toHaveLength(0);
    expect(
      fakeDb.rows("member").filter((m) => m.organizationId === "org_acme"),
    ).toHaveLength(3);

    // Members still work in the team.
    signIn("u_bob", "org_acme");
    expect(await getActiveScope()).toEqual({
      userId: "u_bob",
      organizationId: "org_acme",
      role: "member",
    });
  });

  it("explains Better Auth's own seat refusals with an upgrade hint", async () => {
    subscribe("u_owner", "business");
    acme();
    state.apiError = {
      method: "createInvitation",
      code: "INVITATION_LIMIT_REACHED",
    };
    expect(
      await teams.inviteMember({ email: "x@example.com", role: "member" }),
    ).toEqual({
      ok: false,
      error:
        "This workspace has no free seats for another invitation. Revoke a pending invitation or upgrade the workspace's plan.",
      upgrade: true,
    });
  });

  it("explains a full team when an invitation is accepted", async () => {
    signIn("u_new");
    state.apiError = {
      method: "acceptInvitation",
      code: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
    };
    expect(await teams.acceptInvitation({ invitationId: "inv_1" })).toEqual({
      ok: false,
      error:
        "This workspace is full. Pro workspaces have up to 3 members; Business workspaces have no limit.",
    });
  });
});

// ─── Roles ──────────────────────────────────────────────────────────────────

describe("who manages a team", () => {
  beforeEach(() => {
    subscribe("u_owner", "business");
    acme();
    join("org_acme", "u_admin", "admin");
    join("org_acme", "u_member", "member");
  });

  const invitation = { email: "new@example.com", role: "member" as const };

  it("lets owners and admins invite, but not members", async () => {
    expect((await teams.inviteMember(invitation)).ok).toBe(true);
    signIn("u_admin", "org_acme");
    expect((await teams.inviteMember(invitation)).ok).toBe(true);

    signIn("u_member", "org_acme");
    expect(await teams.inviteMember(invitation)).toEqual({
      ok: false,
      error: "Only owners and admins can manage this workspace's people.",
    });
    expect(calls("createInvitation")).toHaveLength(2);
  });

  it("lets people invite into their own workspace by their plan's seats", async () => {
    // u_owner is on Business: their own workspace has no member limit.
    signIn("u_owner", null);
    expect((await teams.inviteMember(invitation)).ok).toBe(true);
    expect(calls("createInvitation")[0]?.body).toMatchObject({
      organizationId: ownWorkspaceId("u_owner"),
    });
    // On Free their own workspace has one seat: theirs.
    signIn("u_free", null);
    expect(await teams.inviteMember(invitation)).toEqual({
      ok: false,
      error: "Adding members needs a workspace owner on Pro or Business.",
      upgrade: true,
    });
  });

  it("invites by valid email as member or admin only", async () => {
    expect(
      await teams.inviteMember({ email: "not-an-email", role: "member" }),
    ).toEqual({ ok: false, error: "Enter a valid email" });
    const owner = await teams.inviteMember({
      email: "new@example.com",
      role: "owner" as "admin",
    });
    expect(owner.ok).toBe(false);
    expect(calls("createInvitation")).toHaveLength(0);
  });

  it("lets only owners make someone an owner", async () => {
    signIn("u_admin", "org_acme");
    expect(
      await teams.updateMemberRole({ memberId: "m_3", role: "owner" }),
    ).toEqual({
      ok: false,
      error:
        "Only owners can make someone an owner, or change an owner's role.",
    });
    expect(
      (await teams.updateMemberRole({ memberId: "m_3", role: "admin" })).ok,
    ).toBe(true);

    signIn("u_owner", "org_acme");
    expect(
      (await teams.updateMemberRole({ memberId: "m_3", role: "owner" })).ok,
    ).toBe(true);
    expect(calls("updateMemberRole").map((c) => c.body)).toEqual([
      { memberId: "m_3", role: "admin", organizationId: "org_acme" },
      { memberId: "m_3", role: "owner", organizationId: "org_acme" },
    ]);
  });

  it("keeps members from removing people, changing roles or revoking invitations", async () => {
    const pending = invite("org_acme", "pending@example.com");
    signIn("u_member", "org_acme");
    expect(await teams.removeMember({ memberId: "m_2" })).toEqual({
      ok: false,
      error: "Only owners and admins can manage this workspace's people.",
    });
    expect(
      await teams.updateMemberRole({ memberId: "m_2", role: "member" }),
    ).toEqual({
      ok: false,
      error: "Only owners and admins can manage this workspace's people.",
    });
    expect(await teams.cancelInvitation({ invitationId: pending })).toEqual({
      ok: false,
      error: "Only owners and admins can manage this workspace's people.",
    });
    expect(state.calls).toHaveLength(0);
  });

  it("removes members in the open team only", async () => {
    signIn("u_admin", "org_acme");
    expect((await teams.removeMember({ memberId: "m_3" })).ok).toBe(true);
    expect(calls("removeMember")[0]?.body).toEqual({
      memberIdOrEmail: "m_3",
      organizationId: "org_acme",
    });
    // Ids that the plugin would read as emails are refused.
    expect((await teams.removeMember({ memberId: "a@b.c" })).ok).toBe(false);
  });

  it("lets only an owner delete the open team, after typing its URL", async () => {
    signIn("u_admin", "org_acme");
    expect(
      await teams.deleteTeam({
        organizationId: "org_acme",
        confirmSlug: "acme",
      }),
    ).toEqual({ ok: false, error: "Only owners can delete a workspace." });

    signIn("u_owner", null);
    expect(
      (
        await teams.deleteTeam({
          organizationId: "org_acme",
          confirmSlug: "acme",
        })
      ).ok,
    ).toBe(false);

    signIn("u_owner", "org_acme");
    expect(
      await teams.deleteTeam({
        organizationId: "org_acme",
        confirmSlug: "Acme",
      }),
    ).toEqual({
      ok: false,
      error: "Type the workspace URL exactly to confirm.",
    });
    expect(calls("deleteOrganization")).toHaveLength(0);

    expect(
      await teams.deleteTeam({
        organizationId: "org_acme",
        confirmSlug: "acme",
      }),
    ).toEqual({ ok: true, data: null });
    expect(calls("deleteOrganization")).toHaveLength(1);
  });

  it("never deletes or leaves someone's own workspace", async () => {
    signIn("u_owner", null);
    const own = (await getActiveScope()).organizationId;
    expect(own).toBe(ownWorkspaceId("u_owner"));
    const slug = fakeDb.find("organization", { id: own })?.slug as string;
    expect(
      await teams.deleteTeam({ organizationId: own, confirmSlug: slug }),
    ).toEqual({
      ok: false,
      error: "Your own workspace can't be deleted. Rename it instead.",
    });
    expect(await teams.leaveTeam({ organizationId: own })).toEqual({
      ok: false,
      error: "You can't leave your own workspace.",
    });
    expect(calls("deleteOrganization")).toHaveLength(0);
    expect(calls("leaveOrganization")).toHaveLength(0);
  });

  it("words Better Auth errors for workspaces", async () => {
    state.apiError = {
      method: "leaveOrganization",
      code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER",
    };
    expect(await teams.leaveTeam({ organizationId: "org_acme" })).toEqual({
      ok: false,
      error:
        "A workspace needs at least one owner. Make someone else an owner first.",
    });
    state.apiError = {
      method: "removeMember",
      code: "SOMETHING_NEW",
      message: "Organization member not found",
    };
    expect(await teams.removeMember({ memberId: "m_9" })).toEqual({
      ok: false,
      error: "Workspace member not found",
    });
  });
});

// ─── The active workspace ───────────────────────────────────────────────────

const own = (userId: string) => ({
  userId,
  organizationId: ownWorkspaceId(userId),
  role: "owner",
});

describe("getActiveScope", () => {
  it("makes your own workspace on the first visit and moves your rows into it", async () => {
    fakeDb.seed("user", [
      { id: "u_alice", name: "Alice Smith", email: "alice@example.com" },
    ]);
    fakeDb.seed("qrCode", [
      // From before workspaces: no workspace yet.
      { id: "c1", userId: "u_alice", organizationId: null, slug: "abc1234" },
      // Someone else's, and a team's: untouched.
      { id: "c2", userId: "u_bob", organizationId: null, slug: "abc1235" },
      { id: "c3", userId: "u_alice", organizationId: "org_x", slug: "abc1236" },
    ]);
    fakeDb.seed("qrPreset", [
      { id: "t1", userId: "u_alice", organizationId: null, name: "Mine" },
    ]);
    fakeDb.seed("oauthApp", [
      { id: "app_mine", ownerUserId: "u_alice", organizationId: null },
      // First-party apps (no owner) never get a workspace.
      { id: "app_qrdx", ownerUserId: null, organizationId: null },
    ]);
    signIn("u_alice");

    expect(await getActiveScope()).toEqual(own("u_alice"));
    expect(
      fakeDb.find("organization", { id: ownWorkspaceId("u_alice") }),
    ).toMatchObject({ name: "Alice's workspace", slug: "alice-smith" });
    expect(
      fakeDb.find("member", { id: ownWorkspaceMemberId("u_alice") }),
    ).toMatchObject({ userId: "u_alice", role: "owner" });
    const orgOf = (table: string, id: string) =>
      fakeDb.find(table, { id })?.organizationId;
    expect(orgOf("qrCode", "c1")).toBe(ownWorkspaceId("u_alice"));
    expect(orgOf("qrCode", "c2")).toBeNull();
    expect(orgOf("qrCode", "c3")).toBe("org_x");
    // Moving a code changes nothing about its short link.
    expect(fakeDb.find("qrCode", { id: "c1" })?.slug).toBe("abc1234");
    expect(orgOf("qrPreset", "t1")).toBe(ownWorkspaceId("u_alice"));
    expect(orgOf("oauthApp", "app_mine")).toBe(ownWorkspaceId("u_alice"));
    expect(orgOf("oauthApp", "app_qrdx")).toBeNull();

    // Idempotent: the second visit writes nothing new.
    expect(await getActiveScope()).toEqual(own("u_alice"));
    expect(fakeDb.rows("organization")).toHaveLength(1);
    expect(fakeDb.rows("member")).toHaveLength(1);
  });

  it("picks a free, unreserved URL for the own workspace", async () => {
    fakeDb.seed("organization", [
      { id: "org_1", name: "Acme", slug: "acme", createdAt: NOW },
      { id: "org_2", name: "Acme 2", slug: "acme-2", createdAt: NOW },
    ]);
    fakeDb.seed("user", [{ id: "u_a", name: "Acme", email: "a@x.dev" }]);
    signIn("u_a");
    await getActiveScope();
    expect(
      fakeDb.find("organization", { id: ownWorkspaceId("u_a") })?.slug,
    ).toBe("acme-3");
    fakeDb.seed("user", [{ id: "u_s", name: "Settings", email: "s@x.dev" }]);
    signIn("u_s");
    await getActiveScope();
    expect(
      fakeDb.find("organization", { id: ownWorkspaceId("u_s") })?.slug,
    ).toBe("settings-workspace");
  });

  it("opens the workspace the URL names, for members only, never falling back", async () => {
    acme();
    const byUrl = (slug: string) =>
      getActiveScope(new Headers({ "x-qrdx-workspace": slug }));
    signIn("u_owner", null);
    expect(await byUrl("acme")).toEqual({
      userId: "u_owner",
      organizationId: "org_acme",
      role: "owner",
    });
    // Not a member, or no such workspace: the same 404, nothing created.
    signIn("u_stranger", "org_acme");
    await expect(byUrl("acme")).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    await expect(byUrl("nope")).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    expect(
      fakeDb.find("organization", { id: ownWorkspaceId("u_stranger") }),
    ).toBeUndefined();
  });

  it("uses the strongest of several roles", async () => {
    acme();
    const cases: [string, string][] = [
      ["owner,admin", "owner"],
      ["admin, owner", "owner"],
      ["member,admin", "admin"],
      ["member", "member"],
      ["member,billing", "member"],
      ["billing", "billing"],
      ["viewer", "viewer"],
      // A role this code doesn't know never grants more than reading.
      ["superuser", "viewer"],
    ];
    for (const [role, expected] of cases) {
      fakeDb.rows("member").splice(0);
      join("org_acme", "u_alice", role);
      signIn("u_alice", "org_acme");
      expect((await getActiveScope()).role, role).toBe(expected);
    }
  });

  it("falls back to your own workspace after leaving the session's workspace", async () => {
    acme();
    signIn("u_alice", "org_acme");
    expect(await getActiveScope()).toEqual(own("u_alice"));
  });

  it("throws UnauthorizedError when signed out", async () => {
    await expect(getActiveScope()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

// ─── Renaming and the URL check ─────────────────────────────────────────────

describe("renaming a workspace", () => {
  beforeEach(() => {
    subscribe("u_owner", "pro");
    acme();
    join("org_acme", "u_member", "member");
    fakeDb.seed("organization", [
      { id: "org_beta", name: "Beta", slug: "beta", createdAt: NOW },
    ]);
  });

  it("checks a URL as you type: format, reserved words, taken, your own", async () => {
    const check = (slug: string) => teams.checkWorkspaceSlug({ slug });
    expect(await check("acme")).toEqual({
      ok: true,
      data: { status: "available" },
    });
    expect(await check("beta")).toEqual({
      ok: true,
      data: {
        status: "unavailable",
        message: "That workspace URL is already taken.",
      },
    });
    expect(await check("codes")).toMatchObject({
      data: {
        status: "unavailable",
        message: expect.stringMatching(/reserved/),
      },
    });
    expect(await check("A")).toMatchObject({
      data: { status: "unavailable", message: expect.stringMatching(/3-48/) },
    });
    expect(await check("new-acme")).toEqual({
      ok: true,
      data: { status: "available" },
    });
  });

  it("lets owners and admins rename and move the workspace", async () => {
    expect(
      await teams.updateWorkspace({ name: "Acme Inc", slug: "acme-inc" }),
    ).toEqual({ ok: true, data: { slug: "acme-inc" } });
    expect(calls("updateOrganization")[0]?.body).toEqual({
      organizationId: "org_acme",
      data: { name: "Acme Inc", slug: "acme-inc" },
    });
    expect(await teams.updateWorkspace({ slug: "settings" })).toEqual({
      ok: false,
      error: "That URL is reserved. Pick another one.",
    });
    signIn("u_member", "org_acme");
    expect(await teams.updateWorkspace({ name: "Mine now" })).toEqual({
      ok: false,
      error: "Only owners and admins can change this workspace's settings.",
    });
    expect(calls("updateOrganization")).toHaveLength(1);
  });
});

describe("remembering the workspace you opened", () => {
  it("makes it the session's workspace once, and only for members", async () => {
    acme();
    const opened = new Headers({ "x-qrdx-workspace": "acme" });
    // The page's server action posts to its own URL, so proxy.ts adds this.
    const { headers } = await import("next/headers");
    vi.mocked(headers).mockResolvedValueOnce(opened as never);
    signIn("u_owner", null);
    await teams.rememberWorkspace();
    expect(calls("setActiveOrganization")[0]?.body).toEqual({
      organizationId: "org_acme",
    });
  });
});
