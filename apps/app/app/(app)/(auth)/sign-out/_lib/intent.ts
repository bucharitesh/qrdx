// /sign-out signs out on arrival only when the app sent the person there a
// moment ago (the account menu marks it in sessionStorage). Anything else,
// such as a link on another site or a typed URL, gets a confirm button, so
// a link alone can't sign anyone out. The sign-out itself is a POST.

export const SIGN_OUT_INTENT_KEY = "qrdx:sign-out-intent";

/** How long the menu's mark stays good (navigation takes well under this). */
export const SIGN_OUT_INTENT_TTL_MS = 60_000;

/** Where /sign-out lands once the session is gone. */
export const SIGNED_OUT_PATH = "/sign-in?signedOut=1";

/** True for a mark written within the last minute (not from the future). */
export function isFreshSignOutIntent(
  value: string | null,
  now: number,
): boolean {
  if (!value || !/^\d+$/.test(value)) return false;
  const age = now - Number(value);
  return age >= 0 && age <= SIGN_OUT_INTENT_TTL_MS;
}

/** The account menu calls this right before opening /sign-out. */
export function markSignOutIntent(now = Date.now()): void {
  try {
    window.sessionStorage.setItem(SIGN_OUT_INTENT_KEY, String(now));
  } catch {
    // Blocked storage: /sign-out asks for a click instead.
  }
}

/** Reads and clears the mark (it works once). */
export function takeSignOutIntent(now = Date.now()): boolean {
  try {
    const value = window.sessionStorage.getItem(SIGN_OUT_INTENT_KEY);
    window.sessionStorage.removeItem(SIGN_OUT_INTENT_KEY);
    return isFreshSignOutIntent(value, now);
  } catch {
    return false;
  }
}
