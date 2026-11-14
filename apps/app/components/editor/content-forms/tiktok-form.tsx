"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { TikTokContent } from "@/types/qr-content";
import { encodeTikTok } from "@/utils/qr-content-encoder";

export function TikTokForm() {
  const t = useTranslations("editor.contentForms.tiktokForm");
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("tiktok") as TikTokContent | undefined;
  const [tiktokData, setTiktokData] = React.useState<
    Omit<TikTokContent, "type">
  >({
    username: storedConfig?.username || "",
  });

  React.useEffect(() => {
    const config: TikTokContent = { type: "tiktok", ...tiktokData };
    const encoded = encodeTikTok(config);
    setValue(encoded);
    setContentConfig("tiktok", config);
  }, [tiktokData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="tiktok-username">
          {t("tiktokUsername")}
        </Label>
        <Input
          id="tiktok-username"
          type="text"
          placeholder={t("usernameOrUsername")}
          value={tiktokData.username}
          onChange={(e) =>
            setTiktokData({ ...tiktokData, username: e.target.value })
          }
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {t("scanningWillOpenYourTiktok")}
      </p>
    </div>
  );
}
