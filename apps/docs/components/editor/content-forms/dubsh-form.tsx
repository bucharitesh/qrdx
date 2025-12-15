"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import type { DubshFormData } from "@/lib/validations/qr-content";
import { dubshSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { DubshContent } from "@/types/qr-content";
import { encodeDubsh } from "@/utils/qr-content-encoder";

export function DubshForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("dubsh") as DubshContent | undefined;
  const [dubshData, setDubshData] = React.useState<DubshFormData>({
    shortUrl: storedConfig?.shortUrl || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = dubshSchema.safeParse(dubshData);

    if (result.success) {
      const config: DubshContent = { type: "dubsh", ...result.data };
      const encoded = encodeDubsh(config);
      setValue(encoded);
      setContentConfig("dubsh", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [dubshData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="dubsh-short-url">
          Dub.sh Short URL *
        </Label>
        <Input
          id="dubsh-short-url"
          type="url"
          placeholder="https://dub.sh/abc123"
          value={dubshData.shortUrl}
          onChange={(e) => setDubshData({ shortUrl: e.target.value })}
          className={errors.shortUrl ? "border-destructive" : ""}
        />
        {errors.shortUrl && (
          <p className="text-destructive text-[11px]">{errors.shortUrl}</p>
        )}
        {!errors.shortUrl && (
          <p className="text-muted-foreground text-[11px]">
            Enter your Dub.sh short link
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will redirect to your Dub.sh short link
      </p>
    </div>
  );
}

