// Exact workspace role names (packages/auth/workspace-role-rules.ts and
// ./workspace-roles.ts). Better Auth's organization plugin trims roles when
// it checks who may invite as owner, but stores them as sent, and nothing
// here may read " owner" as an owner. So:
//
// - the rules on their own, and every reader in the app matching parts
//   exactly;
// - a real Better Auth (memory adapter) with the organization plugin
//   configured like production's, over HTTP: first without QRdx's checks, to
//   show the hole is real, then with them, and with the plugin hooks alone
//   (the second layer);
// - the hooks and the gate wired into the real auth server.
import { realpathSync } from "node:fs";
import path from "node:path";
import { holdsOwnerRole } from "@repo/auth/sso-required-rules";
import {
  fieldHoldsRole,
  INVALID_ROLE,
  isWorkspaceRoleName,
  rolesInField,
  WORKSPACE_ROLE_NAMES,
} from "@repo/auth/workspace-role-rules";
import {
  workspaceRoleGate,
  workspaceRoleHooks,
} from "@repo/auth/workspace-roles";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { roleRank } from "@/lib/account/deletion";
import { inviteRole } from "@/lib/email/templates/team-invite";
import {
  holdsPlanRole,
  strongestRole,
  WORKSPACE_ROLES,
} from "@/lib/permissions";

/** Written as any of these, a role is refused. */
const NOT_EXACT = [
  " owner",
  "owner ",
  "member, owner",
  "member,owner",
  "Owner",
  "OWNER",
  "owner\n",
  "",
  ["member", "owner"],
  [" owner"],
] as const;

// ─── The rules ───────────────────────────────────────────────────────────────

describe("role names", () => {
  it("are the app's five, in the same order", () => {
    expect([...WORKSPACE_ROLE_NAMES]).toEqual([...WORKSPACE_ROLES]);
  });

  it("are exact: no spaces, no other case, no lists", () => {
    for (const name of WORKSPACE_ROLE_NAMES) {
      expect(isWorkspaceRoleName(name), name).toBe(true);
    }
    for (const value of [...NOT_EXACT, null, undefined, 1, "superuser"]) {
      expect(isWorkspaceRoleName(value), JSON.stringify(value)).toBe(false);
    }
  });

  it("read a stored field part by part, exactly, like Better Auth", () => {
    expect(rolesInField("owner")).toEqual(["owner"]);
    expect(rolesInField("member,owner")).toEqual(["member", "owner"]);
    expect(rolesInField(" owner")).toEqual([]);
    expect(rolesInField("owner ")).toEqual([]);
    expect(rolesInField("Owner")).toEqual([]);
    expect(rolesInField("member, owner")).toEqual(["member"]);
    expect(rolesInField(null)).toEqual([]);
    expect(fieldHoldsRole("admin,owner", "owner")).toBe(true);
    expect(fieldHoldsRole("admin, owner", "owner")).toBe(false);
  });

  it("grant nothing for a stored ' owner' anywhere the app reads roles", () => {
    for (const field of [" owner", "owner ", "Owner", "member, owner"]) {
      expect(holdsOwnerRole(field), field).toBe(false);
      expect(strongestRole(field), field).not.toBe("owner");
      expect(roleRank(field), field).toBeGreaterThan(0);
      expect(inviteRole(field), field).not.toBe("owner");
    }
    expect(holdsPlanRole(" owner")).toBe(false);
    expect(holdsPlanRole(" billing")).toBe(false);
    // The exact names still work.
    expect(holdsOwnerRole("owner")).toBe(true);
    expect(strongestRole("owner")).toBe("owner");
    expect(roleRank("owner")).toBe(0);
    expect(inviteRole("admin")).toBe("admin");
  });
});

// ─── A real Better Auth with the organization plugin ─────────────────────────

const ORIGIN = "http://localhost:3000";
const SECRET = "test-secret-at-least-32-characters-long";
const ORG = "org_team";

const betterAuthDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/better-auth",
  ),
);

