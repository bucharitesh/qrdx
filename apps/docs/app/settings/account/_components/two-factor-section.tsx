import { loadTwoFactorStatus } from "@/lib/account/two-factor-server";
import { TwoFactorSettings } from "./two-factor-settings";

/** Settings → Profile & security → Two-step verification. */
export async function TwoFactorSection({
  userId,
  email,
  recentSignIn,
}: {
  userId: string;
  email: string;
  /** Signed in within a day: turning it on is allowed (the email-change rule) */
  recentSignIn: boolean;
}) {
  const status = await loadTwoFactorStatus(userId);
  return (
    <TwoFactorSettings
      email={email}
      recentSignIn={recentSignIn}
      status={status}
    />
  );
}
