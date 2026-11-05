"use server";

import { isSsoJoinRole, type SsoJoinRole } from "@repo/auth/sso-rules";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { HttpError } from "@/lib/error-response";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import {
  type CreateSsoInput,
  createSsoConnection,
  deleteSsoConnection,
  type SsoConnectionView,
  setSsoJoinRole,
  type UpdateSsoInput,
  updateSsoConnection,
  verifySsoDomain,
} from "@/lib/sso/connections";
import { UnauthorizedError } from "@/types/errors";

// Settings → Single sign-on. lib/sso/connections.ts does the checks (role,
// Business plan, recent sign-in) and calls the plugin through auth.api.

export type SsoActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: {
        code: string;
        message: string;
        /** Sign out and in again first (lib/account/email-change.ts rule) */
        reauth?: boolean;
      };
    };

// Verifying looks up DNS and setting up fetches the IdP's configuration.
const mutationLimiter = createRateLimiter({
  prefix: "qrdx:sso",
  limiter: slidingWindow(20, "60 s"),
});

function failure(error: unknown, action: string): SsoActionResult<never> {
  if (error instanceof UnauthorizedError) {
    return {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Sign in to manage single sign-on.",
      },
    };
  }
  if (error instanceof HttpError) {
    if (error.status >= 500) logError(error, { action });
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.code === "REAUTH_REQUIRED" ? { reauth: true } : {}),
      },
    };
  }
  logError(error as Error, { action });
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Something went wrong." },
  };
}

/** The workspace always comes from the session and the URL, never the client. */
async function mutate<T>(
  action: string,
  fn: (scope: ActiveScope, requestHeaders: Headers) => Promise<T>,
): Promise<SsoActionResult<T>> {
  try {
    const requestHeaders = await headers();
    const scope = await getActiveScope();
    await enforceRateLimits([
      { limiter: mutationLimiter, key: `sso:user:${scope.userId}` },
    ]);
    const data = await fn(scope, requestHeaders);
    revalidatePath("/dashboard", "layout");
    return { success: true, data };
  } catch (error) {
    return failure(error, action);
  }
}

const asString = (value: unknown) => (typeof value === "string" ? value : "");

/** Only the fields each protocol uses, as strings. */
function toCreateInput(input: unknown): CreateSsoInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  const providerId = asString(raw.providerId);
  if (raw.protocol === "saml") {
    return {
      providerId,
      protocol: "saml",
      domain: asString(raw.domain),
      metadataXml: asString(raw.metadataXml),
      ssoUrl: asString(raw.ssoUrl),
      entityId: asString(raw.entityId),
      certificate: asString(raw.certificate),
    };
  }
  return {
    providerId,
    protocol: "oidc",
    domain: asString(raw.domain),
    issuer: asString(raw.issuer),
    clientId: asString(raw.clientId),
    clientSecret: asString(raw.clientSecret),
  };
}

function toUpdateInput(input: unknown): UpdateSsoInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  return raw.protocol === "saml"
    ? { protocol: "saml", certificate: asString(raw.certificate) }
    : { protocol: "oidc", clientSecret: asString(raw.clientSecret) };
}

export async function createSso(
  input: CreateSsoInput,
): Promise<SsoActionResult<SsoConnectionView>> {
  return mutate("createSso", (scope, requestHeaders) =>
    createSsoConnection(scope, requestHeaders, toCreateInput(input)),
  );
}

export async function verifySso(): Promise<SsoActionResult<SsoConnectionView>> {
  return mutate("verifySso", verifySsoDomain);
}

export async function updateSso(
  input: UpdateSsoInput,
): Promise<SsoActionResult<SsoConnectionView>> {
  return mutate("updateSso", (scope, requestHeaders) =>
    updateSsoConnection(scope, requestHeaders, toUpdateInput(input)),
  );
}

export async function removeSso(): Promise<
  SsoActionResult<{ domain: string }>
> {
  return mutate("removeSso", deleteSsoConnection);
}

export async function setSsoRole(
  role: SsoJoinRole,
): Promise<SsoActionResult<SsoJoinRole>> {
  return mutate("setSsoRole", (scope, requestHeaders) => {
    if (!isSsoJoinRole(role)) {
      throw new HttpError(400, "VALIDATION_ERROR", "Choose Member or Viewer.");
    }
    return setSsoJoinRole(scope, requestHeaders, role);
  });
}
