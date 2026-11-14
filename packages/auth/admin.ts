import "server-only";
import {
  type AdminCandidate,
  type AdminLists,
  isAdminWith,
  isListedAdmin,
  parseAdminList,
} from "./admin-rules";
import { keys } from "./keys";

// The rule itself is pure (./admin-rules.ts); this binds it to the lists in
// this deployment's environment.
export { ADMIN_ROLE, hasAdminRole } from "./admin-rules";

/** User ids from ADMIN_USER_IDS; passed to Better Auth's `adminUserIds`. */
export const getAdminUserIds = () => parseAdminList(keys().ADMIN_USER_IDS);

const adminLists = (): AdminLists => ({
  ids: getAdminUserIds(),
  emails: parseAdminList(keys().ADMIN_EMAILS),
});

/** True when the env bootstrap lists grant admin (email must be verified). */
export const isBootstrapAdmin = (user: AdminCandidate): boolean =>
  isListedAdmin(user, adminLists());

export const isAdmin = (user: AdminCandidate) =>
  isAdminWith(user, adminLists());