type Memory = Record<string, Record<string, unknown>[]>;
type Mode = "unchecked" | "hooks" | "production";

interface Reply {
  status: number;
  json: Record<string, unknown> | null;
}

const instances = {} as Record<Mode, { auth: any; memory: Memory }>;

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { organization } = await import(
    `${betterAuthDir}/dist/plugins/index.mjs`
  );
  const { defaultRoles, memberAc } = await import(
    `${betterAuthDir}/dist/plugins/organization/access/index.mjs`
  );
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  const { createAuthEndpoint } = await import(
    `${betterAuthDir}/dist/api/index.mjs`
  );
  const { setSessionCookie } = await import(
    `${betterAuthDir}/dist/cookies/index.mjs`
  );

  // Signs in whoever the body names (with a verified address).
  const signInStandIn = {
    id: "sign-in-stand-in",
    endpoints: {
      testSignIn: createAuthEndpoint(
        "/test/sign-in",
        { method: "POST", body: z.object({ email: z.string() }) },
        async (ctx: any) => {
          const email = ctx.body.email;
          let user = (await ctx.context.internalAdapter.findUserByEmail(email))
            ?.user;
          if (!user) {
            user = await ctx.context.internalAdapter.createUser({
              email,
              name: email,
              emailVerified: true,
            });
          }
          const session = await ctx.context.internalAdapter.createSession(
            user.id,
          );
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ userId: user.id });
        },
      ),
    },
  };

  for (const mode of ["unchecked", "hooks", "production"] as Mode[]) {
    const memory: Memory = {
      user: [],
      session: [],
      account: [],
      verification: [],
      organization: [],
      member: [],
      invitation: [],
    };
    const auth = betterAuth({
      baseURL: ORIGIN,
      secret: SECRET,
      database: memoryAdapter(memory),
      rateLimit: { enabled: false },
      plugins: [
        // As packages/auth/server.ts sets it up, minus seats and emails.
        organization({
          creatorRole: "owner",
          roles: { ...defaultRoles, viewer: memberAc, billing: memberAc },
          sendInvitationEmail: () => Promise.resolve(),
          requireEmailVerificationOnInvitation: true,
          organizationHooks: mode === "unchecked" ? {} : workspaceRoleHooks,
        }),
        ...(mode === "production" ? [workspaceRoleGate()] : []),
        signInStandIn,
      ],
    });
    instances[mode] = { auth, memory };
  }
});

class Browser {
  cookies = new Map<string, string>();
  constructor(private readonly auth: any) {}

  async post(route: string, body: unknown): Promise<Reply> {
    const response: Response = await this.auth.handler(
      new Request(`${ORIGIN}/api/auth${route}`, {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          cookie: [...this.cookies].map(([n, v]) => `${n}=${v}`).join("; "),
        },
        body: JSON.stringify(body),
      }),
    );
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const [name, ...rest] = pair.split("=");
      this.cookies.set(name.trim(), rest.join("="));
    }
    const text = await response.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json };
  }
}

interface Team {
  auth: any;
  memory: Memory;
  owner: Browser;
  admin: Browser;
  ids: Record<"owner" | "admin" | "cy", string>;
}

/** A workspace with an owner (Ada) and an admin (Bob); Cy isn't in it yet. */
async function team(mode: Mode): Promise<Team> {
  const { auth, memory } = instances[mode];
  for (const table of Object.values(memory)) table.length = 0;
  const owner = new Browser(auth);
  const admin = new Browser(auth);
  const cy = new Browser(auth);
  const ids = {
    owner: (await owner.post("/test/sign-in", { email: "ada@qrdx.test" })).json
      ?.userId as string,
    admin: (await admin.post("/test/sign-in", { email: "bob@qrdx.test" })).json
      ?.userId as string,
    cy: (await cy.post("/test/sign-in", { email: "cy@qrdx.test" })).json
      ?.userId as string,
  };
  memory.organization.push({
    id: ORG,
    name: "Team",
    slug: "team",
    createdAt: new Date(),
  });
  memory.member.push(
    {
      id: "m_owner",
      organizationId: ORG,
      userId: ids.owner,
      role: "owner",
      createdAt: new Date(),
    },
    {
      id: "m_admin",
      organizationId: ORG,
      userId: ids.admin,
      role: "admin",
      createdAt: new Date(),
    },
  );
  return { auth, memory, owner, admin, ids };
}

