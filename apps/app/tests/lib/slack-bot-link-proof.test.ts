// Proving the Slack identity before a link (lib/slack-bot/link-proof.ts):
// the signed sign-in flow and proof cookies, and the id_token checks. Pure,
// with fake secrets and ids; the routes are tests/api/slack-bot.test.ts.
import { describe, expect, it } from "vitest";
import {
  checkSlackIdToken,
  isSlackSignInError,
  openSignInFlow,
  proofMatches,
  SLACK_SIGN_IN_ERRORS,
  sealLinkProof,
  sealSignInFlow,
  slackIdentityOf,
} from "@/lib/slack-bot/link-proof";

const SECRET = "test-secret-at-least-32-characters-long";
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const TEAM = "T0ACME";
const ANA = "U0ANA";

const flow = {
  state: "state-1",
  nonce: "nonce-1",
  userId: "u_ana",
  sessionId: "s_1",
  token: "payload.signature",
};
const proof = {
  userId: "u_ana",
  sessionId: "s_1",
  token: "payload.signature",
  claims: { teamId: TEAM, slackUserId: ANA },
};

const jwt = (claims: Record<string, unknown>) =>
  [
    Buffer.from('{"alg":"RS256"}').toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".");
const claims = (extra: Record<string, unknown> = {}) => ({
  iss: "https://slack.com",
  aud: "client-1",
  exp: NOW / 1000 + 300,
  nonce: "nonce-1",
  "https://slack.com/team_id": TEAM,
  "https://slack.com/user_id": ANA,
  ...extra,
});
const expected = {
  clientId: "client-1",
  nonce: "nonce-1",
  teamId: TEAM,
  slackUserId: ANA,
};

describe("the sign-in flow cookie", () => {
  it("opens with the same secret for 10 minutes", () => {
    const sealed = sealSignInFlow(flow, SECRET, NOW);
    expect(openSignInFlow(sealed, SECRET, NOW)).toEqual({
      ...flow,
      exp: NOW / 1000 + 600,
    });
    expect(openSignInFlow(sealed, SECRET, NOW + 10 * 60_000)).toBeNull();
    expect(openSignInFlow(sealed, `${SECRET}x`, NOW)).toBeNull();
  });

  it("refuses a changed or malformed value", () => {
    const [payload, signature] = sealSignInFlow(flow, SECRET, NOW).split(".");
    const changed = Buffer.from(
      JSON.stringify({ ...flow, userId: "u_eve", exp: NOW / 1000 + 600 }),
    ).toString("base64url");
    expect(openSignInFlow(`${changed}.${signature}`, SECRET, NOW)).toBeNull();
    expect(openSignInFlow(payload, SECRET, NOW)).toBeNull();
    expect(openSignInFlow(`${payload}.${signature}.x`, SECRET, NOW)).toBeNull();
    expect(openSignInFlow("", SECRET, NOW)).toBeNull();
    expect(openSignInFlow(undefined, SECRET, NOW)).toBeNull();
  });

  it("can't pass for a proof (each has its own key)", () => {
    const sealed = sealSignInFlow(flow, SECRET, NOW);
    expect(proofMatches(sealed, SECRET, proof, NOW)).toBe(false);
    expect(openSignInFlow(sealLinkProof(proof, SECRET, NOW), SECRET, NOW)).toBe(
      null,
    );
  });
});

describe("the proof cookie", () => {
  const sealed = sealLinkProof(proof, SECRET, NOW);

  it("matches this user, session, Slack person and token for 10 minutes", () => {
    expect(proofMatches(sealed, SECRET, proof, NOW)).toBe(true);
    expect(proofMatches(sealed, SECRET, proof, NOW + 10 * 60_000)).toBe(false);
    // It holds the token's digest, never the token.
    expect(
      Buffer.from(sealed.split(".")[0] ?? "", "base64url").toString(),
    ).not.toContain(proof.token);
  });

  it("doesn't match anyone or anything else", () => {
    for (const other of [
      { ...proof, userId: "u_eve" },
      { ...proof, sessionId: "s_2" },
      { ...proof, token: "another.token" },
      { ...proof, claims: { teamId: TEAM, slackUserId: "U0EVE" } },
      { ...proof, claims: { teamId: "T0OTHER", slackUserId: ANA } },
    ]) {
      expect(proofMatches(sealed, SECRET, other, NOW)).toBe(false);
    }
    expect(proofMatches(sealed, `${SECRET}x`, proof, NOW)).toBe(false);
    expect(proofMatches(undefined, SECRET, proof, NOW)).toBe(false);
  });
});

describe("checkSlackIdToken", () => {
  it("accepts Slack's token for this app, sign-in and person", () => {
    expect(checkSlackIdToken(jwt(claims()), expected, NOW)).toEqual({
      ok: true,
    });
    expect(
      checkSlackIdToken(jwt(claims({ aud: ["client-1"] })), expected, NOW),
    ).toEqual({ ok: true });
  });

  it("names what's wrong with any other", () => {
    const problem = (extra: Record<string, unknown>) => {
      const result = checkSlackIdToken(jwt(claims(extra)), expected, NOW);
      return result.ok ? "ok" : result.problem;
    };
    expect(problem({ iss: "https://slack.com/" })).toBe("issuer");
    expect(problem({ iss: undefined })).toBe("issuer");
    expect(problem({ aud: "client-2" })).toBe("audience");
    expect(problem({ aud: ["client-1", "client-2"] })).toBe("audience");
    expect(problem({ aud: undefined })).toBe("audience");
    expect(problem({ exp: NOW / 1000 })).toBe("expired");
    expect(problem({ exp: "never" })).toBe("expired");
    expect(problem({ nonce: "nonce-2" })).toBe("nonce");
    expect(problem({ nonce: undefined })).toBe("nonce");
    expect(problem({ "https://slack.com/team_id": undefined })).toBe("invalid");
    expect(problem({ "https://slack.com/user_id": "" })).toBe("invalid");
    expect(problem({ "https://slack.com/user_id": "U0EVE" })).toBe(
      "different_person",
    );
    expect(problem({ "https://slack.com/team_id": "T0OTHER" })).toBe(
      "different_person",
    );
    for (const token of [
      null,
      42,
      "",
      "a.b",
      "a.%%%.c",
      `a.${"x".repeat(9000)}.c`,
    ]) {
      const result = checkSlackIdToken(token, expected, NOW);
      expect(result.ok ? "ok" : result.problem).toBe("invalid");
    }
  });
});

describe("slackIdentityOf", () => {
  it("reads Slack's team and user claims, and nothing else", () => {
    expect(slackIdentityOf(claims())).toEqual({
      teamId: TEAM,
      slackUserId: ANA,
    });
    expect(slackIdentityOf({ sub: ANA })).toBeNull();
    expect(slackIdentityOf(null)).toBeNull();
  });
});

describe("the confirm page's messages", () => {
  it("say plainly why a sign-in didn't count", () => {
    expect(SLACK_SIGN_IN_ERRORS.mismatch).toBe(
      "You signed in to Slack as a different person than the one who asked to link.",
    );
    expect(isSlackSignInError("mismatch")).toBe(true);
    expect(isSlackSignInError("toString")).toBe(false);
    expect(isSlackSignInError(undefined)).toBe(false);
  });
});
