import type { CSSProperties, ReactNode } from "react";
import { Column, Row, Section, Text } from "react-email";
import { EMAIL_ACCENT } from "./layout";

// Building blocks shared by the event and digest templates.

const numberFormat = new Intl.NumberFormat("en-US");
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export const formatCount = (value: number) => numberFormat.format(value);

export const formatEmailDateTime = (value: Date | string) =>
  `${dateTimeFormat.format(new Date(value))} UTC`;

export const formatEmailDate = (value: Date | string) =>
  dateFormat.format(new Date(value));

/** “Title” or the slug when a code has no title. */
export const codeLabel = (code: { title: string | null; slug: string }) =>
  code.title?.trim() ? `“${code.title.trim()}”` : `/${code.slug}`;

const styles = {
  table: {
    border: "1px solid #e5e5e5",
    borderRadius: "8px",
    margin: "0 0 20px",
    padding: "4px 16px",
  },
  label: {
    color: "#737373",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "8px 0",
    paddingRight: "12px",
    verticalAlign: "top",
    width: "38%",
  },
  value: {
    color: "#0a0a0a",
    fontSize: "14px",
    lineHeight: "20px",
    margin: "8px 0",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  stat: {
    border: "1px solid #e5e5e5",
    borderRadius: "8px",
    padding: "12px",
    textAlign: "center",
  },
  statValue: {
    color: "#0a0a0a",
    fontSize: "22px",
    fontWeight: 700,
    lineHeight: "28px",
    margin: 0,
  },
  statLabel: {
    color: "#737373",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "2px 0 0",
  },
  delta: { fontSize: "12px", lineHeight: "18px", margin: "2px 0 0" },
  sectionTitle: {
    color: "#0a0a0a",
    fontSize: "14px",
    fontWeight: 600,
    lineHeight: "20px",
    margin: "20px 0 8px",
  },
  muted: {
    color: "#737373",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "0 0 16px",
  },
} satisfies Record<string, CSSProperties>;

/** Label/value rows, e.g. scan details or form answers. */
export function DetailsTable({
  rows,
}: {
  rows: { label: string; value: ReactNode }[];
}) {
  if (rows.length === 0) return null;
  return (
    <Section style={styles.table}>
      {rows.map((row, index) => (
        <Row key={index}>
          <Column style={styles.label}>{`${row.label}:\u00a0`}</Column>
          <Column style={styles.value}>{row.value}</Column>
        </Row>
      ))}
    </Section>
  );
}

export function StatGrid({
  stats,
}: {
  stats: { label: string; value: string; delta?: string | null }[];
}) {
  return (
    <Section style={{ margin: "0 0 8px" }}>
      <Row>
        {stats.map((stat) => (
          <Column
            key={stat.label}
            style={{ padding: "0 4px", width: `${100 / stats.length}%` }}
          >
            <Section style={styles.stat}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
              {stat.delta ? (
                <Text
                  style={{
                    ...styles.delta,
                    color: stat.delta.startsWith("-")
                      ? "#b45309"
                      : EMAIL_ACCENT,
                  }}
                >
                  {stat.delta}
                </Text>
              ) : null}
            </Section>
          </Column>
        ))}
      </Row>
    </Section>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function MutedText({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}
