import "server-only";

// Event bus for webhooks, Zapier/Make hooks and notifications.
//   emitEvent(type, data, scope)            await it (already in the background)
//   emitEventInBackground(type, data, scope) from actions / route handlers
//   emitCodesCreated / emitCodeUpdated / emitFormSubmitted: typed helpers

export {
  codeSummary,
  type EventScope,
  emitCodesCreated,
  emitCodeUpdated,
  emitEvent,
  emitEventInBackground,
  emitFormSubmitted,
  emitScanRecorded,
} from "./emit";
export * from "./types";
