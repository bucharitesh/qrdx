"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { PinterestContent } from "@/types/qr-content";
import { encodePinterest } from "@/utils/qr-content-encoder";

export function PinterestForm() {
  const t = useTranslations("editor.contentForms.pinterestForm");
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("pinterest") as
    | PinterestContent
    | undefined;
  const [pinterestData, setPinterestData] = React.useState<
    Omit<PinterestContent, "type">
  >({
    username: storedConfig?.username || "",
  });

  React.useEffect(() => {
    const config: PinterestContent = { type: "pinterest", ...pinterestData };
    const encoded = encodePinterest(config);
    setValue(encoded);
    setContentConfig("pinterest", config);
  }, [pinterestData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="pinterest-username">
          {t("pinterestUsername")}
        </Label>
        <Input
          id="pinterest-username"
          type="text"
          placeholder={t("username")}
          value={pinterestData.username}
          onChange={(e) =>
            setPinterestData({ ...pinterestData, username: e.target.value })
          }
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {t("scanningWillOpenYourPinterest")}
      </p>
    </div>
  );
}
