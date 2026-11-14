// What people see when their company requires single sign-on
// (packages/auth/ee/sso-required.ts refuses with `sso_required`): the
// sign-in page after Google or GitHub, the email-code panel, "Continue with
// passkey", the second step, an email change, and which sign-ins "Confirm
// it's you" offers. The refusals themselves are tested in
// tests/auth/sso-required.test.ts. Nothing connects anywhere.
import { SSO_REQUIRED_ERROR } from "@repo/auth/sso-required-rules";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInErrorMessage } from "@/app/(app)/(auth)/sign-in/_lib/error-message";

const state = vi.hoisted(() => ({
  problem: null as null | { kind: "off" | "onto"; domain: string },
  bound: false,
  confirmed: true,
  requested: [] as string[],
  problemChecks: [] as string[][],
  linked: ["google", "github"] as string[],
  ssoConfirms: false,
}));

vi.mock("@repo/auth/sso-required", () => ({
  emailChangeSsoProblem: async (userId: string, from: string, to: string) => {
    state.problemChecks.push([userId, from, to]);
    return state.problem;
  },
  boundSsoRequirement: async () =>
    state.bound
      ? {
          providerId: "sso-aaaaaaaaaaaa",
          organizationId: "o",
          domain: "acme.test",
        }
      : null,
}));
vi.mock("@repo/auth/sso", () => ({
  ssoConfirmsFor: async () => state.ssoConfirms,
}));
vi.mock("@repo/auth/keys", () => ({
  keys: () => ({
    GOOGLE_CLIENT_ID: "g",
    GOOGLE_CLIENT_SECRET: "g",
    GITHUB_CLIENT_ID: "h",
    GITHUB_CLIENT_SECRET: "h",
  }),
}));
vi.mock("@repo/database", () => ({
  account: { providerId: "providerId", userId: "userId" },
  database: {
    select: () => ({
      from: () => ({
        where: async () => state.linked.map((providerId) => ({ providerId })),
      }),
    }),
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  ne: () => ({}),
}));
vi.mock("@/lib/feature-availability", () => ({
  isFeatureAvailable: () => true,
}));
vi.mock("@/lib/account/confirmation-server", () => ({
  currentSession: async () => ({
    userId: "user_1",
    email: "ana@acme.test",
    sessionId: "session_1",
    sessionCreatedAt: new Date(),
    requestHeaders: new Headers(),
  }),
  requireRecentConfirmation: async () =>
    state.confirmed ? null : { ok: false, error: "CONFIRMATION_REQUIRED" },
}));
vi.mock("@repo/auth/server", () => ({
  auth: {
    api: {
      requestEmailChangeEmailOTP: async ({
        body,
      }: {
        body: { newEmail: string };
      }) => {
        state.requested.push(body.newEmail);
      },
    },
  },
}));
vi.mock("@repo/auth/email-otp", () => ({
  registerEmailChangeCodeSender: () => {},
}));
vi.mock("@repo/rate-limit", () => ({
  createRateLimiter: () => ({ limit: async () => ({ success: true }) }),
  slidingWindow: () => ({}),
}));
vi.mock("@/lib/auth/email-change-code", () => ({
  sendEmailChangeCode: async () => {},
}));
vi.mock("@/lib/account/email-change-server", () => ({
  afterEmailChanged: async () => {},
}));
vi.mock("@/lib/shared", () => ({ logError: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/server", () => ({ after: () => {} }));

const { ssoEmailChangeMessage, ssoSignInErrorMessage } = await import(
  "@/ee/sso/messages"
);
const { signInFailureMessage } = await import("@/lib/account/passkeys");
const { challengeFailure } = await import("@/lib/auth/two-factor");
const { passkeyStepOutcome } = await import(
  "@/app/(app)/(auth)/components/second-step"
);
const { requestEmailChange } = await import(
  "@/app/(app)/settings/account/_lib/email-change-actions"
);
const { linkedSignInsFor } = await import(
  "@/lib/account/linked-sign-ins-server"
);

beforeEach(() => {
  state.problem = null;
  state.bound = false;
  state.confirmed = true;
  state.requested = [];
  state.problemChecks = [];
  state.linked = ["google", "github"];
  state.ssoConfirms = false;
});

const REQUIRED =
  "Your company requires single sign-on for this address. Sign in with SSO.";

describe("the sign-in screens say why, and point to SSO", () => {
  it("on /sign-in after Google or GitHub, and after an SSO sign-in", () => {
    expect(SSO_REQUIRED_ERROR).toBe("sso_required");
    expect(signInErrorMessage("sso_required", "google")).toBe(REQUIRED);
    expect(signInErrorMessage("sso_required", "github")).toBe(REQUIRED);
    expect(signInErrorMessage("sso_required", null)).toBe(REQUIRED);
    expect(ssoSignInErrorMessage("sso_required")).toBe(REQUIRED);
  });

  it("under Continue with passkey", () => {
    expect(signInFailureMessage({ code: "sso_required", status: 403 })).toBe(
      "Your company requires single sign-on for this account. Sign in with SSO.",
    );
  });

  it("on the second step (a code sign-in that started just before), and it's over", () => {
    for (const mode of ["totp", "backup"] as const) {
      const result = challengeFailure(
        { code: "sso_required", status: 403 },
        mode,
      );
      expect(result.over).toBe(true);
      expect(result.message).toMatch(/requires single sign-on/);
    }
    const passkey = passkeyStepOutcome(
      { ok: false, kind: "server", code: "sso_required", status: 403 } as never,
      { automatic: false },
    );
    expect(passkey).toMatchObject({ over: true, counted: false });
    expect(passkey.message).toMatch(/requires single sign-on/);
  });
});

describe("changing your email", () => {
  it("is refused onto or off a domain that requires SSO, before asking to confirm", async () => {
    state.confirmed = false;
    state.problem = { kind: "off", domain: "acme.test" };
    expect(await requestEmailChange({ newEmail: "ana@gmail.test" })).toEqual({
      ok: false,
      error: ssoEmailChangeMessage(state.problem),
    });
    expect(state.problemChecks).toEqual([
      ["user_1", "ana@acme.test", "ana@gmail.test"],
    ]);
    state.problem = { kind: "onto", domain: "acme.test" };
    const onto = await requestEmailChange({ newEmail: "ana@acme.test.test" });
    expect(onto).toMatchObject({ ok: false });
    expect((onto as { error: string }).error).toMatch(/sign in with SSO/);
    expect(state.requested).toEqual([]);
  });

  it("goes ahead otherwise (after Confirm it's you)", async () => {
    state.confirmed = false;
    expect(await requestEmailChange({ newEmail: "ana@other.test" })).toEqual({
      ok: false,
      error: "CONFIRMATION_REQUIRED",
    });
    state.confirmed = true;
    expect(await requestEmailChange({ newEmail: "ana@other.test" })).toEqual({
      ok: true,
    });
    expect(state.requested).toEqual(["ana@other.test"]);
  });

  it("says plainly which way and where", () => {
    expect(ssoEmailChangeMessage({ kind: "off", domain: "acme.test" })).toBe(
      "Your company requires single sign-on for acme.test, so your account can't move to an address elsewhere. Ask your workspace admin.",
    );
    expect(ssoEmailChangeMessage({ kind: "onto", domain: "acme.test" })).toBe(
      "Your company requires single sign-on for acme.test. To use an address there, sign in with SSO instead.",
    );
  });
});

describe("Confirm it's you by signing in again", () => {
  it("doesn't offer Google or GitHub to someone SSO is required for", async () => {
    const who = { userId: "user_1", email: "ana@acme.test" };
    expect(await linkedSignInsFor(who)).toEqual(["google", "github"]);
    state.bound = true;
    expect(await linkedSignInsFor(who)).toEqual([]);
    state.ssoConfirms = true;
    expect(await linkedSignInsFor(who)).toEqual(["sso"]);
  });
});
