import {
  BACKUP_CODE_ALPHABET,
  generateBackupCodes,
} from "@repo/auth/sign-in-challenge-rules";
import { describe, expect, it, vi } from "vitest";
import { deliverTwoFactorNotice } from "@/lib/account/two-factor-notice";
import {
  BACKUP_CODE_COUNT,
  backupCodesText,
  challengeFailure,
  groupSecret,
  isTotpCode,
  normalizeBackupCode,
  secretFromUri,
  TWO_FACTOR_MESSAGES,
} from "@/lib/auth/two-factor";

describe("normalizeBackupCode", () => {
  it("returns the stored shape from any case, dash or spacing", () => {
    expect(normalizeBackupCode("ABCDE-FGH23")).toBe("ABCDE-FGH23");
    expect(normalizeBackupCode("abcde-fgh23")).toBe("ABCDE-FGH23");
    expect(normalizeBackupCode("abcdefgh23")).toBe("ABCDE-FGH23");
    expect(normalizeBackupCode(" abc de fgh 23 ")).toBe("ABCDE-FGH23");
    expect(normalizeBackupCode("aBcDe - FgH23")).toBe("ABCDE-FGH23");
  });

  it("rejects what can't be a code", () => {
    for (const bad of [
      "",
      "123456",
      "ABCD-FGH23",
      "ABCDE-FGH234",
      "ABCDE_FGH23",
      // Characters codes never contain
      "ABCDE-FGH20",
      "ABCDO-FGH23",
      "ABCD1-FGH23",
      "ABCDI-FGH23",
    ]) {
      expect(normalizeBackupCode(bad), bad).toBeNull();
    }
    expect(normalizeBackupCode(undefined)).toBeNull();
    expect(normalizeBackupCode(12345)).toBeNull();
  });
});

describe("generateBackupCodes", () => {
  it("makes 10 distinct easy-to-read codes that normalise to themselves", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
      expect(normalizeBackupCode(code)).toBe(code);
      expect(normalizeBackupCode(code.toLowerCase().replace("-", " "))).toBe(
        code,
      );
    }
  });

  it("uses every letter of its alphabet and nothing else", () => {
    const seen = new Set(generateBackupCodes(400).join("").replace(/-/g, ""));
    expect([...seen].sort().join("")).toBe(
      [...BACKUP_CODE_ALPHABET].sort().join(""),
    );
    for (const char of "0O1Il")
      expect(BACKUP_CODE_ALPHABET).not.toContain(char);
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
      codes: ["ABCDE-FGH23", "JKLMN-PQR45"],
      email: "ada@qrdx.test",
      createdAt: new Date("2026-11-05T10:00:00Z"),
    });
    expect(text).toContain("Account: ada@qrdx.test");
    expect(text).toContain("Created: 2026-11-05");
    expect(text).toContain("ABCDE-FGH23\nJKLMN-PQR45\n");
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
