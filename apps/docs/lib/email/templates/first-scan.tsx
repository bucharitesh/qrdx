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
}

export function FirstScanEmail({
  code,
  scannedAt,
  location,
  device,
  analyticsUrl,
  workspaceName,
  unsubscribeUrl,
}: FirstScanEmailProps) {
  const rows = [
    { label: "When", value: formatEmailDateTime(scannedAt) },
    ...(location ? [{ label: "Where", value: location }] : []),
    ...(device ? [{ label: "Device", value: device }] : []),
  ];
  return (
    <EmailLayout
      preview={`${codeLabel(code)} was scanned for the first time`}
      reason={`You get this because scan milestone alerts are on for ${workspaceName}.`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>Your code got its first scan</EmailHeading>
      <EmailText>
        Someone just scanned {codeLabel(code)}. Your QR code is live and
        working.
      </EmailText>
      <DetailsTable rows={rows} />
      <EmailButton href={analyticsUrl}>View scan analytics</EmailButton>
    </EmailLayout>
  );
}

export default FirstScanEmail;
