import {
  type FormResponseData,
  formatAnswerValue,
} from "@/lib/landing/blocks/form-fields";

// CSV export of form responses (dashboard → Responses → Export CSV).

export interface CsvForm {
  id: string;
  title: string;
  fields: Array<{ id: string; label: string }>;
}

export interface CsvResponse {
  createdAt: Date;
  codeSlug: string | null;
  data: FormResponseData;
}

function csvCell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  // Spreadsheet formula injection: visitor-typed values must stay plain text.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * One row per response, one column per question: the page's current
 * questions first (in page order), then questions that were removed but still
 * have answers. Answers are matched by field id, so renaming a question keeps
 * its column.
 */
export function responsesToCsv(
  responses: CsvResponse[],
  forms: CsvForm[],
): string {
  const columns = new Map<string, string>();
  for (const form of forms) {
    for (const field of form.fields) {
      if (!columns.has(field.id)) columns.set(field.id, field.label);
    }
  }
  // Oldest first, so removed questions appear in the order they were asked.
  for (const response of [...responses].reverse()) {
    for (const answer of response.data.answers) {
      if (!columns.has(answer.id)) columns.set(answer.id, answer.label);
    }
  }

  const seen = new Map<string, number>();
  for (const label of columns.values()) {
    seen.set(label, (seen.get(label) ?? 0) + 1);
  }
  const headers = [...columns].map(([id, label]) =>
    (seen.get(label) ?? 0) > 1 ? `${label} (${id})` : label,
  );

  const formTitles = new Map(forms.map((form) => [form.id, form.title]));
  const withForm = forms.length > 1;
  const header = [
    "submitted_at",
    ...(withForm ? ["form"] : []),
    "code",
    ...headers,
  ];

  const lines = responses.map((response) => {
    const answers = new Map(
      response.data.answers.map((answer) => [answer.id, answer]),
    );
    return [
      response.createdAt,
      ...(withForm
        ? [formTitles.get(response.data.block) ?? response.data.block]
        : []),
      response.codeSlug ?? "",
      ...[...columns.keys()].map((id) => {
        const answer = answers.get(id);
        if (!answer) return "";
        // Plain numbers for ratings, so spreadsheets can average them.
        return answer.type === "stars" || answer.type === "nps"
          ? String(answer.value)
          : formatAnswerValue(answer);
      }),
    ]
      .map(csvCell)
      .join(",");
  });

  return `${[header.map(csvCell).join(","), ...lines].join("\r\n")}\r\n`;
}
