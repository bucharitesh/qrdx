"use client";

import { CANONICAL_ORIGIN } from "@repo/config";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { ThemeStyles } from "@/types/theme";
import { DesignQr } from "./design-qr";

const SAMPLE = `${CANONICAL_ORIGIN}/community`;

/** The item's design with the visitor's own link, drawn in the browser. */
export function TryIt({ style }: { style: ThemeStyles }) {
  const t = useTranslations("community.tryIt");
  const id = useId();
  const [value, setValue] = useState("");
  return (
    <div className="space-y-4">
      <div className="bg-muted/40 relative aspect-square overflow-hidden rounded-2xl border">
        <div className="absolute inset-6 rounded-xl bg-white p-4 ring-1 ring-black/5 sm:inset-10">
          <DesignQr
            className="size-full"
            style={style}
            value={value || SAMPLE}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor={id}>
          {t("tryItWithYourLink")}
        </Label>
        <Input
          id={id}
          inputMode="url"
          maxLength={500}
          onChange={(event) => setValue(event.target.value)}
          placeholder={SAMPLE}
          value={value}
        />
        <p className="text-muted-foreground text-xs">
          {t("drawnInYourBrowserNothing")}
        </p>
      </div>
    </div>
  );
}
