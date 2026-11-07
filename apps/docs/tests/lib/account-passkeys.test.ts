// Passkeys: where they work (relying party and page origin), QRdx's rules on
// top of Better Auth's plugin (user verification required, no session from
// adding one), the settings list and messages, and the notice email.

import { render } from "@react-email/render";
import {
  cookiesToSet,
  PASSKEY_SIGN_IN_PATH,
  passkeyOptions,
  passkeyPolicy,
  refuseWithoutUserVerification,
  requireUserVerification,
  SERVER_ONLY_PASSKEY_PATHS,
} from "@repo/auth/passkey";
import { isPasskeyOrigin, passkeyRelyingParty } from "@repo/auth/passkey-rp";
import { signInMethodForPath } from "@repo/auth/sign-in-method";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import {
  browserFailureMessage,
  defaultPasskeyName,
  deliverPasskeyNotice,
  normalizePasskeyName,
  PASSKEY_MESSAGES,
  registrationFailure,
  signInFailureMessage,
  toPasskeyViews,
} from "@/lib/account/passkeys";
import {
  PASSKEY_NOTICE_SUBJECTS,
  PasskeyNoticeEmail,
} from "@/lib/email/templates/passkey-notice";
import { passkeysWorkOn } from "@/lib/passkeys";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

describe("relying party", () => {
  it("is the app's host and origin, from BETTER_AUTH_URL first", () => {
    expect(
      passkeyRelyingParty({ BETTER_AUTH_URL: "https://qrdx.dev" }),
    ).toEqual({ rpID: "qrdx.dev", origin: "https://qrdx.dev" });
    expect(
      passkeyRelyingParty({ NEXT_PUBLIC_APP_URL: "http://localhost:3112/" }),
    ).toEqual({ rpID: "localhost", origin: "http://localhost:3112" });
    expect(
      passkeyRelyingParty({
        BETTER_AUTH_URL: "https://qr.example.com/",
        NEXT_PUBLIC_APP_URL: "https://qr.example.com",
      }),
    ).toEqual({ rpID: "qr.example.com", origin: "https://qr.example.com" });
  });

  it("is null where passkeys can't work", () => {
    for (const env of [
      {},
      { NEXT_PUBLIC_APP_URL: "  " },
      { NEXT_PUBLIC_APP_URL: "http://qr.example.com" },
      { NEXT_PUBLIC_APP_URL: "https://10.0.0.5" },
      { NEXT_PUBLIC_APP_URL: "http://[::1]:3000" },
      { NEXT_PUBLIC_APP_URL: "ftp://qrdx.dev" },
      {
        BETTER_AUTH_URL: "https://qrdx.dev",
        NEXT_PUBLIC_APP_URL: "https://www.qrdx.dev",
      },
    ]) {
      expect(passkeyRelyingParty(env), JSON.stringify(env)).toBeNull();
    }
  });

  it("accepts only the app's exact origin (never a preview URL or subdomain)", () => {
    const rp = passkeyRelyingParty({ BETTER_AUTH_URL: "https://qrdx.dev" });
    expect(isPasskeyOrigin(rp, "https://qrdx.dev")).toBe(true);
    expect(isPasskeyOrigin(rp, "https://www.qrdx.dev")).toBe(false);
    expect(isPasskeyOrigin(rp, "https://qrdx-git-x.vercel.app")).toBe(false);
    expect(isPasskeyOrigin(rp, "http://qrdx.dev")).toBe(false);
    expect(isPasskeyOrigin(null, "https://qrdx.dev")).toBe(false);
    expect(isPasskeyOrigin(rp, null)).toBe(false);
  });

  it("is read on the client from NEXT_PUBLIC_APP_URL", () => {
    // vitest.config.ts sets NEXT_PUBLIC_APP_URL=http://localhost:3000
    expect(passkeysWorkOn("http://localhost:3000")).toBe(true);
    expect(passkeysWorkOn("http://localhost:3112")).toBe(false);
  });
});

