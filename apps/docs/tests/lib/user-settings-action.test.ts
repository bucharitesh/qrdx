// updateUserSettings (actions/user-settings.ts) is a public server action:
// only known settings may reach user.settings. Nothing connects to a database.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  stored: { keyboardShortcuts: true } as Record<string, unknown>,
  written: null as Record<string, unknown> | null,
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@repo/auth/server", () => ({
  auth: { api: { getSession: async () => ({ user: { id: "user_1" } }) } },
}));
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
vi.mock("@repo/database/schema", () => ({ user: { id: "user.id" } }));
vi.mock("@repo/database", () => ({
  database: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ settings: state.stored }],
        }),
      }),
    }),
    update: () => ({
      set: (values: { settings: Record<string, unknown> }) => ({
        where: async () => {
          state.written = values.settings;
        },
      }),
    }),
  },
}));

const { updateUserSettings } = await import("@/actions/user-settings");

beforeEach(() => {
  state.stored = { keyboardShortcuts: true };
  state.written = null;
});

describe("updateUserSettings", () => {
  it("saves known settings", async () => {
    const result = await updateUserSettings({ keyboardShortcuts: false });
    expect(result).toEqual({
      success: true,
      settings: { keyboardShortcuts: false },
    });
    expect(state.written).toEqual({ keyboardShortcuts: false });
  });

  it("rejects unknown keys and wrong types without writing", async () => {
    const extra = { keyboardShortcuts: false, blob: "x".repeat(1000) };
    expect(
      await updateUserSettings(
        extra as unknown as { keyboardShortcuts: boolean },
      ),
    ).toEqual({ success: false });
    expect(
      await updateUserSettings({
        keyboardShortcuts: "yes",
      } as unknown as { keyboardShortcuts: boolean }),
    ).toEqual({ success: false });
    expect(state.written).toBeNull();
  });
});
