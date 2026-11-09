// No Google or GitHub sign-up from an address the provider hasn't verified
// (packages/auth/verified-sign-up.ts): the rule on its own, then inside a
// real Better Auth (memory adapter) where Google and GitHub are stand-ins
// that accept any token and answer with a chosen profile, so the sign-up,
// sign-in and linking paths run exactly as they do for the real providers.
// And the message the sign-in page shows for it.
import { realpathSync } from "node:fs";
import path from "node:path";
import {
  allUserInfoChecks,
  UNVERIFIED_SIGN_UP_ERROR,
  unverifiedSignUpError,
  validateSocialSignUp,
} from "@repo/auth/verified-sign-up";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  signInErrorMessage,
  socialSignInErrorPath,
} from "@/app/(auth)/sign-in/_lib/error-message";
import { readSignInParams } from "@/app/(auth)/sign-in/_lib/params";
import { confirmSignInErrorMessage } from "@/lib/account/confirmation";

type Check = Parameters<typeof validateSocialSignUp>[0];

const check = (
  method: string,
  action: string,
  emailVerified: unknown,
  providerId = "github",
) =>
  validateSocialSignUp(
    {
      user: { email: "ada@qrdx.test", emailVerified },
      source: {
        method,
        action,
        ...(method === "oauth"
          ? { oauth: { providerId } }
          : method.startsWith("sso")
            ? { sso: { providerId } }
            : {}),
      },
    } as Check,
    {} as never,
  );

describe("the rule", () => {
  it("refuses a Google or GitHub sign-up the provider hasn't verified", async () => {
    for (const verified of [false, undefined, null, "true", 1]) {
      expect(
        await check("oauth", "create-user", verified, "github"),
        String(verified),
      ).toMatchObject({ error: "github_email_unverified" });
      expect(
        await check("oauth", "create-user", verified, "google"),
        String(verified),
      ).toMatchObject({ error: "google_email_unverified" });
    }
    expect(
      await check("oauth", "create-user", false, "something-else"),
    ).toMatchObject({ error: "oauth_email_unverified" });
  });

  it("lets a verified sign-up through", async () => {
    expect(await check("oauth", "create-user", true)).toBeUndefined();
  });

  it("leaves signing in and linking alone", async () => {
    for (const action of ["sign-in", "link-account"]) {
      expect(await check("oauth", action, false)).toBeUndefined();
    }
  });

  it("leaves every other way in alone", async () => {
    for (const method of ["email-otp", "sso-oidc", "sso-saml", "admin"]) {
      expect(await check(method, "create-user", false), method).toBeUndefined();
    }
  });

  it("names the provider in its code", () => {
    expect(unverifiedSignUpError("github")).toBe(
      UNVERIFIED_SIGN_UP_ERROR.github,
    );
    expect(unverifiedSignUpError("google")).toBe(
      UNVERIFIED_SIGN_UP_ERROR.google,
    );
    expect(unverifiedSignUpError(undefined)).toBe(
      UNVERIFIED_SIGN_UP_ERROR.other,
    );
  });

  it("combined checks run in order and the first refusal wins", async () => {
    const calls: string[] = [];
    const combined = allUserInfoChecks(
      () => {
        calls.push("first");
        return undefined;
      },
      async () => {
        calls.push("second");
        return { error: "second_says_no" };
      },
      () => {
        calls.push("third");
        return { error: "third_says_no" };
      },
    );
    expect(await combined({} as Check, {} as never)).toEqual({
      error: "second_says_no",
    });
    expect(calls).toEqual(["first", "second"]);
    expect(
      await allUserInfoChecks(() => undefined)({} as Check, {} as never),
    ).toBeUndefined();
  });
});

// ─── Inside Better Auth ─────────────────────────────────────────────────────

const betterAuthDir = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/better-auth",
  ),
);
const ORIGIN = "http://localhost:3000";

/** What the stand-in provider answers for a token. */
const profiles = new Map<
  string,
  { id: string; email: string; emailVerified: boolean | undefined }
>();
let auth: any;
let db: Record<string, Record<string, unknown>[]>;

function standIn() {
  return {
    clientId: "test-client",
    clientSecret: "test-secret",
    verifyIdToken: async () => true,
    getUserInfo: async (token: { idToken?: string }) => {
      const profile = profiles.get(token.idToken ?? "");
      if (!profile) return null;
      return {
        user: {
          id: profile.id,
          name: "Ada",
          email: profile.email,
          emailVerified: profile.emailVerified,
        },
        data: { id: profile.id, sub: profile.id, email: profile.email },
      };
    },
  };
}

beforeAll(async () => {
  const { betterAuth } = await import(`${betterAuthDir}/dist/index.mjs`);
  const { memoryAdapter } = await import(
    `${betterAuthDir}/dist/adapters/memory-adapter/index.mjs`
  );
  db = { user: [], session: [], account: [], verification: [] };
  auth = betterAuth({
    baseURL: ORIGIN,
    secret: "test-secret-at-least-32-characters-long",
    database: memoryAdapter(db),
    rateLimit: { enabled: false },
    socialProviders: { github: standIn(), google: standIn() },
    user: { validateUserInfo: validateSocialSignUp },
  });
});

