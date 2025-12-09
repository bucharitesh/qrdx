"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { PhoneContent } from "@/types/qr-content";
import { encodePhone } from "@/utils/qr-content-encoder";

export function PhoneForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("phone") as PhoneContent | undefined;
  const [phoneData, setPhoneData] = React.useState<Omit<PhoneContent, "type">>({
    phoneNumber: storedConfig?.phoneNumber || "",
  });

  React.useEffect(() => {
    const config: PhoneContent = { type: "phone", ...phoneData };
    const encoded = encodePhone(config);
    setValue(encoded);
    setContentConfig("phone", config);
  }, [phoneData, setValue, setContentConfig]);

  return (
    <div className="space-y-2">
      <Label className="text-xs" htmlFor="phone-number">
        Phone Number *
      </Label>
      <Input
        id="phone-number"
        type="tel"
        placeholder="+1234567890"
        value={phoneData.phoneNumber}
        onChange={(e) => setPhoneData({ phoneNumber: e.target.value })}
      />
      <p className="text-muted-foreground text-xs">
        Include country code (e.g., +1 for US). Scanning will initiate a phone
        call.
      </p>
    </div>
  );
}
