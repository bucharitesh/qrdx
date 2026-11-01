"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { DocumentDownload } from "iconsax-reactjs";
import { useState } from "react";
import { SettingsRow, SettingsSection } from "./settings-section";

const EXPORT_URL = "/settings/account/export";

/** "qrdx-data-2026-11-01.zip" from Content-Disposition, with a fallback. */
function filenameOf(response: Response): string {
  const header = response.headers.get("content-disposition") ?? "";
  return /filename="([^"]+)"/.exec(header)?.[1] ?? "qrdx-data.zip";
}

export function DataExportSection() {
  const [preparing, setPreparing] = useState(false);

  const download = async () => {
    setPreparing(true);
    try {
      const response = await fetch(EXPORT_URL, {
        method: "POST",
        credentials: "same-origin",
      });
      const type = response.headers.get("content-type") ?? "";
      if (!(response.ok && type.startsWith("application/zip"))) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        toast.error(
          body?.message ?? "We couldn't prepare your data. Please try again.",
        );
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filenameOf(response);
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("Your data is downloading");
    } catch (error) {
      console.error("Data export failed:", error);
      toast.error("The download was interrupted. Please try again.");
    } finally {
      setPreparing(false);
    }
  };

  return (
    <SettingsSection
      description="Take a copy of everything QRdx keeps about you, whenever you like."
      id="data"
      title="Your data"
    >
      <SettingsRow
        description="Up to 3 downloads an hour. A big account can take a minute."
        label="Download my data"
      >
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm text-pretty">
            A ZIP of your profile, sign-in methods and sessions, codes and their
            settings, scans, hosted pages and form responses, themes, folders,
            tags, webhooks, apps, integrations, teams and subscription, with a
            README that explains each file. Secrets such as passwords, tokens
            and webhook keys are never included.
          </p>
          <Button disabled={preparing} onClick={download} variant="outline">
            {preparing ? (
              <Spinner className="animate-spin" />
            ) : (
              <DocumentDownload aria-hidden />
            )}
            {preparing ? "Preparing your data…" : "Download my data"}
          </Button>
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
