"use client";

import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useTranslations } from "next-intl";
import * as React from "react";
import type { GoogleReviewFormData } from "@/lib/validations/qr-content";
import { googleReviewSchema } from "@/lib/validations/qr-content";
import { useQREditorStore } from "@/store/editor-store";
import type { GoogleReviewContent } from "@/types/qr-content";
import { encodeGoogleReview } from "@/utils/qr-content-encoder";

export function GoogleReviewForm() {
  const t = useTranslations("editor.contentForms.googleReviewForm");
  const { setValue, getContentConfig, setContentConfig } = useQREditorStore();

  // Initialize from stored config or use defaults
  const storedConfig = getContentConfig("google-review") as
    | GoogleReviewContent
    | undefined;
  const [reviewData, setReviewData] = React.useState<GoogleReviewFormData>({
    placeId: storedConfig?.placeId || "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Validate and encode
    const result = googleReviewSchema.safeParse(reviewData);

    if (result.success) {
      const config: GoogleReviewContent = {
        type: "google-review",
        ...result.data,
      };
      const encoded = encodeGoogleReview(config);
      setValue(encoded);
      setContentConfig("google-review", config);
      setErrors({});
    } else {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
    }
  }, [reviewData, setValue, setContentConfig]);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="place-id">
          {t("googlePlaceId")}
        </Label>
        <Input
          id="place-id"
          type="text"
          placeholder={t("chijn1tTdeuemsrusoyg83fry4")}
          value={reviewData.placeId}
          onChange={(e) => setReviewData({ placeId: e.target.value })}
          className={errors.placeId ? "border-destructive" : ""}
        />
        {errors.placeId && (
          <p className="text-destructive text-[11px]">{errors.placeId}</p>
        )}
        {!errors.placeId && (
          <p className="text-muted-foreground text-[11px]">
            {t.rich("findYoursWithTheGoogle", {
              link: (chunks) => (
                <a
                  href="https://developers.google.com/maps/documentation/places/web-service/place-id"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        {t("scanningWillOpenGoogleTo")}
      </p>
    </div>
  );
}
