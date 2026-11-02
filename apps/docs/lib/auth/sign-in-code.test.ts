// Sign-in and email-change code delivery rules and the @repo/auth wrapper
// (nothing is sent).
//   cd apps/docs && npx tsx --test lib/auth/sign-in-code.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMAIL_CHANGE_CODE_NOT_SENT,
  registerEmailChangeCodeSender,
  registerSignInCodeSender,
  SIGN_IN_CODE_NOT_SENT,
  sendVerificationOTP,
  signInCodeRateLimited,
} from "@repo/auth/email-otp";
import {
  addressKey,
  addressMayRequestCode,
  deliverSignInCode,
  type SignInCodeDeliveryDeps,
} from "./sign-in-code-delivery";

const CODE = { email: "ada@example.com", otp: "402871" };

function fakeDeps(overrides: Partial<SignInCodeDeliveryDeps>) {
  const calls = { sent: 0, logs: [] as string[] };
  const deps: SignInCodeDeliveryDeps = {
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

describe("deliverSignInCode", () => {
  it("logs the code in dev instead of emailing it", async () => {
    const { deps, calls } = fakeDeps({ nodeEnv: "development" });
    assert.equal(await deliverSignInCode(CODE, deps), "logged");
    assert.equal(calls.sent, 0);
    assert.equal(calls.logs.length, 1);
    assert.match(calls.logs[0], /^\[dev only\].*402871/);
  });

  it("never emails in tests, even when delivery is allowed", async () => {
    const { deps, calls } = fakeDeps({
      nodeEnv: "test",
      deliveryAllowed: true,
    });
    assert.equal(await deliverSignInCode(CODE, deps), "logged");
    assert.equal(calls.sent, 0);
  });

  it("emails in production and never logs the code", async () => {
    const { deps, calls } = fakeDeps({
      nodeEnv: "production",
      deliveryAllowed: true,
    });
    assert.equal(await deliverSignInCode(CODE, deps), "emailed");
    assert.equal(calls.sent, 1);
    assert.equal(calls.logs.length, 0);
  });

  it("fails without logging when production can't deliver", async () => {
    const { deps, calls } = fakeDeps({ nodeEnv: "production" });
    await assert.rejects(deliverSignInCode(CODE, deps));
    assert.equal(calls.sent, 0);
    assert.equal(calls.logs.length, 0);
  });

  it("names the kind of code in the dev log line", async () => {
    const { deps, calls } = fakeDeps({ nodeEnv: "development" });
    await deliverSignInCode(CODE, deps, "email-change code");
    assert.match(
      calls.logs[0],
      /^\[dev only\] QRdx email-change code for ada@example\.com: 402871/,
    );
  });

  it("fails when the email isn't sent", async () => {
    const { deps } = fakeDeps({
      nodeEnv: "production",
      deliveryAllowed: true,
      send: async () => ({ sent: false, reason: "not-configured" }),
    });
    await assert.rejects(deliverSignInCode(CODE, deps), /not-configured/);
  });
});

describe("@repo/auth sendVerificationOTP", () => {
  it("delivers sign-in and email-change codes, each through its own sender", async () => {
    const signIn: string[] = [];
    const change: string[] = [];
    registerSignInCodeSender(async ({ otp }) => {
      signIn.push(otp);
    });
    registerEmailChangeCodeSender(async ({ email, otp }) => {
      change.push(`${email}:${otp}`);
    });
    for (const type of ["email-verification", "forget-password"] as const) {
      await sendVerificationOTP({ ...CODE, type });
    }
    assert.deepEqual(signIn, []);
    assert.deepEqual(change, []);
    await sendVerificationOTP({ ...CODE, type: "sign-in" });
    await sendVerificationOTP({
      email: "new@example.com",
      otp: "915273",
      type: "change-email",
    });
    assert.deepEqual(signIn, ["402871"]);
    assert.deepEqual(change, ["new@example.com:915273"]);
  });

  it("refuses an email-change code when no sender is registered", async () => {
    registerEmailChangeCodeSender(undefined as never);
    await assert.rejects(
      sendVerificationOTP({ ...CODE, type: "change-email" }),
      (error: { body?: { code?: string } }) => {
        assert.equal(error.body?.code, EMAIL_CHANGE_CODE_NOT_SENT);
        return true;
      },
    );
  });

  it("answers 429 when a new address got too many email-change codes", async () => {
    registerEmailChangeCodeSender(async () => {
      throw signInCodeRateLimited();
    });
    await assert.rejects(
      sendVerificationOTP({ ...CODE, type: "change-email" }),
      (error: { statusCode?: number; body?: { code?: string } }) => {
        assert.equal(error.statusCode, 429);
        assert.equal(error.body?.code, "EMAIL_CHANGE_CODE_RATE_LIMITED");
        return true;
      },
    );
  });

  it("turns a failed send into an error without the code", async () => {
    registerSignInCodeSender(async () => {
      throw new Error("Resend is down");
    });
    await assert.rejects(
      sendVerificationOTP({ ...CODE, type: "sign-in" }),
      (error: { body?: { code?: string; message?: string } }) => {
        assert.equal(error.body?.code, SIGN_IN_CODE_NOT_SENT);
        assert.doesNotMatch(error.body?.message ?? "", /402871/);
        return true;
      },
    );
  });

  it("answers 429 when the address asked for too many codes", async () => {
    registerSignInCodeSender(async () => {
      throw signInCodeRateLimited();
    });
    await assert.rejects(
      sendVerificationOTP({ ...CODE, type: "sign-in" }),
      (error: { statusCode?: number; body?: { code?: string } }) => {
        assert.equal(error.statusCode, 429);
        assert.equal(error.body?.code, "SIGN_IN_CODE_RATE_LIMITED");
        return true;
      },
    );
  });
});

describe("addressKey", () => {
  it("hashes the address, ignoring case and spaces", () => {
    const key = addressKey(" Ada@Example.com ");
    assert.equal(key, addressKey("ada@example.com"));
    assert.match(key, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(key, /ada/);
  });
});

describe("addressMayRequestCode", () => {
  const limiter = (remaining: number) => {
    const seen: string[] = [];
    return {
      seen,
      limit: async (key: string) => {
        seen.push(key);
        remaining -= 1;
        return { success: remaining >= 0 };
      },
    };
  };

  it("allows a request only while every window has room", async () => {
    const burst = limiter(5);
    const daily = limiter(1);
    assert.equal(await addressMayRequestCode("hash", [burst, daily]), true);
    assert.equal(await addressMayRequestCode("hash", [burst, daily]), false);
    assert.deepEqual(burst.seen, ["hash", "hash"]);
    assert.deepEqual(daily.seen, ["hash", "hash"]);
  });
});
