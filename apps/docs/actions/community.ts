"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import {
  type FrameImportColor,
  type FrameImportWarning,
  type FrameSpec,
  importFrameSvg,
} from "qrdx";
import type { QRCustomFrame } from "qrdx/types";
import { z } from "zod";
import { CopyRefusedError, copyItemToWorkspace } from "@/lib/community/copies";
import {
  getMyCommunityProfile,
  type MyCommunityProfile,
  ProfileInputError,
  saveCommunityProfile,
} from "@/lib/community/profiles";
import {
  PublishError,
  publishFrame,
  unpublishItem,
} from "@/lib/community/publish";
import { savedFrames } from "@/lib/community/queries";
import {
  ItemNotFoundError,
  toggleItemLike,
  toggleItemSave,
} from "@/lib/community/reactions";
import { CommunityUnavailableError } from "@/lib/community/store";
import { type CommunityItemType, itemPath } from "@/lib/community/types";
import { getActiveScope } from "@/lib/scope";
import { getCurrentUserId, logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// Server actions for the community pages and the editor's frame tools.
// Each returns a plain result the client shows as it is; nothing here
// trusts what the client says a design scores or contains.

export type CommunityResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code:
        | "UNAUTHORIZED"
        | "UNAVAILABLE"
        | "RATE_LIMITED"
        | "VALIDATION_ERROR"
        | "SCAN_GATE"
        | "ALREADY_PUBLISHED"
        | "LICENSE_REQUIRED"
        | "NOT_FOUND"
        | "THEME_LIMIT_REACHED"
        | "UNKNOWN";
      message: string;
      /** For ALREADY_PUBLISHED: the existing item's page */
      href?: string;
    };

const publishLimiter = createRateLimiter({
  limiter: slidingWindow(10, "1 d"),
});
const importLimiter = createRateLimiter({
  limiter: slidingWindow(30, "1 h"),
});
const reactionLimiter = createRateLimiter({
  limiter: slidingWindow(120, "1 h"),
});

const fail = <T>(
  code: Extract<CommunityResult<T>, { ok: false }>["code"],
  message: string,
  href?: string,
): CommunityResult<T> => ({ ok: false, code, message, ...(href && { href }) });

async function limited(
  limiter: ReturnType<typeof createRateLimiter>,
  key: string,
): Promise<boolean> {
  if (process.env.NODE_ENV === "development") return false;
  const { success } = await limiter.limit(key);
  return !success;
}

function failure<T>(error: unknown, action: string): CommunityResult<T> {
  if (error instanceof UnauthorizedError) {
    return fail("UNAUTHORIZED", "Sign in to continue.");
  }
  if (error instanceof CommunityUnavailableError) {
    return fail("UNAVAILABLE", error.message);
  }
  if (error instanceof PublishError) {
    return fail(
      error.code,
      error.message,
      error.slug ? itemPath("frame", error.slug) : undefined,
    );
  }
  if (error instanceof ProfileInputError) {
    return fail("VALIDATION_ERROR", error.message);
  }
  if (error instanceof ItemNotFoundError) {
    return fail("NOT_FOUND", error.message);
  }
  if (error instanceof CopyRefusedError) {
    return fail(error.code, error.message);
  }
  logError(error as Error, { action });
  return fail("UNKNOWN", "Something went wrong. Please try again.");
}

const publishFrameSchema = z.object({
  frame: z.unknown(),
  name: z.string().max(200),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  acceptLicense: z.boolean(),
});

/** Publishes a custom frame (Great scan score, spec limits, CC0). */
export async function publishCommunityFrame(
  input: z.input<typeof publishFrameSchema>,
): Promise<CommunityResult<{ href: string }>> {
  try {
    const userId = await getCurrentUserId();
    const parsed = publishFrameSchema.safeParse(input);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Check the details.");
    if (parsed.data.acceptLicense !== true) {
      return fail("LICENSE_REQUIRED", "Confirm the CC0 licence to publish.");
    }
    if (await limited(publishLimiter, `community-publish:${userId}`)) {
      return fail(
        "RATE_LIMITED",
        "You've published a lot today. Try again tomorrow.",
      );
    }
    const item = await publishFrame({
      userId,
      frame: parsed.data.frame,
      details: {
        name: parsed.data.name,
        description: parsed.data.description,
        tags: parsed.data.tags,
      },
    });
    return { ok: true, data: { href: itemPath(item.type, item.slug) } };
  } catch (error) {
    return failure(error, "publishCommunityFrame");
  }
}

export interface ImportedFrame {
  spec: FrameSpec;
  warnings: FrameImportWarning[];
  palette: FrameImportColor[];
}

