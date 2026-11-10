import "server-only";

// "QRdx in numbers" on the home page is off until the owner turns it on:
// QRDX_HOME_NUMBERS=1 where the app is built, then a redeploy. Off by
// default on qrdx.dev and self-hosted. Admins can preview the real numbers
// at /admin/numbers either way.
//
// The build replaces process.env.QRDX_HOME_NUMBERS in server code with its
// value (next.config.ts compiler.defineServer), so the switch is decided at
// build time, like the prerendered home page itself, and the bundler can
// drop everything behind it while it's off. Client code never sees it.

export const HOME_NUMBERS_FLAG = "QRDX_HOME_NUMBERS";

/** Whether the home page shows the section. Only "1" turns it on. */
export function homeNumbersOnHomePage(): boolean {
  return process.env.QRDX_HOME_NUMBERS === "1";
}
