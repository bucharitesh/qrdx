import type { CSSProperties } from "react";
import { Section, Text } from "react-email";
import { type EmailIntl, ENGLISH_EMAIL } from "@/lib/i18n/email";
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";
import { NeverAskForCode } from "./security-parts";

export const SIGN_IN_CODE_SUBJECT = "Your QRdx sign-in code";

/** The subject line in the recipient's language. */
export const signInCodeSubject = (intl: EmailIntl = ENGLISH_EMAIL) =>
  intl.t("signInCode.subject");

const MONO =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

// Letter spacing (not spaces) keeps the code copyable as six digits.
const SPACING = "0.4em";

const styles = {
  codeBox: {
    backgroundColor: "#f5f5f5",
    border: "1px solid #e5e5e5",
    borderRadius: "10px",
    margin: "4px 0 20px",
    padding: "20px 12px",
    textAlign: "center",
  },
  code: {
    color: "#0a0a0a",
    fontFamily: MONO,
    fontSize: "34px",
    fontWeight: 700,
    letterSpacing: SPACING,
    lineHeight: "40px",
    margin: 0,
    // Balances the spacing after the last digit so the code sits centred.
    paddingLeft: SPACING,
  },
} satisfies Record<string, CSSProperties>;

/** The 6-digit code, large and letter-spaced (still copyable as one word). */
export function EmailCodeBox({ code }: { code: string }) {
  return (
    <Section style={styles.codeBox}>
      <Text style={styles.code}>{code}</Text>
    </Section>
  );
}

export interface SignInCodeEmailProps {
  /** The 6-digit code */
  code: string;
  expiresInMinutes?: number;
  /** Where the code was asked for, approximately ("Mumbai, India") */
  location?: string | null;
  /** The recipient's language */
  intl?: EmailIntl;
}

/** Transactional: the one-time code for signing in with email. No links. */
export function SignInCodeEmail({
  code,
  expiresInMinutes = 5,
  location = null,
  intl = ENGLISH_EMAIL,
}: SignInCodeEmailProps) {
  const { t } = intl;
  return (
    <EmailLayout
      intl={intl}
      preview={t("signInCode.preview", { minutes: expiresInMinutes })}
      reason={t("signInCode.reason")}
    >
      <EmailHeading>{t("signInCode.heading")}</EmailHeading>
      {location ? (
        <EmailText>{t("signInCode.location", { location })}</EmailText>
      ) : null}
      <EmailText>{t("signInCode.enter")}</EmailText>
      <EmailCodeBox code={code} />
      <EmailText>{t("codes.expires", { minutes: expiresInMinutes })}</EmailText>
      <NeverAskForCode intl={intl} />
      <EmailDivider />
      <MutedText>{t("signInCode.ignore")}</MutedText>
    </EmailLayout>
  );
}

export default SignInCodeEmail;
