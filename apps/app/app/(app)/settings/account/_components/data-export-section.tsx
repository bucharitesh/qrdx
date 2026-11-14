"use client";

import { toast } from "@repo/design-system";
import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { DocumentDownload } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SettingsRow, SettingsSection } from "./settings-section";

const EXPORT_URL = "/settings/account/export";

/** "qrdx-data-2026-11-01.zip" from Content-Disposition, with a fallback. */
function filenameOf(response: Response): string {
  const header = response.headers.get("content-disposition") ?? "";
  return /filename="([^"]+)"/.exec(header)?.[1] ?? "qrdx-data.zip";
}

export function DataExportSection() {
  const t = useTranslations("app.settings.account.dataExportSection");
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
        toast.error(body?.message ?? t("weCouldntPrepareYourData"));
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
      toast.success(t("yourDataIsDownloading"));
    } catch (error) {
      console.error("Data export failed:", error);
      toast.error(t("theDownloadWasInterruptedPlease"));
    } finally {
      setPreparing(false);
    }
  };

  return (
    <SettingsSection
      description={t("takeACopyOfEverything")}
      id="data"
      title={t("yourData")}
    >
      <SettingsRow
        description={t("upTo3DownloadsAn")}
        label={t("downloadMyData")}
      >
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm text-pretty">
            {t("aZipOfYourProfile")}
          </p>
          <Button disabled={preparing} onClick={download} variant="outline">
            {preparing ? (
              <Spinner className="animate-spin" />
            ) : (
              <DocumentDownload aria-hidden />
            )}
            {preparing ? t("preparingYourData") : t("downloadMyData")}
          </Button>
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