describe("plugin options", () => {
  it("pin rpID and origin, never the request's Origin header", () => {
    const options = passkeyOptions({
      rpID: "qrdx.dev",
      origin: "https://qrdx.dev",
    });
    expect(options.rpID).toBe("qrdx.dev");
    expect(options.origin).toBe("https://qrdx.dev");
    expect(options.rpName).toBe("QRdx");
  });

  it("fall back to a host that can't exist when the URL can't carry passkeys", () => {
    const options = passkeyOptions(null);
    expect(options.origin).toMatch(/^https:\/\/[a-z-]+\.invalid$/);
    expect(options.rpID).toMatch(/\.invalid$/);
  });

  it("register discoverable credentials with user verification", () => {
    expect(passkeyOptions(null).authenticatorSelection).toEqual({
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    });
  });

  it("refuse a sign-in whose authenticator didn't verify the person", async () => {
    const options = passkeyOptions(null);
    const verify = (userVerified: boolean) =>
      options.authentication?.afterVerification?.({
        verification: { authenticationInfo: { userVerified } },
      } as never);
    await expect(async () => verify(false)).rejects.toMatchObject({
      statusCode: 401,
      body: { code: "PASSKEY_USER_VERIFICATION_REQUIRED" },
    });
    expect(await verify(true)).toBeUndefined();
  });

  it("refuse to add a passkey that didn't verify the person", async () => {
    const options = passkeyOptions(null);
    const verify = (userVerified: boolean | undefined) =>
      options.registration?.afterVerification?.({
        verification: {
          registrationInfo:
            userVerified === undefined ? undefined : { userVerified },
        },
      } as never);
    await expect(async () => verify(false)).rejects.toMatchObject({
      body: { code: "PASSKEY_USER_VERIFICATION_REQUIRED" },
    });
    await expect(async () => verify(undefined)).rejects.toMatchObject({
      body: { code: "PASSKEY_USER_VERIFICATION_REQUIRED" },
    });
    expect(await verify(true)).toBeUndefined();
    expect(() => refuseWithoutUserVerification(true)).not.toThrow();
  });

  it("ask the browser for user verification on sign-in", () => {
    expect(
      requireUserVerification({
        challenge: "abc",
        userVerification: "preferred",
      }),
    ).toEqual({ challenge: "abc", userVerification: "required" });
  });

  it("keep management off HTTP and sign-in on it", () => {
    expect(SERVER_ONLY_PASSKEY_PATHS).toEqual([
      "/passkey/generate-register-options",
      "/passkey/verify-registration",
      "/passkey/update-passkey",
      "/passkey/delete-passkey",
    ]);
    expect(SERVER_ONLY_PASSKEY_PATHS).not.toContain(PASSKEY_SIGN_IN_PATH);
    expect(SERVER_ONLY_PASSKEY_PATHS).not.toContain(
      "/passkey/generate-authenticate-options",
    );
  });

  it("match their hooks to the right paths", () => {
    const { hooks } = passkeyPolicy();
    const before = hooks.before[0];
    const after = hooks.after[0];
    expect(
      before.matcher({ path: "/passkey/verify-registration" } as never),
    ).toBe(true);
    expect(before.matcher({ path: PASSKEY_SIGN_IN_PATH } as never)).toBe(false);
    expect(
      after.matcher({
        path: "/passkey/generate-authenticate-options",
      } as never),
    ).toBe(true);
    expect(
      after.matcher({ path: "/passkey/generate-register-options" } as never),
    ).toBe(false);
  });
});

describe("last used sign-in method", () => {
  it("names passkeys, workspace SSO and email codes; leaves the rest to the plugin", () => {
    expect(signInMethodForPath("/passkey/verify-authentication")).toBe(
      "passkey",
    );
    expect(signInMethodForPath("/sso/callback/:providerId")).toBe("sso");
    expect(signInMethodForPath("/sso/callback")).toBe("sso");
    expect(signInMethodForPath("/sso/saml2/sp/acs/:providerId")).toBe("sso");
    expect(signInMethodForPath("/sign-in/email-otp")).toBe("email-otp");
    // Starting SSO or a passkey sign-in isn't a sign-in yet.
    expect(signInMethodForPath("/sign-in/sso")).toBeNull();
    expect(
      signInMethodForPath("/passkey/generate-authenticate-options"),
    ).toBeNull();
    expect(signInMethodForPath("/callback/:id")).toBeNull();
    expect(signInMethodForPath(undefined)).toBeNull();
  });
});

describe("challenge cookie hand-off", () => {
  it("passes on every cookie an auth.api call set, with its attributes", () => {
    const headers = new Headers();
    headers.append(
      "set-cookie",
      "better-auth.better-auth-passkey=tok.sig; Max-Age=300; Path=/; HttpOnly; SameSite=Lax",
    );
    expect(cookiesToSet(headers)).toEqual([
      {
        name: "better-auth.better-auth-passkey",
        value: "tok.sig",
        options: expect.objectContaining({
          maxAge: 300,
          path: "/",
          httpOnly: true,
          sameSite: "lax",
        }),
      },
    ]);
    expect(cookiesToSet(new Headers())).toEqual([]);
  });
});

