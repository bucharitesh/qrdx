"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { ThreadsContent } from "@/types/qr-content";
import { encodeThreads } from "@/utils/qr-content-encoder";

export function ThreadsForm() {
  const { setValue } = useQREditorStore();
  const [threadsData, setThreadsData] = React.useState<
    Omit<ThreadsContent, "type">
  >({
    username: "",
  });

  React.useEffect(() => {
    const encoded = encodeThreads({ type: "threads", ...threadsData });
    setValue(encoded);
  }, [threadsData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="threads-username">
          Threads Username *
        </Label>
        <Input
          id="threads-username"
          type="text"
          placeholder="username or @username"
          value={threadsData.username}
          onChange={(e) =>
            setThreadsData({ ...threadsData, username: e.target.value })
          }
        />
        <p className="text-muted-foreground text-[11px]">
          Enter your Threads username with or without @
        </p>
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open your Threads profile
      </p>
    </div>
  );
}


