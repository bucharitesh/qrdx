import { consoleReturnPath } from "@repo/next-config/console-zone";
import { SettingsHeader } from "@/app/(app)/settings/components/settings-header";
import { CONFIRMATION_MINUTES } from "@/lib/account/confirmation";
import { requireAdmin } from "../_lib/guard";
import { adminMetadata } from "../_lib/metadata";
import { ConfirmAndReturn } from "./confirm-and-return";

// "Confirm it's you" for the back-office console's actions. The console
// can't open this app's dialog (its server actions only answer this app),
// so a console action that needs a recent confirmation links here with
// ?next=<its page>. Only the console's pages are accepted as `next`;
// anything else comes back to /admin.

export const generateMetadata = adminMetadata("Admin · Confirm it's you");

export default async function AdminConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const { next } = await searchParams;
  const back =
    consoleReturnPath(typeof next === "string" ? next : null) ?? "/admin";

  return (
    <div className="space-y-4">
      <SettingsHeader
        title="Confirm it's you"
        description={`Some admin changes need a passkey, an authenticator code or a backup code from the last ${CONFIRMATION_MINUTES} minutes. Once you've confirmed, you go back to the page you came from.`}
      />
      <ConfirmAndReturn next={back} />
    </div>
  );
}
