import { type EmailIntl, ENGLISH_EMAIL } from "@/lib/i18n/email";
import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";
import { DetailsTable, formatEmailDateTime, MutedText } from "./parts";

export interface FormSubmissionEmailProps {
  pageTitle: string | null;
  fields: { label: string; value: string }[];
  submittedAt: Date | string;
  responsesUrl: string;
  workspaceName: string;
  unsubscribeUrl: string;
  /** The recipient's language */
  intl?: EmailIntl;
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
  intl = ENGLISH_EMAIL,
}: FormSubmissionEmailProps) {
  const { t } = intl;
  const page = pageTitle?.trim()
    ? `“${pageTitle.trim()}”`
    : t("formSubmission.yourPage");
  const shown = fields.slice(0, MAX_FIELDS).map((field) => ({
    label: field.label || t("formSubmission.answer"),
    value:
      field.value.length > MAX_VALUE_LENGTH
        ? `${field.value.slice(0, MAX_VALUE_LENGTH)}…`
        : field.value || "—",
  }));
  return (
    <EmailLayout
      intl={intl}
      preview={t("formSubmission.preview", { page })}
      reason={t("formSubmission.reason", { workspace: workspaceName })}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{t("formSubmission.heading", { page })}</EmailHeading>
      <EmailText>
        {t("formSubmission.submitted", {
          when: formatEmailDateTime(submittedAt, intl.locale),
        })}
      </EmailText>
      <DetailsTable rows={shown} />
      {fields.length > MAX_FIELDS ? (
        <MutedText>
          {t("formSubmission.more", { count: fields.length - MAX_FIELDS })}
        </MutedText>
      ) : null}
      <EmailButton href={responsesUrl}>
        {t("formSubmission.viewAll")}
      </EmailButton>
    </EmailLayout>
  );
}

export default FormSubmissionEmail;
