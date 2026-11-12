import { type EmailIntl, ENGLISH_EMAIL } from "@/lib/i18n/email";
import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";
import { codeLabel, DetailsTable, formatEmailDateTime } from "./parts";

export interface FirstScanEmailProps {
  code: { title: string | null; slug: string };
  scannedAt: Date | string;
  /** "Berlin, DE" etc.; omitted when unknown */
  location?: string | null;
  /** "iOS · Safari" etc. */
  device?: string | null;
  analyticsUrl: string;
  workspaceName: string;
  unsubscribeUrl: string;
  /** The recipient's language */
  intl?: EmailIntl;
}

export function FirstScanEmail({
  code,
  scannedAt,
  location,
  device,
  analyticsUrl,
  workspaceName,
  unsubscribeUrl,
  intl = ENGLISH_EMAIL,
}: FirstScanEmailProps) {
  const { t } = intl;
  const rows = [
    {
      label: t("firstScan.when"),
      value: formatEmailDateTime(scannedAt, intl.locale),
    },
    ...(location ? [{ label: t("firstScan.where"), value: location }] : []),
    ...(device ? [{ label: t("firstScan.device"), value: device }] : []),
  ];
  return (
    <EmailLayout
      intl={intl}
      preview={t("firstScan.preview", { code: codeLabel(code) })}
      reason={t("alerts.milestoneReason", { workspace: workspaceName })}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{t("firstScan.heading")}</EmailHeading>
      <EmailText>{t("firstScan.body", { code: codeLabel(code) })}</EmailText>
      <DetailsTable rows={rows} />
      <EmailButton href={analyticsUrl}>{t("alerts.viewAnalytics")}</EmailButton>
    </EmailLayout>
  );
}

export default FirstScanEmail;
