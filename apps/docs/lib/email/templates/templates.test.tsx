// Renders every template to HTML and plain text (no network, nothing sent).
//   cd apps/docs && npx tsx --test lib/email/templates/templates.test.tsx
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { render } from "@react-email/render";
import * as React from "react";
import { AbuseReportAckEmail } from "./abuse-report-ack";
import { CodeActivityEmail } from "./code-activity";
import { FirstScanEmail } from "./first-scan";
import { FormSubmissionEmail } from "./form-submission";
import { ScanMilestoneEmail } from "./scan-milestone";
import { TeamInviteEmail } from "./team-invite";
import { WeeklyDigestEmail, weekOverWeek } from "./weekly-digest";

// tsconfig has jsx: "preserve", so tsx compiles JSX to React.createElement.
Object.assign(globalThis, { React });

const UNSUBSCRIBE = "https://qrdx.dev/api/email/unsubscribe?token=abc.def";
const code = { title: "Spring menu", slug: "aB3dE5f" };

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
    assert.match(invite.text, /Ada invited you to the Acme team as an admin/i);
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
});
