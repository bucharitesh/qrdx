import "server-only";

import type { BrandInput } from "@/lib/client-brands";
import { HttpError } from "@/lib/error-response";
import { logError } from "@/lib/shared";
import { LOGO_MAX_BYTES } from "@/lib/workspace-logo";
import { UnauthorizedError } from "@/types/errors";

// The brand form's fields (components/agency/brand-fields.tsx), read by the
// client-brand and portal-branding actions.

export type BrandActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; error: string };

const KNOWN = new Set([
  "NOT_FOUND",
  "FORBIDDEN",
  "PLAN_REQUIRED",
  "RATE_LIMITED",
  "UNAVAILABLE",
  "VALIDATION_ERROR",
]);

export const formText = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

/**
 * A brand form (components/agency/brand-fields.tsx): name, accent, and the
 * logo as a file (`logo`), an https URL (`logoUrl`) or `removeLogo=1`.
 */
export async function brandInputFromForm(form: FormData): Promise<BrandInput> {
  const file = form.get("logo");
  let logo: BrandInput["logo"] = { kind: "keep" };
  if (file instanceof File && file.size > 0) {
    if (file.size > LOGO_MAX_BYTES) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "That picture is too large. Try a smaller one.",
      );
    }
    logo = { kind: "upload", bytes: new Uint8Array(await file.arrayBuffer()) };
  } else if (formText(form, "logoUrl").trim()) {
    logo = { kind: "url", url: formText(form, "logoUrl") };
  } else if (formText(form, "removeLogo") === "1") {
    logo = { kind: "remove" };
  }
  return {
    name: formText(form, "name"),
    accent: formText(form, "accent") || null,
    logo,
  };
}

/** The shape every brand action answers with. */
export async function brandFailure(
  error: unknown,
  action: string,
): Promise<{ ok: false; code: string; error: string }> {
  if (error instanceof UnauthorizedError) {
    return { ok: false, code: "UNAUTHORIZED", error: "Sign in to continue." };
  }
  if (error instanceof HttpError && KNOWN.has(error.code)) {
    return { ok: false, code: error.code, error: error.message };
  }
  logError(error as Error, { action });
  return {
    ok: false,
    code: "UNKNOWN_ERROR",
    error: "Something went wrong. Please try again.",
  };
}
