// Domain Connect request signing and apply URLs (lib/domain-connect). The
// known-answer vectors come from the Domain Connect spec (its example public
// key, published as TXT records) and the reference library's tests
// (github.com/Domain-Connect/domainconnect_python, test_generate_sig_params).
// Keys are generated in the test; nothing touches the network.
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  applyQuery,
  buildApplyUrl,
  encodeQuery,
  formEncode,
} from "@/lib/domain-connect/apply-url";
import {
  parseSigningKey,
  publicKeyFromTxt,
  publicKeyTxtValues,
  signQuery,
  verifyQuery,
} from "@/lib/domain-connect/signing";

/** The spec's example public key as its three TXT records. */
const SPEC_KEY_TXT = [
  "p=1,a=RS256,d=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA18SgvpmeasN4BHkkv0SBjAzIc4grYLjiAXRtNiBUiGUDMeTzQrKTsWvy9NuxU1dIHCZy9o1CrKNg5EzLIZLNyMfI6qiXnM+HMd4byp97zs/3D39Q8iR5poubQcRaGozWx8yQpG0OcVdmEVcTfy",
  "p=2,a=RS256,d=R/XSEWC5u16EBNvRnNAOAvZYUdWqVyQvXsjnxQot8KcK0QP8iHpoL/1dbdRy2opRPQ2FdZpovUgknybq/6FkeDtW7uCQ6Mvu4QxcUa3+WP9nYHKtgWip/eFxpeb+qLvcLHf1h0JXtxLVdyy6OLk3f2JRYUX2ZZVDvG3biTpeJz6iRzjGg6MfGxXZHjI8",
  "p=3,a=RS256,d=weDjXrJwIDAQAB",
];

/** Reference library: this query string, signed with that key. */
const REFERENCE_QUERY =
  "domain=connect.domains&RANDOMTEXT=shm%3A1552462554%3AHola&IP=132.148.25.185";
const REFERENCE_SIG =
  "pDgKCqDX+YafD8fqchYjayZt6bgf5ncz/JlYVGV0SbZrcUPb5tgMyqpn4g+lY/igpgKYFhkXGcAeNOrQ0aiTu31bLo7ODkK2fWsdz4G+pSa5Lkb7NhwS07o6cpQMcvO8aihA7pU5+IbPd3Im1ncUNol3zfjeyAl+aBkfcXOAl2xnWY8NobMzaI0jqVwPnWperRj5VGfX6vu5mPviDFzcS0RvruRAHv08X8zDp+BvCnpk4L1cWn49/ZceS8Hifo7/kVd4j+dFGvze7H4cGZ2Kx6ZrSShW3a7AwvV6cVGxqn/dQlpYYsHBHlv9Zbhe2pKuqpAhB/xDN2G/jQaDqmcWGw==";

const rsaPem = (modulusLength = 2048) =>
  generateKeyPairSync("rsa", { modulusLength })
    .privateKey.export({ type: "pkcs8", format: "pem" })
    .toString();

const asTxt = (values: string[]) => values.map((value) => [value]);

describe("public key TXT records", () => {
  it("reassembles the spec's example key and verifies the reference signature", () => {
    const key = publicKeyFromTxt(asTxt(SPEC_KEY_TXT));
    expect(key).toHaveLength(392);
    expect(verifyQuery(REFERENCE_QUERY, REFERENCE_SIG, key as string)).toBe(
      true,
    );
    expect(
      verifyQuery(`${REFERENCE_QUERY}&x=1`, REFERENCE_SIG, key as string),
    ).toBe(false);
  });

  it("joins parts in p order, whatever order DNS returns them in", () => {
    const shuffled = [SPEC_KEY_TXT[2], SPEC_KEY_TXT[0], SPEC_KEY_TXT[1]];
    expect(publicKeyFromTxt(asTxt(shuffled as string[]))).toBe(
      publicKeyFromTxt(asTxt(SPEC_KEY_TXT)),
    );
    // A long TXT value arrives as several strings of one record.
    const split = SPEC_KEY_TXT.map((value) => [
      value.slice(0, 100),
      value.slice(100),
    ]);
    expect(publicKeyFromTxt(split)).toBe(publicKeyFromTxt(asTxt(SPEC_KEY_TXT)));
  });

  it("refuses missing, repeated and non-RS256 parts", () => {
    expect(publicKeyFromTxt([])).toBeNull();
    expect(
      publicKeyFromTxt(asTxt([SPEC_KEY_TXT[0], SPEC_KEY_TXT[2]] as string[])),
    ).toBeNull();
    expect(
      publicKeyFromTxt(asTxt([...SPEC_KEY_TXT, SPEC_KEY_TXT[0] as string])),
    ).toBeNull();
    expect(publicKeyFromTxt(asTxt(["p=1,a=ES256,d=abc"]))).toBeNull();
  });

  it("publishes a generated key in records that fit one TXT string each", () => {
    const key = parseSigningKey(rsaPem()) ?? expect.unreachable();
    const values = publicKeyTxtValues(key.publicKey);
    expect(values.length).toBeGreaterThan(1);
    for (const value of values) expect(value.length).toBeLessThanOrEqual(255);
    expect(values[0]).toMatch(/^p=1,a=RS256,d=MIIB/);
    expect(publicKeyFromTxt(asTxt(values))).toBe(key.publicKey);
  });
});

