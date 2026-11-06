// Workspace SSO: the pure rules (packages/auth/ee/sso-rules.ts), the plan gate
// in lib/plans.ts, the settings helpers that read IdP metadata, and the
// sign-in messages. The plugin wiring is in sso-auth.test.ts; the full flows
// run in e2e/sso.e2e.mts.
import {
  DEFAULT_SSO_JOIN_ROLE,
  domainCovers,
  domainsOverlap,
  emailDomain,
  emailInSsoDomain,
  isSsoJoinRole,
  isSsoProviderId,
  looksLikeEmail,
  newSsoProviderId,
  normalizeSsoDomain,
  SSO_JOIN_ROLES,
  samlPersonName,
  samlWeakAlgorithms,
  saysNotVerified,
  ssoEmailUnverified,
  ssoErrorCode,
  ssoFailureRedirect,
  ssoJoinRoleFromMetadata,
  ssoServiceProviderUrls,
  ssoVerificationRecord,
} from "@repo/auth/sso-rules";
import { describe, expect, it } from "vitest";
import {
  describeCertificate,
  readIdpMetadata,
  withUnsignedSignInRequests,
} from "@/ee/sso/connections";
import { ssoSignInErrorMessage } from "@/ee/sso/messages";
import { can, WORKSPACE_ROLES } from "@/lib/permissions";
import { cheapestPlanWith, PLAN_LIMITS, PLANS } from "@/lib/plans";

describe("plan gate", () => {
  it("only Business includes SSO", () => {
    expect(PLANS.filter((plan) => PLAN_LIMITS[plan].sso)).toEqual(["business"]);
    expect(cheapestPlanWith((limits) => limits.sso)).toBe("business");
  });
});

describe("who manages SSO", () => {
  it("owners and admins, nobody else", () => {
    expect(WORKSPACE_ROLES.filter((role) => can(role, "sso.manage"))).toEqual([
      "owner",
      "admin",
    ]);
  });
});

describe("normalizeSsoDomain", () => {
  it("accepts domains, addresses and @domains", () => {
    expect(normalizeSsoDomain("Acme.com")).toBe("acme.com");
    expect(normalizeSsoDomain(" acme.com. ")).toBe("acme.com");
    expect(normalizeSsoDomain("@eu.acme.co.uk")).toBe("eu.acme.co.uk");
    expect(normalizeSsoDomain("ana@acme.com")).toBe("acme.com");
    expect(normalizeSsoDomain("xn--bcher-kva.example")).toBe(
      "xn--bcher-kva.example",
    );
  });

  it("refuses what isn't one email domain", () => {
    for (const input of [
      "",
      "acme",
      "localhost",
      "10.0.0.1",
      "acme.com:443",
      "*.acme.com",
      "acme.com,other.com",
      "https://acme.com",
      "acme..com",
      "-acme.com",
      "acme.123",
      `${"a".repeat(64)}.com`,
    ]) {
      expect(normalizeSsoDomain(input), input).toBeNull();
    }
  });
});

describe("domains and addresses", () => {
  it("a connection covers its domain and subdomains only", () => {
    expect(domainCovers("acme.com", "acme.com")).toBe(true);
    expect(domainCovers("acme.com", "eu.acme.com")).toBe(true);
    expect(domainCovers("acme.com", "notacme.com")).toBe(false);
    expect(domainCovers("eu.acme.com", "acme.com")).toBe(false);
  });

  it("overlap works both ways (one verified domain per workspace)", () => {
    expect(domainsOverlap("acme.com", "eu.acme.com")).toBe(true);
    expect(domainsOverlap("eu.acme.com", "acme.com")).toBe(true);
    expect(domainsOverlap("acme.com", "acme.co")).toBe(false);
  });

  it("matches addresses to the connection's domain", () => {
    expect(emailDomain("Ana@Acme.com")).toBe("acme.com");
    expect(emailDomain("not-an-address")).toBeNull();
    expect(emailDomain("a@b@acme.com")).toBeNull();
    expect(emailInSsoDomain("ana@eu.acme.com", "acme.com")).toBe(true);
    expect(emailInSsoDomain("ana@acme.com.evil.test", "acme.com")).toBe(false);
    expect(emailInSsoDomain("ana@evilacme.com", "acme.com")).toBe(false);
  });
});

describe("connection ids", () => {
  it("are random and fit a DNS label with the record prefix", () => {
    const a = newSsoProviderId();
    const b = newSsoProviderId();
    expect(a).not.toBe(b);
    expect(isSsoProviderId(a)).toBe(true);
    expect(`_qrdx-${a}`.length).toBeLessThanOrEqual(63);
    expect(isSsoProviderId("google")).toBe(false);
    expect(isSsoProviderId("sso-UPPERCASE123")).toBe(false);
  });
});

