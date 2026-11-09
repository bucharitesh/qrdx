// SAML sign-ins started at the identity provider: the pure rules in
// packages/auth/ee/sso-rules.ts (reading a response before the plugin does,
// what QRdx refuses, where it lands) and the sign-in page's messages. The
// whole flow, with signed responses, is in tests/auth/sso-idp-initiated.test.ts;
// the browser runs are in e2e/sso-idp-initiated.e2e.mts.
import {
  readSamlResponse,
  SSO_IDP_LANDING_PATH,
  samlIdpInitiated,
  samlIdpInitiatedProblem,
  ssoIdpLandingPath,
  ssoIdpLandingRedirect,
} from "@repo/auth/sso-rules";
import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "@/app/(auth)/sign-in/_lib/error-message";
import { ssoSignInErrorMessage } from "@/ee/sso/messages";
import { createTestIdp } from "../support/saml-idp";

const ACS = "http://localhost:3000/api/auth/sso/saml2/sp/acs/sso-abcdefabcdef";
const AUDIENCE =
  "http://localhost:3000/api/auth/sso/saml2/sp/metadata?providerId=sso-abcdefabcdef";
const idp = createTestIdp();
const base = { email: "ana@acme.test", acs: ACS, audience: AUDIENCE };

describe("reading a SAML response before the plugin", () => {
  it("tells a sign-in started at the IdP from an answer to QRdx's request", () => {
    const started = readSamlResponse(idp.xml(base));
    expect(started).not.toBeNull();
    expect(started?.inResponseTo).toBeNull();
    expect(samlIdpInitiated(started as never)).toBe(true);
    const answer = readSamlResponse(
      idp.xml({
        ...base,
        inResponseTo: "_req1",
        confirmationInResponseTo: "_req1",
      }),
    );
    expect(answer?.inResponseTo).toBe("_req1");
    expect(answer?.confirmationInResponseTo).toEqual(["_req1"]);
    expect(samlIdpInitiated(answer as never)).toBe(false);
  });

  it("reads the assertion's ID and expiry from a signed response", () => {
    const expiry = new Date(Date.now() + 120_000);
    for (const sign of ["assertion", "response", "both", "none"] as const) {
      const facts = readSamlResponse(
        idp.xml({ ...base, assertionId: "_a1", notOnOrAfter: expiry, sign }),
      );
      expect(facts, sign).toMatchObject({
        assertionIds: ["_a1"],
        encryptedAssertions: 0,
        conditionsNotOnOrAfter: [expiry.toISOString()],
      });
    }
  });

  it("skips comments, CDATA and processing instructions", () => {
    // Comments aren't signed (canonicalization drops them), so anyone can
    // add one; an element inside one isn't an element.
    const xml = idp.xml({
      ...base,
      assertionId: "_real",
      beforeRoot: `<?xml version="1.0"?><!-- <samlp:Response InResponseTo="_fake"> -->`,
      afterSigning: (signed) =>
        signed.replace(
          "<saml:Subject>",
          `<!-- <saml:Assertion ID="_hidden"> <saml:Conditions NotOnOrAfter="2099-01-01T00:00:00Z"> --><saml:Subject>`,
        ),
    });
    const facts = readSamlResponse(xml);
    expect(facts?.inResponseTo).toBeNull();
    expect(facts?.assertionIds).toEqual(["_real"]);
    expect(facts?.conditionsNotOnOrAfter).toHaveLength(1);
    const cdata = readSamlResponse(
      `<samlp:Response><![CDATA[<saml:Assertion ID="_x">]]><saml:Assertion ID="_y"/></samlp:Response>`,
    );
    expect(cdata?.assertionIds).toEqual(["_y"]);
  });

  it("reads attributes in order, so a value can't pose as InResponseTo", () => {
    const facts = readSamlResponse(
      `<samlp:Response Note="x InResponseTo='_fake'" Other='a InResponseTo="_b"'><saml:Assertion ID="_a"/></samlp:Response>`,
    );
    expect(facts?.inResponseTo).toBeNull();
    // A namespaced attribute isn't the protocol's InResponseTo either.
    expect(
      readSamlResponse(`<samlp:Response x:InResponseTo="_r"/>`)?.inResponseTo,
    ).toBeNull();
    // Empty is absent, as for the plugin.
    expect(
      readSamlResponse(`<samlp:Response InResponseTo=""/>`)?.inResponseTo,
    ).toBeNull();
    expect(
      readSamlResponse(`<samlp:Response\n\tInResponseTo = '_r' />`)
        ?.inResponseTo,
    ).toBe("_r");
  });

  it("is null for what isn't one readable Response", () => {
    for (const xml of [
      "",
      "not xml",
      "<samlp:LogoutRequest ID='_1'/>",
      `<!DOCTYPE r [<!ENTITY x "y">]><samlp:Response/>`,
      "<samlp:Response><!-- never closed",
      "<samlp:Response><![CDATA[ never closed",
      `<samlp:Response ID="_1`,
      `<samlp:Response ID=_1>`,
      `<samlp:Response ID="_1" ID="_2">`,
      `<samlp:Response ID>`,
      "< samlp:Response>",
    ]) {
      expect(readSamlResponse(xml), xml).toBeNull();
    }
  });

  it("stays fast on hostile input", () => {
    for (const hostile of [
      "<samlp:Response>".concat("<saml:Assertion ID='a'>".repeat(40_000)),
      `<samlp:Response a="${"x".repeat(400_000)}`,
      `<samlp:Response>${"<!--".repeat(100_000)}`,
      `<samlp:Response ${"a='1' ".repeat(60_000)}>`,
    ]) {
      const started = performance.now();
      readSamlResponse(hostile);
      expect(performance.now() - started).toBeLessThan(500);
    }
  });
});