beforeEach(() => {
  for (const rows of Object.values(db)) rows.length = 0;
  profiles.clear();
});

async function signIn(provider: "github" | "google", token: string) {
  const response = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ provider, idToken: { token } }),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    json: text ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

describe("signing up through Better Auth", () => {
  it("refuses an unverified GitHub address and creates nothing", async () => {
    profiles.set("t", {
      id: "gh_1",
      email: "ada@qrdx.test",
      emailVerified: false,
    });
    const reply = await signIn("github", "t");
    expect(reply.status).toBe(403);
    expect(reply.json?.code).toBe("github_email_unverified");
    expect(db.user).toEqual([]);
    expect(db.account).toEqual([]);
    expect(db.session).toEqual([]);
  });

  it("refuses a Google answer without email_verified", async () => {
    profiles.set("t", {
      id: "g_1",
      email: "ada@qrdx.test",
      emailVerified: undefined,
    });
    const reply = await signIn("google", "t");
    expect(reply.status).toBe(403);
    expect(reply.json?.code).toBe("google_email_unverified");
    expect(db.user).toEqual([]);
  });

  it("creates the account when the provider verified the address", async () => {
    profiles.set("t", {
      id: "gh_1",
      email: "ada@qrdx.test",
      emailVerified: true,
    });
    const reply = await signIn("github", "t");
    expect(reply.status).toBe(200);
    expect(db.user).toHaveLength(1);
    expect(db.user[0].emailVerified).toBe(true);
    expect(db.account).toHaveLength(1);
  });

  it("still signs in to an account already linked, even if the address is now unverified there", async () => {
    profiles.set("t", {
      id: "gh_1",
      email: "ada@qrdx.test",
      emailVerified: true,
    });
    expect((await signIn("github", "t")).status).toBe(200);
    profiles.set("t", {
      id: "gh_1",
      email: "ada@qrdx.test",
      emailVerified: false,
    });
    const again = await signIn("github", "t");
    expect(again.status).toBe(200);
    expect(db.user).toHaveLength(1);
    expect(db.session).toHaveLength(2);
  });

  it("never links an unverified address to an existing account (Better Auth's own rule)", async () => {
    profiles.set("verified", {
      id: "gh_1",
      email: "ada@qrdx.test",
      emailVerified: true,
    });
    await signIn("github", "verified");
    profiles.set("other", {
      id: "g_9",
      email: "ada@qrdx.test",
      emailVerified: false,
    });
    const reply = await signIn("google", "other");
    expect(reply.status).toBe(401);
    expect(db.account).toHaveLength(1);
  });
});

describe("what the sign-in page says", () => {
  it("explains the refusal, naming the provider", () => {
    expect(signInErrorMessage("github_email_unverified", "github")).toBe(
      "GitHub hasn't verified this email address, so QRdx can't create an account with it. Verify it in your GitHub email settings and try again, or sign in with an email code.",
    );
    expect(signInErrorMessage("google_email_unverified", "google")).toMatch(
      /^Google hasn't verified this email address/,
    );
    expect(signInErrorMessage("oauth_email_unverified", null)).toMatch(
      /isn't verified/,
    );
  });

  it("names Google or GitHub for their other failures", () => {
    expect(signInErrorMessage("invalid_code", "github")).toBe(
      "GitHub sign-in didn't work. Try again, or sign in another way.",
    );
    expect(signInErrorMessage("account_not_linked", "google")).toMatch(
      /isn't linked to Google/,
    );
    expect(signInErrorMessage("state_mismatch", "google")).toMatch(
      /took too long/,
    );
    expect(signInErrorMessage("access_denied", "github")).toBe(
      "Sign-in was cancelled.",
    );
  });

  it("keeps single sign-on's messages when it isn't Google or GitHub", () => {
    expect(signInErrorMessage("sso_email_unverified", null)).toMatch(
      /company's sign-in system/,
    );
    expect(signInErrorMessage("whatever", null)).toBe(
      "Single sign-on didn't work. Try again, or sign in another way.",
    );
  });

  it("Google and GitHub come back to /sign-in with where they were going", () => {
    expect(socialSignInErrorPath("/dashboard/codes?x=1", "github")).toBe(
      "/sign-in?next=%2Fdashboard%2Fcodes%3Fx%3D1&via=github",
    );
    expect(socialSignInErrorPath("https://evil.example/", "google")).toBe(
      "/sign-in?via=google",
    );
    const url = new URL(
      `${socialSignInErrorPath("/playground", "github")}&error=github_email_unverified`,
      ORIGIN,
    );
    const params = readSignInParams(Object.fromEntries(url.searchParams));
    expect(params).toMatchObject({
      next: "/playground",
      error: "github_email_unverified",
      via: "github",
    });
    expect(readSignInParams({ via: "facebook" }).via).toBeNull();
    expect(readSignInParams({ via: ["google", "github"] }).via).toBe("google");
  });

  it("signing in again to confirm it's you says it isn't the linked account", () => {
    for (const code of Object.values(UNVERIFIED_SIGN_UP_ERROR)) {
      expect(confirmSignInErrorMessage(code)).toMatch(/isn't linked/);
    }
  });
});
