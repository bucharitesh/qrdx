"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { PhoneContent } from "@/types/qr-content";
import { encodePhone } from "@/utils/qr-content-encoder";

export function PhoneForm() {
  const { setValue } = useQREditorStore();
  const [phoneData, setPhoneData] = React.useState<Omit<PhoneContent, "type">>({
    phoneNumber: "",
  });

  React.useEffect(() => {
    const encoded = encodePhone({ type: "phone", ...phoneData });
    setValue(encoded);
  }, [phoneData, setValue]);

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
        Include country code (e.g., +1 for US). Scanning will initiate a phone call.
      </p>
    </div>
  );
}


