import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";
import { codeLabel, formatCount } from "./parts";

export interface ScanMilestoneEmailProps {
  code: { title: string | null; slug: string };
  milestone: number;
  analyticsUrl: string;
  workspaceName: string;
  unsubscribeUrl: string;
}

export function ScanMilestoneEmail({
  code,
  milestone,
  analyticsUrl,
  workspaceName,
  unsubscribeUrl,
}: ScanMilestoneEmailProps) {
  const count = formatCount(milestone);
  return (
    <EmailLayout
      preview={`${codeLabel(code)} reached ${count} scans`}
      reason={`You get this because scan milestone alerts are on for ${workspaceName}.`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>
        {codeLabel(code)} reached {count} scans
      </EmailHeading>
      <EmailText>
        Your dynamic QR code just passed {count} scans. See where and when
        people scan it, and which devices they use.
      </EmailText>
      <EmailButton href={analyticsUrl}>View scan analytics</EmailButton>
    </EmailLayout>
  );
}

export default ScanMilestoneEmail;
