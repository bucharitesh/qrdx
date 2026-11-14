import type {
  IntegrationCapability,
  IntegrationCapabilityKind,
} from "@repo/integration-kit";
import { getCapabilityLabel, hasCapability } from "@repo/integration-kit";
import type { IntegrationDefinition } from "@repo/integrations";
import { dubIntegration } from "@repo/integrations/src/integrations/dub/config";
import { googleDriveIntegration } from "@repo/integrations/src/integrations/google-drive/config";
import type { ContentType } from "@/types/qr-content";

export const EDITOR_INTEGRATIONS = [dubIntegration, googleDriveIntegration];

export function getIntegrationContentType(
  integration: IntegrationDefinition,
): ContentType | null {
  const capability = integration.capabilities.find(
    (item) =>
      item.kind === "short-link-provider" || item.kind === "qr-content-source",
  );

  if (!capability || !("contentType" in capability)) {
    return null;
  }

  return capability.contentType as ContentType;
}

export function getIntegrationByContentType(
  contentType: ContentType | undefined,
): IntegrationDefinition | undefined {
  if (!contentType) {
    return undefined;
  }

  return EDITOR_INTEGRATIONS.find(
    (integration) => getIntegrationContentType(integration) === contentType,
  );
}

export function getIntegrationCapabilityLabels(
  capabilities: readonly IntegrationCapability[],
): string[] {
  return capabilities.map((capability) => getCapabilityLabel(capability.kind));
}

export function hasIntegrationCapability(
  integration: IntegrationDefinition,
  kind: IntegrationCapabilityKind,
): boolean {
  return hasCapability(integration.capabilities, kind);
}
