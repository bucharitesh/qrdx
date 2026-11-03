import "server-only";

import {
  communityProfile,
  database as db,
  user as userTable,
} from "@repo/database";
import cuid from "cuid";
import { and, eq, ne } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { isUniqueViolation } from "@/lib/slug-claims";
import { handleProblem, normalizeHandle } from "./handles";
import { COMMUNITY_TAG, guarded } from "./store";
import { cleanText, textProblem } from "./text";

// Creator profiles. Every item belongs to one: a person's (made the first
// time they publish, showing their account name and picture as the gallery
// always has) or the official QRdx profile (made by the seed, owned by the
// team account). Handles are opt-in, claimed and released in Settings.

export const DISPLAY_NAME_MAX_LENGTH = 40;

export interface PublishingProfile {
  id: string;
  official: boolean;
}

export interface MyCommunityProfile {
  /** Publishing goes to the official QRdx profile (the team account) */
  official: boolean;
  handle: string | null;
  displayName: string;
  showPicture: boolean;
  /** The account's picture (what "show my picture" shows) */
  accountPicture: string | null;
  /** A profile row exists (the person has published or set it up) */
  exists: boolean;
}

/** Thrown for a handle or name that can't be saved, with the reason. */
export class ProfileInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProfileInputError";
  }
}

async function accountOf(userId: string) {
  const [account] = await db
    .select({ name: userTable.name, image: userTable.image })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  return account ?? null;
}

async function profileOf(userId: string, kind: "person" | "official") {
  const [row] = await db
    .select({
      id: communityProfile.id,
      handle: communityProfile.handle,
      displayName: communityProfile.displayName,
      avatarUrl: communityProfile.avatarUrl,
    })
    .from(communityProfile)
    .where(
      and(eq(communityProfile.userId, userId), eq(communityProfile.kind, kind)),
    )
    .limit(1);
  return row ?? null;
}

const fallbackName = (name: string | null | undefined) =>
  cleanText(name ?? "", DISPLAY_NAME_MAX_LENGTH) || "QRdx creator";

/**
 * The profile `userId` publishes under: the official one when the account
 * owns it, else their own (made now, without a handle, if it's missing).
 */
export async function ensurePublishingProfile(
  userId: string,
): Promise<PublishingProfile> {
  return guarded(async () => {
    const official = await profileOf(userId, "official");
    if (official) return { id: official.id, official: true };
    const { id } = await ensurePersonProfile(userId);
    return { id, official: false };
  });
}

/** What Settings → Community profile shows. */
export async function getMyCommunityProfile(
  userId: string,
): Promise<MyCommunityProfile> {
  return guarded(async () => {
    const [official, person, account] = await Promise.all([
      profileOf(userId, "official"),
      profileOf(userId, "person"),
      accountOf(userId),
    ]);
    const accountPicture = account?.image ?? null;
    if (official) {
      return {
        official: true,
        handle: official.handle,
        displayName: official.displayName,
        showPicture: false,
        accountPicture,
        exists: true,
      };
    }
    return {
      official: false,
      handle: person?.handle ?? null,
      displayName: person?.displayName ?? fallbackName(account?.name),
      showPicture: person ? person.avatarUrl != null : accountPicture != null,
      accountPicture,
      exists: person != null,
    };
  });
}

/**
 * Saves a person's profile: an empty handle releases theirs; a new one must
 * be free and not reserved. The official profile isn't edited here.
 */
export async function saveCommunityProfile(
  userId: string,
  input: { handle: string; displayName: string; showPicture: boolean },
): Promise<{ handle: string | null }> {
  const handle = normalizeHandle(input.handle) || null;
  if (handle) {
    const problem = handleProblem(handle);
    if (problem) throw new ProfileInputError(problem);
  }
  const displayName = cleanText(input.displayName, DISPLAY_NAME_MAX_LENGTH);
  if (!displayName) throw new ProfileInputError("Enter a display name.");
  const nameProblem = textProblem(displayName);
  if (nameProblem) throw new ProfileInputError(nameProblem);

  return guarded(async () => {
    const { id } = await ensurePersonProfile(userId);
    const account = await accountOf(userId);
    const current = await profileOf(userId, "person");
    if (handle) {
      const [taken] = await db
        .select({ id: communityProfile.id })
        .from(communityProfile)
        .where(
          and(eq(communityProfile.handle, handle), ne(communityProfile.id, id)),
        )
        .limit(1);
      if (taken) throw new ProfileInputError("That handle is taken.");
    }
    const now = new Date();
    try {
      await db
        .update(communityProfile)
        .set({
          handle,
          displayName,
          avatarUrl: input.showPicture ? (account?.image ?? null) : null,
          ...(current?.handle !== handle ? { handleChangedAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(communityProfile.id, id));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProfileInputError("That handle is taken.");
      }
      throw error;
    }
    revalidateTag(COMMUNITY_TAG, "max");
    revalidateTag("community-themes", "max");
    return { handle };
  });
}

/** The person's own profile (never the official one), made if missing. */
async function ensurePersonProfile(userId: string): Promise<{ id: string }> {
  const person = await profileOf(userId, "person");
  if (person) return { id: person.id };
  const account = await accountOf(userId);
  if (!account) throw new Error("Account not found");
  const now = new Date();
  await db
    .insert(communityProfile)
    .values({
      id: cuid(),
      kind: "person",
      userId,
      displayName: fallbackName(account.name),
      avatarUrl: account.image,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  const made = await profileOf(userId, "person");
  if (!made) throw new Error("Could not create the community profile");
  return { id: made.id };
}
