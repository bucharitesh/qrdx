// Public creator handles (/community/@handle). Opt-in: a person claims one
// in Settings; nothing is derived from the email address. The official
// QRdx profile holds "qrdx" (seeded), and no one else can take it or a
// lookalike. packages/database/scripts/backfill-community.mjs and
// seed-community.mjs keep their own copy of RESERVED_HANDLES; a test keeps
// them equal.

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;

/** 3 to 30 of a-z, 0-9, "_" and "-", starting with a letter or digit. */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9_-]{2,29}$/;

/** The official profile's handle. */
export const OFFICIAL_HANDLE = "qrdx";

export const RESERVED_HANDLES = [
  "qrdx",
  "official",
  "admin",
  "administrator",
  "team",
  "staff",
  "support",
  "help",
  "community",
  "templates",
  "template",
  "frames",
  "frame",
  "themes",
  "theme",
  "collections",
  "collection",
  "kits",
  "api",
  "app",
  "about",
  "settings",
  "dashboard",
  "account",
  "billing",
  "pricing",
  "docs",
  "blog",
  "login",
  "logout",
  "signin",
  "signup",
  "register",
  "me",
  "u",
  "moderator",
  "mod",
  "security",
  "abuse",
  "legal",
  "privacy",
  "terms",
  "root",
  "system",
  "null",
  "undefined",
  "anonymous",
  "everyone",
  "here",
  "new",
  "edit",
] as const;

const RESERVED = new Set<string>(RESERVED_HANDLES);

/** "@Ana_Ruiz " → "ana_ruiz": what a person typed, as a handle. */
export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

/**
 * A handle that reads as "qrdx" once separators are dropped and look-alike
 * digits read as letters ("qr-dx", "qrd_x", "0fficial-qrdx").
 */
export function looksLikeQrdx(handle: string): boolean {
  const plain = handle
    .replace(/[-_]/g, "")
    .replace(/0/g, "o")
    .replace(/[1!]/g, "l")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t");
  return plain.includes("qrdx");
}

/** Why `handle` can't be claimed by a person, or null when it can. */
export function handleProblem(handle: string): string | null {
  if (
    handle.length < HANDLE_MIN_LENGTH ||
    handle.length > HANDLE_MAX_LENGTH ||
    !HANDLE_PATTERN.test(handle)
  ) {
    return `Use ${HANDLE_MIN_LENGTH} to ${HANDLE_MAX_LENGTH} lowercase letters, numbers, "_" or "-", starting with a letter or number.`;
  }
  if (RESERVED.has(handle) || looksLikeQrdx(handle)) {
    return "That handle is reserved.";
  }
  return null;
}

/** "/community/@ana" */
export const profilePath = (handle: string) => `/community/@${handle}`;
