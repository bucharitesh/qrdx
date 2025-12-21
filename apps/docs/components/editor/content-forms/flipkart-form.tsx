"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import type { FlipkartFormData } from "@/lib/validations/qr-content";
import { flipkartSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { FlipkartContent } from "@/types/qr-content";
import { encodeFlipkart } from "@/utils/qr-content-encoder";

export function FlipkartForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("flipkart") as
    | FlipkartContent
    | undefined;
  const [flipkartData, setFlipkartData] = React.useState<FlipkartFormData>({
    productUrl: storedConfig?.productUrl || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = flipkartSchema.safeParse(flipkartData);

    if (result.success) {
      const config: FlipkartContent = { type: "flipkart", ...result.data };
      const encoded = encodeFlipkart(config);
      setValue(encoded);
      setContentConfig("flipkart", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [flipkartData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="flipkart-product-url">
          Flipkart Product URL *
        </Label>
        <Input
          id="flipkart-product-url"
          type="url"
          placeholder="https://www.flipkart.com/product/..."
          value={flipkartData.productUrl}
          onChange={(e) => setFlipkartData({ productUrl: e.target.value })}
          className={errors.productUrl ? "border-destructive" : ""}
        />
        {errors.productUrl && (
          <p className="text-destructive text-[11px]">{errors.productUrl}</p>
        )}
        {!errors.productUrl && (
          <p className="text-muted-foreground text-[11px]">
            Enter your Flipkart product or store URL
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open the Flipkart product page
      </p>
    </div>
  );
}
