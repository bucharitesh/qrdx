"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { type ClientBrand, savePortalBrand } from "@/lib/client-brands";
import {
  type BrandActionResult,
  brandFailure,
  brandInputFromForm,
} from "@/lib/client-brands-form";
import { HttpError } from "@/lib/error-response";
import {
  invitePortalClient,
  type PortalClientInput,
  type PortalClientView,
  removePortalClient,
  updatePortalClient,
} from "@/lib/portal/manage";
import { enforceRateLimits } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";

// Settings → Client portal (agency tools, Business): invite clients, choose
// their folders, remove them, and brand the portal. Owners and admins.

const inviteLimiter = createRateLimiter({ limiter: slidingWindow(30, "10 m") });
const writeLimiter = createRateLimiter({ limiter: slidingWindow(60, "10 m") });

const failure = (error: unknown, action: string) => brandFailure(error, action);

export async function invitePortalClientAction(
  input: PortalClientInput,
): Promise<BrandActionResult<{ client: PortalClientView; emailed: boolean }>> {
  try {
    const scope = await getActiveScope();
    await enforceRateLimits([
      { limiter: inviteLimiter, key: `portal:invite:user:${scope.userId}` },
    ]);
    const data = await invitePortalClient(scope, input);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data };
  } catch (error) {
    return failure(error, "invitePortalClient");
  }
}

export async function updatePortalClientAction(input: {
  id: string;
  name: string | null;
  folderIds: string[];
}): Promise<BrandActionResult<PortalClientView>> {
  try {
    const id = typeof input?.id === "string" ? input.id.trim() : "";
    if (!id || id.length > 64) {
      throw new HttpError(404, "NOT_FOUND", "Client not found.");
    }
    const scope = await getActiveScope();
    await enforceRateLimits([
      { limiter: writeLimiter, key: `portal:write:user:${scope.userId}` },
    ]);
    const data = await updatePortalClient(scope, id, {
      name: input.name ?? "",
      folderIds: Array.isArray(input.folderIds) ? input.folderIds : [],
    });
    return { ok: true, data };
  } catch (error) {
    return failure(error, "updatePortalClient");
  }
}

export async function removePortalClientAction(input: {
  id: string;
}): Promise<BrandActionResult<null>> {
  try {
    const id = typeof input?.id === "string" ? input.id.trim() : "";
    if (!id || id.length > 64) {
      throw new HttpError(404, "NOT_FOUND", "Client not found.");
    }
    const scope = await getActiveScope();
    await enforceRateLimits([
      { limiter: writeLimiter, key: `portal:write:user:${scope.userId}` },
    ]);
    await removePortalClient(scope, id);
    return { ok: true, data: null };
  } catch (error) {
    return failure(error, "removePortalClient");
  }
}

/** The portal's name, logo and accent (the brand form's fields). */
export async function savePortalBrandAction(
  form: FormData,
): Promise<BrandActionResult<ClientBrand>> {
  try {
    const scope = await getActiveScope();
    await enforceRateLimits([
      { limiter: writeLimiter, key: `portal:write:user:${scope.userId}` },
    ]);
    const data = await savePortalBrand(scope, await brandInputFromForm(form));
    return { ok: true, data };
  } catch (error) {
    return failure(error, "savePortalBrand");
  }
}
