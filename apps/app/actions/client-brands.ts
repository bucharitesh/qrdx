"use server";

import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import {
  type ClientBrand,
  deleteClientBrand,
  saveClientBrand,
} from "@/lib/client-brands";
import {
  type BrandActionResult,
  brandFailure,
  brandInputFromForm,
  formText,
} from "@/lib/client-brands-form";
import { HttpError } from "@/lib/error-response";
import { enforceRateLimits } from "@/lib/request-guards";
import { getActiveScope } from "@/lib/scope";

// Client brands (agency tools): a client's name, logo and accent color for
// shared stats pages. Anyone who can share a code's analytics (owners,
// admins and members) on Pro or Business.

export type { BrandActionResult } from "@/lib/client-brands-form";

const limiter = createRateLimiter({ limiter: slidingWindow(30, "10 m") });

/** Creates a client brand, or changes the one named by the form's `id`. */
export async function saveClientBrandAction(
  form: FormData,
): Promise<BrandActionResult<ClientBrand>> {
  try {
    const scope = await getActiveScope();
    await enforceRateLimits([
      { limiter, key: `client-brands:write:user:${scope.userId}` },
    ]);
    const id = formText(form, "id").trim() || null;
    const input = await brandInputFromForm(form);
    return { ok: true, data: await saveClientBrand(scope, id, input) };
  } catch (error) {
    return brandFailure(error, "saveClientBrand");
  }
}

export async function deleteClientBrandAction(input: {
  id: string;
}): Promise<BrandActionResult<null>> {
  try {
    const id = typeof input?.id === "string" ? input.id.trim() : "";
    if (!id || id.length > 64) {
      throw new HttpError(404, "NOT_FOUND", "Client brand not found.");
    }
    const scope = await getActiveScope();
    await enforceRateLimits([
      { limiter, key: `client-brands:write:user:${scope.userId}` },
    ]);
    await deleteClientBrand(scope, id);
    return { ok: true, data: null };
  } catch (error) {
    return brandFailure(error, "deleteClientBrand");
  }
}
