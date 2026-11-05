import "server-only";

import { auth } from "@repo/auth/server";
import { cookies } from "next/headers";

/** The cookie that holds a pending two-step challenge (10 minutes). */
async function challengeCookie(): Promise<{
  name: string;
  attributes: Record<string, unknown>;
}> {
  const context = await auth.$context;
  return context.createAuthCookie("two_factor");
}

/**
 * True while this browser has a pending challenge. Only the cookie's presence
 * is checked (it expires with the challenge); the plugin checks the rest.
 */
export async function hasPendingChallenge(): Promise<boolean> {
  const { name } = await challengeCookie();
  return (await cookies()).has(name);
}

/**
 * Drops this browser's pending challenge ("Use another account"). Expired
 * with the cookie's own attributes, so a __Secure- name is cleared too.
 */
export async function dropPendingChallenge(): Promise<void> {
  const { name, attributes } = await challengeCookie();
  (await cookies()).set(name, "", { ...attributes, maxAge: 0 });
}
