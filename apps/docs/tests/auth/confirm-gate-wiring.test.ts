// "Confirm it's you" over HTTP (packages/auth/confirm-gate.ts), against the
// real auth server's endpoint list: the gate is registered, every path it
// gates exists, and the app's server actions call those same endpoints by
// the auth.api names they use. A renamed endpoint (Better Auth's /link-social
// is `linkSocialAccount`, not `linkSocial`) or a moved path fails here
// rather than in production. No database is touched: nothing is called.
import { CONFIRM_GATED_PATHS } from "@repo/auth/confirm-gate";
import { describe, expect, it } from "vitest";

async function loadAuth() {
  const { auth } = await import("@repo/auth/server");
  return auth as {
    api: Record<string, { path?: string }>;
    options: { plugins?: { id: string }[] };
  };
}

describe("the confirm gate on the real auth server", () => {
  it("is registered", async () => {
    const auth = await loadAuth();
    expect(auth.options.plugins?.map((plugin) => plugin.id)).toContain(
      "qrdx-confirm-gate",
    );
  });

  it("gates only paths the server has", async () => {
    const auth = await loadAuth();
    const registered = new Set(
      Object.values(auth.api).map((endpoint) => endpoint.path),
    );
    expect(CONFIRM_GATED_PATHS.filter((path) => !registered.has(path))).toEqual(
      [],
    );
  });

  it("covers the endpoints the app's gated actions call", async () => {
    const auth = await loadAuth();
    // auth.api name (as the app calls it) → the HTTP path the gate lists.
    const called: Record<string, string> = {
      linkSocialAccount: "/link-social", // app/(app)/settings/account/_lib/actions.ts
      unlinkAccount: "/unlink-account",
      deleteOrganization: "/organization/delete", // actions/organizations.ts
      updateMemberRole: "/organization/update-member-role",
      removeMember: "/organization/remove-member",
      createInvitation: "/organization/invite-member",
    };
    for (const [name, path] of Object.entries(called)) {
      expect(auth.api[name]?.path, name).toBe(path);
      expect(CONFIRM_GATED_PATHS, name).toContain(path);
    }
  });
});
