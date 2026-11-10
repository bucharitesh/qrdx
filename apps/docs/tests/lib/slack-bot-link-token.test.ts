// /qr link's token (lib/slack-bot/link-token.ts): signed with a key derived
// from BETTER_AUTH_SECRET, bound to one Slack person in one Slack workspace,
// valid for 10 minutes. The secret is a fake.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  LINK_TOKEN_MINUTES,
  linkTokenKey,
  signLinkToken,
  verifyLinkToken,
} from "@/lib/slack-bot/link-token";

const SECRET = "test-secret-at-least-32-characters-long";
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const CLAIMS = {
  teamId: "T0ACME",
  slackUserId: "U0ANA",
  teamName: "Acme",
  userName: "ana",
};

const token = () => signLinkToken(CLAIMS, SECRET, NOW);

/** Re-signs a changed payload with a given key. */
function forge(payload: Record<string, unknown>, key: Buffer | string) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`;
}

describe("link tokens", () => {
  it("sign and verify, carrying the Slack ids and names", () => {
    expect(verifyLinkToken(token(), SECRET, NOW + 1000)).toEqual({
      ...CLAIMS,
      exp: NOW / 1000 + LINK_TOKEN_MINUTES * 60,
    });
  });

  it("expire after 10 minutes", () => {
    const tenMinutes = LINK_TOKEN_MINUTES * 60 * 1000;
    expect(
      verifyLinkToken(token(), SECRET, NOW + tenMinutes - 1),
    ).not.toBeNull();
    expect(verifyLinkToken(token(), SECRET, NOW + tenMinutes)).toBeNull();
  });

  it("refuse a changed payload: another Slack workspace or person", () => {
    const [, signature] = token().split(".");
    for (const changed of [
      { ...CLAIMS, teamId: "T0OTHER" },
      { ...CLAIMS, slackUserId: "U0EVE" },
      { ...CLAIMS, exp: NOW / 1000 + 86_400 },
    ]) {
      const body = Buffer.from(JSON.stringify(changed)).toString("base64url");
      expect(verifyLinkToken(`${body}.${signature}`, SECRET, NOW)).toBeNull();
    }
  });

  it("refuse a token signed with another secret, or with the raw secret", () => {
    expect(
      verifyLinkToken(token(), "another-secret-of-32-characters!!", NOW),
    ).toBeNull();
    const payload = { ...CLAIMS, exp: NOW / 1000 + 600 };
    // The key is derived (HKDF), never BETTER_AUTH_SECRET itself.
    expect(verifyLinkToken(forge(payload, SECRET), SECRET, NOW)).toBeNull();
    expect(
      verifyLinkToken(forge(payload, linkTokenKey(SECRET)), SECRET, NOW),
    ).not.toBeNull();
    expect(linkTokenKey(SECRET).equals(Buffer.from(SECRET))).toBe(false);
  });

  it("refuse malformed tokens and bad ids", () => {
    const key = linkTokenKey(SECRET);
    for (const bad of [
      "",
      "abc",
      `${token()}.extra`,
      `${token()}x`,
      forge({ ...CLAIMS, teamId: "t-lower", exp: NOW / 1000 + 60 }, key),
      forge({ ...CLAIMS, slackUserId: 42, exp: NOW / 1000 + 60 }, key),
      forge({ ...CLAIMS, exp: "soon" }, key),
    ]) {
      expect(verifyLinkToken(bad, SECRET, NOW), bad).toBeNull();
    }
    expect(verifyLinkToken(token(), "", NOW)).toBeNull();
  });

  it("clip long display names", () => {
    const long = signLinkToken(
      { ...CLAIMS, teamName: "x".repeat(500) },
      SECRET,
      NOW,
    );
    expect(verifyLinkToken(long, SECRET, NOW)?.teamName).toHaveLength(80);
  });
});