describe("what QRdx refuses from a sign-in started at the IdP", () => {
  const problem = (options: Parameters<typeof idp.xml>[0]) => {
    const facts = readSamlResponse(idp.xml(options));
    if (!facts) throw new Error("unreadable");
    return samlIdpInitiatedProblem(facts);
  };

  it("takes one plaintext assertion with an ID and an expiry", () => {
    expect(problem(base)).toBeNull();
    expect(problem({ ...base, sign: "response" })).toBeNull();
  });

  it("refuses one it couldn't record as used", () => {
    // No ID: the plugin would only warn, and the response could be replayed.
    expect(problem({ ...base, assertionId: null, sign: "response" })).toMatch(
      /without an ID/,
    );
    expect(problem({ ...base, assertionId: " ", sign: "response" })).toMatch(
      /without an ID/,
    );
    const encrypted = readSamlResponse(
      `<samlp:Response><saml:EncryptedAssertion><x/></saml:EncryptedAssertion></samlp:Response>`,
    );
    expect(samlIdpInitiatedProblem(encrypted as never)).toMatch(/encrypted/);
    const two = readSamlResponse(
      `<samlp:Response><saml:Assertion ID="_a"><saml:Conditions NotOnOrAfter="2099-01-01T00:00:00Z"/></saml:Assertion><saml:Assertion ID="_b"/></samlp:Response>`,
    );
    expect(samlIdpInitiatedProblem(two as never)).toMatch(/exactly one/);
  });

  it("refuses one without an expiry to keep that record until", () => {
    expect(problem({ ...base, notOnOrAfter: null })).toMatch(/expiry/);
    const bad = readSamlResponse(
      `<samlp:Response><saml:Assertion ID="_a"><saml:Conditions NotOnOrAfter="soon"/></saml:Assertion></samlp:Response>`,
    );
    expect(samlIdpInitiatedProblem(bad as never)).toMatch(/expiry/);
  });

  it("refuses an answer to a request it doesn't name", () => {
    // The plugin would see no InResponseTo and skip its request check.
    expect(problem({ ...base, confirmationInResponseTo: "_req1" })).toMatch(
      /doesn't name/,
    );
  });
});

