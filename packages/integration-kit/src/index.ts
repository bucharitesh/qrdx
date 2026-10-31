export interface IntegrationLogoSet {
  light: string;
  dark: string;
}

export type IntegrationCapabilityKind =
  | "manual-url-parser"
  | "short-link-provider"
  | "qr-content-source"
  | "asset-picker"
  | "event-sink";

export type IntegrationUiSurface =
  | "editor-content-modal"
  | "editor-content-form"
  | "settings-detail";

export interface IntegrationManualPattern {
  id: string;
  label: string;
  pattern: string;
  example: string;
  contentType: string;
  targetField: string;
}

export interface IntegrationCapabilityBase {
  kind: IntegrationCapabilityKind;
  id: string;
  label: string;
  description: string;
  surfaces: IntegrationUiSurface[];
  requiresConnection: boolean;
}

export type ManualUrlParserCapability = IntegrationCapabilityBase & {
  kind: "manual-url-parser";
  patterns: IntegrationManualPattern[];
};

export type ShortLinkProviderCapability = IntegrationCapabilityBase & {
  kind: "short-link-provider";
  contentType: string;
  actions: Array<"create" | "select" | "manual">;
};

export type QrContentSourceCapability = IntegrationCapabilityBase & {
  kind: "qr-content-source";
  contentType: string;
  sourceTypes: Array<
    "file" | "folder" | "link" | "product" | "event-type" | "video" | "playlist"
  >;
};

/** QRdx data an event sink can receive. */
export type EventSinkData = "scans" | "form-responses" | "alerts";

/**
 * Data out: sends QRdx events (scans, form responses, alerts) to the user's
 * own tool. `export` = one-off copy on request; `sync` = new items are
 * delivered in batches by the background worker (idempotent, retried with
 * backoff, last status shown in settings); `notify` = posted as alerts
 * through the notification pipeline.
 */
export type EventSinkCapability = IntegrationCapabilityBase & {
  kind: "event-sink";
  data: EventSinkData[];
  modes: Array<"export" | "sync" | "notify">;
};

export type AssetPickerCapability = IntegrationCapabilityBase & {
  kind: "asset-picker";
  assetTypes: Array<"image" | "svg" | "file">;
};

export type IntegrationCapability =
  | ManualUrlParserCapability
  | ShortLinkProviderCapability
  | QrContentSourceCapability
  | AssetPickerCapability
  | EventSinkCapability;

export type IntegrationCapabilityKindLabel = Record<
  IntegrationCapabilityKind,
  string
>;

export const INTEGRATION_CAPABILITY_LABELS: IntegrationCapabilityKindLabel = {
  "manual-url-parser": "Manual URL",
  "short-link-provider": "Short links",
  "qr-content-source": "QR source",
  "asset-picker": "Asset picker",
  "event-sink": "Data out",
};

export function getCapabilityLabel(kind: IntegrationCapabilityKind): string {
  return INTEGRATION_CAPABILITY_LABELS[kind];
}

export function hasCapability(
  capabilities: readonly IntegrationCapability[],
  kind: IntegrationCapabilityKind
): boolean {
  return capabilities.some((capability) => capability.kind === kind);
}