describe("the signing key", () => {
  it("signs so the published key verifies, deterministically", () => {
    const key = parseSigningKey(rsaPem()) ?? expect.unreachable();
    const signature = signQuery("a=1&b=2", key.privateKey);
    expect(signQuery("a=1&b=2", key.privateKey)).toBe(signature);
    expect(verifyQuery("a=1&b=2", signature, key.publicKey)).toBe(true);
    expect(verifyQuery("a=1&b=3", signature, key.publicKey)).toBe(false);
  });

  it("reads PEM with real or escaped newlines", () => {
    const pem = rsaPem();
    const escaped = pem.trim().replace(/\n/g, "\\n");
    expect(parseSigningKey(escaped)?.publicKey).toBe(
      parseSigningKey(pem)?.publicKey,
    );
  });

  it("refuses anything but an RSA key of 2048 bits or more", () => {
    expect(parseSigningKey("not a key")).toBeNull();
    expect(parseSigningKey(rsaPem(1024))).toBeNull();
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" })
      .privateKey.export({ type: "pkcs8", format: "pem" })
      .toString();
    expect(parseSigningKey(ec)).toBeNull();
  });
});

describe("query encoding", () => {
  it("matches the reference library (sorted keys, quote_plus)", () => {
    // test_get_domain_connect_template_sync_url_with_signature
    expect(
      encodeQuery({
        IP: "132.148.25.185",
        RANDOMTEXT: "shm:1531371203:Hejo",
        domain: "example.com",
      }),
    ).toBe(
      "IP=132.148.25.185&RANDOMTEXT=shm%3A1531371203%3AHejo&domain=example.com",
    );
  });

  it("form-encodes like quote_plus", () => {
    expect(formEncode("a b+c/d,e~f*g!h'(i)")).toBe(
      "a+b%2Bc%2Fd%2Ce~f%2Ag%21h%27%28i%29",
    );
  });
});

describe("apply URLs", () => {
  const key = parseSigningKey(rsaPem()) ?? expect.unreachable();
  const request = {
    urlSyncUX: "https://dash.cloudflare.com/domainconnect",
    providerId: "qrdx.dev",
    serviceId: "qrdx",
    domain: "brand.com",
    host: "go",
    groupIds: ["route", "vercel"],
    variables: {
      target: "cname.vercel-dns.com",
      vercel: "go.brand.com,abc123",
    },
    redirectUri: "https://qrdx.dev/dashboard/domains?connected=dom1",
  };
  const signer = {
    keyId: "_dck1",
    sign: (query: string) => signQuery(query, key.privateKey),
  };

  it("builds the spec's path and a sorted query", () => {
    expect(applyQuery(request)).toBe(
      "domain=brand.com&groupId=route%2Cvercel&host=go&redirect_uri=https%3A%2F%2Fqrdx.dev%2Fdashboard%2Fdomains%3Fconnected%3Ddom1&target=cname.vercel-dns.com&vercel=go.brand.com%2Cabc123",
    );
    const url = buildApplyUrl(request, signer);
    expect(
      url.startsWith(
        "https://dash.cloudflare.com/domainconnect/v2/domainTemplates/providers/qrdx.dev/services/qrdx/apply?domain=brand.com&",
      ),
    ).toBe(true);
  });

  it("signs exactly the query before key and sig, with sig last", () => {
    const url = buildApplyUrl(request, signer);
    const [, query = ""] = url.split("?", 2);
    const match = query.match(/^(.*)&key=_dck1&sig=([^&]+)$/);
    expect(match).not.toBeNull();
    const [, signed = "", sig = ""] = match as RegExpMatchArray;
    expect(signed).toBe(applyQuery(request));
    expect(verifyQuery(signed, decodeURIComponent(sig), key.publicKey)).toBe(
      true,
    );
    // The browser and the provider read the same values back.
    const params = new URL(url).searchParams;
    expect(params.get("host")).toBe("go");
    expect(params.get("redirect_uri")).toBe(request.redirectUri);
    expect(params.get("vercel")).toBe("go.brand.com,abc123");
  });

  it("leaves out host at the apex and refuses reserved variable names", () => {
    expect(applyQuery({ ...request, host: "" })).not.toContain("host=");
    expect(() =>
      applyQuery({ ...request, variables: { domain: "evil.com" } }),
    ).toThrow(/can't be a template variable/);
  });
});
