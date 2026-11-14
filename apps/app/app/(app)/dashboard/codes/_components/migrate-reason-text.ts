"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { MigrateReason } from "@/lib/migrate/reasons";

/**
 * Why an imported link was skipped, in the person's language: by its code
 * (lib/migrate/reasons.ts) when it has one, else the reason as sent (a
 * provider's own error, or a job saved before codes).
 */
export function useMigrateReasonText(): (item: {
  reason?: string | null;
  reasonCode?: MigrateReason;
}) => string | null {
  const t = useTranslations("app.dashboard.codes.import.reasons");
  return useCallback(
    ({ reason, reasonCode }) =>
      reasonCode
        ? // Codes are a closed list with a message each (tests/i18n catalogs).
          (t as unknown as (key: string, values?: object) => string)(
            reasonCode.code,
            reasonCode.values,
          )
        : (reason ?? null),
    [t],
  );
}
