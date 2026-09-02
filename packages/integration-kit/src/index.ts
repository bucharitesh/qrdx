export type IntegrationLogoSet = {
  light: string;
  dark: string;
};

export type IntegrationCapabilityKind =
  | "manual-url-parser"
  | "short-link-provider"
  | "qr-content-source"
  | "asset-picker";

export type IntegrationUiSurface =
  | "editor-content-modal"
  | "editor-content-form"
  | "settings-detail";

export type IntegrationManualPattern = {
  id: string;
  label: string;
  pattern: string;
  example: string;
  contentType: string;
  targetField: string;
};

export type IntegrationCapabilityBase = {
  kind: IntegrationCapabilityKind;
  id: string;
  label: string;
  description: string;
  surfaces: IntegrationUiSurface[];
  requiresConnection: boolean;
};

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
  sourceTypes: Array<"file" | "folder" | "link">;
};

export type AssetPickerCapability = IntegrationCapabilityBase & {
  kind: "asset-picker";
  assetTypes: Array<"image" | "svg" | "file">;
};

export type IntegrationCapability =
  | ManualUrlParserCapability
  | ShortLinkProviderCapability
  | QrContentSourceCapability
  | AssetPickerCapability;

export type IntegrationCapabilityKindLabel = Record<
  IntegrationCapabilityKind,
  string
>;

export const INTEGRATION_CAPABILITY_LABELS: IntegrationCapabilityKindLabel = {
  "manual-url-parser": "Manual URL",
  "short-link-provider": "Short links",
  "qr-content-source": "QR source",
  "asset-picker": "Asset picker",
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
