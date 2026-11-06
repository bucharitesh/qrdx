// Renders every template to HTML and plain text (no network, nothing sent).
//   cd apps/docs && npx tsx --test lib/email/templates/templates.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { render } from "@react-email/render";
import * as React from "react";
import { AbuseReportAckEmail } from "./abuse-report-ack";
import { CodeActivityEmail } from "./code-activity";
import {
  CONFIRMATION_CODE_SUBJECT,
  ConfirmationCodeEmail,
} from "./confirmation-code";
import { EmailChangeCodeEmail, EmailChangedEmail } from "./email-change";
import { FirstScanEmail } from "./first-scan";
import { FormSubmissionEmail } from "./form-submission";
import { LimitNoticeEmail } from "./limit-notice";
import { NEW_SIGN_IN_SUBJECT, NewSignInEmail } from "./new-sign-in";
import { PasskeyNoticeEmail } from "./passkey-notice";
import { ScanMilestoneEmail } from "./scan-milestone";
import type { SecurityEventDetails } from "./security-parts";
import { SignInCodeEmail } from "./sign-in-code";
import { inviteRole, TeamInviteEmail, teamInviteSubject } from "./team-invite";
import {
  TwoFactorNoticeEmail,
  type TwoFactorNoticeKind,
  twoFactorNoticeSubject,
} from "./two-factor-notice";
import { WeeklyDigestEmail, weekOverWeek } from "./weekly-digest";

// tsconfig has jsx: "preserve", so tsx compiles JSX to React.createElement.
Object.assign(globalThis, { React });

const UNSUBSCRIBE = "https://qrdx.dev/api/email/unsubscribe?token=abc.def";
const code = { title: "Spring menu", slug: "aB3dE5f" };

// Where and when a security event happened (lib/security/request-details.ts).
const DETAILS: SecurityEventDetails = {
  device: "Chrome on macOS",
  location: "Mumbai, India",
  ip: "203.0.113.24",
  time: "Nov 7, 2026, 3:04 PM GMT+5:30",
};
const REVIEW_SECURITY = "/settings/account#two-factor";
const NEVER_ASK = "QRdx will never ask for this code by phone, chat or email.";

/** Links a security email may carry: home, the security settings, support. */
function assertSecurityLinks(html: string, label: string) {
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(hrefs.includes("mailto:support@qrdx.dev"), `${label} support`);
  let review = 0;
  for (const href of hrefs) {
    if (href.startsWith("mailto:")) {
      assert.equal(href, "mailto:support@qrdx.dev", label);
      continue;
    }
    const url = new URL(href);
    assert.equal(url.search, "", `${label} ${href}`);
    if (`${url.pathname}${url.hash}` === REVIEW_SECURITY) {
      review += 1;
      continue;
    }
    assert.equal(url.pathname, "/", `${label} ${href}`);
  }
  assert.equal(review, 1, `${label} has one Review security button`);
}

/** Device, place, address and time, in the details table. */
function assertDetails(text: string, label: string) {
  assert.match(text, /Device:\s+Chrome on macOS/, label);
  assert.match(text, /Approximate location:\s+Mumbai, India/, label);
  assert.match(text, /IP address:\s+203\.0\.113\.24/, label);
  assert.match(text, /Time:\s+Nov 7, 2026, 3:04 PM GMT\+5:30/, label);
  assert.match(text, /Review security/, label);
}

async function both(element: React.ReactElement) {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { html, text };
}

