import {
  challengePageUrl,
  challengeReturnPath,
  passkeyAssertionUserVerified,
} from "@repo/auth/sign-in-challenge-rules";
import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-redirect";

const ORIGIN = "https://qrdx.dev";

function assertion(flags: number | null, length = 37) {
  const data = Buffer.alloc(length);
  if (flags !== null) data[32] = flags;
  return {
    response: { response: { authenticatorData: data.toString("base64url") } },
  };
}

describe("passkeyAssertionUserVerified", () => {
  it("reads the UV flag from the authenticator data", () => {
    expect(passkeyAssertionUserVerified(assertion(0x05))).toBe(true); // UP + UV
    expect(passkeyAssertionUserVerified(assertion(0x45))).toBe(true); // + AT
    expect(passkeyAssertionUserVerified(assertion(0x01))).toBe(false); // UP only
    expect(passkeyAssertionUserVerified(assertion(0x00))).toBe(false);
  });

  it("treats anything malformed as not verified", () => {
    expect(passkeyAssertionUserVerified(undefined)).toBe(false);
    expect(passkeyAssertionUserVerified({})).toBe(false);
    expect(passkeyAssertionUserVerified(assertion(0x05, 32))).toBe(false);
    expect(
      passkeyAssertionUserVerified({
        response: { response: { authenticatorData: "%%%" } },
      }),
    ).toBe(false);
    expect(
      passkeyAssertionUserVerified({
        response: { response: { authenticatorData: 5 } },
      }),
    ).toBe(false);
  });
});

describe("challengeReturnPath", () => {
  it("keeps where a same-site sign-in was going", () => {
    expect(challengeReturnPath("/dashboard", ORIGIN)).toBe("/dashboard");
    expect(
      challengeReturnPath(
        "https://qrdx.dev/oauth/authorize?client_id=a&x=1",
        ORIGIN,
      ),
    ).toBe("/oauth/authorize?client_id=a&x=1");
    expect(challengeReturnPath("/invite/abc#top", ORIGIN)).toBe(
      "/invite/abc#top",
    );
  });

  it("drops other origins and junk", () => {
    expect(challengeReturnPath("https://evil.example/x", ORIGIN)).toBeNull();
    expect(challengeReturnPath("//evil.example/x", ORIGIN)).toBeNull();
    expect(challengeReturnPath("http://qrdx.dev/x", ORIGIN)).toBeNull();
    expect(challengeReturnPath(null, ORIGIN)).toBeNull();
    expect(challengeReturnPath("", ORIGIN)).toBeNull();
  });

  it("leaves the final check to safe-redirect", () => {
    // A backslash path survives URL parsing as a same-origin path here, and
    // the challenge page's safeNextPath rejects it.
    const kept = challengeReturnPath("/\\evil.example", ORIGIN);
    expect(safeNextPath(kept)).toBe("/dashboard");
    expect(safeNextPath(challengeReturnPath("/join/tok", ORIGIN))).toBe(
      "/join/tok",
    );
  });
});

describe("challengePageUrl", () => {
  it("carries next when there is one", () => {
    expect(challengePageUrl(ORIGIN, "/oauth/authorize?a=1&b=2")).toBe(
      "https://qrdx.dev/sign-in/two-factor?next=%2Foauth%2Fauthorize%3Fa%3D1%26b%3D2",
    );
    expect(challengePageUrl(ORIGIN, null)).toBe(
      "https://qrdx.dev/sign-in/two-factor",
    );
  });
});
