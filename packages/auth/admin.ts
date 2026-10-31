import "server-only";
import { keys } from "./keys";

export const ADMIN_ROLE = "admin";

interface AdminCandidate {
  id: string;
  email?: string | null;
  emailVerified?: boolean | null;
  role?: string | null;
}

const parseList = (value: string | null | undefined) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/** User ids from ADMIN_USER_IDS; passed to Better Auth's `adminUserIds`. */
export const getAdminUserIds = () => parseList(keys().ADMIN_USER_IDS);

/** Lower-cased emails from ADMIN_EMAILS. */
const getAdminEmails = () =>
  parseList(keys().ADMIN_EMAILS).map((email) => email.toLowerCase());

export const hasAdminRole = (role: string | null | undefined) =>
  parseList(role).includes(ADMIN_ROLE);

/** True when the env bootstrap lists grant admin (email must be verified). */
export function isBootstrapAdmin(user: AdminCandidate): boolean {
  if (getAdminUserIds().includes(user.id)) {
    return true;
  }
  if (!(user.emailVerified && user.email)) {
    return false;
  }
  return getAdminEmails().includes(user.email.toLowerCase());
}

export const isAdmin = (user: AdminCandidate) =>
  hasAdminRole(user.role) || isBootstrapAdmin(user);