/** Largest SVG sent to the importer (it refuses more than 200 KB itself). */
const MAX_SVG_CHARS = 210_000;

/** Converts an uploaded SVG into a frame spec on the server. */
export async function importCommunityFrameSvg(
  svg: string,
): Promise<CommunityResult<ImportedFrame>> {
  try {
    const userId = await getCurrentUserId();
    if (typeof svg !== "string" || svg.length > MAX_SVG_CHARS) {
      return fail("VALIDATION_ERROR", "SVG files can be up to 200 KB.");
    }
    if (await limited(importLimiter, `community-import:${userId}`)) {
      return fail("RATE_LIMITED", "Too many imports. Try again in an hour.");
    }
    const result = importFrameSvg(svg);
    if (!result.ok) return fail("VALIDATION_ERROR", result.error);
    return {
      ok: true,
      data: {
        spec: result.spec,
        warnings: result.warnings,
        palette: result.palette,
      },
    };
  } catch (error) {
    return failure(error, "importCommunityFrameSvg");
  }
}

const idSchema = z.string().min(1).max(64);

export async function toggleCommunityLike(
  itemId: string,
): Promise<CommunityResult<{ liked: boolean; likeCount: number }>> {
  try {
    const userId = await getCurrentUserId();
    const id = idSchema.parse(itemId);
    if (await limited(reactionLimiter, `community-react:${userId}`)) {
      return fail("RATE_LIMITED", "Too many changes. Try again later.");
    }
    return { ok: true, data: await toggleItemLike(userId, id) };
  } catch (error) {
    return failure(error, "toggleCommunityLike");
  }
}

export async function toggleCommunitySave(
  itemId: string,
): Promise<CommunityResult<{ saved: boolean }>> {
  try {
    const userId = await getCurrentUserId();
    const id = idSchema.parse(itemId);
    if (await limited(reactionLimiter, `community-react:${userId}`)) {
      return fail("RATE_LIMITED", "Too many changes. Try again later.");
    }
    return { ok: true, data: await toggleItemSave(userId, id) };
  } catch (error) {
    return failure(error, "toggleCommunitySave");
  }
}

/** The creator unpublishes their own item. */
export async function unpublishCommunityItem(
  itemId: string,
): Promise<CommunityResult<{ removed: true }>> {
  try {
    const userId = await getCurrentUserId();
    const id = idSchema.parse(itemId);
    if (!(await unpublishItem(userId, id))) {
      return fail(
        "NOT_FOUND",
        "Only the person who published it can unpublish it.",
      );
    }
    return { ok: true, data: { removed: true } };
  } catch (error) {
    return failure(error, "unpublishCommunityItem");
  }
}

const refSchema = z.object({
  type: z.enum(["frame", "theme"]),
  slug: z.string().min(1).max(80),
});

/** Copies a frame or theme into the workspace as a saved theme. */
export async function copyCommunityItem(ref: {
  type: CommunityItemType;
  slug: string;
}): Promise<
  CommunityResult<{ themeId: string; name: string; where: "own" | "team" }>
> {
  try {
    const scope = await getActiveScope();
    const parsed = refSchema.safeParse(ref);
    if (!parsed.success)
      return fail("NOT_FOUND", "This item isn't in the community.");
    return { ok: true, data: await copyItemToWorkspace(scope, parsed.data) };
  } catch (error) {
    return failure(error, "copyCommunityItem");
  }
}

/** The viewer's saved frames (empty when signed out or not available). */
export async function getSavedCommunityFrames(): Promise<
  { id: string; name: string; frame: QRCustomFrame }[]
> {
  try {
    const userId = await getCurrentUserId();
    return await savedFrames(userId);
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      logError(error as Error, { action: "getSavedCommunityFrames" });
    }
    return [];
  }
}

export async function getMyCommunityProfileAction(): Promise<
  CommunityResult<MyCommunityProfile>
> {
  try {
    const userId = await getCurrentUserId();
    return { ok: true, data: await getMyCommunityProfile(userId) };
  } catch (error) {
    return failure(error, "getMyCommunityProfile");
  }
}

const profileSchema = z.object({
  handle: z.string().max(64),
  displayName: z.string().max(200),
  showPicture: z.boolean(),
});

export async function saveCommunityProfileAction(
  input: z.input<typeof profileSchema>,
): Promise<CommunityResult<{ handle: string | null }>> {
  try {
    const userId = await getCurrentUserId();
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Check the details.");
    return { ok: true, data: await saveCommunityProfile(userId, parsed.data) };
  } catch (error) {
    return failure(error, "saveCommunityProfile");
  }
}
