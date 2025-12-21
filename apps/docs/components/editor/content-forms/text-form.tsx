"use client";

import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import * as React from "react";
import { useSmartPaste } from "@/lib/hooks/use-smart-paste";
import type { TextFormData } from "@/lib/validations/qr-content";
import { textSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { TextContent } from "@/types/qr-content";
import { encodeText } from "@/utils/qr-content-encoder";

export function TextForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();
  const { handlePaste } = useSmartPaste();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("text") as TextContent | undefined;
  const [textData, setTextData] = React.useState<TextFormData>({
    text: storedConfig?.text || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Sync with store when config changes (e.g., from smart paste)
  React.useEffect(() => {
    if (storedConfig?.text && storedConfig.text !== textData.text) {
      setTextData({ text: storedConfig.text });
    }
  }, [storedConfig]);

  React.useEffect(() => {
    // Validate and encode
    const result = textSchema.safeParse(textData);

    if (result.success) {
      const config: TextContent = { type: "text", ...result.data };
      const encoded = encodeText(config);
      setValue(encoded);
      setContentConfig("text", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [textData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="text-input">
          Text Content *
        </Label>
        <Textarea
          id="text-input"
          placeholder="Enter any text content..."
          value={textData.text}
          onChange={(e) => setTextData({ text: e.target.value })}
          onPaste={handlePaste}
          rows={6}
          className={`resize-none ${errors.text ? "border-destructive" : ""}`}
        />
        {errors.text && (
          <p className="text-destructive text-[11px]">{errors.text}</p>
        )}
        {!errors.text && (
          <p className="text-muted-foreground text-[11px]">
            Enter plain text content (paste URLs to auto-detect type)
          </p>
        )}
      </div>
    </div>
  );
}
