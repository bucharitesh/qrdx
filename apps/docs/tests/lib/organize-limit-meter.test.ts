// Organize actions' errors (app/(app)/dashboard/codes/_lib/organize.ts): only the
// plan's active-code cap (402) is marked as a meter, so the app shows its
// limit card and upgrade; folder and tag caps (400) are the same on every
// plan and get no upgrade.
import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/auth/server", () => ({ auth: { api: {} } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { organizeFailure } = await import("@/app/(app)/dashboard/codes/_lib/organize");
const { limitReached } = await import("@/app/(app)/dashboard/codes/_lib/qr-codes");
const { HttpError } = await import("@/lib/error-response");

describe("organizeFailure", () => {
  it("marks the active-code cap as the dynamicCodes meter", () => {
    const result = organizeFailure(limitReached(10), "restoreCodes");
    expect(result).toMatchObject({
      success: false,
      error: { code: "LIMIT_REACHED", meter: "dynamicCodes" },
    });
  });

  it("leaves folder and tag caps without a meter", () => {
    const result = organizeFailure(
      new HttpError(400, "LIMIT_REACHED", "You can have up to 100 folders."),
      "createFolder",
    );
    expect(result).toEqual({
      success: false,
      error: {
        code: "LIMIT_REACHED",
        message: "You can have up to 100 folders.",
      },
    });
  });
});
