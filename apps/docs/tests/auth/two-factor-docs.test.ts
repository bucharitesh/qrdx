// The two-step verification help page quotes the plugin's numbers; this keeps
// them in step with packages/auth (sign-in-challenge-rules.ts).
import { readFileSync } from "node:fs";
import path from "node:path";
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
import { describe, expect, it } from "vitest";
import { TWO_FACTOR_MESSAGES } from "@/lib/auth/two-factor";

const page = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../content/docs/help/privacy-and-security/two-step-verification.mdx",
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

  it("doesn't carve SAML out of trusted devices", () => {
    // GET /two-factor/continue reads the trust cookie after a SAML POST.
    expect(page).not.toMatch(/SAML[^.]*may still ask/);
  });
});
