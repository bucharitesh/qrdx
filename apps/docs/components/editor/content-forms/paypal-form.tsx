"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { PayPalContent } from "@/types/qr-content";
import { encodePayPal } from "@/utils/qr-content-encoder";

export function PayPalForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("paypal") as PayPalContent | undefined;
  const [paypalData, setPaypalData] = React.useState<
    Omit<PayPalContent, "type">
  >({
    paypalUrl: storedConfig?.paypalUrl || "",
  });

  React.useEffect(() => {
    const config: PayPalContent = { type: "paypal", ...paypalData };
    const encoded = encodePayPal(config);
    setValue(encoded);
    setContentConfig("paypal", config);
  }, [paypalData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="paypal-url">
          PayPal.Me URL or Payment Link *
        </Label>
        <Input
          id="paypal-url"
          type="url"
          placeholder="https://paypal.me/username or payment link"
          value={paypalData.paypalUrl}
          onChange={(e) =>
            setPaypalData({ ...paypalData, paypalUrl: e.target.value })
          }
        />
        <p className="text-muted-foreground text-[11px]">
          Enter your PayPal.Me URL or a PayPal payment link
        </p>
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open the PayPal payment page
      </p>
    </div>
  );
}
