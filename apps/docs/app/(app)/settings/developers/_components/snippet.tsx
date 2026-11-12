"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { CopyButton } from "@/app/(app)/dashboard/webhooks/_components/event-checkboxes";

/** A labelled block of code with a copy button (`copy` when it differs). */
export function Snippet({
  label,
  code,
  copy = code,
}: {
  label: string;
  code: string;
  copy?: string;
}) {
  const t = useTranslations("app.settings.developers.snippet");
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="bg-muted/40 flex items-center justify-between gap-2 border-b py-1.5 pr-1.5 pl-3">
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
        <CopyButton
          className="size-7"
          label={t("copyLabel", { label: label.toLowerCase() })}
          value={copy}
        />
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** A read-only value to copy, such as a secret shown once. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const t = useTranslations("app.settings.developers.snippet");
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          className="font-mono text-xs"
          id={id}
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          value={value}
        />
        <CopyButton
          label={t("copyLabel", { label: label.toLowerCase() })}
          value={value}
        />
      </div>
    </div>
  );
}
