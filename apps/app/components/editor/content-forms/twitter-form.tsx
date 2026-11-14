"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { TwitterContent } from "@/types/qr-content";
import { encodeTwitter } from "@/utils/qr-content-encoder";
import { useExternalConfigSync } from "./use-external-config-sync";

export function TwitterForm() {
  const t = useTranslations("editor.contentForms.twitterForm");
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("twitter") as
    | TwitterContent
    | undefined;
  const [twitterData, setTwitterData] = React.useState<
    Omit<TwitterContent, "type">
  >({
    username: storedConfig?.username || "",
  });

  // Only external changes (e.g. smart paste) flow back into the form
  const markWritten = useExternalConfigSync(storedConfig, (config) =>
    setTwitterData({ username: config.username || "" }),
  );

  React.useEffect(() => {
    const config: TwitterContent = { type: "twitter", ...twitterData };
    const encoded = encodeTwitter(config);
    setValue(encoded);
    markWritten(config);
    setContentConfig("twitter", config);
  }, [twitterData, setValue, setContentConfig, markWritten]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="twitter-username">
          {t("twitterXUsername")}
        </Label>
        <Input
          id="twitter-username"
          type="text"
          placeholder={t("usernameOrUsername")}
          value={twitterData.username}
          onChange={(e) =>
            setTwitterData({ ...twitterData, username: e.target.value })
          }
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {t("scanningWillOpenYourTwitter")}
      </p>
    </div>
  );
}
