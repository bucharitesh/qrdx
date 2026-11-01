/**
 * Profile pictures in R2 under `avatars/<userId>/<id>.<ext>`. The browser
 * crops and re-encodes the picture (which also drops EXIF data such as GPS
 * position) before the server checks its bytes and stores it. Client-safe.
 */

export const AVATAR_PIXELS = 256;
/** After the browser's re-encode a 256 px picture is far smaller than this. */
export const AVATAR_MAX_BYTES = 512 * 1024;
/** What the picker accepts before re-encoding. */
export const AVATAR_INPUT_MAX_BYTES = 10 * 1024 * 1024;
export const AVATAR_INPUT_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export const AVATAR_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
export type AvatarMime = keyof typeof AVATAR_EXTENSIONS;

export function isAvatarMime(mime: string): mime is AvatarMime {
  return Object.hasOwn(AVATAR_EXTENSIONS, mime);
}

const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const FILE = /^[a-z0-9]{16,40}\.(?:png|jpg|webp)$/;

export function avatarKey(userId: string, id: string, mime: AvatarMime) {
  return `avatars/${userId}/${id}.${AVATAR_EXTENSIONS[mime]}`;
}

/** A key this feature could have written (for the serving route). */
export function isAvatarKey(key: string): boolean {
  const [prefix, userId, file, ...rest] = key.split("/");
  return (
    rest.length === 0 &&
    prefix === "avatars" &&
    USER_ID.test(userId ?? "") &&
    FILE.test(file ?? "")
  );
}

/**
 * The storage key behind a profile picture URL when it is one of this user's
 * uploads (public bucket URL or /api/avatars/...), else null: pictures from
 * Google or GitHub, and other users' keys, are never touched.
 */
export function avatarKeyFromImage(
  image: string | null | undefined,
  userId: string,
): string | null {
  if (!image) return null;
  let pathname: string;
  try {
    pathname = new URL(image).pathname;
  } catch {
    return null;
  }
  const [prefix, owner, file] = pathname.split("/").slice(-3);
  const key = `${prefix}/${owner}/${file}`;
  return owner === userId && isAvatarKey(key) ? key : null;
}

/** "Ada Lovelace" → "AL", "ada@example.com" → "A". */
export function initialsOf(name: string | null | undefined, email: string) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1
      ? [words[0], words[words.length - 1]].map((word) => [...word][0])
      : words.length === 1
        ? [[...words[0]][0]]
        : [[...email][0] ?? "?"];
  return letters.join("").toUpperCase();
}