describe("join role", () => {
  it("is member or viewer, member by default, never owner, admin or billing", () => {
    expect(SSO_JOIN_ROLES).toEqual(["member", "viewer"]);
    expect(DEFAULT_SSO_JOIN_ROLE).toBe("member");
    expect(ssoJoinRoleFromMetadata(null)).toBe("member");
    expect(ssoJoinRoleFromMetadata('{"ssoJoinRole":"viewer"}')).toBe("viewer");
    expect(ssoJoinRoleFromMetadata({ ssoJoinRole: "viewer" })).toBe("viewer");
    for (const role of ["owner", "admin", "billing", "", 1]) {
      expect(ssoJoinRoleFromMetadata({ ssoJoinRole: role })).toBe("member");
      expect(isSsoJoinRole(role)).toBe(false);
    }
    expect(ssoJoinRoleFromMetadata("not json")).toBe("member");
  });
});

describe("URLs for the identity provider", () => {
  it("are built from the app URL and the connection id", () => {
    const urls = ssoServiceProviderUrls(
      "https://qrdx.dev/",
      "sso-abc123def456",
    );
    expect(urls).toEqual({
      oidcRedirectUri:
        "https://qrdx.dev/api/auth/sso/callback/sso-abc123def456",
      samlAcsUrl: "https://qrdx.dev/api/auth/sso/saml2/sp/acs/sso-abc123def456",
      samlEntityId:
        "https://qrdx.dev/api/auth/sso/saml2/sp/metadata?providerId=sso-abc123def456",
      samlMetadataUrl:
        "https://qrdx.dev/api/auth/sso/saml2/sp/metadata?providerId=sso-abc123def456",
    });
    // Only the origin counts.
    expect(
      ssoServiceProviderUrls("http://localhost:3000/x/y", "sso-1").samlAcsUrl,
    ).toBe("http://localhost:3000/api/auth/sso/saml2/sp/acs/sso-1");
  });

  it("the TXT record matches the plugin's identifier", () => {
    // @better-auth/sso: `_${tokenPrefix}-${providerId}` on each domain.
    expect(ssoVerificationRecord("sso-abc", "acme.com", "tok")).toEqual({
      type: "TXT",
      name: "_qrdx-sso-abc.acme.com",
      value: "tok",
    });
  });
});

describe("IdP metadata", () => {
  const xml = `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.acme.com/saml">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing"><ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:X509Data><ds:X509Certificate>
      MIIBfake
    </ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.acme.com/post"/>
    <md:SingleSignOnService Location="https://idp.acme.com/sso?a=1&amp;b=2" Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`;

  it("reads the entity ID, the HTTP-Redirect sign-in URL and the certificate", () => {
    expect(readIdpMetadata(xml)).toEqual({
      entityId: "https://idp.acme.com/saml",
      ssoUrl: "https://idp.acme.com/sso?a=1&b=2",
      certificate: "MIIBfake",
    });
  });

  it("finds no sign-in URL without an HTTP-Redirect binding", () => {
    expect(
      readIdpMetadata(xml.replace(":HTTP-Redirect", ":HTTP-Artifact")).ssoUrl,
    ).toBeNull();
  });

  it("refuses an unreadable certificate", () => {
    expect(describeCertificate("MIIBfake")).toBeNull();
    expect(describeCertificate("not a certificate")).toBeNull();
  });

  it("stores metadata that asks for signed sign-in requests as not asking", () => {
    const asks = xml.replace(
      "<md:IDPSSODescriptor ",
      '<md:IDPSSODescriptor WantAuthnRequestsSigned="true" ',
    );
    const stored = withUnsignedSignInRequests(asks);
    expect(stored).toContain(
      '<md:IDPSSODescriptor WantAuthnRequestsSigned="false" ',
    );
    expect(stored.replace('="false"', '="true"')).toBe(asks);
    expect(
      withUnsignedSignInRequests(
        "<IDPSSODescriptor protocolSupportEnumeration='p' WantAuthnRequestsSigned = '1'>",
      ),
    ).toBe(
      "<IDPSSODescriptor protocolSupportEnumeration='p' WantAuthnRequestsSigned = 'false'>",
    );
  });

  it("leaves other metadata as it is", () => {
    expect(withUnsignedSignInRequests(xml)).toBe(xml);
    const doesNotAsk = xml.replace(
      "<md:IDPSSODescriptor ",
      '<md:IDPSSODescriptor WantAuthnRequestsSigned="false" ',
    );
    expect(withUnsignedSignInRequests(doesNotAsk)).toBe(doesNotAsk);
    // Only the identity provider's descriptor, never an SP's in the same file.
    const sp =
      '<md:SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="true">';
    expect(withUnsignedSignInRequests(sp)).toBe(sp);
  });
});

