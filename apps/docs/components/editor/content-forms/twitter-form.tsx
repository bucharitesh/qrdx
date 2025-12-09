"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { TwitterContent } from "@/types/qr-content";
import { encodeTwitter } from "@/utils/qr-content-encoder";

export function TwitterForm() {
  const { setValue } = useQREditorStore();
  const [twitterData, setTwitterData] = React.useState<
    Omit<TwitterContent, "type">
  >({
    username: "",
  });

  React.useEffect(() => {
    const encoded = encodeTwitter({ type: "twitter", ...twitterData });
    setValue(encoded);
  }, [twitterData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="twitter-username">
          Twitter / X Username *
        </Label>
        <Input
          id="twitter-username"
          type="text"
          placeholder="username or @username"
          value={twitterData.username}
          onChange={(e) =>
            setTwitterData({ ...twitterData, username: e.target.value })
          }
        />
        <p className="text-muted-foreground text-[11px]">
          Enter your Twitter/X username with or without @
        </p>
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open your Twitter/X profile
      </p>
    </div>
  );
}


