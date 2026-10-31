import { EmailButton, EmailHeading, EmailLayout, EmailText } from "./layout";
import { codeLabel, DetailsTable } from "./parts";

export interface CodeActivityEmailProps {
  kind: "created" | "updated";
  code: {
    title: string | null;
    slug: string;
    shortLink: string;
    destination: string;
  };
  /** Human-readable changed fields ("Destination", "Title", ...) */
  changes?: string[];
  actorName?: string | null;
  codeUrl: string;
  workspaceName: string;
  unsubscribeUrl: string;
}

export function CodeActivityEmail({
  kind,
  code,
  changes = [],
  actorName,
  codeUrl,
  workspaceName,
  unsubscribeUrl,
}: CodeActivityEmailProps) {
  const label = codeLabel(code);
  const who = actorName?.trim() || "Someone";
  const heading =
    kind === "created" ? `New code: ${label}` : `${label} was changed`;
  const rows = [
    { label: "Short link", value: code.shortLink },
    { label: "Opens", value: code.destination },
    ...(changes.length > 0
      ? [{ label: "Changed", value: changes.join(", ") }]
      : []),
  ];
  return (
    <EmailLayout
      preview={heading}
      reason={`You get this because ${kind === "created" ? "new code" : "code change"} alerts are on for ${workspaceName}.`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>{heading}</EmailHeading>
      <EmailText>
        {kind === "created"
          ? `${who} created a dynamic QR code in ${workspaceName}.`
          : `${who} changed this dynamic QR code in ${workspaceName}. Printed QR codes keep working and now follow the new settings.`}
      </EmailText>
      <DetailsTable rows={rows} />
      <EmailButton href={codeUrl}>Open the code</EmailButton>
    </EmailLayout>
  );
}

export default CodeActivityEmail;
