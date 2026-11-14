// Pure: who is an admin, from the user and the two bootstrap lists. No env
// and no server-only, so any app can apply the same rule: ./admin.ts binds
// it to this deployment's ADMIN_USER_IDS and ADMIN_EMAILS, and the console
// zone binds it to its own copies of them.

export const ADMIN_ROLE = "admin";

export interface AdminCandidate {
  id: string;
  email?: string | null;
  emailVerified?: boolean | null;
  role?: string | null;
}

/** The bootstrap lists: user ids, and verified account emails. */
export interface AdminLists {
  ids: readonly string[];
  emails: readonly string[];
}

/** A comma-separated list (ADMIN_EMAILS, ADMIN_USER_IDS, a user's roles). */
export const parseAdminList = (value: string | null | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const hasAdminRole = (role: string | null | undefined) =>
  parseAdminList(role).includes(ADMIN_ROLE);

/** Listed by id, or by email (any case) once the email is verified. */
export function isListedAdmin(
  user: AdminCandidate,
  lists: AdminLists
): boolean {
  if (lists.ids.includes(user.id)) {
    return true;
  }
  if (!(user.emailVerified && user.email)) {
    return false;
  }
  const email = user.email.toLowerCase();
  return lists.emails.some((listed) => listed.toLowerCase() === email);
}

/** The admin role, or either list. */
export const isAdminWith = (user: AdminCandidate, lists: AdminLists) =>
  hasAdminRole(user.role) || isListedAdmin(user, lists);
