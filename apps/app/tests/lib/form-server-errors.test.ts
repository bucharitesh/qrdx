// /api/forms answers in English with a code and the flagged fields; the
// hosted page shows its own translated words for them instead
// (lib/landing/blocks/form-client.tsx).

import { describe, expect, it } from "vitest";
import { serverFieldErrors } from "@/lib/landing/blocks/form-client";
import {
  ENGLISH_FORM_ERRORS,
  type FormErrorText,
  validateAnswers,
} from "@/lib/landing/blocks/form-fields";

const JAPANESE: FormErrorText = {
  ...ENGLISH_FORM_ERRORS,
  required: "この項目は必須です",
  email: "有効なメールアドレスを入力してください",
};

const fields = [
  { id: "name", type: "text", label: "Name", required: true, maxLength: 80 },
  { id: "mail", type: "email", label: "Email", required: true },
] as Parameters<typeof validateAnswers>[0];

describe("form errors from the API", () => {
  it("shows the browser's translated message for each field the API flagged", () => {
    const local = validateAnswers(fields, { mail: "nope" }, JAPANESE);
    expect(
      serverFieldErrors(["name", "mail"], local, "もう一度ご確認ください"),
    ).toEqual({
      name: "この項目は必須です",
      mail: "有効なメールアドレスを入力してください",
    });
  });

  it("falls back to the general message when only the API saw a problem", () => {
    const local = validateAnswers(
      fields,
      { name: "Aiko", mail: "a@example.com" },
      JAPANESE,
    );
    expect(local.success).toBe(true);
    expect(
      serverFieldErrors(["mail"], local, "もう一度ご確認ください"),
    ).toEqual({ mail: "もう一度ご確認ください" });
  });

  it("never passes the API's English through", () => {
    const local = validateAnswers(fields, {}, JAPANESE);
    const shown = Object.values(serverFieldErrors(["name"], local, "x"));
    expect(shown).not.toContain(ENGLISH_FORM_ERRORS.required);
  });
});
