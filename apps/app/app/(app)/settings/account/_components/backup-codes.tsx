"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Label } from "@repo/design-system/components/ui/label";
import { Copy, DocumentDownload } from "iconsax-reactjs";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { backupCodesText } from "@/lib/auth/two-factor";
import type { Translator } from "@/lib/i18n/translator";

export async function copyText(
  text: string,
  what: string,
  t: Translator<"app.settings.account.backupCodes">,
) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(t("whatCopied", { what }));
  } catch {
    toast.error(t("couldntCopySelectTheText"));
  }
}

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * New backup codes, shown once: the list, Copy, Download and the "I've
 * saved them" box that lets the dialog finish.
 */
export function BackupCodesList({
  codes,
  email,
  saved,
  onSavedChange,
}: {
  codes: string[];
  email: string;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
}) {
  const t = useTranslations("app.settings.account.backupCodes");
  const id = useId();
  if (codes.length === 0) {
    return (
      <p className="text-sm text-pretty">{t("yourBackupCodesCouldntBe")}</p>
    );
  }
  return (
    <div className="space-y-4">
      <ul
        aria-label={t("backupCodes")}
        className="bg-muted/40 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border px-5 py-4 font-mono text-sm"
      >
        {codes.map((code) => (
          <li className="text-center tracking-wider tabular-nums" key={code}>
            {code.slice(0, 5)}
            <span className="text-muted-foreground">-</span>
            {code.slice(6)}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="h-10 sm:h-9"
          onClick={() => copyText(codes.join("\n"), "Backup codes", t)}
          type="button"
          variant="outline"
        >
          <Copy className="size-4" />
          {t("copy")}
        </Button>
        <Button
          className="h-10 sm:h-9"
          onClick={() =>
            download(
              backupCodesText({ codes, email, createdAt: new Date() }),
              "qrdx-backup-codes.txt",
            )
          }
          type="button"
          variant="outline"
        >
          <DocumentDownload className="size-4" />
          {t("download")}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={saved}
          className="relative after:absolute after:-inset-3"
          id={`${id}-saved`}
          onCheckedChange={(checked) => onSavedChange(checked === true)}
        />
        <Label
          className="-my-3 min-h-10 py-3 text-sm font-normal"
          htmlFor={`${id}-saved`}
        >
          {t("iveSavedMyBackupCodes")}
        </Label>
      </div>
    </div>
  );
}
