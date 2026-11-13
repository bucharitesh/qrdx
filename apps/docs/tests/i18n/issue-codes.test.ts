// Validators keep English for the API and give each problem a stable code
// the UI translates (barcode generator, CSV import, provider imports, hosted
// forms). Every code needs its message in the catalog, and nothing else.

import { describe, expect, it } from "vitest";
import { IMPORT_ISSUE_CODES } from "@/app/(app)/dashboard/codes/import/_lib/csv";
import { BARCODE_ISSUE_CODES } from "@/lib/barcode/formats";
import { MIGRATE_REASON_CODES } from "@/lib/migrate/reasons";
import en from "@/messages/en.json";

describe("issue codes have messages", () => {
  it.each([
    ["barcodeTool.issues", BARCODE_ISSUE_CODES, en.barcodeTool.issues],
    [
      "app.dashboard.codes.import.issues",
      IMPORT_ISSUE_CODES,
      en.app.dashboard.codes.import.issues,
    ],
    [
      "app.dashboard.codes.import.reasons",
      MIGRATE_REASON_CODES,
      en.app.dashboard.codes.import.reasons,
    ],
  ] as const)("%s", (_namespace, codes, messages) => {
    const keys = Object.keys(messages).filter(
      // Words the barcode messages use inside {chars}.
      (key) => key !== "space" && key !== "lineBreak",
    );
    expect([...keys].sort()).toEqual([...codes].sort());
  });
});
