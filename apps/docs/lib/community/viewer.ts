import "server-only";

import { auth } from "@repo/auth/server";
import { headers } from "next/headers";

/** The signed-in account's id, or null (signed out, or the session failed). */
export async function viewerId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}