const invite = (by: Browser, role: unknown) =>
  by.post("/organization/invite-member", {
    email: "cy@qrdx.test",
    role,
    organizationId: ORG,
  });

const setRole = (by: Browser, memberId: string, role: unknown) =>
  by.post("/organization/update-member-role", {
    memberId,
    role,
    organizationId: ORG,
  });

/** Cy accepts an invitation saved as `role` (from before roles were checked). */
async function acceptSaved(t: Team, role: string) {
  t.memory.invitation.push({
    id: "inv_saved",
    organizationId: ORG,
    email: "cy@qrdx.test",
    role,
    status: "pending",
    inviterId: t.ids.admin,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    createdAt: new Date(),
  });
  const cy = new Browser(t.auth);
  await cy.post("/test/sign-in", { email: "cy@qrdx.test" });
  return cy.post("/organization/accept-invitation", {
    invitationId: "inv_saved",
  });
}

const roleOf = (t: Team, userId: string) =>
  t.memory.member.find((m) => m.userId === userId)?.role;

describe("without QRdx's checks (the plugin alone)", () => {
  it("lets an admin invite ' owner', and accepting it stores ' owner'", async () => {
    const t = await team("unchecked");
    const sent = await invite(t.admin, " owner");
    expect(sent.status).toBe(200);
    expect(t.memory.invitation[0]?.role).toBe(" owner");
    const cy = new Browser(t.auth);
    await cy.post("/test/sign-in", { email: "cy@qrdx.test" });
    const accepted = await cy.post("/organization/accept-invitation", {
      invitationId: t.memory.invitation[0]?.id,
    });
    expect(accepted.status).toBe(200);
    expect(roleOf(t, t.ids.cy)).toBe(" owner");
  });

  it("refuses an admin's plain 'owner' (its own check)", async () => {
    const t = await team("unchecked");
    expect((await invite(t.admin, "owner")).status).toBe(403);
  });
});

describe("with QRdx's checks, as in production", () => {
  let t: Team;
  beforeEach(async () => {
    t = await team("production");
  });

  it("refuses an invitation with any role that isn't exact, from an admin or an owner", async () => {
    for (const by of [t.admin, t.owner]) {
      for (const role of NOT_EXACT) {
        const reply = await invite(by, role);
        expect(reply.status, JSON.stringify(role)).toBe(400);
        expect(reply.json?.code, JSON.stringify(role)).toBe(INVALID_ROLE);
      }
    }
    expect(t.memory.invitation).toEqual([]);
  });

  it("still invites with an exact role", async () => {
    const reply = await invite(t.admin, "member");
    expect(reply.status).toBe(200);
    expect(t.memory.invitation.map((i) => i.role)).toEqual(["member"]);
    // And the plugin still refuses an admin's owner invitation.
    expect((await invite(t.admin, "owner")).status).toBe(403);
  });

  it("refuses a role change to anything that isn't exact, even from an owner", async () => {
    for (const role of NOT_EXACT) {
      const reply = await setRole(t.owner, "m_admin", role);
      expect(reply.status, JSON.stringify(role)).toBe(400);
      expect(reply.json?.code, JSON.stringify(role)).toBe(INVALID_ROLE);
    }
    expect(roleOf(t, t.ids.admin)).toBe("admin");
    expect((await setRole(t.owner, "m_admin", "member")).status).toBe(200);
    expect(roleOf(t, t.ids.admin)).toBe("member");
  });

  it("won't accept an invitation saved with a role that isn't exact", async () => {
    for (const role of [" owner", "owner ", "member, owner", "Owner"]) {
      await team("production").then((fresh) => {
        t = fresh;
      });
      const reply = await acceptSaved(t, role);
      expect(reply.status, role).toBe(400);
      expect(reply.json?.code, role).toBe(INVALID_ROLE);
      expect(roleOf(t, t.ids.cy), role).toBeUndefined();
      expect(t.memory.invitation[0]?.status, role).toBe("pending");
    }
  });

  it("accepts an exact one", async () => {
    expect((await acceptSaved(t, "viewer")).status).toBe(200);
    expect(roleOf(t, t.ids.cy)).toBe("viewer");
  });

  it("won't add a member with a role that isn't exact (join links)", async () => {
    await expect(
      t.auth.api.addMember({
        body: { userId: t.ids.cy, organizationId: ORG, role: " owner" },
      }),
    ).rejects.toMatchObject({ body: { code: INVALID_ROLE } });
    expect(roleOf(t, t.ids.cy)).toBeUndefined();
    await t.auth.api.addMember({
      body: { userId: t.ids.cy, organizationId: ORG, role: "member" },
    });
    expect(roleOf(t, t.ids.cy)).toBe("member");
  });
});

