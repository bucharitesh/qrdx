// Workspaces that require two-step verification, in the app: pure and
// client-safe. The rules are packages/auth/workspace-two-factor-rules.ts; the
// guard is lib/scope.ts; the setting is on Settings → Team.

import { safeNextPath } from "@/lib/safe-redirect";
import { workspaceSlugFromPath } from "@/lib/workspace-paths";

/** Profile & security's two-step verification section. */
export const TWO_FACTOR_SETTINGS_PATH = "/settings/account";
export const TWO_FACTOR_SECTION_ID = "two-factor";

/** The query key that brings Profile & security back to a workspace. */
export const RETURN_PARAM = "next";

/**
 * Where "Turn on two-step verification" goes from a workspace that requires
 * it: Settings → Profile & security, which links back to `returnPath`.
 */
export function twoFactorSetupHref(returnPath: string): string {
  const next = workspaceReturnPath(returnPath);
  const query = next ? `?${new URLSearchParams({ [RETURN_PARAM]: next })}` : "";
  return `${TWO_FACTOR_SETTINGS_PATH}${query}#${TWO_FACTOR_SECTION_ID}`;
}

/**
 * `value` when it's a same-site path inside a workspace
 * (/dashboard/<slug>/...), else null. It comes from the query string, so it's
 * checked like a sign-in's `next` (lib/safe-redirect.ts).
 */
export function workspaceReturnPath(value: unknown): string | null {
  const path = safeNextPath(value, "");
  if (!path) return null;
  return workspaceSlugFromPath(path) ? path : null;
}

/** "1 member hasn't" / "3 members haven't": for the Team page. */
export function membersWithoutTwoFactor(count: number): string {
  return count === 1
    ? "1 member hasn't turned on two-step verification yet."
    : `${count} members haven't turned on two-step verification yet.`;
}
