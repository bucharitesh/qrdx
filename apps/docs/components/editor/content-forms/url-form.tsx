"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useSmartPaste } from "@/lib/hooks/use-smart-paste";
import { useQREditorStore } from "@/store/editor-store";
import type { UrlContent } from "@/types/qr-content";
import { encodeUrl } from "@/utils/qr-content-encoder";

export function UrlForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();
  const { handlePaste } = useSmartPaste();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("url") as UrlContent | undefined;
  const [urlData, setUrlData] = React.useState({
    url: storedConfig?.url || "",
  });

  // Sync with store when config changes (e.g., from smart paste)
  React.useEffect(() => {
    if (storedConfig?.url && storedConfig.url !== urlData.url) {
      setUrlData({ url: storedConfig.url });
    }
  }, [storedConfig]);

  React.useEffect(() => {
    const config: UrlContent = { type: "url", ...urlData };
    const encoded = encodeUrl(config);
    setValue(encoded);
    setContentConfig("url", config);
  }, [urlData, setValue, setContentConfig]);

  return (
    <div className="space-y-2">
      <Label className="text-xs" htmlFor="url-input">
        URL
      </Label>
      <Input
        id="url-input"
        onChange={(e) => setUrlData({ url: e.target.value })}
        onPaste={handlePaste}
        placeholder="https://example.com"
        type="text"
        value={urlData.url}
      />
      <p className="text-muted-foreground text-xs">
        Enter a website URL (paste any URL to auto-detect type)
      </p>
    </div>
  );
}
