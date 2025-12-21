"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import * as React from "react";
import type { AttendanceFormData } from "@/lib/validations/qr-content";
import { attendanceSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { AttendanceContent } from "@/types/qr-content";
import { encodeAttendance } from "@/utils/qr-content-encoder";

export function AttendanceForm() {
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("attendance") as
    | AttendanceContent
    | undefined;
  const [attendanceData, setAttendanceData] =
    React.useState<AttendanceFormData>({
      formUrl: storedConfig?.formUrl || "",
    });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = attendanceSchema.safeParse(attendanceData);

    if (result.success) {
      const config: AttendanceContent = { type: "attendance", ...result.data };
      const encoded = encodeAttendance(config);
      setValue(encoded);
      setContentConfig("attendance", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [attendanceData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="attendance-form-url">
          Google Form URL *
        </Label>
        <Input
          id="attendance-form-url"
          type="url"
          placeholder="https://forms.gle/... or https://docs.google.com/forms/..."
          value={attendanceData.formUrl}
          onChange={(e) => setAttendanceData({ formUrl: e.target.value })}
          className={errors.formUrl ? "border-destructive" : ""}
        />
        {errors.formUrl && (
          <p className="text-destructive text-[11px]">{errors.formUrl}</p>
        )}
        {!errors.formUrl && (
          <p className="text-muted-foreground text-[11px]">
            Enter your Google Form URL for attendance tracking
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        Scanning will open the Google Form for attendance submission
      </p>
    </div>
  );
}
