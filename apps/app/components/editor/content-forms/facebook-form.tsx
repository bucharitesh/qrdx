"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { FacebookContent } from "@/types/qr-content";
import { encodeFacebook } from "@/utils/qr-content-encoder";

export function FacebookForm() {
  const t = useTranslations("editor.contentForms.facebookForm");
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("facebook") as
    | FacebookContent
    | undefined;
  const [facebookData, setFacebookData] = React.useState<
    Omit<FacebookContent, "type">
  >({
    profileUrl: storedConfig?.profileUrl || "",
  });

  React.useEffect(() => {
    const config: FacebookContent = { type: "facebook", ...facebookData };
    const encoded = encodeFacebook(config);
    setValue(encoded);
    setContentConfig("facebook", config);
  }, [facebookData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="facebook-url">
          {t("facebookProfileUrl")}
        </Label>
        <Input
          id="facebook-url"
          type="url"
          placeholder="https://www.facebook.com/username"
          value={facebookData.profileUrl}
          onChange={(e) =>
            setFacebookData({ ...facebookData, profileUrl: e.target.value })
          }
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {t("scanningWillOpenYourFacebook")}
      </p>
    </div>
  );
}
