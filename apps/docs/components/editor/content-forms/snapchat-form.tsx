"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { SnapchatContent } from "@/types/qr-content";
import { encodeSnapchat } from "@/utils/qr-content-encoder";

export function SnapchatForm() {
  const { setValue } = useQREditorStore();
  const [snapchatData, setSnapchatData] = React.useState<
    Omit<SnapchatContent, "type">
  >({
    username: "",
  });

  React.useEffect(() => {
    const encoded = encodeSnapchat({ type: "snapchat", ...snapchatData });
    setValue(encoded);
  }, [snapchatData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="snapchat-username">
          Snapchat Username *
        </Label>
        <Input
          id="snapchat-username"
          type="text"
          placeholder="username"
          value={snapchatData.username}
          onChange={(e) =>
            setSnapchatData({ ...snapchatData, username: e.target.value })
          }
        />
        <p className="text-muted-foreground text-[11px]">
          Enter your Snapchat username
        </p>
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open the add friend page for your Snapchat profile
      </p>
    </div>
  );
}


