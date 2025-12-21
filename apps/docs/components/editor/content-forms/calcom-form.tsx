"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import type { CalcomFormData } from "@/lib/validations/qr-content";
import { calcomSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { CalcomContent } from "@/types/qr-content";
import { encodeCalcom } from "@/utils/qr-content-encoder";

export function CalcomForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("calcom") as CalcomContent | undefined;
  const [calcomData, setCalcomData] = React.useState<CalcomFormData>({
    bookingUrl: storedConfig?.bookingUrl || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = calcomSchema.safeParse(calcomData);

    if (result.success) {
      const config: CalcomContent = { type: "calcom", ...result.data };
      const encoded = encodeCalcom(config);
      setValue(encoded);
      setContentConfig("calcom", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [calcomData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="calcom-booking-url">
          Cal.com Booking URL *
        </Label>
        <Input
          id="calcom-booking-url"
          type="url"
          placeholder="https://cal.com/username/meeting-type"
          value={calcomData.bookingUrl}
          onChange={(e) => setCalcomData({ bookingUrl: e.target.value })}
          className={errors.bookingUrl ? "border-destructive" : ""}
        />
        {errors.bookingUrl && (
          <p className="text-destructive text-[11px]">{errors.bookingUrl}</p>
        )}
        {!errors.bookingUrl && (
          <p className="text-muted-foreground text-[11px]">
            Enter your Cal.com booking link
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open your Cal.com booking page
      </p>
    </div>
  );
}
