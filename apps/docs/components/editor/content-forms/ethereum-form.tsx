"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import type { EthereumFormData } from "@/lib/validations/qr-content";
import { ethereumSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { EthereumContent } from "@/types/qr-content";
import { encodeEthereum } from "@/utils/qr-content-encoder";

export function EthereumForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("ethereum") as
    | EthereumContent
    | undefined;
  const [ethereumData, setEthereumData] = React.useState<EthereumFormData>({
    address: storedConfig?.address || "",
    amount: storedConfig?.amount || "",
    gas: storedConfig?.gas || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = ethereumSchema.safeParse(ethereumData);

    if (result.success) {
      const config: EthereumContent = { type: "ethereum", ...result.data };
      const encoded = encodeEthereum(config);
      setValue(encoded);
      setContentConfig("ethereum", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [ethereumData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="ethereum-address">
          Ethereum Address *
        </Label>
        <Input
          id="ethereum-address"
          type="text"
          placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
          value={ethereumData.address}
          onChange={(e) =>
            setEthereumData({ ...ethereumData, address: e.target.value })
          }
          className={errors.address ? "border-destructive" : ""}
        />
        {errors.address && (
          <p className="text-destructive text-[11px]">{errors.address}</p>
        )}
        {!errors.address && (
          <p className="text-muted-foreground text-[11px]">
            Enter a valid Ethereum address (0x...)
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="ethereum-amount">
          Amount (ETH)
        </Label>
        <Input
          id="ethereum-amount"
          type="text"
          placeholder="0.1"
          value={ethereumData.amount}
          onChange={(e) =>
            setEthereumData({ ...ethereumData, amount: e.target.value })
          }
          className={errors.amount ? "border-destructive" : ""}
        />
        {errors.amount && (
          <p className="text-destructive text-[11px]">{errors.amount}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="ethereum-gas">
          Gas Limit
        </Label>
        <Input
          id="ethereum-gas"
          type="text"
          placeholder="21000"
          value={ethereumData.gas}
          onChange={(e) =>
            setEthereumData({ ...ethereumData, gas: e.target.value })
          }
          className={errors.gas ? "border-destructive" : ""}
        />
        {errors.gas && (
          <p className="text-destructive text-[11px]">{errors.gas}</p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open Ethereum wallet with payment details
      </p>
    </div>
  );
}
