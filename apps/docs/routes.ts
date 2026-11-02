import { SIGN_IN_PATH } from "./lib/safe-redirect";

export const API_AUTH_PREFIX: string = "/api/auth";

/** Where signed-out visitors go; prefer signInPath(next) from lib/safe-redirect. */
export const DEFAULT_LOGIN_REDIRECT: string = SIGN_IN_PATH;
