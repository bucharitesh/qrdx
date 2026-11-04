import {
  EmailButton,
  EmailDivider,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./layout";
import { DetailsTable, MutedText } from "./parts";

export interface LimitNoticeEmailProps {
  /** "Acme" */
  workspaceName: string;
  /** "Dynamic QR codes" */
  limitLabel: string;
  /** "dynamic QR codes" */
  noun: string;
  level: "near" | "full";
  /** "9 of 10", "48 MB of 50 MB" */
  value: string;
  /** "Free" */
  planName: string;
  /**
   * The app's own limit sentences (app/settings/usage/_lib/limit-copy.ts),
   * with the reset date for monthly allowances
   */
  reason: string;
  /** Plan & usage for the workspace */
  usageUrl: string;
  /** Why this person gets it */
  recipientReason: string;
}

/**
 * Account notice: sent once when a workspace reaches 90% of a plan limit
 * and once at 100%, per limit and calendar month (lib/limit-notices).
 */
export function LimitNoticeEmail({
  workspaceName,
  limitLabel,
  noun,
  level,
  value,
  planName,
  reason,
  usageUrl,
  recipientReason,
}: LimitNoticeEmailProps) {
  const full = level === "full";
  const rows = [
    { label: limitLabel, value },
    { label: "Plan", value: planName },
  ];
  return (
    <EmailLayout
      preview={
        full
          ? `${workspaceName} has reached its limit of ${noun}`
          : `${workspaceName} has used ${value} ${noun}`
      }
      reason={recipientReason}
    >
      <EmailHeading>
        {full
          ? `${workspaceName} has reached a plan limit`
          : `${workspaceName} is close to a plan limit`}
      </EmailHeading>
      <EmailText>
        {full
          ? `${workspaceName} has used all its ${noun}.`
          : `${workspaceName} has used ${value} ${noun}.`}{" "}
        {reason}
      </EmailText>
      <DetailsTable rows={rows} />
      <EmailButton href={usageUrl}>See plan and usage</EmailButton>
      <EmailDivider />
      <MutedText>
        You get at most two of these per limit each month: one at 90% and one at
        100%.
      </MutedText>
    </EmailLayout>
  );
}

export default LimitNoticeEmail;
