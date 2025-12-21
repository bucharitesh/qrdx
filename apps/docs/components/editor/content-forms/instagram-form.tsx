"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import type { InstagramFormData } from "@/lib/validations/qr-content";
import { instagramSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { InstagramContent } from "@/types/qr-content";
import { encodeInstagram } from "@/utils/qr-content-encoder";

export function InstagramForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("instagram") as
    | InstagramContent
    | undefined;
  const [instagramData, setInstagramData] = React.useState<InstagramFormData>({
    username: storedConfig?.username || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Sync with store when config changes (e.g., from smart paste)
  React.useEffect(() => {
    if (
      storedConfig?.username &&
      storedConfig.username !== instagramData.username
    ) {
      setInstagramData({ username: storedConfig.username });
    }
  }, [storedConfig]);

  React.useEffect(() => {
    // Validate and encode
    const result = instagramSchema.safeParse(instagramData);

    if (result.success) {
      const config: InstagramContent = { type: "instagram", ...result.data };
      const encoded = encodeInstagram(config);
      setValue(encoded);
      setContentConfig("instagram", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [instagramData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="instagram-username">
          Instagram Username *
        </Label>
        <Input
          id="instagram-username"
          type="text"
          placeholder="username or @username"
          value={instagramData.username}
          onChange={(e) =>
            setInstagramData({ ...instagramData, username: e.target.value })
          }
          className={errors.username ? "border-destructive" : ""}
        />
        {errors.username && (
          <p className="text-destructive text-[11px]">{errors.username}</p>
        )}
        {!errors.username && (
          <p className="text-muted-foreground text-[11px]">
            Enter your Instagram username with or without @
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open your Instagram profile
      </p>
    </div>
  );
}
