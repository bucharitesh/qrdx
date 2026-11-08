// Workspace SSO copy shared by the sign-in panel, the /sign-in page and the
// settings page. Pure and client-safe.

/** Codes the plugin and packages/auth/ee/sso.ts send back (?error= or JSON). */
export function ssoSignInErrorMessage(
  code: string | null | undefined,
  description?: string | null,
): string {
  switch (code) {
    case "SSO_EMAIL_REQUIRED":
      return "Enter your work email.";
    case "SSO_NOT_FOUND":
    case "SSO_NOT_AVAILABLE":
      // The server's message names the domain.
      return description || "SSO isn't set up for that address.";
    case "sso_unavailable":
      return "Single sign-on isn't available for this workspace right now. Sign in another way.";
    case "sso_email_outside_domain":
      return "Your identity provider sent an address outside your company's domain, so QRdx can't sign you in with it. Ask your workspace admin.";
    case "sso_email_unverified":
      return "Your company's sign-in system hasn't confirmed this email address, so QRdx can't sign you in with it. Its admin needs to verify email addresses there.";
    case "sso_email_missing":
      return "Your company's sign-in system didn't send an email address, so QRdx can't sign you in. Ask your workspace admin.";
    case "sso_weak_signature":
      return "Your company's sign-in system signed this sign-in with SHA-1 or another outdated algorithm, which QRdx doesn't accept. Its admin needs to switch the QRdx app's signature algorithm to SHA-256.";
    case "unsolicited_response":
      return "QRdx couldn't accept this sign-in from your company's app list. Start from QRdx's sign-in page: choose Sign in with SSO and enter your work email. If it keeps happening, ask your workspace admin.";
    case "replay_detected":
      return "That sign-in has already been used. Sign in again.";
    case "account_not_linked":
    case "account not linked":
      return "An account with this address already exists and couldn't be linked. Sign in with an email code instead.";
    case "access_denied":
      return "Sign-in was cancelled.";
    case "invalid_state":
      return "That sign-in took too long or was started elsewhere. Try again.";
    default:
      return "Single sign-on didn't work. Try again, or sign in another way.";
  }
}
