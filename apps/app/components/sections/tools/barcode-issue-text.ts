"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { BarcodeIssue } from "@/lib/barcode/formats";

/**
 * A barcode input issue (lib/barcode/formats.ts) in the page's language:
 * the validator keeps English for the API and gives each problem or note a
 * stable code, which the generator translates here (barcodeTool.issues).
 */
export function useBarcodeIssueText(): (issue: BarcodeIssue) => string {
  const t = useTranslations("barcodeTool.issues");
  return useCallback(
    function text(issue: BarcodeIssue): string {
      const values: Record<string, string | number> = { ...issue.values };
      if (issue.chars) {
        values.chars = issue.chars
          .map((char) =>
            char === " " ? t("space") : char === "\n" ? t("lineBreak") : char,
          )
          .join(" ");
      }
      if (issue.inner) values.inner = text(issue.inner);
      // Codes are a closed list with a message each (tests/i18n catalogs).
      return (t as unknown as (key: string, values: object) => string)(
        issue.code,
        values,
      );
    },
    [t],
  );
}
