"use server";

import { isSsoJoinRole, type SsoJoinRole } from "@repo/auth/sso-rules";
import { createRateLimiter, slidingWindow } from "@repo/rate-limit";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  type CreateSsoInput,
  createSsoConnection,
  deleteSsoConnection,
  type SsoConnectionView,
  setSsoJoinRole,
  type UpdateSsoInput,
  updateSsoConnection,
  verifySsoDomain,
} from "@/ee/sso/connections";
import { CONFIRMATION_REQUIRED } from "@/lib/account/confirmation";
import {
  currentSession,
  requireRecentConfirmation,
} from "@/lib/account/confirmation-server";
import { HttpError } from "@/lib/error-response";
import { isFeatureAvailable } from "@/lib/feature-availability";
import { enforceRateLimits } from "@/lib/request-guards";
import { type ActiveScope, getActiveScope } from "@/lib/scope";
import { logError } from "@/lib/shared";
import { UnauthorizedError } from "@/types/errors";

// Settings → Single sign-on. ee/sso/connections.ts does the checks (role,
// Business plan, recent sign-in) and calls the plugin through auth.api.
// Creating, editing, verifying and removing the connection also need a
// recent "Confirm it's you" (lib/account/confirmation-server.ts); without
// one they answer CONFIRMATION_REQUIRED and the page asks, then retries.

export type SsoActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: {
        code: string;
        message: string;
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
      },
    };
  }
  logError(error as Error, { action });
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Something went wrong." },
  };
}

const confirmationRequired = (): SsoActionResult<never> => ({
  success: false,
  error: {
    code: CONFIRMATION_REQUIRED,
    message: "Confirm it's you to change single sign-on.",
  },
});

/** The workspace always comes from the session and the URL, never the client. */
async function mutate<T>(
  action: string,
  fn: (scope: ActiveScope, requestHeaders: Headers) => Promise<T>,
  { confirm = false }: { confirm?: boolean } = {},
): Promise<SsoActionResult<T>> {
  try {
    // Without a licence key the SSO plugin isn't registered (packages/auth/
    // ee-license.ts), so there's nothing to manage.
    if (!isFeatureAvailable("sso")) {
      throw new HttpError(
        404,
        "NOT_FOUND",
        "Single sign-on isn't available on this server.",
      );
    }
    const requestHeaders = await headers();
    const scope = await getActiveScope();
    await enforceRateLimits([
      { limiter: mutationLimiter, key: `sso:user:${scope.userId}` },
    ]);
    if (confirm) {
      const session = await currentSession();
      if (!session || session.userId !== scope.userId) {
        throw new UnauthorizedError();
      }
      if (await requireRecentConfirmation(session)) {
        return confirmationRequired();
      }
    }
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
  return mutate(
    "createSso",
    (scope, requestHeaders) =>
      createSsoConnection(scope, requestHeaders, toCreateInput(input)),
    { confirm: true },
  );
}

export async function verifySso(): Promise<SsoActionResult<SsoConnectionView>> {
  return mutate("verifySso", verifySsoDomain, { confirm: true });
}

export async function updateSso(
  input: UpdateSsoInput,
): Promise<SsoActionResult<SsoConnectionView>> {
  return mutate(
    "updateSso",
    (scope, requestHeaders) =>
      updateSsoConnection(scope, requestHeaders, toUpdateInput(input)),
    { confirm: true },
  );
}

export async function removeSso(): Promise<
  SsoActionResult<{ domain: string }>
> {
  return mutate("removeSso", deleteSsoConnection, { confirm: true });
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
