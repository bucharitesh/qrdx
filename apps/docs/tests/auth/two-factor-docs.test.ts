// The two-step verification help page quotes the plugin's numbers; this keeps
// them in step with packages/auth (sign-in-challenge-rules.ts, and support's
// wait in two-factor-reset.ts). So does the account security page, for how
// long a sign-in lasts (session-lifetime.ts).
import { readFileSync } from "node:fs";
import path from "node:path";
import { SESSION_MAX_DAYS } from "@repo/auth/session-lifetime";
import {
  BACKUP_CODE_COUNT,
  CHALLENGE_ATTEMPTS,
  CHALLENGE_MINUTES,
  LOCKOUT_FAILURES,
  LOCKOUT_MINUTES,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  TRUST_DEVICE_DAYS,
} from "@repo/auth/sign-in-challenge-rules";
import { TWO_FACTOR_RESET_WAIT_DAYS } from "@repo/auth/two-factor-reset";
import { describe, expect, it } from "vitest";
import { TWO_FACTOR_MESSAGES } from "@/lib/auth/two-factor";

const page = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../content/docs/help/privacy-and-security/two-step-verification.mdx",
  ),
  "utf8",
);

const securityPage = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../content/docs/help/privacy-and-security/account-security.mdx",
  ),
  "utf8",
);

describe("two-step verification help page", () => {
  it("quotes the configured numbers", () => {
    expect(page).toContain(`${TOTP_DIGITS}-digit code`);
    expect(page).toContain(`change every ${TOTP_PERIOD_SECONDS} seconds`);
    expect(page).toContain(`Save your ${BACKUP_CODE_COUNT} backup codes`);
    expect(page).toContain(`allows ${CHALLENGE_ATTEMPTS} wrong codes`);
    expect(page).toContain(
      `After ${LOCKOUT_FAILURES} wrong codes in a row, QRdx stops accepting codes for your account for ${LOCKOUT_MINUTES} minutes`,
    );
    expect(page).toContain(`expires after ${CHALLENGE_MINUTES} minutes`);
    expect(page).toContain(
      `Don't ask again on this device for ${TRUST_DEVICE_DAYS} days`,
    );
    expect(TWO_FACTOR_MESSAGES.locked).toContain(`${LOCKOUT_MINUTES} minutes`);
  });

  it("quotes support's wait and the session cap", () => {
    expect(page).toContain(
      `support's turn-off waits ${TWO_FACTOR_RESET_WAIT_DAYS} days`,
    );
    expect(securityPage).toContain(
      `A sign-in lasts up to ${SESSION_MAX_DAYS} days`,
    );
    expect(securityPage).toContain(`waits ${TWO_FACTOR_RESET_WAIT_DAYS} days`);
  });

  it("doesn't carve SAML out of trusted devices", () => {
    // GET /two-factor/continue reads the trust cookie after a SAML POST.
    expect(page).not.toMatch(/SAML[^.]*may still ask/);
  });
});
