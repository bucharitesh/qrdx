"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import * as React from "react";
import { useQREditorStore } from "@/store/editor-store";
import type { WhatsAppContent } from "@/types/qr-content";
import { encodeWhatsApp } from "@/utils/qr-content-encoder";

export function WhatsAppForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("whatsapp") as
    | WhatsAppContent
    | undefined;
  const [whatsappData, setWhatsappData] = React.useState<
    Omit<WhatsAppContent, "type">
  >({
    phoneNumber: storedConfig?.phoneNumber || "",
    message: storedConfig?.message || "",
  });

  // Sync with store when config changes (e.g., from smart paste)
  React.useEffect(() => {
    if (storedConfig && (storedConfig.phoneNumber || storedConfig.message)) {
      if (
        storedConfig.phoneNumber !== whatsappData.phoneNumber ||
        storedConfig.message !== whatsappData.message
      ) {
        setWhatsappData({
          phoneNumber: storedConfig.phoneNumber || "",
          message: storedConfig.message || "",
        });
      }
    }
  }, [storedConfig]);

  React.useEffect(() => {
    const config: WhatsAppContent = { type: "whatsapp", ...whatsappData };
    const encoded = encodeWhatsApp(config);
    setValue(encoded);
    setContentConfig("whatsapp", config);
  }, [whatsappData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="whatsapp-phone">
          Phone Number *
        </Label>
        <Input
          id="whatsapp-phone"
          type="tel"
          placeholder="+1234567890"
          value={whatsappData.phoneNumber}
          onChange={(e) =>
            setWhatsappData({ ...whatsappData, phoneNumber: e.target.value })
          }
        />
        <p className="text-muted-foreground text-[11px]">
          Include country code without spaces or symbols
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="whatsapp-message">
          Message
        </Label>
        <Textarea
          id="whatsapp-message"
          placeholder="Pre-filled WhatsApp message"
          value={whatsappData.message}
          onChange={(e) =>
            setWhatsappData({ ...whatsappData, message: e.target.value })
          }
          rows={4}
          className="resize-none"
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open WhatsApp with pre-filled message to this number
      </p>
    </div>
  );
}
