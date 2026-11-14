import { type EmailIntl, ENGLISH_EMAIL } from "@/lib/i18n/email";
import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";
import { codeLabel } from "./parts";

export interface ScanMilestoneEmailProps {
  code: { title: string | null; slug: string };
  milestone: number;
  analyticsUrl: string;
  workspaceName: string;
  unsubscribeUrl: string;
  /** The recipient's language */
  intl?: EmailIntl;
}

export function ScanMilestoneEmail({
  code,
  milestone,
  analyticsUrl,
  workspaceName,
  unsubscribeUrl,
  intl = ENGLISH_EMAIL,
}: ScanMilestoneEmailProps) {
  const { t } = intl;
  const reached = t("scanMilestone.reached", {
    code: codeLabel(code),
    count: milestone,
  });
  return (
    <EmailLayout
      intl={intl}
      preview={reached}
      reason={t("alerts.milestoneReason", { workspace: workspaceName })}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{reached}</EmailHeading>
      <EmailText>{t("scanMilestone.body", { count: milestone })}</EmailText>
      <EmailButton href={analyticsUrl}>{t("alerts.viewAnalytics")}</EmailButton>
    </EmailLayout>
  );
}

export default ScanMilestoneEmail;
