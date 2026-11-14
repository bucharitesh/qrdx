"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useTranslations } from "next-intl";
import * as React from "react";
import type { UPIFormData } from "@/lib/validations/qr-content";
import { upiSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { UPIContent } from "@/types/qr-content";
import { encodeUPI } from "@/utils/qr-content-encoder";

export function UPIForm() {
  const t = useTranslations("editor.contentForms.upiForm");
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("upi") as UPIContent | undefined;
  const [upiData, setUpiData] = React.useState<UPIFormData>({
    upiId: storedConfig?.upiId || "",
    name: storedConfig?.name || "",
    amount: storedConfig?.amount || "",
    note: storedConfig?.note || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = upiSchema.safeParse(upiData);

    if (result.success) {
      const config: UPIContent = { type: "upi", ...result.data };
      const encoded = encodeUPI(config);
      setValue(encoded);
      setContentConfig("upi", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [upiData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="upi-id">
          {t("upiId")}
        </Label>
        <Input
          id="upi-id"
          type="text"
          placeholder={t("usernameBankname")}
          value={upiData.upiId}
          onChange={(e) => setUpiData({ ...upiData, upiId: e.target.value })}
          className={errors.upiId ? "border-destructive" : ""}
        />
        {errors.upiId && (
          <p className="text-destructive text-[11px]">{errors.upiId}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="upi-name">
          {t("payeeName")}
        </Label>
        <Input
          id="upi-name"
          type="text"
          placeholder={t("yourName")}
          value={upiData.name}
          onChange={(e) => setUpiData({ ...upiData, name: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="upi-amount">
          {t("amount")}
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
          {t("note")}
        </Label>
        <Input
          id="upi-note"
          type="text"
          placeholder={t("paymentFor")}
          value={upiData.note}
          onChange={(e) => setUpiData({ ...upiData, note: e.target.value })}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {t("scanningWillOpenAUpi")}
      </p>
    </div>
  );
}