describe("sign-in messages", () => {
  it("name the domain from the server, never from the URL", () => {
    expect(
      ssoSignInErrorMessage("SSO_NOT_FOUND", "No SSO is set up for acme.com."),
    ).toBe("No SSO is set up for acme.com.");
    // The /sign-in page passes only the code.
    expect(ssoSignInErrorMessage("SSO_NOT_FOUND")).toBe(
      "SSO isn't set up for that address.",
    );
    expect(ssoSignInErrorMessage("sso_unavailable")).toMatch(/isn't available/);
    expect(ssoSignInErrorMessage("whatever")).toMatch(/didn't work/);
  });

  it("say what the identity provider got wrong", () => {
    expect(ssoSignInErrorMessage("sso_email_unverified")).toBe(
      "Your company's sign-in system hasn't confirmed this email address, so QRdx can't sign you in with it. Its admin needs to verify email addresses there.",
    );
    expect(ssoSignInErrorMessage("sso_email_missing")).toMatch(
      /didn't send an email address/,
    );
    expect(ssoSignInErrorMessage("sso_email_missing")).not.toMatch(/domain/);
    expect(ssoSignInErrorMessage("sso_weak_signature")).toMatch(
      /SHA-1.*switch the QRdx app's signature algorithm to SHA-256/,
    );
    expect(ssoSignInErrorMessage("unsolicited_response")).toMatch(
      /Start from QRdx's sign-in page/,
    );
  });
});

describe("what the identity provider sends", () => {
  it("counts only an explicit no as unverified", () => {
    for (const no of [false, 0, "false", "FALSE", " 0 ", ["true", "false"]]) {
      expect(saysNotVerified(no), JSON.stringify(no)).toBe(true);
    }
    for (const notNo of [
      true,
      "true",
      1,
      "1",
      undefined,
      null,
      "",
      "yes",
      [],
    ]) {
      expect(saysNotVerified(notNo), JSON.stringify(notNo)).toBe(false);
    }
  });

  it("reads email_verified for OIDC and an email-verified attribute for SAML", () => {
    expect(ssoEmailUnverified("oidc", { email_verified: false })).toBe(true);
    expect(ssoEmailUnverified("oidc", { email_verified: "false" })).toBe(true);
    expect(ssoEmailUnverified("oidc", { email_verified: 0 })).toBe(true);
    expect(ssoEmailUnverified("oidc", { email_verified: true })).toBe(false);
    expect(ssoEmailUnverified("oidc", { email: "a@b.co" })).toBe(false);
    expect(ssoEmailUnverified("oidc", null)).toBe(false);
    expect(ssoEmailUnverified("saml", { email_verified: ["false"] })).toBe(
      true,
    );
    expect(ssoEmailUnverified("saml", { emailVerified: "false" })).toBe(true);
    expect(ssoEmailUnverified("saml", { emailVerified: "true" })).toBe(false);
    expect(ssoEmailUnverified("saml", { email: "a@b.co" })).toBe(false);
  });

  it("tells an email address from a user name or an opaque id", () => {
    expect(looksLikeEmail("ana@acme.com")).toBe(true);
    for (const value of ["ulla", "G-29a5e34a-f01e-4d86", "", "a@b", null]) {
      expect(looksLikeEmail(value), String(value)).toBe(false);
    }
  });

  it("names a SAML user from the common attribute names, never the NameID", () => {
    expect(samlPersonName({ givenName: "Ivy", surname: "Mapped" })).toBe(
      "Ivy Mapped",
    );
    expect(
      samlPersonName({
        "urn:oid:2.5.4.42": ["Xena"],
        "urn:oid:2.5.4.4": ["Oid"],
      }),
    ).toBe("Xena Oid");
    expect(samlPersonName({ firstName: "Fay", lastName: "Existing" })).toBe(
      "Fay Existing",
    );
    expect(samlPersonName({ givenName: "Solo" })).toBe("Solo");
    expect(
      samlPersonName({ "urn:oid:2.16.840.1.113730.3.1.241": "Dee Splay" }),
    ).toBe("Dee Splay");
    expect(samlPersonName({ displayName: "Dee", name: "Other" })).toBe("Dee");
    expect(samlPersonName({ name: "Nam E" })).toBe("Nam E");
    // Given and surname win over a display name; blanks are skipped.
    expect(
      samlPersonName({ givenName: " ", surname: "Last", displayName: "D" }),
    ).toBe("Last");
    // Nothing usable: "" (the account starts with the address's local part).
    expect(samlPersonName({ Role: ["admin"] })).toBe("");
    expect(samlPersonName(null)).toBe("");
  });
});

describe("SAML signature algorithms", () => {
  const signed = (signature: string, digest: string) =>
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"><ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/><ds:SignatureMethod Algorithm="${signature}"/><ds:Reference URI="#x"><ds:DigestMethod Algorithm="${digest}"/></ds:Reference></ds:SignedInfo></ds:Signature></samlp:Response>`;
  const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
  const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
  const RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
  const SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1";

  it("accepts SHA-256 or stronger", () => {
    expect(samlWeakAlgorithms(signed(RSA_SHA256, SHA256))).toEqual([]);
    expect(
      samlWeakAlgorithms(
        signed(
          "http://www.w3.org/2001/04/xmldsig-more#rsa-sha512",
          "http://www.w3.org/2001/04/xmlenc#sha512",
        ),
      ),
    ).toEqual([]);
    // Unsigned: nothing to judge here (the plugin refuses it).
    expect(samlWeakAlgorithms("<samlp:Response/>")).toEqual([]);
  });

  it("refuses SHA-1 signatures or digests, in any form", () => {
    expect(samlWeakAlgorithms(signed(RSA_SHA1, SHA256))).toEqual([RSA_SHA1]);
    expect(samlWeakAlgorithms(signed(RSA_SHA256, SHA1))).toEqual([SHA1]);
    // No prefix, single quotes, and a ">" inside another attribute's value.
    expect(
      samlWeakAlgorithms(
        `<SignatureMethod Id="a>b" Algorithm='${RSA_SHA1}'/><DigestMethod Algorithm="${SHA256}"/>`,
      ),
    ).toEqual([RSA_SHA1]);
    // A second signature (the assertion's) is checked too.
    expect(
      samlWeakAlgorithms(
        signed(RSA_SHA256, SHA256) + signed(RSA_SHA256, "urn:unknown"),
      ),
    ).toEqual(["urn:unknown"]);
    expect(samlWeakAlgorithms("<ds:SignatureMethod/>")).toEqual(["(none)"]);
  });
});

describe("ssoFailureRedirect", () => {
  const app = "http://localhost:3000";
  it("sends a refused sign-in to /sign-in with the page it was going to", () => {
    // The SAML plugin's "account not linked" goes to the success URL.
    expect(
      ssoFailureRedirect(`${app}/dashboard?error=account_not_linked`, app),
    ).toBe("/sign-in?next=%2Fdashboard&error=account_not_linked");
    expect(
      ssoFailureRedirect(
        `${app}/invite/abc?x=1&error=account%20not%20linked&error_description=nope`,
        app,
      ),
    ).toBe("/sign-in?next=%2Finvite%2Fabc%3Fx%3D1&error=account_not_linked");
  });

  it("never keeps the auth API or another site as next", () => {
    expect(
      ssoFailureRedirect(`${app}/api/auth/error?error=invalid_state`, app),
    ).toBe("/sign-in?error=invalid_state");
    expect(
      ssoFailureRedirect("https://evil.test/x?error=account_not_linked", app),
    ).toBe("/sign-in?error=account_not_linked");
  });

  it("gives the plugin's own words QRdx's code", () => {
    expect(ssoErrorCode("invalid_provider", "missing_user_info")).toBe(
      "sso_email_missing",
    );
    expect(
      ssoErrorCode(
        "saml_error",
        "Unable to extract user ID or email from SAML response",
      ),
    ).toBe("sso_email_missing");
    expect(ssoErrorCode("invalid_provider", "token_not_verified")).toBe(
      "invalid_provider",
    );
    expect(ssoErrorCode("account not linked")).toBe("account_not_linked");
    // OIDC failures already land on /sign-in: only the code changes.
    expect(
      ssoFailureRedirect(
        `${app}/sign-in?next=%2Fdashboard&error=invalid_provider&error_description=missing_user_info`,
        app,
      ),
    ).toBe("/sign-in?next=%2Fdashboard&error=sso_email_missing");
  });

  it("leaves successes and the sign-in page alone", () => {
    expect(ssoFailureRedirect(`${app}/dashboard`, app)).toBeNull();
    expect(ssoFailureRedirect(null, app)).toBeNull();
    expect(
      ssoFailureRedirect(`${app}/sign-in?next=%2Fdashboard&error=x`, app),
    ).toBeNull();
  });
});
