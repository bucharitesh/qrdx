import { authClient } from "@repo/auth/client";
import { ssoSignInErrorMessage } from "@/ee/sso/messages";
import { signInPath } from "@/lib/safe-redirect";

/**
 * Starts an SSO sign-in: the work email finds the company's identity
 * provider (packages/auth/ee/sso.ts), then the browser goes there. Failures
 * on the way back land on /sign-in with ?error= (ee/sso/messages.ts).
 * Returns the message to show when it can't start; null once the browser
 * is on its way.
 */
export async function startSsoSignIn(
  email: string,
  callbackURL: string,
): Promise<string | null> {
  try {
    const { data, error } = await authClient.signIn.sso({
      email: email.trim(),
      callbackURL,
      errorCallbackURL: signInPath(callbackURL),
    });
    if (error) {
      return error.status === 429
        ? "Too many tries. Wait a minute, then try again."
        : ssoSignInErrorMessage(error.code, error.message);
    }
    if (!data?.url) return ssoSignInErrorMessage(null);
    window.location.href = data.url;
    return null;
  } catch {
    return ssoSignInErrorMessage(null);
  }
}
