import { describe, expect, it } from "vitest";
import {
  canChangeEmailNow,
  confirmFailure,
  deliverEmailChangedNotice,
  EMAIL_CHANGE_MESSAGES,
  EMAIL_CHANGE_RECENT_SIGN_IN_MS,
  isSameEmail,
  type NoticeDeliveryDeps,
  normalizeEmail,
  requestFailureMessage,
} from "@/lib/account/email-change";

// A Better Auth APIError as auth.api throws it.
const apiError = (statusCode: number, body: Record<string, string>) =>
  Object.assign(new Error(body.message ?? "error"), {
    name: "APIError",
    statusCode,
    body,
  });

describe("canChangeEmailNow", () => {
  const now = new Date("2026-11-01T12:00:00Z");

  it("allows a session signed in within the last day", () => {
    expect(canChangeEmailNow(new Date("2026-11-01T11:59:00Z"), now)).toBe(true);
    expect(
      canChangeEmailNow(
        new Date(now.getTime() - EMAIL_CHANGE_RECENT_SIGN_IN_MS),
        now,
      ),
    ).toBe(true);
  });

  it("asks an older session to sign in again", () => {
    expect(
      canChangeEmailNow(
        new Date(now.getTime() - EMAIL_CHANGE_RECENT_SIGN_IN_MS - 1),
        now,
      ),
    ).toBe(false);
    expect(canChangeEmailNow(new Date("2026-10-20T12:00:00Z"), now)).toBe(
      false,
    );
  });
});

describe("addresses", () => {
  it("compares addresses ignoring case and surrounding spaces", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
    expect(isSameEmail("ADA@example.com", "ada@example.com ")).toBe(true);
    expect(isSameEmail("ada+new@example.com", "ada@example.com")).toBe(false);
  });
});

describe("requestFailureMessage", () => {
  it("words rate limits and delivery failures", () => {
    expect(
      requestFailureMessage(
        apiError(429, { code: "EMAIL_CHANGE_CODE_RATE_LIMITED" }),
      ),
    ).toBe(EMAIL_CHANGE_MESSAGES.codeRateLimited);
    expect(
      requestFailureMessage(
        apiError(500, { code: "EMAIL_CHANGE_CODE_NOT_SENT" }),
      ),
    ).toBe(EMAIL_CHANGE_MESSAGES.notSent);
    expect(
      requestFailureMessage(apiError(400, { code: "INVALID_EMAIL" })),
    ).toBe(EMAIL_CHANGE_MESSAGES.invalidEmail);
  });

  it("leaves unknown errors to the caller (logged as unexpected)", () => {
    expect(requestFailureMessage(new Error("boom"))).toBeNull();
    expect(requestFailureMessage(null)).toBeNull();
  });
});

describe("confirmFailure", () => {
  it("keeps the code usable after a wrong guess", () => {
    expect(confirmFailure(apiError(400, { code: "INVALID_OTP" }))).toEqual({
      message: EMAIL_CHANGE_MESSAGES.wrongCode,
      codeDead: false,
    });
  });

  it("asks for a new code once the code is used up", () => {
    expect(confirmFailure(apiError(400, { code: "OTP_EXPIRED" }))).toEqual({
      message: EMAIL_CHANGE_MESSAGES.expired,
      codeDead: true,
    });
    expect(
      confirmFailure(apiError(403, { code: "TOO_MANY_ATTEMPTS" }))?.codeDead,
    ).toBe(true);
  });

  it("says when another account took the address meanwhile", () => {
    // Better Auth checks again after a valid code, so this leaks nothing.
    expect(
      confirmFailure(apiError(400, { message: "Email already in use" })),
    ).toEqual({ message: EMAIL_CHANGE_MESSAGES.taken, codeDead: true });
  });

  it("leaves unknown errors to the caller", () => {
    expect(confirmFailure(new Error("boom"))).toBeNull();
  });
});

describe("deliverEmailChangedNotice", () => {
  const change = {
    previousEmail: "ada@example.com",
    newEmail: "ada+new@example.com",
  };

  function fakeDeps(overrides: Partial<NoticeDeliveryDeps>) {
    const calls = { sent: 0, logs: [] as string[] };
    const deps: NoticeDeliveryDeps = {
      nodeEnv: "development",
      deliveryAllowed: false,
      send: async () => {
        calls.sent += 1;
        return { sent: true };
      },
      log: (line) => calls.logs.push(line),
      ...overrides,
    };
    return { deps, calls };
  }

  it("emails the old address where delivery is on", async () => {
    const { deps, calls } = fakeDeps({
      nodeEnv: "production",
      deliveryAllowed: true,
    });
    expect(await deliverEmailChangedNotice(change, deps)).toBe("emailed");
    expect(calls.sent).toBe(1);
    expect(calls.logs).toEqual([]);
  });

  it("writes it to the console in local dev instead", async () => {
    const { deps, calls } = fakeDeps({});
    expect(await deliverEmailChangedNotice(change, deps)).toBe("logged");
    expect(calls.sent).toBe(0);
    expect(calls.logs[0]).toMatch(
      /^\[dev only\] QRdx email-change notice for ada@example\.com: .*changed to ada\+new@example\.com/,
    );
  });

  it("never throws: the change has already happened", async () => {
    const { deps } = fakeDeps({
      nodeEnv: "production",
      deliveryAllowed: true,
      send: async () => {
        throw new Error("Resend is down");
      },
    });
    expect(await deliverEmailChangedNotice(change, deps)).toBe("not-sent");
    const off = fakeDeps({ nodeEnv: "production" });
    expect(await deliverEmailChangedNotice(change, off.deps)).toBe("not-sent");
    expect(off.calls.logs).toEqual([]);
  });

  it("never emails from tests", async () => {
    const { deps, calls } = fakeDeps({
      nodeEnv: "test",
      deliveryAllowed: true,
    });
    expect(await deliverEmailChangedNotice(change, deps)).toBe("logged");
    expect(calls.sent).toBe(0);
  });
});
