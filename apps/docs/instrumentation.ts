/**
 * Runs once when a server starts, before it takes requests.
 *
 * Better Auth's side of the stolen-session check (packages/auth/
 * session-origin.ts) reads a request's country and browser family through a
 * reader the app hands it. Registering it here means every server has it
 * from its first request, whichever page, action or route that is; the
 * modules that use the check register it too.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerAppSessionOriginReader } = await import(
    "./lib/account/session-origin"
  );
  registerAppSessionOriginReader();
}
