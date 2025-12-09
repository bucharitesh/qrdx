"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { SmsContent } from "@/types/qr-content";
import { encodeSms } from "@/utils/qr-content-encoder";

export function SmsForm() {
  const { setValue } = useQREditorStore();
  const [smsData, setSmsData] = React.useState<Omit<SmsContent, "type">>({
    phoneNumber: "",
    message: "",
  });

  React.useEffect(() => {
    const encoded = encodeSms({ type: "sms", ...smsData });
    setValue(encoded);
  }, [smsData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="sms-phone">
          Phone Number *
        </Label>
        <Input
          id="sms-phone"
          type="tel"
          placeholder="+1234567890"
          value={smsData.phoneNumber}
          onChange={(e) =>
            setSmsData({ ...smsData, phoneNumber: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="sms-message">
          Message
        </Label>
        <Textarea
          id="sms-message"
          placeholder="Pre-filled SMS message"
          value={smsData.message}
          onChange={(e) => setSmsData({ ...smsData, message: e.target.value })}
          rows={4}
          className="resize-none"
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open the messaging app with pre-filled content
      </p>
    </div>
  );
}


