import { getAuthenticatorName } from "@repo/auth/passkey";
import { isPasskeyOrigin, passkeyRelyingParty } from "@repo/auth/passkey-rp";
import { auth } from "@repo/auth/server";
import { headers } from "next/headers";
import { type PasskeyRow, toPasskeyViews } from "@/lib/account/passkeys";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { requestOrigin } from "../../developers/_lib/origin";
import { PasskeysList } from "./passkeys-list";

const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

// Never matches the relying party: a request without a usable host.
const NO_ORIGIN = new URL("https://unknown.invalid");

/**
 * Settings → Profile & security → Passkeys. Left out where passkeys can't
 * work: a deployment whose URL can't carry them, or a page served from
 * another host than that URL (a preview URL), since a passkey only works on
 * the origin it belongs to.
 */
export async function PasskeysSection({
  recentSignIn,
}: {
  /** Signed in within the last day, so a passkey can be added now */
  recentSignIn: boolean;
}) {
  if (!isFeatureAvailable("passkeys")) return null;
  const requestHeaders = await headers();
  const origin = requestOrigin(requestHeaders, NO_ORIGIN);
  const relyingParty = passkeyRelyingParty({
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!isPasskeyOrigin(relyingParty, origin)) return null;

  const rows = (await auth.api.listPasskeys({
    headers: requestHeaders,
  })) as PasskeyRow[];
  const passkeys = toPasskeyViews(rows, {
    formatDate: (date) => DATE_FORMAT.format(date),
    providerName: (aaguid) => getAuthenticatorName(aaguid ?? undefined),
  });

  return <PasskeysList passkeys={passkeys} recentSignIn={recentSignIn} />;
}
