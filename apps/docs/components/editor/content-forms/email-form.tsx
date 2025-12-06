"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import * as React from "react";
import type { EmailFormData } from "@/lib/validations/qr-content";
import { emailSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import { encodeEmail } from "@/utils/qr-content-encoder";

export function EmailForm() {
  const { setValue } = useQREditorStore();
  const [emailData, setEmailData] = React.useState<EmailFormData>({
    recipient: "",
    subject: "",
    body: "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = emailSchema.safeParse(emailData);
    
    if (result.success) {
      const encoded = encodeEmail({ type: "email", ...result.data });
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
  }, [emailData, setValue]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="email-recipient">
          Recipient Email *
        </Label>
        <Input
          id="email-recipient"
          type="email"
          placeholder="contact@example.com"
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
          Subject
        </Label>
        <Input
          id="email-subject"
          type="text"
          placeholder="Email subject"
          value={emailData.subject}
          onChange={(e) =>
            setEmailData({ ...emailData, subject: e.target.value })
          }
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="email-body">
          Message
        </Label>
        <Textarea
          id="email-body"
          placeholder="Email message"
          value={emailData.body}
          onChange={(e) => setEmailData({ ...emailData, body: e.target.value })}
          rows={4}
          className="resize-none"
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open the default email app with pre-filled content
      </p>
    </div>
  );
}

