"use client";

import { authClient } from "@repo/auth/client";
import posthog from "posthog-js";
import { ApiError, UnauthorizedError } from "@/types/errors";
import { DEFAULT_LOGIN_REDIRECT } from "@/routes";

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

  try {
    posthog.reset();
    await authClient.signOut();
    window.location.href = DEFAULT_LOGIN_REDIRECT;
  } catch (signOutError) {
    console.error("Failed to sign out after unauthorized response:", signOutError);
    window.location.href = DEFAULT_LOGIN_REDIRECT;
  } finally {
    isSigningOut = false;
  }
}

export async function handleUnauthorizedIfNeeded(error: unknown): Promise<void> {
  if (isUnauthorized(error)) {
    await handleUnauthorized();
  }
}
