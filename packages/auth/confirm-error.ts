import { APIError } from "better-auth/api";

// The answer for a request that needs "Confirm it's you" first: from the
// HTTP confirm gate (./confirm-gate.ts) and for a held session
// (./session-origin.ts). Its own module so both can use it without
// importing each other.

export const CONFIRMATION_REQUIRED = "CONFIRMATION_REQUIRED";

export function confirmationRequiredError(): APIError {
  return new APIError("FORBIDDEN", {
    code: CONFIRMATION_REQUIRED,
    message: "Confirm it's you first, then try again.",
  });
}
