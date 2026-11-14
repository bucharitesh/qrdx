"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useTranslations } from "next-intl";
import * as React from "react";
import type { EmailFormData } from "@/lib/validations/qr-content";
import { emailSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { EmailContent } from "@/types/qr-content";
import { encodeEmail } from "@/utils/qr-content-encoder";

export function EmailForm() {
  const t = useTranslations("editor.contentForms.emailForm");
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("email") as EmailContent | undefined;
  const [emailData, setEmailData] = React.useState<EmailFormData>({
    recipient: storedConfig?.recipient || "",
    subject: storedConfig?.subject || "",
    body: storedConfig?.body || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = emailSchema.safeParse(emailData);

    if (result.success) {
      const config: EmailContent = { type: "email", ...result.data };
      const encoded = encodeEmail(config);
      setValue(encoded);
      setContentConfig("email", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [emailData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="email-recipient">
          {t("recipientEmail")}
        </Label>
        <Input
          id="email-recipient"
          type="email"
          placeholder={t("contactExampleCom")}
          value={emailData.recipient}
          onChange={(e) =>
            setEmailData({ ...emailData, recipient: e.target.value })
          }
          className={errors.recipient ? "border-destructive" : ""}
        />
        {errors.recipient && (
          <p className="text-destructive text-[11px]">{errors.recipient}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="email-subject">
          {t("subject")}
        </Label>
        <Input
          id="email-subject"
          type="text"
          placeholder={t("emailSubject")}
          value={emailData.subject}
          onChange={(e) =>
            setEmailData({ ...emailData, subject: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="email-body">
          {t("message")}
        </Label>
        <Textarea
          id="email-body"
          placeholder={t("emailMessage")}
          value={emailData.body}
          onChange={(e) => setEmailData({ ...emailData, body: e.target.value })}
          rows={4}
          className="resize-none"
        />
      </div>

      <p className="text-muted-foreground text-xs">
        {t("scanningWillOpenAnEmail")}
      </p>
    </div>
  );
}
