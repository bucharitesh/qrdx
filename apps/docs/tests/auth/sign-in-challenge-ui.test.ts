// The second step's page logic (app/(auth)/components/second-step.ts):
// which method shows first, what a failed passkey says, and why a typed
// backup code can't be one.
import { normalizeBackupCode } from "@repo/auth/sign-in-challenge-rules";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backupCodeProblem,
  firstStep,
  offeredSteps,
  PASSKEY_STEP_MESSAGES,
  PROMPT_REFUSED_MS,
  passkeyStepOutcome,
  readRememberedStep,
  rememberStep,
} from "@/app/(auth)/components/second-step";

const ALL = { passkey: true, totp: true, backupCodes: true };

describe("offeredSteps", () => {
  it("puts a passkey first, where this browser can use one", () => {
    expect(offeredSteps(ALL, true)).toEqual(["passkey", "totp", "backup"]);
    expect(offeredSteps(ALL, false)).toEqual(["totp", "backup"]);
  });

  it("offers only what the person has", () => {
    expect(
      offeredSteps({ passkey: true, totp: false, backupCodes: true }, true),
    ).toEqual(["passkey", "backup"]);
    expect(
      offeredSteps({ passkey: false, totp: true, backupCodes: false }, true),
    ).toEqual(["totp"]);
    // A passkey-only account on a browser without passkeys, codes used up.
    expect(
      offeredSteps({ passkey: true, totp: false, backupCodes: false }, false),
    ).toEqual([]);
  });

  it("offers everything, passkey last, when the server couldn't say", () => {
    expect(offeredSteps(null, true)).toEqual(["totp", "backup", "passkey"]);
    expect(offeredSteps(null, false)).toEqual(["totp", "backup"]);
  });
});

describe("firstStep", () => {
  it("starts with the method used last in this browser", () => {
    expect(firstStep(["passkey", "totp", "backup"], "totp")).toBe("totp");
    expect(firstStep(["totp", "backup", "passkey"], "passkey")).toBe("passkey");
  });

  it("else with the best one offered", () => {
    expect(firstStep(["passkey", "totp", "backup"], null)).toBe("passkey");
    // Remembered, but not offered any more (e.g. the app was removed).
    expect(firstStep(["passkey", "backup"], "totp")).toBe("passkey");
    expect(firstStep([], "totp")).toBeNull();
  });
});

describe("the remembered method", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps only the method's name", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    expect(readRememberedStep()).toBeNull();
    rememberStep("passkey");
    expect(readRememberedStep()).toBe("passkey");
    expect([...store.values()]).toEqual(["passkey"]);
    store.set([...store.keys()][0], "something else");
    expect(readRememberedStep()).toBeNull();
  });

  it("never remembers a backup code, and keeps what was there", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    rememberStep("backup");
    expect(readRememberedStep()).toBeNull();
    expect(store.size).toBe(0);
    rememberStep("totp");
    rememberStep("backup");
    expect(readRememberedStep()).toBe("totp");
    rememberStep("passkey");
    rememberStep("backup");
    expect(readRememberedStep()).toBe("passkey");
    // A stored "backup" is ignored.
    store.set([...store.keys()][0], "backup");
    expect(readRememberedStep()).toBeNull();
    expect(firstStep(["passkey", "totp", "backup"], readRememberedStep())).toBe(
      "passkey",
    );
  });

  it("works without storage", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(() => rememberStep("totp")).not.toThrow();
    expect(readRememberedStep()).toBeNull();
  });
});

