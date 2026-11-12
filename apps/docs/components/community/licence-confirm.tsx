"use client";

import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Label } from "@repo/design-system/components/ui/label";
import { useTranslations } from "next-intl";
import { useId } from "react";
import {
  COMMUNITY_LICENSE_NAME,
  COMMUNITY_LICENSE_URL,
  LICENSE_CONFIRMATION,
  LICENSE_SUMMARY,
} from "@/lib/community/licence";

/** The CC0 box every publish dialog shows; publishing waits for the tick. */
export function LicenceConfirm({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("community.licenceConfirm");
  const id = useId();
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {t("licence")}
          <a
            className="underline underline-offset-2"
            href={COMMUNITY_LICENSE_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            {COMMUNITY_LICENSE_NAME}
          </a>
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {LICENSE_SUMMARY}
        </p>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          checked={checked}
          disabled={disabled}
          id={id}
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        <Label className="text-xs leading-snug font-normal" htmlFor={id}>
          {LICENSE_CONFIRMATION}
        </Label>
      </div>
    </div>
  );
}
