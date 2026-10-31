import type { CSSProperties } from "react";
import { Section, Text } from "react-email";
import { EmailDivider, EmailHeading, EmailLayout, EmailText } from "./layout";
import { MutedText } from "./parts";

export const SIGN_IN_CODE_SUBJECT = "Your QRdx sign-in code";

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

export interface SignInCodeEmailProps {
  /** The 6-digit code */
  code: string;
  expiresInMinutes?: number;
}

/** Transactional: the one-time code for signing in with email. No links. */
export function SignInCodeEmail({
  code,
  expiresInMinutes = 5,
}: SignInCodeEmailProps) {
  const expiry = `${expiresInMinutes} minute${expiresInMinutes === 1 ? "" : "s"}`;
  return (
    <EmailLayout
      preview={`Enter this code to sign in. It expires in ${expiry}.`}
      reason="You got this email because someone asked to sign in to QRdx with this address."
    >
      <EmailHeading>Your QRdx sign-in code</EmailHeading>
      <EmailText>Enter this code in the QRdx sign-in window:</EmailText>
      <Section style={styles.codeBox}>
        <Text style={styles.code}>{code}</Text>
      </Section>
      <EmailText>
        The code expires in {expiry} and works once. Don't share it with anyone.
      </EmailText>
      <EmailDivider />
      <MutedText>
        If you didn't ask for this, ignore this email. Nobody can sign in
        without the code.
      </MutedText>
    </EmailLayout>
  );
}

export default SignInCodeEmail;
