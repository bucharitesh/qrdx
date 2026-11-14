import { baseUrl } from "@/lib/metadata";
import { EmailHeading, EmailLayout, EmailText } from "./layout";
import { DetailsTable, formatEmailDateTime, MutedText } from "./parts";

export interface AbuseReportAckEmailProps {
  /** Reported link or code, as the reporter entered it */
  reported: string | null;
  reason: string;
  reportedAt: Date | string;
  reportId: string;
}

/**
 * Transactional: confirms an abuse report to the address the reporter gave.
 * Never echoes their free-text details back (keeps it from being a relay).
 */
export function AbuseReportAckEmail({
  reported,
  reason,
  reportedAt,
  reportId,
}: AbuseReportAckEmailProps) {
  return (
    <EmailLayout
      preview="We received your report"
      reason="You got this email because this address was entered on the QRdx abuse report form."
    >
      <EmailHeading>We received your report</EmailHeading>
      <EmailText>
        Thanks for telling us. Our team reviews every report, and QR codes or
        pages that break our rules are disabled.
      </EmailText>
      <DetailsTable
        rows={[
          ...(reported ? [{ label: "Reported", value: reported }] : []),
          { label: "Reason", value: reason },
          { label: "Received", value: formatEmailDateTime(reportedAt) },
          { label: "Reference", value: reportId },
        ]}
      />
      <MutedText>
        We may not be able to reply to every report individually. Our rules are
        in the terms of service:{" "}
        {new URL("/legal/terms-of-service", baseUrl).toString()}
      </MutedText>
    </EmailLayout>
  );
}

export default AbuseReportAckEmail;
