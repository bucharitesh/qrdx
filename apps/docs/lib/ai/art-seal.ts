import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { HttpError } from "@/lib/error-response";

// Scene mode's picture between its two requests (POST /api/ai/art/picture,
// then /api/ai/art). The picture is sealed with AES-256-GCM, so the client
// carries it without being able to see or change it: nothing in it is clear
// text, and it can't be used as a free picture. The seal binds who it was
// made for, what the code will encode and the mode, and expires after 10
// minutes. The key comes from BETTER_AUTH_SECRET through HKDF-SHA256 with an
// info string of its own, so it's never the secret itself and nothing else
// QRdx encrypts or signs can pass for a sealed picture. Nothing is stored.

export const PICTURE_SEAL_MINUTES = 10;
const INFO = "qrdx-ai-art-picture-v1";
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface PictureSealClaims {
  userId: string;
  /** What the code encodes; only its hash is kept */
  text: string;
  mode: "scene";
}

const keyFor = (secret: string) =>
  Buffer.from(hkdfSync("sha256", secret, "", INFO, 32));
const textHash = (text: string) =>
  createHash("sha256").update(text).digest("base64url");

/** `picture` (image bytes) sealed for `claims`, as base64url. */
export function sealPicture(
  picture: Uint8Array,
  claims: PictureSealClaims,
  secret: string,
  now: number = Date.now(),
): string {
  const header = Buffer.from(
    JSON.stringify({
      u: claims.userId,
      t: textHash(claims.text),
      m: claims.mode,
      exp: Math.floor(now / 1000) + PICTURE_SEAL_MINUTES * 60,
    }),
  );
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  cipher.setAAD(Buffer.from([VERSION]));
  const body = Buffer.concat([
    cipher.update(Buffer.concat([length, header, Buffer.from(picture)])),
    cipher.final(),
  ]);
  return Buffer.concat([
    Buffer.from([VERSION]),
    iv,
    cipher.getAuthTag(),
    body,
  ]).toString("base64url");
}

const invalid = () =>
  new HttpError(
    400,
    "AI_ART_PICTURE_INVALID",
    "This picture can't be used. Generate again to paint a new one.",
  );

/**
 * The picture in `seal`, when it's QRdx's, unchanged, for `claims` and not
 * expired. Otherwise a 400 (AI_ART_PICTURE_EXPIRED or AI_ART_PICTURE_INVALID)
 * that the app recovers from by making a new picture.
 */
export function openPicture(
  seal: string,
  claims: PictureSealClaims,
  secret: string,
  now: number = Date.now(),
): Uint8Array {
  const sealed = Buffer.from(seal, "base64url");
  if (sealed.length < 1 + IV_BYTES + TAG_BYTES + 4 || sealed[0] !== VERSION) {
    throw invalid();
  }
  let plain: Buffer;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFor(secret),
      sealed.subarray(1, 1 + IV_BYTES),
    );
    decipher.setAAD(Buffer.from([VERSION]));
    decipher.setAuthTag(
      sealed.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES),
    );
    plain = Buffer.concat([
      decipher.update(sealed.subarray(1 + IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]);
  } catch {
    throw invalid();
  }
  const length = plain.readUInt32BE(0);
  let header: { u?: unknown; t?: unknown; m?: unknown; exp?: unknown };
  try {
    header = JSON.parse(plain.subarray(4, 4 + length).toString("utf8"));
  } catch {
    throw invalid();
  }
  if (
    header.u !== claims.userId ||
    header.t !== textHash(claims.text) ||
    header.m !== claims.mode
  ) {
    throw invalid();
  }
  if (typeof header.exp !== "number" || header.exp * 1000 < now) {
    throw new HttpError(
      400,
      "AI_ART_PICTURE_EXPIRED",
      "This picture expired. Generate again to paint a new one.",
    );
  }
  return new Uint8Array(plain.subarray(4 + length));
}
