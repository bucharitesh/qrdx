// A SAML identity provider for tests: an RSA key, a self-signed certificate
// (built here, so no openssl is needed) and signed SAML responses, signed
// with samlify, the SSO plugin's own dependency. Nothing leaves the process.
//
//   const idp = createTestIdp();
//   idp.cert                       // PEM, for the connection's samlConfig
//   idp.response({ email, acs, audience })   // base64 SAMLResponse
import {
  generateKeyPairSync,
  type KeyObject,
  randomBytes,
  sign,
  X509Certificate,
} from "node:crypto";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

// samlify, resolved from the SSO plugin's own dependencies (apps/docs
// doesn't depend on it).
const pluginPackage = realpathSync(
  path.resolve(
    import.meta.dirname,
    "../../../../packages/auth/node_modules/@better-auth/sso/package.json",
  ),
);
const samlify = createRequire(pluginPackage)("samlify") as {
  SamlLib: {
    constructSAMLSignature(options: Record<string, unknown>): string;
  };
};

// ─── A self-signed X.509 certificate, DER by hand ───────────────────────────

function derLength(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}

const sequence = (...parts: Buffer[]) => tlv(0x30, ...parts);
const set = (...parts: Buffer[]) => tlv(0x31, ...parts);
const NULL = Buffer.from([0x05, 0x00]);

function oid(dotted: string): Buffer {
  const [first = 0, second = 0, ...rest] = dotted.split(".").map(Number);
  const out = [40 * first + second];
  for (const n of rest) {
    const chunk = [n & 0x7f];
    for (let v = Math.floor(n / 128); v > 0; v = Math.floor(v / 128)) {
      chunk.unshift((v & 0x7f) | 0x80);
    }
    out.push(...chunk);
  }
  return tlv(0x06, Buffer.from(out));
}

function utcTime(date: Date): Buffer {
  const iso = date.toISOString(); // 2026-11-08T12:34:56.789Z
  const text = `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return tlv(0x17, Buffer.from(text, "ascii"));
}

const SHA256_WITH_RSA = "1.2.840.113549.1.1.11";

/** A PEM certificate for `publicKey`, signed by its own private key. */
export function selfSignedCertificate(
  privateKey: KeyObject,
  publicKey: KeyObject,
  commonName: string,
): string {
  const name = sequence(
    set(sequence(oid("2.5.4.3"), tlv(0x0c, Buffer.from(commonName, "utf8")))),
  );
  const algorithm = sequence(oid(SHA256_WITH_RSA), NULL);
  const serial = randomBytes(8);
  serial[0] = (serial[0] & 0x7f) | 0x01; // positive, minimal
  const now = Date.now();
  const tbs = sequence(
    tlv(0xa0, tlv(0x02, Buffer.from([2]))), // v3
    tlv(0x02, serial),
    algorithm,
    name,
    sequence(
      utcTime(new Date(now - 24 * 60 * 60 * 1000)),
      utcTime(new Date(now + 30 * 24 * 60 * 60 * 1000)),
    ),
    name,
    publicKey.export({ type: "spki", format: "der" }),
  );
  const signature = sign("sha256", tbs, privateKey);
  const der = sequence(
    tbs,
    algorithm,
    tlv(0x03, Buffer.concat([Buffer.from([0]), signature])),
  );
  const body =
    der
      .toString("base64")
      .match(/.{1,64}/g)
      ?.join("\n") ?? "";
  const pem = `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
  // Throws when the DER above isn't a certificate.
  new X509Certificate(pem);
  return pem;
}

// ─── SAML responses ─────────────────────────────────────────────────────────

const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
const EMAIL_NAME_ID = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress";

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c] as string,
  );

export interface TestSamlResponse {
  email: string;
  /** The ACS URL: the Recipient and Destination */
  acs: string;
  /** QRdx's entity ID for the connection */
  audience: string;
  /** Another issuer than the IdP's own */
  issuer?: string;
  /** On the Response: absent for a sign-in started at the IdP */
  inResponseTo?: string;
  /** On SubjectConfirmationData */
  confirmationInResponseTo?: string;
  /** The assertion's ID; null leaves it out */
  assertionId?: string | null;
  /** Conditions; null leaves the attribute out */
  notBefore?: Date | null;
  notOnOrAfter?: Date | null;
  /** SubjectConfirmationData NotOnOrAfter (default: notOnOrAfter or +5 min) */
  confirmationNotOnOrAfter?: Date;
  /** What's signed (default: the assertion, as most IdPs do) */
  sign?: "assertion" | "response" | "both" | "none";
  algorithm?: "sha256" | "sha1";
  /** Sign with this key and certificate instead (another IdP) */
  signer?: { keyPem: string; cert: string };
  /** XML put inside the assertion, after its Issuer (comments, say) */
  insideAssertion?: string;
  /** XML put before the root element */
  beforeRoot?: string;
  /** Changes the finished XML, after signing (an attacker's edit) */
  afterSigning?: (xml: string) => string;
}