describe("with the plugin hooks alone (the second layer)", () => {
  it("refuses what it would store: invitations, lists, accepting, adding", async () => {
    let t = await team("hooks");
    for (const role of [" owner", "owner ", "member, owner"]) {
      const reply = await invite(t.admin, role);
      expect(reply.json?.code, role).toBe(INVALID_ROLE);
    }
    // The plugin refuses an admin's "member,owner" itself; an owner's, the hook.
    expect((await invite(t.owner, "member,owner")).json?.code).toBe(
      INVALID_ROLE,
    );
    expect(t.memory.invitation).toEqual([]);
    // The plugin trims a role change before the hook sees it: " owner" from
    // an owner is stored as "owner", but a list never.
    expect((await setRole(t.owner, "m_admin", "member,owner")).json?.code).toBe(
      INVALID_ROLE,
    );
    t = await team("hooks");
    expect((await acceptSaved(t, " owner")).json?.code).toBe(INVALID_ROLE);
    await expect(
      t.auth.api.addMember({
        body: { userId: t.ids.cy, organizationId: ORG, role: "member,owner" },
      }),
    ).rejects.toMatchObject({ body: { code: INVALID_ROLE } });
  });
});

// ─── The real auth server ────────────────────────────────────────────────────

describe("on the real auth server", () => {
  async function loadAuth() {
    const { auth } = await import("@repo/auth/server");
    return auth as {
      options: {
        plugins: {
          id: string;
          options?: { organizationHooks?: Record<string, any> };
        }[];
      };
    };
  }

  it("registers the gate and the plugin hooks", async () => {
    const auth = await loadAuth();
    const ids = auth.options.plugins.map((plugin) => plugin.id);
    expect(ids).toContain("qrdx-workspace-roles");
    const hooks = auth.options.plugins.find(
      (plugin) => plugin.id === "organization",
    )?.options?.organizationHooks;
    expect(hooks?.beforeCreateInvitation).toBe(
      workspaceRoleHooks.beforeCreateInvitation,
    );
    expect(hooks?.beforeAcceptInvitation).toBe(
      workspaceRoleHooks.beforeAcceptInvitation,
    );
    expect(hooks?.beforeAddMember).toBe(workspaceRoleHooks.beforeAddMember);
    // A role change runs the check, then keeps "your own workspace stays
    // yours" (both pure).
    await expect(
      hooks?.beforeUpdateMemberRole({
        member: { userId: "u_1" },
        newRole: "member,owner",
        organization: { id: "org_other" },
      }),
    ).rejects.toMatchObject({ body: { code: INVALID_ROLE } });
    await expect(
      hooks?.beforeUpdateMemberRole({
        member: { userId: "u_1" },
        newRole: "member",
        organization: { id: "org_other" },
      }),
    ).resolves.toBeUndefined();
  });
});
