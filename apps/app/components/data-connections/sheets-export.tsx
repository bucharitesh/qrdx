import "server-only";

import type { ComponentProps } from "react";
import { getIntegrationAvailability } from "@/lib/integration-availability";
import { isVisible, setupNeeded } from "@/lib/integration-availability-rules";
import { SheetsExportButton } from "./sheets-export-button";

/**
 * Server wrapper for SheetsExportButton: nothing in production and preview
 * when Google Sheets needs setup; in local dev the button plus a "Needs
 * setup" badge naming the missing env variables.
 */
export function SheetsExport(props: ComponentProps<typeof SheetsExportButton>) {
  const availability = getIntegrationAvailability();
  if (!isVisible(availability, "google-sheets")) return null;
  return (
    <SheetsExportButton
      {...props}
      needsSetup={setupNeeded(availability, "google-sheets")}
    />
  );
}
