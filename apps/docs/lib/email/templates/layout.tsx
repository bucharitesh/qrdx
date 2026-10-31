import type { CSSProperties, ReactNode } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";
import { baseUrl } from "@/lib/metadata";

// Base layout for every QRdx email. Templates render
// <EmailLayout preview="…">…</EmailLayout> and use the helpers below so all
// emails share one look.

export const EMAIL_ACCENT = "#155DFC";

/**
 * Postal address shown in the footer (required by CAN-SPAM for marketing
 * email). Fill in before sending digests or announcements.
 */
export const EMAIL_POSTAL_ADDRESS: string | null = null;

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const styles = {
  body: {
    backgroundColor: "#f5f5f5",
    fontFamily: FONT,
    margin: 0,
    padding: "32px 12px",
  },
  container: { maxWidth: "560px", margin: "0 auto" },
  logo: {
    color: "#0a0a0a",
    fontSize: "22px",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    textDecoration: "none",
  },
  card: {
    backgroundColor: "#ffffff",
    border: "1px solid #e5e5e5",
    borderTop: `3px solid ${EMAIL_ACCENT}`,
    borderRadius: "12px",
    marginTop: "16px",
    padding: "32px 28px",
  },
  heading: {
    color: "#0a0a0a",
    fontSize: "20px",
    lineHeight: "28px",
    margin: "0 0 12px",
  },
  text: {
    color: "#404040",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  button: {
    backgroundColor: EMAIL_ACCENT,
    borderRadius: "9999px",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: 600,
    padding: "12px 22px",
    textDecoration: "none",
  },
  hr: { borderColor: "#e5e5e5", margin: "24px 0" },
  footer: { padding: "16px 8px 0", textAlign: "center" },
  footerText: {
    color: "#737373",
    fontSize: "12px",
    lineHeight: "18px",
    margin: "0 0 6px",
  },
  footerLink: { color: "#737373", textDecoration: "underline" },
} satisfies Record<string, CSSProperties>;

export interface EmailLayoutProps {
  /** Inbox preview line (keep under ~90 characters) */
  preview: string;
  children: ReactNode;
  /** Why the recipient gets this email, e.g. "You're an owner of Acme on QRdx." */
  reason?: string;
  /** Shows an Unsubscribe link; pass the same URL to sendEmail's `unsubscribeUrl` */
  unsubscribeUrl?: string;
}

export function EmailLayout({
  preview,
  children,
  reason,
  unsubscribeUrl,
}: EmailLayoutProps) {
  const origin = baseUrl.origin;
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section>
            <Link href={origin} style={styles.logo}>
              QR<span style={{ color: EMAIL_ACCENT }}>dx</span>
            </Link>
          </Section>
          <Section style={styles.card}>{children}</Section>
          <Section style={styles.footer}>
            {reason ? <Text style={styles.footerText}>{reason}</Text> : null}
            <Text style={styles.footerText}>
              QRdx ·{" "}
              <Link href={origin} style={styles.footerLink}>
                {baseUrl.host}
              </Link>
            </Text>
            {EMAIL_POSTAL_ADDRESS ? (
              <Text style={styles.footerText}>{EMAIL_POSTAL_ADDRESS}</Text>
            ) : null}
            {unsubscribeUrl ? (
              <Text style={styles.footerText}>
                <Link href={unsubscribeUrl} style={styles.footerLink}>
                  Unsubscribe
                </Link>
              </Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function EmailHeading({ children }: { children: ReactNode }) {
  return (
    <Heading as="h1" style={styles.heading}>
      {children}
    </Heading>
  );
}

export function EmailText({ children }: { children: ReactNode }) {
  return <Text style={styles.text}>{children}</Text>;
}

export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Button href={href} style={styles.button}>
      {children}
    </Button>
  );
}

export function EmailDivider() {
  return <Hr style={styles.hr} />;
}
