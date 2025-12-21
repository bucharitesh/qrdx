"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import type { AmazonFormData } from "@/lib/validations/qr-content";
import { amazonSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { AmazonContent } from "@/types/qr-content";
import { encodeAmazon } from "@/utils/qr-content-encoder";

export function AmazonForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("amazon") as AmazonContent | undefined;
  const [amazonData, setAmazonData] = React.useState<AmazonFormData>({
    productUrl: storedConfig?.productUrl || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Sync with store when config changes (e.g., from smart paste)
  React.useEffect(() => {
    if (
      storedConfig?.productUrl &&
      storedConfig.productUrl !== amazonData.productUrl
    ) {
      setAmazonData({ productUrl: storedConfig.productUrl });
    }
  }, [storedConfig]);

  React.useEffect(() => {
    // Validate and encode
    const result = amazonSchema.safeParse(amazonData);

    if (result.success) {
      const config: AmazonContent = { type: "amazon", ...result.data };
      const encoded = encodeAmazon(config);
      setValue(encoded);
      setContentConfig("amazon", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [amazonData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="amazon-product-url">
          Amazon Product URL *
        </Label>
        <Input
          id="amazon-product-url"
          type="url"
          placeholder="https://www.amazon.com/dp/B08N5WRWNW"
          value={amazonData.productUrl}
          onChange={(e) => setAmazonData({ productUrl: e.target.value })}
          className={errors.productUrl ? "border-destructive" : ""}
        />
        {errors.productUrl && (
          <p className="text-destructive text-[11px]">{errors.productUrl}</p>
        )}
        {!errors.productUrl && (
          <p className="text-muted-foreground text-[11px]">
            Enter your Amazon product or store URL
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open the Amazon product page
      </p>
    </div>
  );
}
