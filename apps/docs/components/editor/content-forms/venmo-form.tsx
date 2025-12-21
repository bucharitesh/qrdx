"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import type { VenmoFormData } from "@/lib/validations/qr-content";
import { venmoSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { VenmoContent } from "@/types/qr-content";
import { encodeVenmo } from "@/utils/qr-content-encoder";

export function VenmoForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("venmo") as VenmoContent | undefined;
  const [venmoData, setVenmoData] = React.useState<VenmoFormData>({
    username: storedConfig?.username || "",
    amount: storedConfig?.amount || "",
    note: storedConfig?.note || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = venmoSchema.safeParse(venmoData);

    if (result.success) {
      const config: VenmoContent = { type: "venmo", ...result.data };
      const encoded = encodeVenmo(config);
      setValue(encoded);
      setContentConfig("venmo", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [venmoData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="venmo-username">
          Venmo Username *
        </Label>
        <Input
          id="venmo-username"
          type="text"
          placeholder="@username"
          value={venmoData.username}
          onChange={(e) =>
            setVenmoData({ ...venmoData, username: e.target.value })
          }
          className={errors.username ? "border-destructive" : ""}
        />
        {errors.username && (
          <p className="text-destructive text-[11px]">{errors.username}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="venmo-amount">
          Amount ($)
        </Label>
        <Input
          id="venmo-amount"
          type="text"
          placeholder="25.00"
          value={venmoData.amount}
          onChange={(e) =>
            setVenmoData({ ...venmoData, amount: e.target.value })
          }
          className={errors.amount ? "border-destructive" : ""}
        />
        {errors.amount && (
          <p className="text-destructive text-[11px]">{errors.amount}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="venmo-note">
          Note
        </Label>
        <Input
          id="venmo-note"
          type="text"
          placeholder="Payment for..."
          value={venmoData.note}
          onChange={(e) => setVenmoData({ ...venmoData, note: e.target.value })}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open Venmo with pre-filled payment details
      </p>
    </div>
  );
}
