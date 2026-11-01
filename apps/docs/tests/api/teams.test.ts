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
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
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
                user: { id: state.session.userId },
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
const { getActiveScope } = await import("@/lib/scope");
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

// ─── Creating a team ────────────────────────────────────────────────────────

describe("creating a team", () => {
  it("needs Pro or Business, and offers the upgrade", async () => {
    signIn("u_free");
    expect(await teams.createTeam({ name: "Acme", slug: "acme" })).toEqual({
      ok: false,
      error: "Creating teams requires a Pro or Business plan.",
      upgrade: true,
    });
    expect(calls("createOrganization")).toHaveLength(0);
  });

  it("doesn't count lapsed subscriptions", async () => {
    for (const status of ["canceled", "past_due", "unpaid", "incomplete"]) {
      subscribe("u_lapsed", "pro", status);
    }
    signIn("u_lapsed");
    const result = await teams.createTeam({ name: "Acme", slug: "acme" });
    expect(result).toMatchObject({ ok: false, upgrade: true });
  });

  it("creates the team on Pro (and trials), normalizing the URL", async () => {
    subscribe("u_pro", "pro", "trialing");
    signIn("u_pro");
    const result = await teams.createTeam({
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

  it("creates the team on Business", async () => {
    subscribe("u_biz", "business");
    signIn("u_biz");
    expect((await teams.createTeam({ name: "Acme", slug: "acme" })).ok).toBe(
      true,
    );
  });

  it("validates the name and the 3-48 character team URL", async () => {
    subscribe("u_pro", "pro");
    signIn("u_pro");
    expect(await teams.createTeam({ name: "A", slug: "acme" })).toEqual({
      ok: false,
      error: "Team name is too short",
    });
    for (const slug of [
      "ab",
      "-acme",
      "acme-",
      "ac me",
      "a".repeat(49),
      "acmé",
    ]) {
      expect(await teams.createTeam({ name: "Acme", slug }), slug).toEqual({
        ok: false,
        error: "Use 3-48 lowercase letters, numbers and dashes",
      });
    }
    expect(
      (await teams.createTeam({ name: "Acme", slug: "a".repeat(48) })).ok,
    ).toBe(true);
    expect(calls("createOrganization")).toHaveLength(1);
  });

  it("explains a taken team URL", async () => {
    subscribe("u_pro", "pro");
    signIn("u_pro");
    state.apiError = {
      method: "createOrganization",
      code: "ORGANIZATION_ALREADY_EXISTS",
    };
    expect(await teams.createTeam({ name: "Acme", slug: "acme" })).toEqual({
      ok: false,
      error: "That team URL is already taken.",
    });
  });

  it("asks signed-out visitors to sign in, and rate limits", async () => {
    expect(await teams.createTeam({ name: "Acme", slug: "acme" })).toEqual({
      ok: false,
      error: "Sign in to manage teams.",
    });
    subscribe("u_pro", "pro");
    signIn("u_pro");
    state.rateLimited = true;
    expect(await teams.createTeam({ name: "Acme", slug: "acme" })).toEqual({
      ok: false,
      error: "Too many requests. Please wait a minute and try again.",
    });
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
        "This team has used all 3 seats (members plus pending invitations). Revoke an invitation, or upgrade a team owner to Business for unlimited members.",
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
      error: "Adding members needs a team owner on Pro or Business.",
      upgrade: true,
    });
    expect(calls("removeMember")).toHaveLength(0);
    expect(fakeDb.rows("member")).toHaveLength(3);

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
        "This team has no free seats for another invitation. Revoke a pending invitation or upgrade the team's plan.",
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
        "This team is full. Pro teams have up to 3 members; Business teams have no limit.",
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

  it("lets owners and admins invite, but not members or personal workspaces", async () => {
    expect((await teams.inviteMember(invitation)).ok).toBe(true);
    signIn("u_admin", "org_acme");
    expect((await teams.inviteMember(invitation)).ok).toBe(true);

    signIn("u_member", "org_acme");
    expect(await teams.inviteMember(invitation)).toEqual({
      ok: false,
      error: "Only team owners and admins can invite.",
    });
    signIn("u_owner", null);
    expect((await teams.inviteMember(invitation)).ok).toBe(false);
    expect(calls("createInvitation")).toHaveLength(2);
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
    ).toEqual({ ok: false, error: "Only owners can make someone an owner." });
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
      error: "Only team owners and admins can remove members.",
    });
    expect(
      await teams.updateMemberRole({ memberId: "m_2", role: "member" }),
    ).toEqual({
      ok: false,
      error: "Only team owners and admins can change roles.",
    });
    expect(await teams.cancelInvitation({ invitationId: pending })).toEqual({
      ok: false,
      error: "Only team owners and admins can revoke invitations.",
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
    ).toEqual({ ok: false, error: "Only owners can delete a team." });

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
    ).toEqual({ ok: false, error: "Type the team URL exactly to confirm." });
    expect(calls("deleteOrganization")).toHaveLength(0);

    expect(
      await teams.deleteTeam({
        organizationId: "org_acme",
        confirmSlug: "acme",
      }),
    ).toEqual({ ok: true, data: null });
    expect(calls("deleteOrganization")).toHaveLength(1);
  });

  it("words Better Auth errors for teams", async () => {
    state.apiError = {
      method: "leaveOrganization",
      code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER",
    };
    expect(await teams.leaveTeam({ organizationId: "org_acme" })).toEqual({
      ok: false,
      error:
        "A team needs at least one owner. Make someone else an owner first.",
    });
    state.apiError = {
      method: "removeMember",
      code: "SOMETHING_NEW",
      message: "Organization member not found",
    };
    expect(await teams.removeMember({ memberId: "m_9" })).toEqual({
      ok: false,
      error: "Team member not found",
    });
  });
});

// ─── The active workspace ───────────────────────────────────────────────────

describe("getActiveScope", () => {
  it("is the personal workspace without an open team", async () => {
    signIn("u_alice");
    expect(await getActiveScope()).toEqual({
      userId: "u_alice",
      organizationId: null,
      role: "owner",
    });
  });

  it("uses the strongest of several roles", async () => {
    acme();
    const cases: [string, string][] = [
      ["owner,admin", "owner"],
      ["admin, owner", "owner"],
      ["member,admin", "admin"],
      ["member", "member"],
      ["viewer", "member"],
    ];
    for (const [role, expected] of cases) {
      fakeDb.rows("member").splice(0);
      join("org_acme", "u_alice", role);
      signIn("u_alice", "org_acme");
      expect((await getActiveScope()).role, role).toBe(expected);
    }
  });

  it("falls back to the personal workspace after leaving the team", async () => {
    acme();
    signIn("u_alice", "org_acme");
    expect(await getActiveScope()).toEqual({
      userId: "u_alice",
      organizationId: null,
      role: "owner",
    });
  });

  it("throws UnauthorizedError when signed out", async () => {
    await expect(getActiveScope()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
