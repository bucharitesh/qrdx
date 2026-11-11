"use client";

import { toast } from "@repo/design-system";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Label } from "@repo/design-system/components/ui/label";
import { Copy, DocumentDownload } from "iconsax-reactjs";
import { useId } from "react";
import { backupCodesText } from "@/lib/auth/two-factor";

export async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Couldn't copy. Select the text and copy it instead.");
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
  const id = useId();
  if (codes.length === 0) {
    return (
      <p className="text-sm text-pretty">
        Your backup codes couldn't be shown. Choose New codes in Settings to
        make a fresh set.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <ul
        aria-label="Backup codes"
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
          onClick={() => copyText(codes.join("\n"), "Backup codes")}
          type="button"
          variant="outline"
        >
          <Copy className="size-4" />
          Copy
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
          Download
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
          I've saved my backup codes
        </Label>
      </div>
    </div>
  );
}
