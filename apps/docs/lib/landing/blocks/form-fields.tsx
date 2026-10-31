import { z } from "zod";

// Form block fields: the definitions stored in block props, the validation of
// a visitor's answers (shared by the form UI and POST /api/forms/<pageId>),
// and the shape stored in form_response.data.

export const FORM_FIELD_TYPES = [
  "text",
  "email",
  "phone",
  "stars",
  "nps",
  "choice",
  "consent",
] as const;

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_FIELD_LABELS: Record<FormFieldType, string> = {
  text: "Text",
  email: "Email",
  phone: "Phone",
  stars: "Star rating",
  nps: "NPS (0–10)",
  choice: "Choice",
  consent: "Checkbox",
};

export const MAX_FORM_FIELDS = 30;
export const MAX_CHOICE_OPTIONS = 20;
export const MAX_TEXT_ANSWER = 5000;

const fieldBase = {
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  label: z.string().trim().min(1, "Add a question").max(200),
  help: z.string().trim().max(300).optional(),
  required: z.boolean().default(false),
};

const placeholder = z.string().trim().max(120).optional();

export const formFieldSchema = z.discriminatedUnion("type", [
  z.object({
    ...fieldBase,
    type: z.literal("text"),
    multiline: z.boolean().default(false),
    maxLength: z.number().int().min(1).max(MAX_TEXT_ANSWER).default(500),
    placeholder,
  }),
  z.object({ ...fieldBase, type: z.literal("email"), placeholder }),
  z.object({ ...fieldBase, type: z.literal("phone"), placeholder }),
  z.object({
    ...fieldBase,
    type: z.literal("stars"),
    max: z.number().int().min(3).max(10).default(5),
  }),
  z.object({
    ...fieldBase,
    type: z.literal("nps"),
    lowLabel: z.string().trim().max(40).default("Not likely"),
    highLabel: z.string().trim().max(40).default("Very likely"),
  }),
  z.object({
    ...fieldBase,
    type: z.literal("choice"),
    multiple: z.boolean().default(false),
    options: z
      .array(z.string().trim().min(1, "Options can't be empty").max(120))
      .min(1, "Add at least one option")
      .max(MAX_CHOICE_OPTIONS)
      .refine(
        (options) => new Set(options).size === options.length,
        "Options must be different from each other",
      ),
  }),
  z.object({ ...fieldBase, type: z.literal("consent") }),
]);

export type FormField = z.output<typeof formFieldSchema>;

export const formFieldsSchema = z
  .array(formFieldSchema)
  .min(1, "Add at least one field")
  .max(MAX_FORM_FIELDS)
  .refine(
    (fields) => new Set(fields.map((field) => field.id)).size === fields.length,
    "Field ids must be unique",
  );

const EMAIL = z.email("Enter a valid email address").max(254);
const PHONE = /^\+?[0-9 ().-]{5,32}$/;

const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0) ||
  value === false;

export type FormAnswerValue = string | number | boolean | string[];

/** One field's answer, or an error message. Blank optional fields give `undefined`. */
export function validateAnswer(
  field: FormField,
  raw: unknown,
): { value: FormAnswerValue | undefined } | { error: string } {
  if (isBlank(raw)) {
    return field.required
      ? {
          error:
            field.type === "consent"
              ? "Please tick this box to continue"
              : "This field is required",
        }
      : { value: undefined };
  }

  switch (field.type) {
    case "text": {
      if (typeof raw !== "string") return { error: "Enter text" };
      const value = raw.trim();
      return value.length > field.maxLength
        ? { error: `Keep it under ${field.maxLength} characters` }
        : { value };
    }
    case "email": {
      const result = EMAIL.safeParse(
        typeof raw === "string" ? raw.trim() : raw,
      );
      return result.success
        ? { value: result.data.toLowerCase() }
        : { error: "Enter a valid email address" };
    }
    case "phone": {
      const value = typeof raw === "string" ? raw.trim() : "";
      return PHONE.test(value) && /\d{5}/.test(value.replace(/\D/g, ""))
        ? { value }
        : { error: "Enter a valid phone number" };
    }
    case "stars": {
      const value = Number(raw);
      return Number.isInteger(value) && value >= 1 && value <= field.max
        ? { value }
        : { error: `Choose 1 to ${field.max} stars` };
    }
    case "nps": {
      const value = Number(raw);
      return Number.isInteger(value) && value >= 0 && value <= 10
        ? { value }
        : { error: "Choose a score from 0 to 10" };
    }
    case "choice": {
      if (field.multiple) {
        if (
          !Array.isArray(raw) ||
          raw.some((item) => typeof item !== "string")
        ) {
          return { error: "Choose from the options" };
        }
        const picked = field.options.filter((option) => raw.includes(option));
        return picked.length === new Set(raw).size
          ? { value: picked }
          : { error: "Choose from the options" };
      }
      return typeof raw === "string" && field.options.includes(raw)
        ? { value: raw }
        : { error: "Choose one of the options" };
    }
    case "consent":
      return raw === true ? { value: true } : { error: "Invalid value" };
  }
}

export interface FormAnswer {
  id: string;
  /** Question as it read when the visitor answered */
  label: string;
  type: FormFieldType;
  value: FormAnswerValue;
}

/** What form_response.data holds. */
export interface FormResponseData {
  /** Form block id on the page */
  block: string;
  answers: FormAnswer[];
}

export const formResponseDataSchema = z.object({
  block: z.string(),
  answers: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      type: z.enum(FORM_FIELD_TYPES),
      value: z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.string()),
      ]),
    }),
  ),
});

export type AnswersResult =
  | { success: true; answers: FormAnswer[] }
  | { success: false; errors: Record<string, string> };

/** Validates a visitor's answers (keyed by field id) against the form's fields. */
export function validateAnswers(
  fields: FormField[],
  input: Record<string, unknown>,
): AnswersResult {
  const answers: FormAnswer[] = [];
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const result = validateAnswer(field, input[field.id]);
    if ("error" in result) {
      errors[field.id] = result.error;
    } else if (result.value !== undefined) {
      answers.push({
        id: field.id,
        label: field.label,
        type: field.type,
        value: result.value,
      });
    }
  }
  return Object.keys(errors).length > 0
    ? { success: false, errors }
    : { success: true, answers };
}

/** An answer as plain text (inbox, CSV, emails). */
export function formatAnswerValue(answer: Pick<FormAnswer, "type" | "value">) {
  const { type, value } = answer;
  if (Array.isArray(value)) return value.join(", ");
  if (type === "consent") return value ? "Yes" : "No";
  if (type === "stars") return `${value} ★`;
  return String(value);
}

/** A short random id for new fields (letters and digits). */
export function newFieldId(): string {
  return `f${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
}
