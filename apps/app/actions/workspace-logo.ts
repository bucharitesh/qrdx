"use server";

import { auth } from "@repo/auth/server";
import { database as db, organization } from "@repo/database";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import cuid from "cuid";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { SNIFF_BYTES, sniffFileType } from "@/lib/files/magic";
import { baseUrl } from "@/lib/metadata";
import { can, forbiddenMessage } from "@/lib/permissions";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import {
  deleteObject,
  isStorageConfigured,
  publicUrl,
  putObject,
} from "@/lib/storage/r2";
import {
  LOGO_MAX_BYTES,
  type LogoMime,
  logoUrlProblem,
  workspaceLogoKey,
  workspaceLogoKeyFromUrl,
} from "@/lib/workspace-logo";
import { UnauthorizedError } from "@/types/errors";

// The open workspace's logo (Settings → General): an upload (when file
// storage is set up) or an https image URL. Owners and admins only
// (workspace.update); Better Auth's updateOrganization checks again.

export type LogoActionResult =
  | { ok: true; logo: string | null }
  | { ok: false; error: string };

const logoLimiter = createRateLimiter({ limiter: slidingWindow(20, "10 m") });

const SNIFFED_MIME: Partial<Record<string, LogoMime>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const SOMETHING_WRONG = "Something went wrong. Please try again.";

function fail(error: string): LogoActionResult {
  return { ok: false, error };
}

async function editableScope(): Promise<ActiveScope | string> {
  const scope = await getActiveScope();
  if (!can(scope.role, "workspace.update")) {
    return forbiddenMessage(scope.role, "workspace.update");
  }
  const { success } = await logoLimiter.limit(`workspace-logo:${scope.userId}`);
  if (!success) return "Too many changes. Please wait a few minutes.";
  return scope;
}

async function currentLogo(organizationId: string): Promise<string | null> {
  const [row] = await db
    .select({ logo: organization.logo })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row?.logo ?? null;
}

/** Saves `logo` and deletes the upload it replaces (if it was one). */
async function saveLogo(scope: ActiveScope, logo: string | null) {
  const previous = await currentLogo(scope.organizationId);
  await auth.api.updateOrganization({
    headers: await headers(),
    body: { organizationId: scope.organizationId, data: { logo } },
  });
  const previousKey = workspaceLogoKeyFromUrl(previous, scope.organizationId);
  const nextKey = workspaceLogoKeyFromUrl(logo, scope.organizationId);
  if (previousKey && previousKey !== nextKey && isStorageConfigured) {
    await deleteObject(previousKey).catch((error) =>
      logError(error as Error, { action: "workspaceLogo.deletePrevious" }),
    );
  }
  revalidatePath("/dashboard", "layout");
}

function failure(error: unknown, action: string): LogoActionResult {
  if (error instanceof UnauthorizedError) return fail("Sign in to continue.");
  const message = (error as { body?: { message?: string } }).body?.message;
  if (message) return fail(message.replace(/organization/gi, "workspace"));
  logError(error as Error, { action });
  return fail(SOMETHING_WRONG);
}

/** The browser sends a cropped, re-encoded square (workspace-logo-field.tsx). */
export async function uploadWorkspaceLogo(
  formData: FormData,
): Promise<LogoActionResult> {
  try {
    const scope = await editableScope();
    if (typeof scope === "string") return fail(scope);
    if (!(isFeatureAvailable("fileStorage") && isStorageConfigured)) {
      return fail(
        "Logo uploads aren't set up on this server. Use an image URL.",
      );
    }
    const file = formData.get("logo");
    if (!(file instanceof File) || file.size === 0) {
      return fail("Choose a picture to upload.");
    }
    if (file.size > LOGO_MAX_BYTES) {
      return fail("That picture is too large. Try a smaller one.");
    }

    // The bytes decide the type, whatever the browser said.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffFileType(bytes.subarray(0, SNIFF_BYTES));
    const mime = sniffed ? SNIFFED_MIME[sniffed] : undefined;
    if (!mime) return fail("Use a PNG, JPEG or WebP picture.");

    const key = workspaceLogoKey(scope.organizationId, cuid(), mime);
    await putObject(key, bytes, {
      mime,
      // Every upload gets a new key, so the object never changes.
      cacheControl: "public, max-age=31536000, immutable",
    });
    // Public bucket URL, else /api/workspace-logos/<id>/<file> (signed redirect).
    const logo = publicUrl(key) ?? new URL(`/api/${key}`, baseUrl).toString();
    await saveLogo(scope, logo);
    return { ok: true, logo };
  } catch (error) {
    return failure(error, "workspaceLogo.upload");
  }
}

export async function setWorkspaceLogoUrl(input: {
  url: string;
}): Promise<LogoActionResult> {
  try {
    const url = typeof input?.url === "string" ? input.url.trim() : "";
    const problem = logoUrlProblem(url);
    if (problem) return fail(problem);
    const scope = await editableScope();
    if (typeof scope === "string") return fail(scope);
    await saveLogo(scope, url);
    return { ok: true, logo: url };
  } catch (error) {
    return failure(error, "workspaceLogo.setUrl");
  }
}

export async function removeWorkspaceLogo(): Promise<LogoActionResult> {
  try {
    const scope = await editableScope();
    if (typeof scope === "string") return fail(scope);
    await saveLogo(scope, null);
    return { ok: true, logo: null };
  } catch (error) {
    return failure(error, "workspaceLogo.remove");
  }
}
