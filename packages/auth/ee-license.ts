// Workspace single sign-on lives in `ee/` folders under the QRdx commercial
// licence. It runs only where QRDX_EE_LICENSE is set: ./server.ts registers
// the plugin and its routes, and the app shows SSO
// (packages/availability/rules.ts "sso"). Any non-empty value
// turns it on; nothing is checked over the network. Pure and client-safe.

export const EE_LICENSE_ENV = "QRDX_EE_LICENSE";

/** True when this server has a licence key for the `ee/` features. */
export function eeLicensed(
  env: Readonly<Record<string, string | undefined>>
): boolean {
  return Boolean(env[EE_LICENSE_ENV]?.trim());
}
