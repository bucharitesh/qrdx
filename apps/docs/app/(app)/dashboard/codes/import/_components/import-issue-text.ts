"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import type { ImportIssue } from "../_lib/csv";

/**
 * A CSV row's problem (../_lib/csv.ts) in the person's language. The checks
 * and the server keep English for the API and give each problem a code,
 * which the wizard translates here (app.dashboard.codes.import.issues).
 */
export function useImportIssueText(): (issue: ImportIssue) => string {
  const t = useTranslations("app.dashboard.codes.import.issues");
  return useCallback(
    (issue: ImportIssue) =>
      // Codes are a closed list with a message each (tests/i18n catalogs).
      (t as (key: string, values?: object) => string)(issue.code, issue.values),
    [t],
  );
}
