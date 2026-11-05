import { describe, expect, it, vi } from "vitest";
import { deliverTwoFactorNotice } from "@/lib/account/two-factor-notice";
import {
  backupCodesText,
  challengeFailure,
  groupSecret,
  isTotpCode,
  normalizeBackupCode,
  secretFromUri,
  TWO_FACTOR_MESSAGES,
} from "@/lib/auth/two-factor";

describe("normalizeBackupCode", () => {
  it("accepts the stored shape, with or without the dash", () => {
    expect(normalizeBackupCode("aB3dE-x9Yz0")).toBe("aB3dE-x9Yz0");
    expect(normalizeBackupCode(" aB3dEx9Yz0 ")).toBe("aB3dE-x9Yz0");
    expect(normalizeBackupCode("aB3dE - x9Yz0")).toBe("aB3dE-x9Yz0");
  });

  it("keeps letter case (codes are case-sensitive)", () => {
    expect(normalizeBackupCode("ABCDE-12345")).toBe("ABCDE-12345");
    expect(normalizeBackupCode("abcde-12345")).toBe("abcde-12345");
  });

  it("rejects anything else", () => {
    for (const bad of [
      "",
      "123456",
      "abcd-12345",
      "abcde_12345",
      "abcde-1234!",
    ]) {
      expect(normalizeBackupCode(bad), bad).toBeNull();
    }
  });
});

describe("challengeFailure", () => {
  it("words each plugin error and says when the challenge is over", () => {
    expect(challengeFailure({ code: "INVALID_CODE" }, "totp")).toEqual({
      message: TWO_FACTOR_MESSAGES.wrongCode,
      over: false,
    });
    expect(
      challengeFailure({ code: "INVALID_BACKUP_CODE" }, "backup").over,
    ).toBe(false);
    expect(
      challengeFailure({ code: "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE" }, "totp"),
    ).toEqual({ message: TWO_FACTOR_MESSAGES.tooManyAttempts, over: true });
    expect(
      challengeFailure(
        { code: "ACCOUNT_TEMPORARILY_LOCKED", status: 429 },
        "totp",
      ),
    ).toEqual({
      message: TWO_FACTOR_MESSAGES.locked,
      over: true,
    });
    expect(
      challengeFailure({ code: "INVALID_TWO_FACTOR_COOKIE" }, "totp"),
    ).toEqual({
      message: TWO_FACTOR_MESSAGES.expired,
      over: true,
    });
    expect(challengeFailure({ status: 429 }, "totp")).toEqual({
      message: TWO_FACTOR_MESSAGES.rateLimited,
      over: false,
    });
    expect(challengeFailure({ status: 500 }, "totp").message).toBe(
      TWO_FACTOR_MESSAGES.failed,
    );
  });
});

describe("setup helpers", () => {
  it("reads and groups the secret", () => {
    const uri =
      "otpauth://totp/QRdx:a%40b.test?secret=ABCDEFGHIJKLMNOP&issuer=QRdx";
    expect(secretFromUri(uri)).toBe("ABCDEFGHIJKLMNOP");
    expect(secretFromUri("https://qrdx.dev/?secret=X")).toBeNull();
    expect(secretFromUri("not a url")).toBeNull();
    expect(groupSecret("ABCDEFGHIJ")).toBe("ABCD EFGH IJ");
    expect(isTotpCode("012345")).toBe(true);
    expect(isTotpCode("12345")).toBe(false);
  });

  it("writes the backup codes file", () => {
    const text = backupCodesText({
      codes: ["aaaaa-11111", "bbbbb-22222"],
      email: "ada@qrdx.test",
      createdAt: new Date("2026-11-05T10:00:00Z"),
    });
    expect(text).toContain("Account: ada@qrdx.test");
    expect(text).toContain("Created: 2026-11-05");
    expect(text).toContain("aaaaa-11111\nbbbbb-22222\n");
  });
});

describe("deliverTwoFactorNotice", () => {
  const base = { kind: "on" as const, email: "ada@qrdx.test" };

  it("emails where delivery is on", async () => {
    const send = vi.fn(async () => ({ sent: true }));
    const outcome = await deliverTwoFactorNotice(base, {
      nodeEnv: "production",
      deliveryAllowed: true,
      send,
      log: () => {},
    });
    expect(outcome).toBe("emailed");
    expect(send).toHaveBeenCalledOnce();
  });

  it("logs in local dev, never sends", async () => {
    const send = vi.fn();
    const log = vi.fn();
    const outcome = await deliverTwoFactorNotice(
      { kind: "support-off", email: "ada@qrdx.test" },
      { nodeEnv: "development", deliveryAllowed: false, send, log },
    );
    expect(outcome).toBe("logged");
    expect(send).not.toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain("turned off by support");
  });

  it("reports a failed send without throwing", async () => {
    const outcome = await deliverTwoFactorNotice(base, {
      nodeEnv: "production",
      deliveryAllowed: true,
      send: async () => {
        throw new Error("smtp down");
      },
      log: () => {},
    });
    expect(outcome).toBe("not-sent");
    expect(
      await deliverTwoFactorNotice(base, {
        nodeEnv: "production",
        deliveryAllowed: false,
        send: vi.fn(),
        log: () => {},
      }),
    ).toBe("not-sent");
  });
});
