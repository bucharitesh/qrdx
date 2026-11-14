/**
 * Hook for smart URL paste detection and auto-filling
 */

import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { ContentType, QRContentConfig } from "@/types/qr-content";
import { parseURL } from "@/utils/url-parser";

interface UseSmartPasteOptions {
  onPaste?: (type: ContentType, config: Partial<QRContentConfig>) => void;
  enabled?: boolean;
}

export function useSmartPaste(options: UseSmartPasteOptions = {}) {
  const { enabled = true, onPaste } = options;
  const { setContentType, setContentConfig } = useQREditorStore();

  const handlePaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!enabled) return;

      const pastedText = event.clipboardData.getData("text");
      if (!pastedText || pastedText.length === 0) return;

      const parsed = parseURL(pastedText);
      if (!parsed) return;

      // Prevent default paste behavior
      event.preventDefault();

      // Update the store with the new content type and config
      setContentType(parsed.type);

      // Set the config for the detected type
      if (parsed.config) {
        setContentConfig(parsed.type, parsed.config as any);
      }

      // Call optional callback
      if (onPaste) {
        onPaste(parsed.type, parsed.config);
      }
    },
    [enabled, onPaste, setContentType, setContentConfig],
  );

  return { handlePaste };
}
