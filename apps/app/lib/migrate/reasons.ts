// Why a link is skipped in an import from another provider, as a stable
// code (stored on the job) and its English text (`reason`, kept for older
// jobs and the API). The import screens translate by code
// (app.dashboard.codes.import.reasons). Reasons without a code (a
// provider's own error, a destination rule) stay as sent.

export const MIGRATE_REASON_CODES = [
  "imported",
  "duplicate",
  "selectedTwice",
  "qrdx",
  "limit",
  "providerEnded",
  "backHalfShape",
  "backHalfReservedDomain",
  "backHalfReservedShared",
  "backHalfReservedSharedAddDomain",
  "backHalfTakenDomain",
  "backHalfTakenShared",
  "backHalfRepeated",
] as const;

export type MigrateReasonCode = (typeof MIGRATE_REASON_CODES)[number];

export interface MigrateReason {
  code: MigrateReasonCode;
  values?: Record<string, string>;
}

/** The English text of a reason. */
export function migrateReasonText({
  code,
  values = {},
}: MigrateReason): string {
  switch (code) {
    case "imported":
      return "Already imported";
    case "duplicate":
      return "A QRdx code with this destination already exists";
    case "selectedTwice":
      return "Selected twice";
    case "qrdx":
      return "Already points to a QRdx short link";
    case "limit":
      return "Over your plan's active-code limit";
    case "providerEnded":
      return `Imports from ${values.provider} have ended`;
    case "backHalfShape":
      return "QRdx back-halves are 3 to 64 letters, digits, - or _, so this one can't be kept.";
    case "backHalfReservedDomain":
      return `This back-half is reserved on ${values.domain}.`;
    case "backHalfReservedShared":
      return "This back-half is reserved on qrdx.dev.";
    case "backHalfReservedSharedAddDomain":
      return `This back-half is reserved on qrdx.dev. Add ${values.domain} on the Domains page to keep it there.`;
    case "backHalfTakenDomain":
      return `Another code on ${values.domain} already uses this back-half.`;
    case "backHalfTakenShared":
      return "Another QRdx code already uses this back-half on qrdx.dev.";
    case "backHalfRepeated":
      return "Another selected link has the same back-half.";
  }
}
