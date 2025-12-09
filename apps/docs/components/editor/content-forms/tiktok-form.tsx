"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { TikTokContent } from "@/types/qr-content";
import { encodeTikTok } from "@/utils/qr-content-encoder";

export function TikTokForm() {
  const { setValue } = useQREditorStore();
  const [tiktokData, setTiktokData] = React.useState<
    Omit<TikTokContent, "type">
  >({
    username: "",
  });

  React.useEffect(() => {
    const encoded = encodeTikTok({ type: "tiktok", ...tiktokData });
    setValue(encoded);
  }, [tiktokData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="tiktok-username">
          TikTok Username *
        </Label>
        <Input
          id="tiktok-username"
          type="text"
          placeholder="username or @username"
          value={tiktokData.username}
          onChange={(e) =>
            setTiktokData({ ...tiktokData, username: e.target.value })
          }
        />
        <p className="text-muted-foreground text-[11px]">
          Enter your TikTok username with or without @
        </p>
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open your TikTok profile
      </p>
    </div>
  );
}


