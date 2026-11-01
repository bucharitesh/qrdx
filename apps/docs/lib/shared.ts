import { auth } from "@repo/auth/server";
import type { user } from "@repo/database/schema";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
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

export async function getCurrentUser(
  req?: NextRequest,
): Promise<typeof user.$inferSelect> {
  const session = await auth.api.getSession({
    headers: req?.headers ?? (await headers()),
  });

  if (!session) {
    throw new UnauthorizedError();
  }

  return session.user;
}

export { logError } from "./log-error";