describe("email templates", () => {
  it("alert emails carry an unsubscribe link", async () => {
    const emails = [
      <FirstScanEmail
        analyticsUrl="https://qrdx.dev/dashboard/codes/c1"
        code={code}
        device="iOS · Safari"
        key="first"
        location="Berlin, DE"
        scannedAt="2026-10-31T10:00:00Z"
        unsubscribeUrl={UNSUBSCRIBE}
        workspaceName="your personal workspace"
      />,
      <ScanMilestoneEmail
        analyticsUrl="https://qrdx.dev/dashboard/codes/c1"
        code={code}
        key="milestone"
        milestone={1000}
        unsubscribeUrl={UNSUBSCRIBE}
        workspaceName="the Acme team"
      />,
      <FormSubmissionEmail
        fields={[
          { label: "Email", value: "ada@example.com" },
          { label: "Message", value: "<script>alert(1)</script>" },
        ]}
        key="form"
        pageTitle="Feedback"
        responsesUrl="https://qrdx.dev/dashboard/pages/p1/responses"
        submittedAt="2026-10-31T10:00:00Z"
        unsubscribeUrl={UNSUBSCRIBE}
        workspaceName="your personal workspace"
      />,
      <CodeActivityEmail
        actorName="Ada"
        changes={["Destination"]}
        code={{
          ...code,
          shortLink: "https://qrdx.dev/q/aB3dE5f",
          destination: "https://example.com",
        }}
        codeUrl="https://qrdx.dev/dashboard/codes/c1"
        key="code"
        kind="updated"
        unsubscribeUrl={UNSUBSCRIBE}
        workspaceName="the Acme team"
      />,
      <WeeklyDigestEmail
        dashboardUrl="https://qrdx.dev/dashboard/analytics"
        formResponses={3}
        key="digest"
        newCodes={2}
        periodEnd="2026-11-02T00:00:00Z"
        periodStart="2026-10-26T00:00:00Z"
        previousScans={80}
        scans={120}
        topCodes={[
          { label: "“Spring menu”", scans: 90, url: "https://qrdx.dev/x" },
        ]}
        topCountries={[{ country: "DE", scans: 50 }]}
        uniqueVisitors={97}
        unsubscribeUrl={UNSUBSCRIBE}
        workspaceName="Acme"
      />,
    ];
    for (const email of emails) {
      const { html, text } = await both(email);
      assert.ok(
        html.includes(UNSUBSCRIBE.replace("&", "&amp;")),
        email.key ?? "",
      );
      assert.match(text, /Unsubscribe/);
      assert.match(html, /QR<span[^>]*>dx<\/span>/);
    }
  });

  it("escapes visitor-typed form values", async () => {
    const { html } = await both(
      <FormSubmissionEmail
        fields={[{ label: "Message", value: "<script>alert(1)</script>" }]}
        pageTitle={null}
        responsesUrl="https://qrdx.dev/r"
        submittedAt="2026-10-31T10:00:00Z"
        unsubscribeUrl={UNSUBSCRIBE}
        workspaceName="x"
      />,
    );
    assert.ok(!html.includes("<script>alert(1)</script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  it("digest shows totals, week-over-week and countries", async () => {
    const { text } = await both(
      <WeeklyDigestEmail
        dashboardUrl="https://qrdx.dev/dashboard/analytics"
        formResponses={0}
        newCodes={1}
        periodEnd="2026-11-02T00:00:00Z"
        periodStart="2026-10-26T00:00:00Z"
        previousScans={100}
        scans={1250}
        topCodes={[]}
        topCountries={[{ country: "IN", scans: 900 }]}
        uniqueVisitors={1000}
        unsubscribeUrl={UNSUBSCRIBE}
        workspaceName="Personal workspace"
      />,
    );
    assert.match(text, /1,250/);
    assert.match(text, /Oct 26 – Nov 1/);
    assert.match(text, /India 900/);
    assert.equal(weekOverWeek(120, 100), "+20% vs last week");
    assert.equal(weekOverWeek(50, 100), "-50% vs last week");
    assert.equal(weekOverWeek(5, 0), "New this week");
    assert.equal(weekOverWeek(0, 0), null);
  });

  it("transactional emails have no unsubscribe link", async () => {
    const invite = await both(
      <TeamInviteEmail
        expiresAt="2026-11-07T10:00:00Z"
        inviteUrl="https://qrdx.dev/invite/inv_1"
        inviterName="Ada"
        memberRole="admin"
        teamName="Acme"
      />,
    );
    assert.match(
      invite.text,
      /Ada invited you to the Acme workspace as an admin/i,
    );
    assert.ok(invite.html.includes("https://qrdx.dev/invite/inv_1"));
    assert.doesNotMatch(invite.text, /Unsubscribe/);

    const ack = await both(
      <AbuseReportAckEmail
        reason="Phishing"
        reportId="rep_1"
        reported="https://qrdx.dev/q/aB3dE5f"
        reportedAt="2026-10-31T10:00:00Z"
      />,
    );
    assert.match(ack.text, /We received your report/i);
    assert.match(ack.text, /rep_1/);
    assert.doesNotMatch(ack.text, /Unsubscribe/);
  });

  it("team invitations say the role they give, in the subject, preview and body", async () => {
    const cases = [
      [
        "viewer",
        "a viewer",
        /see the workspace's codes, pages and analytics without changing anything/,
      ],
      ["billing", "a billing manager", /handle the plan and billing/],
      ["admin", "an admin", /manage people, settings, domains/],
      ["member", "a member", /create codes and pages/],
    ] as const;
    for (const [role, phrase, line] of cases) {
      const subject = teamInviteSubject({
        inviterName: "Ada",
        teamName: "Acme",
        memberRole: role,
      });
      assert.equal(subject, `Ada invited you to Acme on QRdx as ${phrase}`);
      const email = await both(
        <TeamInviteEmail
          expiresAt="2026-11-07T10:00:00Z"
          inviteUrl="https://qrdx.dev/invite/inv_1"
          inviterName="Ada"
          memberRole={role}
          teamName="Acme"
        />,
      );
      assert.ok(
        email.text.includes(
          `Ada invited you to the Acme workspace as ${phrase}.`,
        ),
        role,
      );
      assert.match(email.text, line);
      // The inbox preview is the subject line.
      assert.ok(email.html.includes(subject), `${role} preview`);
    }
    // Several roles read as the strongest; unknown ones as viewer.
    assert.equal(inviteRole("member,admin"), "admin");
    assert.equal(inviteRole("billing"), "billing");
    assert.equal(inviteRole("superuser"), "viewer");
    assert.equal(inviteRole(null), "viewer");
  });

  it("sign-in code email shows the code and has no tracking links", async () => {
    const { html, text } = await both(<SignInCodeEmail code="402871" />);
    assert.match(text, /Your QRdx sign-in code/i);
    assert.match(text, /402871/);
    assert.match(text, /expires in 5 minutes/);
    assert.ok(text.includes(NEVER_ASK));
    assert.match(text, /If you didn't ask for this, ignore this email/);
    assert.doesNotMatch(text, /Unsubscribe/);
    // No place known: no line about it.
    assert.doesNotMatch(text, /Someone asked to sign in from/);
    // The code renders large and letter-spaced (still copyable as one word).
    assert.match(html, /letter-spacing:0\.4em[^"]*"[^>]*>402871</);
    assert.match(html, /font-size:34px/);
    // Only the plain site links from the layout: no query strings, no pixels.
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    assert.ok(hrefs.length > 0);
    for (const href of hrefs) {
      assert.equal(new URL(href).search, "", href);
      assert.equal(new URL(href).pathname, "/", href);
    }
    assert.doesNotMatch(html, /<img/i);
  });

  it("sign-in code email says roughly where the code was asked for", async () => {
    const { text } = await both(
      <SignInCodeEmail code="402871" location="Mumbai, India" />,
    );
    assert.match(text, /Someone asked to sign in from Mumbai, India\./);
    // The place, never the address or the device: anyone can ask for a code
    // for any address.
    assert.doesNotMatch(text, /IP address/);
  });

  it("email-change code email shows the code and nothing to click", async () => {
    const { html, text } = await both(<EmailChangeCodeEmail code="915273" />);
    assert.match(text, /Confirm your new email/i);
    assert.match(text, /915273/);
    assert.match(text, /expires in 5 minutes/);
    assert.ok(text.includes(NEVER_ASK));
    assert.match(text, /Nothing changes without the code/);
    assert.match(html, /letter-spacing:0\.4em[^"]*"[^>]*>915273</);
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    for (const href of hrefs) {
      assert.equal(new URL(href).pathname, "/", href);
      assert.equal(new URL(href).search, "", href);
    }
  });

  it("email-changed notice names the new address and has no undo link", async () => {
    const { html, text } = await both(
      <EmailChangedEmail details={DETAILS} newEmail="ada+new@example.com" />,
    );
    assert.match(text, /Your QRdx email was changed/i);
    assert.match(text, /ada\+new@example\.com/);
    assert.match(text, /If this wasn't you, contact support/);
    assert.doesNotMatch(text, /Unsubscribe/);
    assertDetails(text, "email changed");
    // Home, the security settings and support: nothing that acts on the
    // account.
    assertSecurityLinks(html, "email changed");
  });

  it("two-step verification notices say what changed, where and when", async () => {
    const kinds: [TwoFactorNoticeKind, RegExp][] = [
      ["on", /Two-step verification is on/i],
      ["off", /Your backup codes no longer work/],
      ["backup-codes", /The old ones no longer work/],
      ["app-added", /Authenticator app added/i],
      ["app-removed", /Two-step verification stays on/],
      ["support-off", /QRdx support turned off two-step verification/],
    ];
    for (const [kind, line] of kinds) {
      const { html, text } = await both(
        <TwoFactorNoticeEmail details={DETAILS} kind={kind} />,
      );
      assert.match(text, line);
      assert.match(text, /If this wasn't you, contact support/);
      assert.ok(twoFactorNoticeSubject(kind).length > 0);
      assertSecurityLinks(html, kind);
      if (kind !== "support-off") assertDetails(text, kind);
    }
  });

  it("a change by support names support, not the device it was made from", async () => {
    const { text } = await both(
      <TwoFactorNoticeEmail
        details={{ ...DETAILS, actor: "QRdx support" }}
        kind="support-off"
      />,
    );
    assert.match(text, /By:\s+QRdx support/);
    assert.match(text, /Time:\s+Nov 7, 2026/);
    assert.doesNotMatch(text, /Chrome on macOS|203\.0\.113\.24|Mumbai/);
    assert.doesNotMatch(text, /If this was you/);
  });

  it("leaves out what isn't known about the request", async () => {
    const { text } = await both(
      <TwoFactorNoticeEmail
        details={{
          device: "Unknown device",
          location: null,
          ip: null,
          time: "Nov 7, 2026, 9:34 AM UTC",
        }}
        kind="on"
      />,
    );
    assert.match(text, /Device:\s+Unknown device/);
    assert.match(text, /Time:\s+Nov 7, 2026, 9:34 AM UTC/);
    assert.doesNotMatch(text, /Approximate location|IP address/);
  });

  it("passkey notices name the passkey, where and when", async () => {
    for (const change of ["added", "removed"] as const) {
      const { html, text } = await both(
        <PasskeyNoticeEmail
          change={change}
          details={DETAILS}
          passkeyName="Chrome on macOS"
        />,
      );
      assert.match(
        text,
        change === "added"
          ? /can now sign in to your QRdx account/
          : /can no longer sign in to your QRdx account/,
      );
      assertDetails(text, change);
      assertSecurityLinks(html, change);
    }
  });

  it("the new sign-in alert says how and where, and what to do if it wasn't you", async () => {
    const { html, text } = await both(
      <NewSignInEmail details={DETAILS} method="Email code, then a passkey" />,
    );
    // Headings come out in capitals in plain text.
    assert.match(text, new RegExp(NEW_SIGN_IN_SUBJECT, "i"));
    assertDetails(text, "new sign-in");
    assert.match(text, /Signed in with:\s+Email code, then a passkey/);
    assert.match(text, /If this was you, there's nothing to do/);
    assert.match(text, /Sign out everywhere else/);
    assert.match(text, /Turn on two-step verification/);
    assert.match(text, /Contact support at support@qrdx\.dev/);
    assert.doesNotMatch(text, /Unsubscribe/);
    assertSecurityLinks(html, "new sign-in");
    // The inbox preview names the device and the place.
    assert.ok(
      html.includes(
        "Chrome on macOS signed in to your QRdx account near Mumbai, India.",
      ),
    );

    const unknown = await both(
      <NewSignInEmail
        details={{ ...DETAILS, location: null, ip: null }}
        method={null}
      />,
    );
    assert.doesNotMatch(unknown.text, /Signed in with|Approximate location/);
  });

  it("the confirmation code email carries the code, where it was asked for and a warning", async () => {
    const { html, text } = await both(
      <ConfirmationCodeEmail
        code="503118"
        details={DETAILS}
        expiresInMinutes={10}
      />,
    );
    assert.equal(CONFIRMATION_CODE_SUBJECT, "Your QRdx confirmation code");
    assert.match(text, /Confirm it's you/i);
    assert.match(text, /503118/);
    assert.match(text, /expires in 10 minutes/);
    assert.ok(text.includes(NEVER_ASK));
    assertDetails(text, "confirmation code");
    assert.match(text, /If you didn't ask for this, don't enter the code/);
    assert.match(html, /letter-spacing:0\.4em[^"]*"[^>]*>503118</);
    assertSecurityLinks(html, "confirmation code");
  });

  it("limit notices name the workspace and limit and link to plan and usage", async () => {
    const usageUrl = "https://qrdx.dev/dashboard/acme/settings/usage";
    const near = await both(
      <LimitNoticeEmail
        level="near"
        limitLabel="Form responses"
        noun="form responses"
        planName="Free"
        reason="5 form responses left this month on Free. Resets Dec 1."
        recipientReason="You get this because you're an owner of Acme on QRdx."
        usageUrl={usageUrl}
        value="45 of 50"
        workspaceName="Acme"
      />,
    );
    assert.match(near.text, /Acme is close to a plan limit/i);
    assert.match(near.text, /Acme has used 45 of 50 form responses\./);
    assert.match(near.text, /Resets Dec 1\./);
    assert.match(near.text, /Form responses:\s+45 of 50/);
    assert.match(
      near.html,
      /href="https:\/\/qrdx\.dev\/dashboard\/acme\/settings\/usage"/,
    );
    // An account notice: no unsubscribe link, the reason says why instead.
    assert.doesNotMatch(near.text, /Unsubscribe/);
    assert.match(near.text, /owner of Acme/);

    const full = await both(
      <LimitNoticeEmail
        level="full"
        limitLabel="Dynamic QR codes"
        noun="dynamic QR codes"
        planName="Free"
        reason="Free includes 10 active dynamic codes. Archive one or upgrade to Pro for unlimited codes. Existing codes keep working."
        recipientReason="You get this because you're an owner of Acme on QRdx."
        usageUrl={usageUrl}
        value="10 of 10"
        workspaceName="Acme"
      />,
    );
    assert.match(full.text, /Acme has reached a plan limit/i);
    assert.match(full.text, /Existing codes keep working/);
    assert.doesNotMatch(full.text, /Resets/);
  });
});
