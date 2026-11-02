// REST API (/v1) errors that tell the caller what to do next: how to get a
// token, which scope is missing, where the endpoint list is. Every /v1 error
// has the shape { code, message, status } (lib/error-response), plus `docs`
// where a page explains the fix.

import { HttpError } from "@/lib/error-response";
import { baseUrl } from "@/lib/metadata";

const docsUrl = (path: string) => new URL(path, baseUrl).href;

export const API_DOCS = {
  /** How to register an OAuth app and get an access token. */
  auth: docsUrl("/docs/developers/rest-api#get-an-access-token"),
  /** Every endpoint and the scope it needs. */
  endpoints: docsUrl("/docs/developers/rest-api#endpoints"),
} as const;

/** Where developers register OAuth apps. */
export const DEVELOPER_SETTINGS_URL = docsUrl("/settings/developers");

/** No credentials at all (or not a Bearer token). */
export function missingTokenError(): HttpError {
  return new HttpError(
    401,
    "UNAUTHORIZED",
    `Missing access token. Send an OAuth access token as "Authorization: Bearer <token>". To get one, register an OAuth app at ${DEVELOPER_SETTINGS_URL} and follow ${API_DOCS.auth}.`,
    { "WWW-Authenticate": 'Bearer realm="QRdx API"' },
    API_DOCS.auth,
  );
}

/** A Bearer token that is unknown, expired, revoked or belongs to a ban. */
export function invalidTokenError(): HttpError {
  return new HttpError(
    401,
    "INVALID_TOKEN",
    "Invalid or expired access token. Access tokens last one hour: get a new one with your refresh token, or send the user through authorization again.",
    { "WWW-Authenticate": 'Bearer realm="QRdx API", error="invalid_token"' },
    API_DOCS.auth,
  );
}

/** A valid token without the scope this endpoint needs. */
export function insufficientScopeError(scope: string): HttpError {
  return new HttpError(
    403,
    "INSUFFICIENT_SCOPE",
    `This token needs the '${scope}' scope. Add it to your app and ask for it when the user authorizes.`,
    {
      "WWW-Authenticate": `Bearer realm="QRdx API", error="insufficient_scope", scope="${scope}"`,
    },
    API_DOCS.endpoints,
  );
}

/** An unknown /v1 path (app/api/v1/[[...missing]]). */
export function unknownEndpointError(method: string, path: string): HttpError {
  return new HttpError(
    404,
    "NOT_FOUND",
    `No such endpoint: ${method} ${path}. See ${API_DOCS.endpoints} for the endpoints.`,
    undefined,
    API_DOCS.endpoints,
  );
}

/**
 * /v1/me and /v1/themes errors: the API shape, plus the OAuth fields
 * (`error`, `error_description`) these endpoints have always sent, so
 * existing clients keep working.
 */
export function oauthCompatibleError(oauthCode: string, error: HttpError) {
  return Response.json(
    {
      error: oauthCode,
      error_description: error.message,
      code: error.code,
      message: error.message,
      status: error.status,
      ...(error.docs ? { docs: error.docs } : {}),
    },
    { status: error.status, headers: error.headers },
  );
}
