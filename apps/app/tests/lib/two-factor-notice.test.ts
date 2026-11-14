// The two-step verification notices: what the "backup code used" and "on"
// notices say, the sender that counts the codes left (and still sends when
// it can't), the notifier registered with @repo/auth for sign-ins, and the
// help page quoting the "few codes left" number. Nothing is emailed: outside
// production the notice is written to the log, which these tests read.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  codes: ["ABCDE-FGH23", "JKLMN-PQR45", "STUVW-XYZ67"] as string[],
  countFails: false,
  afterCalls: 0,
  /** Callbacks given to after(), run when the test says (the response ends) */
  afterQueue: [] as (() => unknown)[],
  info: [] as string[],
  errors: [] as string[],
}));

vi.mock("next/server", () => ({
  after: (run: () => unknown) => {
    state.afterCalls += 1;
    state.afterQueue.push(run);
  },
}));

/** The response has ended: after() callbacks run. */
async function responseEnds() {
  const queue = state.afterQueue.splice(0);
  await Promise.all(queue.map((run) => run()));
}
vi.mock("@/lib/delivery-guard", () => ({
  isOutboundDeliveryAllowed: () => false,
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: async () => ({ sent: true }),
}));
vi.mock("@/lib/security/request-details", () => ({
  requestDetails: () => ({
    device: "Chrome on macOS",
    location: null,
    ip: null,
    time: "Nov 8, 2026, 9:00 AM UTC",
    timeZone: "UTC",
  }),
  currentRequestDetails: async () => ({
    device: "Unknown device",
    location: null,
    ip: null,
    time: "Nov 8, 2026, 9:00 AM UTC",
    timeZone: "UTC",
  }),
}));
vi.mock("@/lib/account/two-factor-server", () => ({
  countBackupCodes: async () => {
    if (state.countFails) throw new Error("decrypt failed");
    return state.codes.length;
  },
}));

const notices = await import("@/lib/account/two-factor-notice");
const sender = await import("@/lib/account/two-factor-notice-server");
const template = await import("@/lib/email/templates/two-factor-notice");