export interface TestIdp {
  entityId: string;
  cert: string;
  keyPem: string;
  /** The response's XML */
  xml(options: TestSamlResponse): string;
  /** The response, base64, as an IdP posts it */
  response(options: TestSamlResponse): string;
}

function signXml(
  xml: string,
  element: "Assertion" | "Response",
  signer: { keyPem: string; cert: string },
  algorithm: "sha256" | "sha1",
): string {
  return samlify.SamlLib.constructSAMLSignature({
    rawSamlMessage: xml,
    referenceTagXPath: `/*[local-name(.)='${element}']`,
    privateKey: signer.keyPem,
    privateKeyPass: undefined,
    signatureAlgorithm: algorithm === "sha1" ? RSA_SHA1 : RSA_SHA256,
    // samlify wants the certificate's base64 body, without the PEM armour.
    signingCert: signer.cert.replace(/-----[^-]+-----|\s+/g, ""),
    isBase64Output: false,
    signatureConfig: {
      prefix: "ds",
      location: {
        reference: `/*[local-name(.)='${element}']/*[local-name(.)='Issuer']`,
        action: "after",
      },
    },
  });
}

export function createTestIdp(
  entityId = "https://idp.acme.test/saml/metadata",
): TestIdp {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const cert = selfSignedCertificate(privateKey, publicKey, "QRdx test IdP");
  const keyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  function xml(options: TestSamlResponse): string {
    const now = new Date();
    const later = new Date(now.getTime() + 5 * 60 * 1000);
    const issuer = escapeXml(options.issuer ?? entityId);
    const notBefore = options.notBefore === undefined ? now : options.notBefore;
    const notOnOrAfter =
      options.notOnOrAfter === undefined ? later : options.notOnOrAfter;
    const confirmationExpiry =
      options.confirmationNotOnOrAfter ?? notOnOrAfter ?? later;
    const assertionId =
      options.assertionId === undefined
        ? `_${randomBytes(16).toString("hex")}`
        : options.assertionId;
    const signer = options.signer ?? { keyPem, cert };
    const algorithm = options.algorithm ?? "sha256";
    const signWhat = options.sign ?? "assertion";
    const conditionTimes = [
      notBefore ? ` NotBefore="${notBefore.toISOString()}"` : "",
      notOnOrAfter ? ` NotOnOrAfter="${notOnOrAfter.toISOString()}"` : "",
    ].join("");
    const answered = options.confirmationInResponseTo
      ? ` InResponseTo="${escapeXml(options.confirmationInResponseTo)}"`
      : "";
    const email = escapeXml(options.email);
    let assertion = `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"${assertionId === null ? "" : ` ID="${escapeXml(assertionId)}"`} Version="2.0" IssueInstant="${now.toISOString()}"><saml:Issuer>${issuer}</saml:Issuer>${options.insideAssertion ?? ""}<saml:Subject><saml:NameID Format="${EMAIL_NAME_ID}">${email}</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData NotOnOrAfter="${confirmationExpiry.toISOString()}" Recipient="${escapeXml(options.acs)}"${answered}/></saml:SubjectConfirmation></saml:Subject><saml:Conditions${conditionTimes}><saml:AudienceRestriction><saml:Audience>${escapeXml(options.audience)}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${now.toISOString()}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement><saml:Attribute Name="email"><saml:AttributeValue>${email}</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion>`;
    if (signWhat === "assertion" || signWhat === "both") {
      assertion = signXml(assertion, "Assertion", signer, algorithm);
    }
    const inResponseTo = options.inResponseTo
      ? ` InResponseTo="${escapeXml(options.inResponseTo)}"`
      : "";
    let response = `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_${randomBytes(16).toString("hex")}" Version="2.0" IssueInstant="${now.toISOString()}" Destination="${escapeXml(options.acs)}"${inResponseTo}><saml:Issuer>${issuer}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${assertion}</samlp:Response>`;
    if (signWhat === "response" || signWhat === "both") {
      response = signXml(response, "Response", signer, algorithm);
    }
    const finished = `${options.beforeRoot ?? ""}${response}`;
    return options.afterSigning ? options.afterSigning(finished) : finished;
  }

  return {
    entityId,
    cert,
    keyPem,
    xml,
    response: (options) => Buffer.from(xml(options)).toString("base64"),
  };
}