describe("passkeyStepOutcome", () => {
  const failure = (
    kind: "prompt" | "aborted" | "browser" | "server",
    extra: { code?: string; status?: number; promptMs?: number } = {},
  ) => ({ ok: false as const, kind, promptMs: 0, ...extra });

  it("stays quiet when a prompt that opened on its own was refused", () => {
    expect(
      passkeyStepOutcome(failure("prompt", { promptMs: 20 }), {
        automatic: true,
      }),
    ).toEqual({ message: null, over: false, counted: false });
  });

  it("says the prompt was closed when someone saw it", () => {
    expect(
      passkeyStepOutcome(failure("prompt", { promptMs: PROMPT_REFUSED_MS }), {
        automatic: true,
      }).message,
    ).toBe(PASSKEY_STEP_MESSAGES.closed);
    expect(
      passkeyStepOutcome(failure("prompt", { promptMs: 20 }), {
        automatic: false,
      }).message,
    ).toBe(PASSKEY_STEP_MESSAGES.closed);
  });

  it("asks for another try when the request expired", () => {
    expect(
      passkeyStepOutcome(
        failure("server", { code: "PASSKEY_CHALLENGE_NOT_FOUND" }),
        { automatic: false },
      ),
    ).toEqual({
      message: "That passkey request expired. Try again.",
      over: false,
      counted: false,
    });
  });

  it("says nothing when another method took over", () => {
    expect(
      passkeyStepOutcome(failure("aborted"), { automatic: false }).message,
    ).toBeNull();
  });

  it("counts a passkey the server refused", () => {
    expect(
      passkeyStepOutcome(failure("server", { code: "INVALID_PASSKEY" }), {
        automatic: false,
      }),
    ).toEqual({
      message: "Couldn't verify your passkey. Try again.",
      over: false,
      counted: true,
    });
    expect(
      passkeyStepOutcome(
        failure("server", { code: "PASSKEY_USER_VERIFICATION_REQUIRED" }),
        { automatic: false },
      ),
    ).toEqual({
      message: PASSKEY_STEP_MESSAGES.userVerification,
      over: false,
      counted: true,
    });
  });

  it("ends the step when the challenge is over", () => {
    for (const code of [
      "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
      "ACCOUNT_TEMPORARILY_LOCKED",
      "INVALID_TWO_FACTOR_COOKIE",
    ]) {
      expect(
        passkeyStepOutcome(failure("server", { code }), { automatic: false })
          .over,
        code,
      ).toBe(true);
    }
    expect(
      passkeyStepOutcome(
        failure("server", { code: "ACCOUNT_TEMPORARILY_LOCKED" }),
        { automatic: false },
      ).message,
    ).toBe(PASSKEY_STEP_MESSAGES.locked);
  });

  it("handles limits and the network", () => {
    expect(
      passkeyStepOutcome(failure("server", { status: 429 }), {
        automatic: false,
      }).message,
    ).toBe(PASSKEY_STEP_MESSAGES.rateLimited);
    expect(
      passkeyStepOutcome(failure("server", { status: 500 }), {
        automatic: false,
      }).message,
    ).toBe(PASSKEY_STEP_MESSAGES.connection);
    expect(
      passkeyStepOutcome(failure("browser"), { automatic: true }).message,
    ).toBe(PASSKEY_STEP_MESSAGES.failed);
  });
});

describe("backupCodeProblem", () => {
  it("accepts what normalizeBackupCode accepts", () => {
    for (const code of ["ABCDE-FGH23", "abcde fgh23", " abcdefgh23 "]) {
      expect(backupCodeProblem(code), code).toBeNull();
      expect(normalizeBackupCode(code), code).toBe("ABCDE-FGH23");
    }
  });

  it("says what's wrong with the rest", () => {
    expect(backupCodeProblem("  ")).toBe("Enter one of your backup codes.");
    expect(backupCodeProblem("ABCDE-FGH2")).toBe(
      "Backup codes have 10 characters, like ABCDE-FGH23. This has 9.",
    );
    expect(backupCodeProblem("ABCDE_FGH23")).toBe(
      'Backup codes only have letters and digits. Remove "_".',
    );
    expect(backupCodeProblem("ABCD0-FGH21")).toBe(
      'Backup codes never use "0" or "1". Check for a look-alike letter or digit.',
    );
    expect(backupCodeProblem("ABCDO-FGHI3")).toBe(
      'Backup codes never use "O" or "I". Check for a look-alike letter or digit.',
    );
  });

  it("never passes something normalizeBackupCode refuses", () => {
    for (const input of [
      "",
      "ABCDE",
      "ABCDE-FGH2345",
      "ABCD0-FGH23",
      "ÄBCDE-FGH23",
    ]) {
      expect(normalizeBackupCode(input), input).toBeNull();
      expect(backupCodeProblem(input), input).not.toBeNull();
    }
  });
});
