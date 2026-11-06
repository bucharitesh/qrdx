import { getAuthenticatorName } from "@repo/auth/passkey";
import { database as db, passkey } from "@repo/database";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { toPasskeyViews } from "@/lib/account/passkeys";
import {
  loadTwoFactorMethods,
  passkeysWorkHere,
} from "@/lib/account/two-factor-server";
import { TwoFactorSettings } from "./two-factor-settings";

const DATE_FORMAT = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/**
 * Settings → Profile & security → Two-step verification: its status and
 * methods (passkeys, the authenticator app, backup codes). Passkeys are
 * left out where they can't work: a deployment whose URL can't carry them,
 * or a page served from another host than that URL (a preview URL), since a
 * passkey only works on the origin it belongs to.
 */
export async function TwoFactorSection({
  userId,
  email,
}: {
  /** The signed-in user (the page has already checked the session) */
  userId: string;
  email: string;
}) {
  const requestHeaders = await headers();
  const passkeysHere = passkeysWorkHere(requestHeaders);
  // Read directly, like the Sessions list: a second session lookup
  // (auth.api.listPasskeys) throws if the session ends while the page renders
  // (signed out in another tab), which took the whole page down. Keys and
  // counters aren't selected.
  const [methods, rows] = await Promise.all([
    loadTwoFactorMethods(userId),
    passkeysHere
      ? db
          .select({
            id: passkey.id,
            name: passkey.name,
            createdAt: passkey.createdAt,
            deviceType: passkey.deviceType,
            backedUp: passkey.backedUp,
            aaguid: passkey.aaguid,
          })
          .from(passkey)
          .where(eq(passkey.userId, userId))
      : Promise.resolve([]),
  ]);
  const passkeys = toPasskeyViews(rows, {
    formatDate: (date) => DATE_FORMAT.format(date),
    providerName: (aaguid) => getAuthenticatorName(aaguid ?? undefined),
  });

  return (
    <TwoFactorSettings
      email={email}
      methods={methods}
      passkeys={passkeys}
      passkeysHere={passkeysHere}
    />
  );
}