beforeEach(() => {
  state.codes = ["ABCDE-FGH23", "JKLMN-PQR45", "STUVW-XYZ67"];
  state.countFails = false;
  state.afterCalls = 0;
  state.afterQueue = [];
  state.info = [];
  state.errors = [];
  vi.spyOn(console, "info").mockImplementation((line: unknown) => {
    state.info.push(String(line));
  });
  vi.spyOn(console, "error").mockImplementation((line: unknown) => {
    state.errors.push(String(line));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("what the notices say", () => {
  it("a backup code used to sign in, with plenty left", () => {
    expect(
      template.twoFactorNoticeLines("backup-code-used", {
        usedFor: "sign-in",
        codesLeft: 7,
      }),
    ).toEqual([
      "One of your backup codes was just used to sign in to your QRdx account. Each code works once, so that one no longer works.",
      "You have 7 backup codes left.",
    ]);
  });

  it("a backup code used to confirm it's you", () => {
    const [used] = template.twoFactorNoticeLines("backup-code-used", {
      usedFor: "confirm",
      codesLeft: 5,
    });
    expect(used).toMatch(/to confirm it's you before a security change/);
  });

  it(`suggests new codes at ${template.BACKUP_CODES_LOW} or fewer, and not before`, () => {
    const low = template.BACKUP_CODES_LOW;
    expect(template.backupCodesLeftText(low + 1)).toBe(
      `You have ${low + 1} backup codes left.`,
    );
    expect(template.backupCodesLeftText(low)).toMatch(
      new RegExp(`^You have ${low} backup codes left\\. Make new ones`),
    );
    expect(template.backupCodesLeftText(1)).toMatch(
      /^You have 1 backup code left\. Make new ones in Settings → Profile & security/,
    );
    expect(template.backupCodesLeftText(0)).toMatch(
      /^That was your last backup code\. Make new ones/,
    );
  });

  it("leaves the count out when it isn't known", () => {
    expect(
      template.twoFactorNoticeLines("backup-code-used", {
        usedFor: "sign-in",
        codesLeft: null,
      }),
    ).toHaveLength(1);
  });

  it("the 'on' notice says the other devices were signed out, only when they were", () => {
    expect(
      template.twoFactorNoticeLines("on", { signedOutElsewhere: true })[1],
    ).toMatch(/Every other device signed in to your account was signed out/);
    expect(
      template.twoFactorNoticeLines("on", { signedOutElsewhere: false }),
    ).toHaveLength(1);
    expect(template.twoFactorNoticeLines("on")).toHaveLength(1);
  });

  it("support's notice says every device was signed out", () => {
    expect(template.twoFactorNoticeLines("support-off")[0]).toMatch(
      /signed it out on every device/,
    );
  });

  it("describes each in the dev log", () => {
    expect(
      notices.describeTwoFactorNotice("backup-code-used", {
        usedFor: "sign-in",
        codesLeft: 2,
      }),
    ).toBe("a backup code was used to sign in, 2 left");
    expect(
      notices.describeTwoFactorNotice("backup-code-used", {
        usedFor: "confirm",
        codesLeft: null,
      }),
    ).toBe("a backup code was used to confirm it's you");
    expect(
      notices.describeTwoFactorNotice("on", { signedOutElsewhere: true }),
    ).toBe("two-step verification turned on, other sessions signed out");
    expect(notices.describeTwoFactorNotice("on")).toBe(
      "two-step verification turned on",
    );
  });
});

describe("sending the backup code notice", () => {
  it("counts the codes left and sends it", async () => {
    await sender.sendBackupCodeUsedNotice({
      userId: "user_1",
      email: "ada@qrdx.test",
      usedFor: "confirm",
      headers: new Headers({ "user-agent": "test" }),
    });
    expect(state.info).toContain(
      "[dev only] QRdx security notice for ada@qrdx.test: a backup code was used to confirm it's you, 3 left (not emailed: delivery is off outside production)",
    );
    expect(state.errors).toEqual([]);
  });

  it("still sends it without the count when the codes can't be read, and says so loudly without the address", async () => {
    state.countFails = true;
    await sender.sendBackupCodeUsedNotice({
      userId: "user_1",
      email: "ada@qrdx.test",
      usedFor: "sign-in",
    });
    expect(state.info).toContain(
      "[dev only] QRdx security notice for ada@qrdx.test: a backup code was used to sign in (not emailed: delivery is off outside production)",
    );
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0]).toContain('"outcome":"count-failed"');
    expect(state.errors[0]).not.toContain("ada@qrdx.test");
    expect(state.errors[0]).not.toContain("user_1");
  });

  it("the sign-in notifier keeps the request alive until it's sent, as a sign-in", async () => {
    await sender.notifyBackupCodeUsed({
      user: { id: "user_1", email: "ada@qrdx.test" },
      headers: new Headers(),
    });
    expect(state.afterCalls).toBe(1);
    await responseEnds();
    expect(state.info.join("\n")).toContain(
      "a backup code was used to sign in, 3 left",
    );
  });

  it("counts the codes when the code is used, not after the response", async () => {
    await sender.notifyBackupCodeUsed({
      user: { id: "user_1", email: "ada@qrdx.test" },
      headers: new Headers(),
    });
    // New codes made straight after (another request) don't change it.
    state.codes = Array.from({ length: 10 }, (_, i) => `CODE${i}`);
    await responseEnds();
    expect(state.info.join("\n")).toContain(
      "a backup code was used to sign in, 3 left",
    );
    expect(state.info.join("\n")).not.toContain("10 left");
  });
});

describe("the help page", () => {
  it('quotes the "few codes left" number and the new behavior', () => {
    const page = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../content/docs/help/privacy-and-security/two-step-verification.mdx",
      ),
      "utf8",
    );
    expect(page).toContain(
      `When you're down to ${template.BACKUP_CODES_LOW} or fewer, make new ones`,
    );
    expect(page).toContain("or a backup code is used.");
    expect(page).toContain("every other browser or device signed in to");
  });
});