describe("where a sign-in started at the IdP lands", () => {
  it("on the page its RelayState names", () => {
    expect(ssoIdpLandingPath("/dashboard/acme")).toBe("/dashboard/acme");
    expect(ssoIdpLandingPath("/dashboard/acme/codes?folder=x#top")).toBe(
      "/dashboard/acme/codes?folder=x#top",
    );
    expect(ssoIdpLandingPath("/settings/account")).toBe("/settings/account");
  });

  it("drops a sign-in outcome from the query", () => {
    expect(
      ssoIdpLandingPath(
        "/settings/account?confirm=signed-in&error=x&error_description=y&tab=1",
      ),
    ).toBe("/settings/account?tab=1");
  });

  it("on the dashboard otherwise", () => {
    expect(SSO_IDP_LANDING_PATH).toBe("/dashboard");
    for (const relayState of [
      undefined,
      null,
      "",
      42,
      "https://evil.example/dashboard",
      "http://localhost:3000/dashboard",
      "//evil.example/x",
      // These normalise to "//evil.example".
      "/.//evil.example",
      "/..//evil.example",
      "/%2e//evil.example",
      "/./%2e//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "dashboard",
      " /dashboard",
      "/dash board",
      "/dashboard\n",
      "/dash\tboard",
      "/dashboard\u0000",
      "/sign-in",
      "/sign-in/two-factor?next=/x",
      "/api/auth/sign-out",
      "/api",
      `/${"a".repeat(2048)}`,
      // An opaque plugin state, or the IdP's own token.
      "eyJhbGciOiJIUzI1NiJ9.e30.x",
    ]) {
      expect(ssoIdpLandingPath(relayState), JSON.stringify(relayState)).toBe(
        SSO_IDP_LANDING_PATH,
      );
    }
    // An encoded backslash stays encoded: a path segment, never a host.
    expect(ssoIdpLandingPath("/%5Cevil.example")).toBe("/%5Cevil.example");
  });

  it("swaps the plugin's default redirect for the landing, keeping a refusal", () => {
    const origin = "http://localhost:3000";
    expect(ssoIdpLandingRedirect("/dashboard", "/dashboard/acme", origin)).toBe(
      "/dashboard/acme",
    );
    expect(
      ssoIdpLandingRedirect(
        `${origin}/dashboard?error=replay_detected&error_description=used`,
        "/dashboard/acme?tab=1",
        origin,
      ),
    ).toBe(
      "/dashboard/acme?tab=1&error=replay_detected&error_description=used",
    );
    // Nothing to change, or not the plugin's default.
    expect(ssoIdpLandingRedirect("/dashboard", "/dashboard", origin)).toBe(
      null,
    );
    expect(
      ssoIdpLandingRedirect("/sign-in?error=x", "/dashboard/acme", origin),
    ).toBe(null);
    expect(
      ssoIdpLandingRedirect(
        "https://evil.example/dashboard",
        "/dashboard/acme",
        origin,
      ),
    ).toBe(null);
    expect(ssoIdpLandingRedirect(null, "/dashboard/acme", origin)).toBe(null);
  });
});

describe("what the sign-in page says", () => {
  it("for a sign-in from the app list QRdx refused", () => {
    const message = ssoSignInErrorMessage("unsolicited_response");
    expect(message).toMatch(/couldn't accept this sign-in/);
    expect(message).toMatch(/Start from QRdx's sign-in page/);
    expect(signInErrorMessage("unsolicited_response", null)).toBe(message);
  });

  it("for one that was already used", () => {
    expect(signInErrorMessage("replay_detected", null)).toBe(
      "That sign-in has already been used. Sign in again.",
    );
  });
});
