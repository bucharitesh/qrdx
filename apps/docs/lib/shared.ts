import type { User } from "better-auth";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { UnauthorizedError } from "@/types/errors";

export async function getCurrentUserId(req?: NextRequest): Promise<string> {
  const session = await auth.api.getSession({
    headers: req?.headers ?? (await headers()),
  });

  if (!session?.user?.id) {
    throw new UnauthorizedError();
  }

  return session.user.id;
}

export async function getCurrentUser(req?: NextRequest): Promise<User> {
  const session = await auth.api.getSession({
    headers: req?.headers ?? (await headers()),
  });

  if (!session) {
    throw new UnauthorizedError();
  }

  return session.user;
}

export function logError(error: Error, context?: Record<string, unknown>) {
  console.error("Action error:", error, context);

  if (error.name === "UnauthorizedError" || error.name === "ValidationError") {
    console.warn("Expected error:", { error: error.message, context });
  } else {
    console.error("Unexpected error:", {
      error: error.message,
      stack: error.stack,
      context,
    });
  }
}
