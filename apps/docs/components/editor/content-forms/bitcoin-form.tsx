"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import type { BitcoinFormData } from "@/lib/validations/qr-content";
import { bitcoinSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { BitcoinContent } from "@/types/qr-content";
import { encodeBitcoin } from "@/utils/qr-content-encoder";

export function BitcoinForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("bitcoin") as
    | BitcoinContent
    | undefined;
  const [bitcoinData, setBitcoinData] = React.useState<BitcoinFormData>({
    address: storedConfig?.address || "",
    amount: storedConfig?.amount || "",
    label: storedConfig?.label || "",
    message: storedConfig?.message || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = bitcoinSchema.safeParse(bitcoinData);

    if (result.success) {
      const config: BitcoinContent = { type: "bitcoin", ...result.data };
      const encoded = encodeBitcoin(config);
      setValue(encoded);
      setContentConfig("bitcoin", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [bitcoinData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="bitcoin-address">
          Bitcoin Address *
        </Label>
        <Input
          id="bitcoin-address"
          type="text"
          placeholder="1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"
          value={bitcoinData.address}
          onChange={(e) =>
            setBitcoinData({ ...bitcoinData, address: e.target.value })
          }
          className={errors.address ? "border-destructive" : ""}
        />
        {errors.address && (
          <p className="text-destructive text-[11px]">{errors.address}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="bitcoin-amount">
          Amount (BTC)
        </Label>
        <Input
          id="bitcoin-amount"
          type="text"
          placeholder="0.001"
          value={bitcoinData.amount}
          onChange={(e) =>
            setBitcoinData({ ...bitcoinData, amount: e.target.value })
          }
          className={errors.amount ? "border-destructive" : ""}
        />
        {errors.amount && (
          <p className="text-destructive text-[11px]">{errors.amount}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="bitcoin-label">
          Label
        </Label>
        <Input
          id="bitcoin-label"
          type="text"
          placeholder="Payment label"
          value={bitcoinData.label}
          onChange={(e) =>
            setBitcoinData({ ...bitcoinData, label: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="bitcoin-message">
          Message
        </Label>
        <Input
          id="bitcoin-message"
          type="text"
          placeholder="Payment message"
          value={bitcoinData.message}
          onChange={(e) =>
            setBitcoinData({ ...bitcoinData, message: e.target.value })
          }
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open Bitcoin wallet with payment details
      </p>
    </div>
  );
}
