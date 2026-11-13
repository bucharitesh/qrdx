// The "Get set up" launcher's data: getSetupTasks (lib/setup-guide-server.ts)
// against in-memory tables, and GET /api/setup-guide, which the launcher
// calls on every app page. The counts other modules own are stubbed here;
// the code count runs its real query.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({
  plan: "free" as "free" | "pro" | "business",
  domainMode: "vercel" as string,
  pages: 0,
  themes: 0,
  members: 1,
  invitations: 0,
  domains: 0,
  calls: [] as string[],
  workspace: null as null | {
    role: string;
    id: string;
  },
}));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("@/lib/plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/plans")>()),
  getPlanForScope: async () => state.plan,
}));
vi.mock("@/lib/feature-availability", () => ({
  getCustomDomainMode: () => state.domainMode,
}));
vi.mock("@/app/(app)/dashboard/pages/_lib/landing-pages", () => ({
  getPageUsage: async () => {
    state.calls.push("pages");
    return { plan: state.plan, limit: null, used: state.pages };
  },
}));
vi.mock("@/app/(app)/dashboard/themes/_lib/queries", () => ({
  countThemesInScope: async () => {
    state.calls.push("themes");
    return state.themes;
  },
}));
vi.mock("@/app/(app)/dashboard/team/_lib/queries", () => ({
  listTeamMembers: async () => {
    state.calls.push("team");
    return Array.from({ length: state.members }, (_, i) => ({ id: `m${i}` }));
  },
  listPendingInvitations: async () =>
    Array.from({ length: state.invitations }, (_, i) => ({ id: `i${i}` })),
}));
vi.mock("@/app/(app)/dashboard/domains/_lib/domains", () => ({
  listDomains: async () => {
    state.calls.push("domains");
    return Array.from({ length: state.domains }, (_, i) => ({ id: `d${i}` }));
  },
}));
vi.mock("@/lib/scope", async () => {
  const { UnauthorizedError } = await import("@/types/errors");
  return {
    getActiveWorkspace: async () => {
      if (!state.workspace) throw new UnauthorizedError();
      return {
        scope: {
          userId: "u_1",
          organizationId: state.workspace.id,
          role: state.workspace.role,
        },
        workspace: { id: state.workspace.id },
      };
    },
  };
});
vi.mock("@/lib/shared", () => ({ logError: () => {} }));

const { getSetupTasks } = await import("@/lib/setup-guide-server");
const { GET } = await import("@/app/api/setup-guide/route");

const ORG = "org_1";
const scope = { userId: "u_1", organizationId: ORG, role: "owner" as const };

beforeEach(() => {
  fakeDb.reset();
  Object.assign(state, {
    plan: "free",
    domainMode: "vercel",
    pages: 0,
    themes: 0,
    members: 1,
    invitations: 0,
    domains: 0,
    calls: [],
    workspace: null,
  });
});

const done = (tasks: { id: string; done: boolean }[]) =>
  Object.fromEntries(tasks.map((task) => [task.id, task.done]));

describe("getSetupTasks", () => {
  it("starts a new Free workspace with three open tasks", async () => {
    expect(await getSetupTasks(scope)).toEqual([
      { id: "code", done: false },
      { id: "page", done: false },
      { id: "theme", done: false },
    ]);
    // Free has neither teams nor custom domains: nothing counted for them.
    expect(state.calls).not.toContain("team");
    expect(state.calls).not.toContain("domains");
  });

  it("counts the workspace's codes, archived ones too, but not the trash or other workspaces", async () => {
    fakeDb.seed("qrCode", [
      { id: "trashed", organizationId: ORG, deletedAt: new Date() },
      { id: "elsewhere", organizationId: "org_2", deletedAt: null },
    ]);
    expect(done(await getSetupTasks(scope)).code).toBe(false);

    fakeDb.seed("qrCode", [
      {
        id: "archived",
        organizationId: ORG,
        archivedAt: new Date(),
        deletedAt: null,
      },
    ]);
    expect(done(await getSetupTasks(scope)).code).toBe(true);
  });

  it("ticks pages and themes from their counts", async () => {
    state.pages = 2;
    state.themes = 1;
    expect(done(await getSetupTasks(scope))).toMatchObject({
      page: true,
      theme: true,
    });
  });

  it("adds team and domain tasks on plans that include them", async () => {
    state.plan = "pro";
    let tasks = await getSetupTasks(scope);
    expect(tasks.map((task) => task.id)).toEqual([
      "code",
      "page",
      "theme",
      "team",
      "domain",
    ]);
    expect(done(tasks)).toMatchObject({ team: false, domain: false });

    // A pending invitation counts: someone besides you is on the way.
    state.invitations = 1;
    state.domains = 1;
    tasks = await getSetupTasks(scope);
    expect(done(tasks)).toMatchObject({ team: true, domain: true });
  });

  it("leaves the domain task out where this deployment can't connect domains", async () => {
    state.plan = "business";
    state.domainMode = "disabled";
    const ids = (await getSetupTasks(scope)).map((task) => task.id);
    expect(ids).toContain("team");
    expect(ids).not.toContain("domain");
    expect(state.calls).not.toContain("domains");
  });
});

describe("GET /api/setup-guide", () => {
  const get = () =>
    GET(new Request("http://localhost/api/setup-guide")) as Promise<Response>;

  it("answers with the open workspace's tasks, never cached", async () => {
    state.workspace = { id: ORG, role: "member" };
    state.themes = 1;
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      workspaceId: ORG,
      tasks: [
        { id: "code", done: false },
        { id: "page", done: false },
        { id: "theme", done: true },
      ],
    });
  });

  it("counts nothing for a read-only member", async () => {
    state.workspace = { id: ORG, role: "viewer" };
    const response = await get();
    expect(await response.json()).toEqual({ workspaceId: ORG, tasks: null });
    expect(state.calls).toEqual([]);
  });

  it("refuses a signed-out request", async () => {
    const response = await get();
    expect(response.status).toBe(401);
    expect(state.calls).toEqual([]);
  });
});
