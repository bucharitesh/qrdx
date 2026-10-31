"use client";

import { Spinner } from "@repo/design-system/components/icons";
import { Button } from "@repo/design-system/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { emitSound } from "@/components/editor/sound";
import { DataConnectionError, exportToSheet } from "@/lib/data-connections/client";

type ExportTarget = { codeId: string | null } | { pageId: string };

/**
 * "Export to Google Sheets": a new spreadsheet with a code's scans (or all
 * codes'), or a page's form responses. Points to settings when Google Sheets
 * isn't connected.
 */
export function SheetsExportButton(props: ExportTarget & { size?: "sm" | "default" }) {
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    try {
      const result = await exportToSheet(
        "pageId" in props
          ? { kind: "responses", pageId: props.pageId }
          : { kind: "scans", codeId: props.codeId },
      );
      emitSound("success");
      toast.success(
        `Exported ${result.rows.toLocaleString()} rows${result.truncated ? " (the first 50,000)" : ""}`,
        {
          action: {
            label: "Open sheet",
            onClick: () => window.open(result.url, "_blank", "noopener,noreferrer"),
          },
        },
      );
    } catch (error) {
      const code = error instanceof DataConnectionError ? error.code : undefined;
      if (code === "NOT_CONNECTED" || code === "RECONNECT" || code === "reconnect") {
        toast.error("Connect Google Sheets first", {
          action: {
            label: "Connect",
            onClick: () => {
              window.location.href = "/settings/integrations/google-sheets";
            },
          },
        });
      } else {
        toast.error(error instanceof Error ? error.message : "Export failed");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      disabled={pending}
      onClick={run}
      size={props.size ?? "sm"}
      type="button"
      variant="outline"
    >
      {pending ? (
        <Spinner className="size-4" />
      ) : (
        <img alt="" className="size-4" src="/integrations/google-sheets.svg" />
      )}
      {pending ? "Exporting…" : "Export to Google Sheets"}
    </Button>
  );
}
