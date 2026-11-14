"use client";

import { authClient } from "@repo/auth/client";
import { resetAnalytics } from "@/lib/analytics";
import { signInPath } from "@/lib/safe-redirect";
import { ApiError, UnauthorizedError } from "@/types/errors";

let isSigningOut = false;

export function isUnauthorized(error: unknown): boolean {
  if (error instanceof UnauthorizedError || error instanceof ApiError) {
    if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
      return true;
    }
    if (error instanceof UnauthorizedError) {
      return true;
    }
  }

  if (error instanceof Error && error.name === "UnauthorizedError") {
    return true;
  }

  return false;
}

export async function handleUnauthorized(): Promise<void> {
  if (isSigningOut) {
    return;
  }

  isSigningOut = true;
  // Sign in again, then come back to this page.
  const { pathname, search } = window.location;
  const signIn = signInPath(pathname + search);

  try {
    resetAnalytics();
    await authClient.signOut();
    window.location.href = signIn;
  } catch (signOutError) {
    console.error(
      "Failed to sign out after unauthorized response:",
      signOutError,
    );
    window.location.href = signIn;
  } finally {
    isSigningOut = false;
  }
}

export async function handleUnauthorizedIfNeeded(
  error: unknown,
): Promise<void> {
  if (isUnauthorized(error)) {
    await handleUnauthorized();
  }
}
