// Settings → Integrations → Slack: "Add another channel" is a button that
// asks "Confirm it's you" in the page before going to "Add to Slack", never a
// plain link to the install route (which would only refuse and come back).
// The server side is tests/lib/confirm-data-out-connect.test.ts. Rendered to
// static markup, so the click itself isn't run here.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings/integrations/slack",
}));
vi.mock("@/components/confirm-identity/actions", () => ({
  ensureConfirmed: async () => ({ ok: true }),
  finishSignInConfirmation: async () => ({ ok: true }),
  getConfirmationOptions: async () => ({ ok: false, error: "unused" }),
}));
vi.mock("@/app/settings/integrations/actions", () => ({
  connectIntegrationAction: async () => ({ url: "https://slack.example" }),
  disconnectIntegrationAction: async () => ({ success: true }),
}));

const { ConfirmIdentityProvider } = await import(
  "@/components/confirm-identity/provider"
);
const { IntegrationDetail } = await import(
  "@/app/settings/integrations/[slug]/components/integration-detail"
);

const slack = (
  <IntegrationDetail
    capabilities={[]}
    category={[]}
    description="Alerts in a Slack channel"
    features={[]}
    isConfigured
    isConnected
    logos={{
      light: "/integrations/slack.svg",
      dark: "/integrations/slack.svg",
    }}
    metadata={{
      channels: [
        {
          targetId: "n_1",
          channel: "#alerts",
          teamName: "Acme",
          addedAt: "2026-11-01T00:00:00.000Z",
        },
      ],
    }}
    name="Slack"
    slug="slack"
    status="active"
  />
);

describe('"Add another channel"', () => {
  it("is a button, not a link straight to the install route", () => {
    const html = renderToStaticMarkup(
      <ConfirmIdentityProvider>{slack}</ConfirmIdentityProvider>,
    );
    expect(html).toMatch(
      /<button[^>]*>(<svg[\s\S]*?<\/svg>)?Add another channel<\/button>/,
    );
    expect(html).not.toContain("/api/integrations/slack/install");
  });

  it("needs the page's ConfirmIdentityProvider", () => {
    expect(() => renderToStaticMarkup(slack)).toThrow(
      /needs a <ConfirmIdentityProvider>/,
    );
  });
});
