// Better Auth's workspace rules (packages/auth/workspace-hooks.ts), which
// guard the organization plugin's own HTTP endpoints too: slugs on create and
// rename, everyone keeps their own workspace, a new account gets one, and a
// deleted workspace's rows go back to their creators' own workspaces. Runs
// on in-memory tables; nothing connects to a database.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);

const hooks = await import("@repo/auth/workspace-hooks");
const { ownWorkspaceId, ownWorkspaceMemberId } = await import(
  "@repo/auth/own-workspace-id"
);

const NOW = new Date("2026-11-03T12:00:00Z");
const own = ownWorkspaceId;

beforeEach(() => {
  fakeDb.resetAll();
  fakeDb.unique("organization", "slug");
  fakeDb.unique("organization", "id");
  fakeDb.unique("member", "id");
});

describe("workspace URLs", () => {
  it("refuses bad and reserved slugs on create and rename", () => {
    expect(() => hooks.assertWorkspaceSlug("acme")).not.toThrow();
    // Renames that don't touch the slug pass.
    expect(() => hooks.assertWorkspaceSlug(undefined)).not.toThrow();
    expect(() => hooks.assertWorkspaceSlug("codes")).toThrow(/reserved/);
    expect(() => hooks.assertWorkspaceSlug("Acme")).toThrow(/3-48/);
  });
});

describe("a new account", () => {
  it("gets its own workspace with a free slug, once", async () => {
    fakeDb.seed("organization", [
      { id: "org_1", name: "Taken", slug: "ritesh-bucha", createdAt: NOW },
    ]);
    const person = { id: "u_new", name: "Ritesh Bucha", email: "r@x.dev" };
    await hooks.createOwnWorkspace(person);
    await hooks.createOwnWorkspace(person);
    expect(fakeDb.rows("organization")).toHaveLength(2);
    expect(fakeDb.find("organization", { id: own("u_new") })).toMatchObject({
      name: "Ritesh's workspace",
      slug: "ritesh-bucha-2",
    });
    expect(fakeDb.rows("member")).toEqual([
      expect.objectContaining({
        id: ownWorkspaceMemberId("u_new"),
        organizationId: own("u_new"),
        userId: "u_new",
        role: "owner",
      }),
    ]);
  });

  it("starts new sessions in the workspace last opened, else their own", async () => {
    fakeDb.seed("organization", [
      { id: "org_acme", name: "Acme", slug: "acme", createdAt: NOW },
    ]);
    fakeDb.seed("user", [
      {
        id: "u_a",
        settings: { keyboardShortcuts: true, lastWorkspaceId: "org_acme" },
      },
      {
        id: "u_b",
        settings: { keyboardShortcuts: true, lastWorkspaceId: "org_acme" },
      },
      { id: "u_c", settings: null },
    ]);
    await hooks.createOwnWorkspace({ id: "u_a", email: "a@x.dev" });
    await hooks.createOwnWorkspace({ id: "u_b", email: "b@x.dev" });
    fakeDb.seed("member", [
      { id: "m1", organizationId: "org_acme", userId: "u_a", role: "member" },
    ]);
    expect(await hooks.initialWorkspaceId("u_a")).toBe("org_acme");
    // No longer a member of the last one: their own.
    expect(await hooks.initialWorkspaceId("u_b")).toBe(own("u_b"));
    // No workspace at all yet: left to the app.
    expect(await hooks.initialWorkspaceId("u_c")).toBeNull();
  });
});

describe("everyone keeps their own workspace", () => {
  beforeEach(async () => {
    await hooks.createOwnWorkspace({ id: "u_owner", email: "o@x.dev" });
    fakeDb.seed("member", [
      {
        id: "m_guest",
        organizationId: own("u_owner"),
        userId: "u_guest",
        role: "admin",
      },
    ]);
  });

  it("can't delete anyone's own workspace", async () => {
    await expect(hooks.assertDeletable(own("u_owner"))).rejects.toThrow(
      /own workspace/,
    );
    fakeDb.seed("organization", [
      { id: "org_team", name: "Team", slug: "team-x", createdAt: NOW },
    ]);
    fakeDb.seed("member", [
      {
        id: "m_t",
        organizationId: "org_team",
        userId: "u_owner",
        role: "owner",
      },
    ]);
    await expect(hooks.assertDeletable("org_team")).resolves.toBeUndefined();
  });

  it("can't leave it or be removed or demoted from it", () => {
    expect(() =>
      hooks.assertNotOwnMember(own("u_owner"), "u_owner", "nope"),
    ).toThrow("nope");
    // Other members can come and go.
    expect(() =>
      hooks.assertNotOwnMember(own("u_owner"), "u_guest", "nope"),
    ).not.toThrow();
  });
});

describe("deleting a workspace", () => {
  it("hands each row back to its creator's own workspace", async () => {
    await hooks.createOwnWorkspace({ id: "u_alice", email: "alice@x.dev" });
    fakeDb.seed("organization", [
      { id: "org_team", name: "Team", slug: "team-x", createdAt: NOW },
    ]);
    fakeDb.seed("qrCode", [
      {
        id: "c_alice",
        userId: "u_alice",
        organizationId: "org_team",
        slug: "a1",
      },
      // Bob has no own workspace yet (account from before workspaces).
      { id: "c_bob", userId: "u_bob", organizationId: "org_team", slug: "b1" },
      {
        id: "c_other",
        userId: "u_alice",
        organizationId: "org_other",
        slug: "o1",
      },
    ]);
    fakeDb.seed("oauthApp", [
      { id: "app_alice", ownerUserId: "u_alice", organizationId: "org_team" },
    ]);
    await hooks.handRowsBackToCreators("org_team");
    const orgOf = (table: string, id: string) =>
      fakeDb.find(table, { id })?.organizationId;
    expect(orgOf("qrCode", "c_alice")).toBe(own("u_alice"));
    // Left in place: the delete's ON DELETE SET NULL returns it to Bob, and
    // his first visit (or the backfill) moves it into his own workspace.
    expect(orgOf("qrCode", "c_bob")).toBe("org_team");
    expect(orgOf("qrCode", "c_other")).toBe("org_other");
    expect(orgOf("oauthApp", "app_alice")).toBe(own("u_alice"));
    // Short links are untouched.
    expect(fakeDb.find("qrCode", { id: "c_alice" })?.slug).toBe("a1");
  });
});
