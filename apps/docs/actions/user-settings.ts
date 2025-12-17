"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@repo/database";
import { user, type UserSettings } from "@repo/database/schema";
import { auth } from "@/lib/auth";

export async function getUserSettings(): Promise<UserSettings | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return null;
  }

  const result = await db
    .select()
    .from(user)
    .where(eq(user.id, session.user.id))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  // Return user settings or default values
  return result[0].settings || {
    keyboardShortcuts: true,
  };
}

export async function updateUserSettings(
  settings: Partial<UserSettings>,
): Promise<{ success: boolean; settings?: UserSettings }> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Unauthorized");
  }

  try {
    // Get current user settings
    const existing = await db
      .select()
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    if (existing.length === 0) {
      throw new Error("User not found");
    }

    // Merge existing settings with new settings
    const currentSettings = existing[0].settings || {
      keyboardShortcuts: true,
    };

    const updatedSettings: UserSettings = {
      ...currentSettings,
      ...settings,
    };

    // Update user settings
    await db
      .update(user)
      .set({
        settings: updatedSettings,
        updatedAt: new Date(),
      })
      .where(eq(user.id, session.user.id));

    return { success: true, settings: updatedSettings };
  } catch (error) {
    console.error("Error updating user settings:", error);
    return { success: false };
  }
}

