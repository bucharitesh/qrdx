import { PASSKEY_SIGN_IN_PATH } from "./passkey";

// What the lastLoginMethod plugin records (the "Last used" hint on the
// sign-in panel, and analytics' sign-in method) for the sign-ins it doesn't
// name itself. Null leaves it to the plugin (Google and GitHub callbacks).

const SIGN_IN_CODE_PATH = "/sign-in/email-otp";
// Workspace SSO sessions start at the OIDC callbacks (/sso/callback and
// /sso/callback/:providerId) and the SAML ACS (/sso/saml2/sp/acs/:providerId).
const SSO_SESSION_PREFIXES = ["/sso/callback", "/sso/saml2/sp/acs"];

export function signInMethodForPath(path: string | undefined): string | null {
  if (!path) return null;
  if (path === SIGN_IN_CODE_PATH) return "email-otp";
  if (path === PASSKEY_SIGN_IN_PATH) return "passkey";
  if (SSO_SESSION_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return "sso";
  }
  return null;
}