describe("settings list", () => {
  const formatDate = (date: Date) => date.toISOString().slice(0, 10);

  it("names a new passkey after the browser and OS, like Sessions", () => {
    expect(defaultPasskeyName(CHROME_MAC)).toBe("Chrome on macOS");
    expect(defaultPasskeyName(SAFARI_IPHONE)).toBe("Safari on iOS");
    expect(defaultPasskeyName(null)).toBe("Passkey");
  });

  it("cleans names: trimmed, single-spaced, at most 64 characters", () => {
    expect(normalizePasskeyName("  Work   laptop ")).toBe("Work laptop");
    expect(normalizePasskeyName("   ")).toBeNull();
    expect(normalizePasskeyName(42)).toBeNull();
    expect(normalizePasskeyName("x".repeat(100))).toHaveLength(64);
  });

  it("lists newest first, synced or device-bound, with the provider when known", () => {
    const views = toPasskeyViews(
      [
        {
          id: "old",
          name: "YubiKey",
          createdAt: new Date("2026-01-02T00:00:00Z"),
          deviceType: "singleDevice",
          backedUp: false,
          aaguid: null,
        },
        {
          id: "new",
          name: null,
          createdAt: new Date("2026-11-05T00:00:00Z"),
          deviceType: "multiDevice",
          backedUp: true,
          aaguid: "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4",
        },
      ],
      {
        formatDate,
        providerName: (aaguid) =>
          aaguid ? "Google Password Manager" : undefined,
      },
    );
    expect(views).toEqual([
      {
        id: "new",
        name: "Google Password Manager",
        added: "Added 2026-11-05",
        synced: true,
        provider: "Google Password Manager",
      },
      {
        id: "old",
        name: "YubiKey",
        added: "Added 2026-01-02",
        synced: false,
        provider: null,
      },
    ]);
  });

  it("explains failures without raw errors", () => {
    expect(
      registrationFailure({ body: { code: "SESSION_NOT_FRESH" } }),
    ).toEqual({ message: PASSKEY_MESSAGES.reauth, reauth: true });
    expect(
      registrationFailure({
        body: { code: "PASSKEY_USER_VERIFICATION_REQUIRED" },
      })?.message,
    ).toBe(PASSKEY_MESSAGES.noUserVerification);
    expect(registrationFailure(new Error("boom"))).toBeNull();
    expect(
      browserFailureMessage("ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED"),
    ).toBe(PASSKEY_MESSAGES.alreadyAdded);
    expect(browserFailureMessage("ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY")).toBe(
      PASSKEY_MESSAGES.cancelled,
    );
    expect(browserFailureMessage(undefined)).toBe(PASSKEY_MESSAGES.failed);
  });

  it("stays quiet when a sign-in prompt is closed, and explains the rest", () => {
    expect(signInFailureMessage({ code: "AUTH_CANCELLED" })).toBeNull();
    expect(signInFailureMessage({ code: "ERROR_CEREMONY_ABORTED" })).toBeNull();
    expect(
      signInFailureMessage({ code: "PASSKEY_USER_VERIFICATION_REQUIRED" }),
    ).toMatch(/PIN, fingerprint or face/);
    expect(signInFailureMessage({ code: "PASSKEY_NOT_FOUND" })).toMatch(
      /isn't linked/,
    );
    expect(signInFailureMessage({ status: 429 })).toMatch(/Too many tries/);
  });
});

describe("notice email", () => {
  it("names the passkey, links only to settings and support", async () => {
    for (const change of ["added", "removed"] as const) {
      const element = createElement(PasskeyNoticeEmail, {
        change,
        passkeyName: "Chrome on macOS",
      });
      const [html, text] = await Promise.all([
        render(element),
        render(element, { plainText: true }),
      ]);
      expect(text.toLowerCase()).toContain(
        PASSKEY_NOTICE_SUBJECTS[change].toLowerCase(),
      );
      expect(text).toContain("/settings/account#two-factor");
      expect(text).not.toContain("//settings");
      expect(text).toContain("Chrome on macOS");
      expect(text).toMatch(/If this wasn't you/);
      expect(text).not.toMatch(/Unsubscribe/);
      const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
      for (const href of hrefs) {
        expect(
          href === "mailto:support@qrdx.dev" ||
            /^https?:\/\/[^/]+(\/settings\/account#two-factor)?\/?$/.test(href),
          href,
        ).toBe(true);
      }
    }
  });

  it("is logged in dev, emailed where delivery is on, and never throws", async () => {
    const lines: string[] = [];
    const deps = {
      nodeEnv: "development",
      deliveryAllowed: false,
      log: (line: string) => lines.push(line),
      send: async () => ({ sent: true }),
    };
    const notice = { email: "ada@qrdx.test", subject: "A passkey was added" };
    expect(await deliverPasskeyNotice(notice, deps)).toBe("logged");
    expect(lines[0]).toMatch(
      /^\[dev only\] QRdx security notice for ada@qrdx\.test: "A passkey was added"/,
    );
    expect(
      await deliverPasskeyNotice(notice, {
        ...deps,
        nodeEnv: "production",
        deliveryAllowed: true,
      }),
    ).toBe("emailed");
    expect(
      await deliverPasskeyNotice(notice, {
        ...deps,
        nodeEnv: "production",
        deliveryAllowed: true,
        send: async () => {
          throw new Error("resend down");
        },
      }),
    ).toBe("not-sent");
    expect(
      await deliverPasskeyNotice(notice, { ...deps, nodeEnv: "production" }),
    ).toBe("not-sent");
  });
});
