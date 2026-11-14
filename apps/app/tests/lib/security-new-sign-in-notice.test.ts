// The new sign-in alert's wording and delivery (lib/account/
// new-sign-in-notice.ts): how the sign-in is named, and that local dev logs
// it instead of emailing. Nothing is sent.
import { describe, expect, it } from "vitest";
import {
  deliverNewSignInNotice,
  isReservedEmailAddress,
  signInMethodLabel,
} from "@/lib/account/new-sign-in-notice";

describe("signInMethodLabel", () => {
  it("names each way in, and the second step that finished it", () => {
    expect(signInMethodLabel("google", null)).toBe("Google");
    expect(signInMethodLabel("github", null)).toBe("GitHub");
    expect(signInMethodLabel("passkey", null)).toBe("Passkey");
    expect(signInMethodLabel("sso", null)).toBe("Single sign-on");
    expect(signInMethodLabel("email-otp", "passkey")).toBe(
      "Email code, then a passkey",
    );
    expect(signInMethodLabel("google", "totp")).toBe(
      "Google, then an authenticator code",
    );
    expect(signInMethodLabel("sso", "backup-code")).toBe(
      "Single sign-on, then a backup code",
    );
  });

  it("says nothing it doesn't know", () => {
    expect(signInMethodLabel(null, "totp")).toBeNull();
    expect(signInMethodLabel("carrier-pigeon", null)).toBeNull();
  });
});

describe("deliverNewSignInNotice", () => {
  const notice = {
    email: "ada@qrdx.test",
    summary: "Chrome on macOS, Mumbai, India, 203.0.113.24, Email code",
  };

  function deps(
    overrides: Partial<Parameters<typeof deliverNewSignInNotice>[1]>,
  ) {
    const calls = { sent: 0, logs: [] as string[] };
    return {
      calls,
      deps: {
        nodeEnv: "development",
        deliveryAllowed: false,
        send: async () => {
          calls.sent += 1;
          return { sent: true };
        },
        log: (line: string) => calls.logs.push(line),
        ...overrides,
      },
    };
  }

  it("logs the alert in dev instead of emailing it", async () => {
    const { deps: d, calls } = deps({});
    expect(await deliverNewSignInNotice(notice, d)).toBe("logged");
    expect(calls.sent).toBe(0);
    expect(calls.logs).toEqual([
      "[dev only] QRdx new sign-in alert for ada@qrdx.test: Chrome on macOS, Mumbai, India, 203.0.113.24, Email code (not emailed: delivery is off outside production)",
    ]);
  });

  it("emails where delivery is on, and reports a failed send", async () => {
    // A real-looking address: reserved test ones are never emailed (below).
    const real = { ...notice, email: "ada@qrdx.dev" };
    const on = deps({ nodeEnv: "production", deliveryAllowed: true });
    expect(await deliverNewSignInNotice(real, on.deps)).toBe("emailed");
    expect(on.calls.sent).toBe(1);
    expect(on.calls.logs).toEqual([]);

    const down = deps({
      nodeEnv: "production",
      deliveryAllowed: true,
      send: async () => {
        throw new Error("Resend is down");
      },
    });
    expect(await deliverNewSignInNotice(real, down.deps)).toBe("not-sent");

    const off = deps({ nodeEnv: "production" });
    expect(await deliverNewSignInNotice(real, off.deps)).toBe("not-sent");
    expect(off.calls.logs).toEqual([]);
  });

  it("never emails a reserved test address, even where delivery is on", async () => {
    for (const email of [
      "e2e-alerts@qrdx.test",
      "ada@example.com",
      "ada@mail.example.org",
      "ada@example.net",
      "ada@foo.invalid",
      "ada@host.localhost",
      "Ada@QRDX.TEST",
    ]) {
      expect(isReservedEmailAddress(email), email).toBe(true);
      const on = deps({ nodeEnv: "production", deliveryAllowed: true });
      expect(await deliverNewSignInNotice({ ...notice, email }, on.deps)).toBe(
        "skipped",
      );
      expect(on.calls.sent).toBe(0);
    }
    for (const email of [
      "ada@gmail.com",
      "ada@examples.com",
      "ada@test.com",
      "ada@qrdx.dev",
    ]) {
      expect(isReservedEmailAddress(email), email).toBe(false);
    }
    // Local dev still logs it, so e2e runs can read it.
    const dev = deps({});
    expect(
      await deliverNewSignInNotice(
        { ...notice, email: "e2e-alerts@qrdx.test" },
        dev.deps,
      ),
    ).toBe("logged");
  });

  it("never emails from tests", async () => {
    const { deps: d, calls } = deps({ nodeEnv: "test", deliveryAllowed: true });
    expect(await deliverNewSignInNotice(notice, d)).toBe("logged");
    expect(calls.sent).toBe(0);
  });
});
