"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import type { InstagramFormData } from "@/lib/validations/qr-content";
import { instagramSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import { encodeInstagram } from "@/utils/qr-content-encoder";

export function InstagramForm() {
  const { setValue } = useQREditorStore();
  const [instagramData, setInstagramData] = React.useState<InstagramFormData>({
    username: "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = instagramSchema.safeParse(instagramData);

    if (result.success) {
      const encoded = encodeInstagram({ type: "instagram", ...result.data });
      setValue(encoded);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [instagramData, setValue]);

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
