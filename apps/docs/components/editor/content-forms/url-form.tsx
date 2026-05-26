"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useSmartPaste } from "@/lib/hooks/use-smart-paste";
import { useQREditorStore } from "@/store/editor-store";
import type { UrlContent } from "@/types/qr-content";
import { encodeUrl } from "@/utils/qr-content-encoder";

export function UrlForm() {
  const storedUrl = useQREditorStore(
    (state) => (state.contentConfigs.url as UrlContent | undefined)?.url ?? "",
  );
  const setValue = useQREditorStore((state) => state.setValue);
  const setContentConfig = useQREditorStore((state) => state.setContentConfig);
  const { handlePaste } = useSmartPaste();

  const [urlData, setUrlData] = React.useState({ url: storedUrl });

  // Sync with store when config changes externally (e.g., smart paste)
  React.useEffect(() => {
    setUrlData({ url: storedUrl });
  }, [storedUrl]);

  React.useEffect(() => {
    const config: UrlContent = { type: "url", ...urlData };
    const encoded = encodeUrl(config);
    const { value, contentConfigs } = useQREditorStore.getState();
    const currentConfig = contentConfigs.url as UrlContent | undefined;

    if (currentConfig?.url === urlData.url && value === encoded) {
      return;
    }

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
