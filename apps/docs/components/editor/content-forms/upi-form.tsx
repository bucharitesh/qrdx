"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import type { UPIFormData } from "@/lib/validations/qr-content";
import { upiSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import { encodeUPI } from "@/utils/qr-content-encoder";

export function UPIForm() {
  const { setValue } = useQREditorStore();
  const [upiData, setUpiData] = React.useState<UPIFormData>({
    upiId: "",
    name: "",
    amount: "",
    note: "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = upiSchema.safeParse(upiData);
    
    if (result.success) {
      const encoded = encodeUPI({ type: "upi", ...result.data });
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
  }, [upiData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="upi-id">
          UPI ID *
        </Label>
        <Input
          id="upi-id"
          type="text"
          placeholder="username@bankname"
          value={upiData.upiId}
          onChange={(e) => setUpiData({ ...upiData, upiId: e.target.value })}
          className={errors.upiId ? "border-destructive" : ""}
        />
        {errors.upiId && (
          <p className="text-destructive text-[11px]">{errors.upiId}</p>
        )}
        {!errors.upiId && (
          <p className="text-muted-foreground text-[11px]">
            Enter your UPI ID (e.g., 9876543210@paytm)
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="upi-name">
          Payee Name
        </Label>
        <Input
          id="upi-name"
          type="text"
          placeholder="Your Name"
          value={upiData.name}
          onChange={(e) => setUpiData({ ...upiData, name: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="upi-amount">
          Amount (₹)
        </Label>
        <Input
          id="upi-amount"
          type="text"
          placeholder="100.00"
          value={upiData.amount}
          onChange={(e) => setUpiData({ ...upiData, amount: e.target.value })}
          className={errors.amount ? "border-destructive" : ""}
        />
        {errors.amount && (
          <p className="text-destructive text-[11px]">{errors.amount}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="upi-note">
          Note
        </Label>
        <Input
          id="upi-note"
          type="text"
          placeholder="Payment for..."
          value={upiData.note}
          onChange={(e) => setUpiData({ ...upiData, note: e.target.value })}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open UPI payment app with pre-filled details
      </p>
    </div>
  );
}

