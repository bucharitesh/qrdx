// Adding a Slack or Discord notification webhook asks "Confirm it's you"
// (app/(app)/settings/notifications/_lib/actions.ts): notifications would go to a
// new address. Changing which events an existing one gets, or removing it,
// doesn't ask. The confirmation is the real one
// (lib/account/confirmation-server.tsx) on in-memory tables
// (tests/support/fake-db.ts); the notification store records what it was
// asked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "../support/fake-db";

const state = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock(
  "drizzle-orm",
  async () => (await import("../support/fake-db")).drizzle,
);
vi.mock(
  "@repo/database",
  async () => (await import("../support/fake-db")).repoDatabase,
);
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "user_1", email: "ada@qrdx.test" },
        session: { id: "session_1", createdAt: new Date() },
      }),
    },
  },
}));
vi.mock("@/lib/account/reauth", () => ({ signInCodesAvailable: () => true }));
vi.mock("@/lib/request-guards", () => ({ enforceRateLimits: async () => {} }));
vi.mock("@/lib/shared", () => ({
  getCurrentUserId: async () => "user_1",
  logError: () => {},
}));
vi.mock("@/lib/events/notification-settings", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/events/notification-settings")
  >()),
  addChatTarget: async (
    _userId: string,
    _org: unknown,
    target: { url: string },
  ) => {
    state.calls.push(`add ${target.url}`);
    return { id: "chat_1" };
  },
  updateChatTarget: async (_userId: string, id: string) => {
    state.calls.push(`update ${id}`);
  },
  removeChatTarget: async (_userId: string, id: string) => {
    state.calls.push(`remove ${id}`);
  },
}));

const { recordConfirmation } = await import(
  "@/lib/account/confirmation-server"
);
const notifications = await import(
  "@/app/(app)/settings/notifications/_lib/actions"
);

const REQUIRED = { ok: false, error: "CONFIRMATION_REQUIRED" };
const SLACK = "https://hooks.slack.com/services/T000/B000/XXXX";

beforeEach(() => {
  fakeDb.reset();
  fakeDb.seed("user", [
    { id: "user_1", email: "ada@qrdx.test", twoFactorEnabled: false },
  ]);
  state.calls = [];
});

describe("a notification webhook", () => {
  it("adding one asks first, then adds it", async () => {
    const input = {
      organizationId: null,
      channel: "slack" as const,
      url: SLACK,
      events: ["scan.milestone"],
    };
    expect(await notifications.addNotificationWebhook(input)).toEqual(REQUIRED);
    expect(state.calls).toEqual([]);
    await recordConfirmation({ userId: "user_1", sessionId: "session_1" });
    expect(await notifications.addNotificationWebhook(input)).toEqual({
      ok: true,
      data: { id: "chat_1" },
    });
    expect(state.calls).toEqual([`add ${SLACK}`]);
  });

  it("changing its events or removing it doesn't ask", async () => {
    expect(
      await notifications.updateNotificationWebhook({
        id: "chat_1",
        events: ["scan.milestone"],
      }),
    ).toEqual({ ok: true, data: null });
    expect(
      await notifications.removeNotificationWebhook({ id: "chat_1" }),
    ).toEqual({ ok: true, data: null });
    expect(state.calls).toEqual(["update chat_1", "remove chat_1"]);
  });
});
