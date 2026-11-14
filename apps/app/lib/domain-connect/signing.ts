import {
  createPrivateKey,
  createPublicKey,
  type KeyObject,
  sign,
  verify,
} from "node:crypto";

// domain-connect/keys.mjs imports this file with Node's type stripping: keep
// it free of path aliases and of TypeScript that isn't erasable.
//
// Domain Connect request signing (spec "Digitally Sign Requests"): RSA with
// SHA-256 and PKCS#1 v1.5 over the apply URL's query string, base64. The
// public key (DER SubjectPublicKeyInfo, base64) is published as TXT records
// `p=<n>,a=RS256,d=<part>` under the template's syncPubKeyDomain.

export interface SigningKey {
  privateKey: KeyObject;
  /** Base64 DER SubjectPublicKeyInfo, as published in DNS */
  publicKey: string;
}

const MIN_MODULUS_BITS = 2048;

/**
 * Reads DOMAIN_CONNECT_PRIVATE_KEY: an RSA private key in PEM. Hosts that
 * can't store newlines may write them as `\n`. Null when it isn't a usable
 * RSA key of at least 2048 bits.
 */
export function parseSigningKey(pem: string): SigningKey | null {
  const text = pem.replace(/\\n/g, "\n").trim();
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey(text);
  } catch {
    return null;
  }
  const bits = privateKey.asymmetricKeyDetails?.modulusLength ?? 0;
  if (privateKey.asymmetricKeyType !== "rsa" || bits < MIN_MODULUS_BITS) {
    return null;
  }
  const publicKey = createPublicKey(privateKey)
    .export({ type: "spki", format: "der" })
    .toString("base64");
  return { privateKey, publicKey };
}

/** The `sig` value for a query string (base64, before URL encoding). */
export function signQuery(query: string, privateKey: KeyObject): string {
  return sign("sha256", Buffer.from(query, "utf8"), privateKey).toString(
    "base64",
  );
}

/** What a DNS provider checks: `signature` over `query` with the published key. */
export function verifyQuery(
  query: string,
  signature: string,
  publicKey: string,
): boolean {
  try {
    return verify(
      "sha256",
      Buffer.from(query, "utf8"),
      {
        key: Buffer.from(publicKey, "base64"),
        format: "der",
        type: "spki",
      },
      Buffer.from(signature, "base64"),
    );
  } catch {
    return false;
  }
}

// One TXT string holds at most 255 bytes; 200 key characters plus the
// `p=10,a=RS256,d=` prefix stay well under it.
const TXT_KEY_CHARS = 200;

/** TXT record values that publish `publicKey`, one record each. */
export function publicKeyTxtValues(publicKey: string): string[] {
  const values: string[] = [];
  for (let start = 0; start < publicKey.length; start += TXT_KEY_CHARS) {
    const part = publicKey.slice(start, start + TXT_KEY_CHARS);
    values.push(`p=${values.length + 1},a=RS256,d=${part}`);
  }
  return values;
}

/**
 * The public key from the TXT records at `<key>.<syncPubKeyDomain>`, parts
 * joined in `p` order. Null when parts are missing, repeated or not RS256.
 */
export function publicKeyFromTxt(answers: readonly string[][]): string | null {
  const parts = new Map<number, string>();
  for (const chunks of answers) {
    const fields = new Map<string, string>();
    for (const field of chunks.join("").split(",")) {
      const at = field.indexOf("=");
      if (at > 0) {
        fields.set(field.slice(0, at).trim(), field.slice(at + 1).trim());
      }
    }
    const index = Number(fields.get("p"));
    const data = fields.get("d");
    // Defaults per the spec: a=RS256, t=x509.
    if ((fields.get("a") ?? "RS256") !== "RS256") return null;
    if ((fields.get("t") ?? "x509") !== "x509") return null;
    if (!(Number.isInteger(index) && index > 0 && data)) continue;
    if (parts.has(index)) return null;
    parts.set(index, data);
  }
  if (parts.size === 0) return null;
  let key = "";
  for (let index = 1; index <= parts.size; index++) {
    const part = parts.get(index);
    if (part === undefined) return null;
    key += part;
  }
  return key;
}
