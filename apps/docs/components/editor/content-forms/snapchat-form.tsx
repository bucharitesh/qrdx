"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { SnapchatContent } from "@/types/qr-content";
import { encodeSnapchat } from "@/utils/qr-content-encoder";

export function SnapchatForm() {
  const t = useTranslations("editor.contentForms.snapchatForm");
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("snapchat") as
    | SnapchatContent
    | undefined;
  const [snapchatData, setSnapchatData] = React.useState<
    Omit<SnapchatContent, "type">
  >({
    username: storedConfig?.username || "",
  });

  React.useEffect(() => {
    const config: SnapchatContent = { type: "snapchat", ...snapchatData };
    const encoded = encodeSnapchat(config);
    setValue(encoded);
    setContentConfig("snapchat", config);
  }, [snapchatData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="snapchat-username">
          {t("snapchatUsername")}
        </Label>
        <Input
          id="snapchat-username"
          type="text"
          placeholder={t("username")}
          value={snapchatData.username}
          onChange={(e) =>
            setSnapchatData({ ...snapchatData, username: e.target.value })
          }
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {t("scanningWillOpenYourSnapchat")}
      </p>
    </div>
  );
}
