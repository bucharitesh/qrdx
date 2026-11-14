import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { PASSKEY_SIGN_IN_PATH } from "./sign-in-challenge-rules";

// "Confirm it's you" with a passkey, and turning on two-step verification with
// one (apps/app/lib/account/confirmation-server.tsx, verifyOwnPasskey), check
// the assertion through the passkey plugin's sign-in endpoint, server-side.
// The plugin then makes a session for the passkey's owner, which the app
// deletes straight away; its token never leaves the server. That isn't a
// sign-in, so rules about how someone may sign in (single sign-on required
// for their domain: ./ee/sso-required.ts) mustn't refuse it.
//
// The check runs inside checkPasskeyWithoutSignIn, which marks that call
// alone: an async context the browser can't set, unlike a header or a body
// field. On globalThis so every copy of this module (Next.js can bundle one
// per server layer) shares it.

const SLOT = Symbol.for("@repo/auth/passkey-check-without-sign-in");
type Slot = Record<symbol, AsyncLocalStorage<true> | undefined>;

function storage(): AsyncLocalStorage<true> {
  const slot = globalThis as unknown as Slot;
  let found = slot[SLOT];
  if (!found) {
    found = new AsyncLocalStorage<true>();
    slot[SLOT] = found;
  }
  return found;
}

/** Runs `check` (the server-side passkey verification) marked as above. */
export function checkPasskeyWithoutSignIn<T>(
  check: () => Promise<T>
): Promise<T> {
  return storage().run(true, check);
}

/**
 * Whether this endpoint call is that check: the passkey sign-in endpoint,
 * called server-side (no HTTP request), inside checkPasskeyWithoutSignIn.
 */
export function isPasskeyCheckWithoutSignIn(
  context: { path?: string; request?: unknown } | null | undefined
): boolean {
  return (
    storage().getStore() === true &&
    context?.path === PASSKEY_SIGN_IN_PATH &&
    !(context.request instanceof Request)
  );
}
