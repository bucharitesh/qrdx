import type { SinkAnswer, SinkFormResponse } from "./types";

/**
 * Form field → CRM property mapping shared by HubSpot and Mailchimp. Only
 * questions the form actually asked are ever sent, and only when they have
 * an answer. Client-safe.
 */

export interface MappableField {
  id: string;
  label: string;
  type: string;
}

/** A property in the destination tool. `email` is the identity. */
export interface SinkTarget {
  id: string;
  label: string;
  /** Matched against field labels to suggest a default */
  hints?: RegExp;
  /** Field types that map here by default */
  types?: string[];
}

/** Field id → target id ("" = don't send) */
export type FieldMap = Record<string, string>;

/** Split into first + last name by the sink. */
export const FULL_NAME_TARGET = "__fullname";
export const EMAIL_TARGET = "email";

export interface FormMapping {
  fields: FieldMap;
  /** Mailchimp: the consent checkbox that allows a subscription */
  consentFieldId?: string | null;
}

/** metadata.settings of a HubSpot / Mailchimp stream. */
export interface ResponseSinkSettings {
  /** Pages whose forms are sent; null = every page in the workspace */
  pageIds: string[] | null;
  /** "<pageId>:<formId>" → mapping. Unlisted forms use the suggestion. */
  forms: Record<string, FormMapping>;
}

export const formKey = (pageId: string, formId: string) =>
  `${pageId}:${formId}`;

/**
 * Suggested mapping: email and phone fields by type, names and the rest by
 * label. Each target is used once; unknown questions are left out.
 */
export function suggestMapping(
  fields: MappableField[],
  targets: SinkTarget[]
): FieldMap {
  const used = new Set<string>();
  const map: FieldMap = {};
  const pick = (field: MappableField) => {
    const label = field.label.trim();
    const byType = targets.find(
      (target) => !used.has(target.id) && target.types?.includes(field.type)
    );
    if (byType) return byType;
    if (field.type !== "text") return;
    return targets.find(
      (target) => !used.has(target.id) && target.hints?.test(label)
    );
  };
  for (const field of fields) {
    const target = pick(field);
    map[field.id] = target?.id ?? "";
    if (target) used.add(target.id);
  }
  return map;
}

/** First consent checkbox, the default "marketing consent" field. */
export function suggestConsentField(fields: MappableField[]): string | null {
  return fields.find((field) => field.type === "consent")?.id ?? null;
}

/** The mapping for one response: saved for its form, else suggested. */
export function mappingFor(
  response: SinkFormResponse,
  settings: ResponseSinkSettings,
  targets: SinkTarget[]
): FormMapping {
  const saved = settings.forms[formKey(response.pageId, response.formId)];
  if (saved) return saved;
  const fields = response.answers.map(({ id, label, type }) => ({
    id,
    label,
    type,
  }));
  return {
    fields: suggestMapping(fields, targets),
    consentFieldId: suggestConsentField(fields),
  };
}

export function isPageIncluded(
  settings: ResponseSinkSettings,
  pageId: string
): boolean {
  return settings.pageIds === null || settings.pageIds.includes(pageId);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

function answerText(answer: SinkAnswer): string {
  return answer.text.trim().slice(0, 1000);
}

/** "Ada King Lovelace" → { first: "Ada", last: "King Lovelace" } */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

/**
 * Mapped, answered values keyed by target id, plus the email. Returns null
 * when the response has no valid email (nothing to upsert by).
 */
export function mappedValues(
  response: SinkFormResponse,
  mapping: FormMapping,
  names: { first: string; last: string }
): { email: string; values: Record<string, string> } | null {
  let email: string | null = null;
  const values: Record<string, string> = {};
  let fullName: string | null = null;
  for (const answer of response.answers) {
    const target = mapping.fields[answer.id];
    if (!target) continue;
    const text = answerText(answer);
    if (!text) continue;
    if (target === EMAIL_TARGET) {
      email = email ?? normalizeEmail(text);
    } else if (target === FULL_NAME_TARGET) {
      fullName = text;
    } else {
      values[target] = text;
    }
  }
  if (!email) return null;
  if (fullName) {
    const split = splitName(fullName);
    if (split.first && !values[names.first]) values[names.first] = split.first;
    if (split.last && !values[names.last]) values[names.last] = split.last;
  }
  return { email, values };
}
