// Workspace slugs and names: pure and client-safe. The app (create and
// rename forms, lib/workspaces.ts), Better Auth's organization hooks
// (./server.ts) and the backfill script
// (packages/database/scripts/backfill-workspaces.mjs, which mirrors
// ownWorkspaceSlugBase and nextFreeSlug; a test keeps them equal) use them.
//
// A workspace lives at /dashboard/<slug>. Slugs are 3-48 lowercase letters,
// digits and inner dashes, unique across workspaces, and never one of the
// reserved words below: today's and earlier dashboard sections (so an old
// link such as /dashboard/codes can never open somebody's workspace) and
// words a future route or a support conversation might need.

/** 3-48 lowercase letters, digits and inner dashes. */
export const WORKSPACE_SLUG_PATTERN = "^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$";
export const WORKSPACE_SLUG_MAX = 48;

const SLUG_RE = new RegExp(WORKSPACE_SLUG_PATTERN);

export const RESERVED_WORKSPACE_SLUGS: readonly string[] = [
  // Dashboard sections, current and before workspaces had URLs
  "analytics",
  "api-keys",
  "codes",
  "developers",
  "domains",
  "files",
  "forms",
  "home",
  "import",
  "integrations",
  "new",
  "notifications",
  "pages",
  "settings",
  "team",
  "teams",
  "themes",
  "usage",
  "webhooks",
  // App and account words
  "account",
  "admin",
  "api",
  "app",
  "auth",
  "billing",
  "create",
  "dashboard",
  "default",
  "docs",
  "help",
  "invite",
  "invites",
  "join",
  "login",
  "logout",
  "me",
  "oauth",
  "onboarding",
  "personal",
  "portal",
  "pricing",
  "qrdx",
  "register",
  "sign-in",
  "sign-out",
  "sign-up",
  "signin",
  "signup",
  "support",
  "workspace",
  "workspaces",
  "www",
];

const RESERVED = new Set(RESERVED_WORKSPACE_SLUGS);

export function isReservedWorkspaceSlug(slug: string): boolean {
  return RESERVED.has(slug);
}

export const SLUG_FORMAT_MESSAGE =
  "Use 3-48 lowercase letters, numbers and dashes.";
export const SLUG_RESERVED_MESSAGE = "That URL is reserved. Pick another one.";

/** Why `slug` can't be a workspace URL, or null when its format is fine. */
export function workspaceSlugProblem(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return SLUG_FORMAT_MESSAGE;
  if (isReservedWorkspaceSlug(slug)) return SLUG_RESERVED_MESSAGE;
  return null;
}

/** Drops leading and trailing dashes, like .replace(/^-+|-+$/g, "") without its regex. */
function trimDashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "-") {
    start++;
  }
  while (end > start && value[end - 1] === "-") {
    end--;
  }
  return value.slice(start, end);
}

/** "Acme Marketing!" -> "acme-marketing" (may be too short or reserved). */
export function slugifyWorkspaceName(text: string): string {
  const slug = trimDashes(
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
  );
  // Cutting it to length can leave a dash at the end again.
  return trimDashes(slug.slice(0, WORKSPACE_SLUG_MAX));
}

interface Person {
  name?: string | null;
  email?: string | null;
}

const emailLocalPart = (email: string | null | undefined) =>
  (email ?? "").split("@")[0] ?? "";

/**
 * A valid, unreserved slug to start from for someone's own workspace: their
 * name, else their email's local part, else "workspace", lengthened or
 * shortened so a "-2" style suffix still fits.
 */
export function ownWorkspaceSlugBase(person: Person): string {
  const candidates = [
    slugifyWorkspaceName(person.name ?? ""),
    slugifyWorkspaceName(emailLocalPart(person.email)),
  ];
  // Room for "-9999" when the base is taken.
  const fit = (slug: string) =>
    slug.slice(0, WORKSPACE_SLUG_MAX - 5).replace(/-+$/g, "");
  for (const candidate of candidates) {
    const base = fit(candidate);
    if (!base) continue;
    const long = base.length < 3 ? `${base}-workspace` : base;
    if (!isReservedWorkspaceSlug(long)) return long;
    return fit(`${long}-workspace`);
  }
  return "workspace-1";
}

/**
 * The first free slug: `base`, then `base-2`, `base-3`, ... (`taken` holds
 * the slugs already in use that start with `base`).
 */
export function nextFreeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!(taken.has(base) || isReservedWorkspaceSlug(base))) return base;
  for (let n = 2; n < 10_000; n++) {
    const slug = `${base}-${n}`;
    if (!taken.has(slug)) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** "Ritesh Bucha" -> "Ritesh's workspace"; falls back to the email. */
export function ownWorkspaceName(person: Person): string {
  const first = (
    (person.name ?? "").trim().split(/\s+/)[0] || emailLocalPart(person.email)
  ).slice(0, 36);
  return first ? `${first}'s workspace` : "My workspace";
}

/** 2-50 characters, like the create form asks for. */
export function workspaceNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) return "Workspace name is too short.";
  if (trimmed.length > 50) return "Workspace name is too long.";
  return null;
}
