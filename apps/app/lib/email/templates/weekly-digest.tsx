import { Column, Link, Row, Section } from "react-email";
import {
  EMAIL_ACCENT,
  EmailButton,
  EmailHeading,
  EmailLayout,
  EmailText,
} from "./layout";
import {
  formatCount,
  formatEmailDate,
  MutedText,
  SectionTitle,
  StatGrid,
} from "./parts";

export interface WeeklyDigestEmailProps {
  workspaceName: string;
  /** Inclusive start, exclusive end (UTC) */
  periodStart: Date | string;
  periodEnd: Date | string;
  scans: number;
  previousScans: number;
  uniqueVisitors: number;
  newCodes: number;
  formResponses: number;
  topCodes: { label: string; scans: number; url: string }[];
  topCountries: { country: string; scans: number }[];
  dashboardUrl: string;
  unsubscribeUrl: string;
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** "+12%" / "-5%" vs the week before; null without a baseline. */
export function weekOverWeek(current: number, previous: number): string | null {
  if (previous === 0) return current > 0 ? "New this week" : null;
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return "Same as last week";
  return `${change > 0 ? "+" : ""}${change}% vs last week`;
}

const rowStyle = {
  borderBottom: "1px solid #f0f0f0",
  color: "#0a0a0a",
  fontSize: "14px",
  lineHeight: "20px",
  padding: "8px 0",
} as const;

export function WeeklyDigestEmail({
  workspaceName,
  periodStart,
  periodEnd,
  scans,
  previousScans,
  uniqueVisitors,
  newCodes,
  formResponses,
  topCodes,
  topCountries,
  dashboardUrl,
  unsubscribeUrl,
}: WeeklyDigestEmailProps) {
  const lastDay = new Date(new Date(periodEnd).getTime() - 1);
  const period = `${formatEmailDate(periodStart)} – ${formatEmailDate(lastDay)}`;
  return (
    <EmailLayout
      preview={`${formatCount(scans)} scans in ${workspaceName} last week`}
      reason={`You get this because the weekly digest is on for ${workspaceName}.`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <EmailHeading>Your week on QRdx</EmailHeading>
      <EmailText>
        {workspaceName} · {period}
      </EmailText>
      <StatGrid
        stats={[
          {
            label: "Scans",
            value: formatCount(scans),
            delta: weekOverWeek(scans, previousScans),
          },
          { label: "Unique visitors", value: formatCount(uniqueVisitors) },
          {
            label: formResponses > 0 ? "Form responses" : "New codes",
            value: formatCount(formResponses > 0 ? formResponses : newCodes),
          },
        ]}
      />

      {topCodes.length > 0 ? (
        <>
          <SectionTitle>Top codes</SectionTitle>
          <Section>
            {topCodes.map((code) => (
              <Row key={code.url}>
                <Column style={rowStyle}>
                  <Link href={code.url} style={{ color: EMAIL_ACCENT }}>
                    {code.label}
                  </Link>
                </Column>
                <Column style={{ ...rowStyle, textAlign: "right" }}>
                  {formatCount(code.scans)}
                </Column>
              </Row>
            ))}
          </Section>
        </>
      ) : null}

      {topCountries.length > 0 ? (
        <>
          <SectionTitle>Where people scanned</SectionTitle>
          <MutedText>
            {topCountries
              .map(
                (row) =>
                  `${countryName(row.country)} ${formatCount(row.scans)}`,
              )
              .join(" · ")}
          </MutedText>
        </>
      ) : null}

      {formResponses > 0 && newCodes > 0 ? (
        <MutedText>
          {formatCount(newCodes)} new {newCodes === 1 ? "code" : "codes"} this
          week.
        </MutedText>
      ) : null}

      <Section style={{ marginTop: "20px" }}>
        <EmailButton href={dashboardUrl}>Open your dashboard</EmailButton>
      </Section>
    </EmailLayout>
  );
}

export default WeeklyDigestEmail;
