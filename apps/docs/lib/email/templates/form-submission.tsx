import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";
import { DetailsTable, formatEmailDateTime, MutedText } from "./parts";

export interface FormSubmissionEmailProps {
  pageTitle: string | null;
  fields: { label: string; value: string }[];
  submittedAt: Date | string;
  responsesUrl: string;
  workspaceName: string;
  unsubscribeUrl: string;
}

const MAX_FIELDS = 30;
const MAX_VALUE_LENGTH = 1000;

export function FormSubmissionEmail({
  pageTitle,
  fields,
  submittedAt,
  responsesUrl,
  workspaceName,
  unsubscribeUrl,
}: FormSubmissionEmailProps) {
  const page = pageTitle?.trim() ? `“${pageTitle.trim()}”` : "your page";
  const shown = fields.slice(0, MAX_FIELDS).map((field) => ({
    label: field.label || "Answer",
    value:
      field.value.length > MAX_VALUE_LENGTH
        ? `${field.value.slice(0, MAX_VALUE_LENGTH)}…`
        : field.value || "—",
  }));
  return (
    <EmailLayout
      preview={`New form response on ${page}`}
      reason={`You get this because form submission alerts are on for ${workspaceName}.`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>New response on {page}</EmailHeading>
      <EmailText>
        Submitted {formatEmailDateTime(submittedAt)}. Answers are shown as the
        visitor typed them.
      </EmailText>
      <DetailsTable rows={shown} />
      {fields.length > MAX_FIELDS ? (
        <MutedText>
          {fields.length - MAX_FIELDS} more answers are in the dashboard.
        </MutedText>
      ) : null}
      <EmailButton href={responsesUrl}>View all responses</EmailButton>
    </EmailLayout>
  );
}

export default FormSubmissionEmail;
