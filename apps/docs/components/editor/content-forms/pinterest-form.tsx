"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { PinterestContent } from "@/types/qr-content";
import { encodePinterest } from "@/utils/qr-content-encoder";

export function PinterestForm() {
  const { setValue } = useQREditorStore();
  const [pinterestData, setPinterestData] = React.useState<
    Omit<PinterestContent, "type">
  >({
    username: "",
  });

  React.useEffect(() => {
    const encoded = encodePinterest({ type: "pinterest", ...pinterestData });
    setValue(encoded);
  }, [pinterestData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="pinterest-username">
          Pinterest Username *
        </Label>
        <Input
          id="pinterest-username"
          type="text"
          placeholder="username"
          value={pinterestData.username}
          onChange={(e) =>
            setPinterestData({ ...pinterestData, username: e.target.value })
          }
        />
        <p className="text-muted-foreground text-[11px]">
          Enter your Pinterest username
        </p>
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open your Pinterest profile
      </p>
    </div>
  );
}


