"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import type { EtsyFormData } from "@/lib/validations/qr-content";
import { etsySchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { EtsyContent } from "@/types/qr-content";
import { encodeEtsy } from "@/utils/qr-content-encoder";

export function EtsyForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("etsy") as EtsyContent | undefined;
  const [etsyData, setEtsyData] = React.useState<EtsyFormData>({
    shopUrl: storedConfig?.shopUrl || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = etsySchema.safeParse(etsyData);

    if (result.success) {
      const config: EtsyContent = { type: "etsy", ...result.data };
      const encoded = encodeEtsy(config);
      setValue(encoded);
      setContentConfig("etsy", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [etsyData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="etsy-shop-url">
          Etsy Shop URL *
        </Label>
        <Input
          id="etsy-shop-url"
          type="url"
          placeholder="https://www.etsy.com/shop/YourShopName"
          value={etsyData.shopUrl}
          onChange={(e) => setEtsyData({ shopUrl: e.target.value })}
          className={errors.shopUrl ? "border-destructive" : ""}
        />
        {errors.shopUrl && (
          <p className="text-destructive text-[11px]">{errors.shopUrl}</p>
        )}
        {!errors.shopUrl && (
          <p className="text-muted-foreground text-[11px]">
            Enter your Etsy shop or product URL
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open your Etsy shop or product page
      </p>
    </div>
  );
}
