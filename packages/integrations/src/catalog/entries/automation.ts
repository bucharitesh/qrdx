import type {
  CatalogAction,
  CatalogCapability,
  CatalogStep,
  IntegrationCatalogEntry,
} from "../types";

const ADD_ENDPOINT: CatalogAction = {
  type: "link",
  label: "Add a webhook endpoint",
  href: "/dashboard/webhooks",
};

const WEBHOOK_DOCS: CatalogAction = {
  type: "link",
  label: "Webhook docs",
  href: "/docs/webhooks",
};

const EVENTS_STEP = (tool: string): CatalogStep => ({
  title: "Add the URL to QRdx",
  body: `Open Dashboard → Webhooks, click Add endpoint, paste the ${tool} URL and pick the events, for example form.submitted or scan.milestone.`,
});

const AUTOMATION_CAPABILITIES: CatalogCapability[] = [
  {
    title: "Every event",
    description:
      "Scans (batched per minute), scan milestones, new and changed codes, and form submissions.",
  },
  {
    title: "Retries for two days",
    description:
      "Failed deliveries are retried 8 times, and every delivery shows in the endpoint's log.",
  },
  {
    title: "Signed requests",
    description:
      "Each request carries an HMAC-SHA256 signature you can verify with your signing secret.",
  },
];

export const automation: IntegrationCatalogEntry[] = [
  {
    slug: "webhooks",
    name: "Webhooks",
    tagline:
      "Get a signed HTTPS request when codes are scanned, created or changed, or a form is submitted.",
    description: [
      "Webhooks send events from a workspace to a URL you control as they happen: update a CRM when someone fills in a form, post to an internal tool when a code passes 1,000 scans, or keep your own copy of scan data.",
      "They are also how Zapier, Make, n8n and any other automation tool receive QRdx events.",
    ],
    kind: "native",
    surface: "developers",
    canonicalPath: "/docs/webhooks",
    categories: ["automation", "developers"],
    logo: { type: "feature", icon: "Flash" },
    plan: "business",
    builtBy: "QRdx",
    docs: "/docs/webhooks",
    primaryAction: ADD_ENDPOINT,
    secondaryAction: WEBHOOK_DOCS,
    steps: [
      {
        title: "Add an endpoint",
        body: "Open Dashboard → Webhooks, click Add endpoint, enter a public https:// URL and pick the events.",
      },
      {
        title: "Copy the signing secret",
        body: "It is shown after saving. Owners and admins can reveal or rotate it later.",
      },
      {
        title: "Verify each request",
        body: "Compute an HMAC-SHA256 of `<timestamp>.<raw body>` and compare it with v1 in X-QRdx-Signature.",
        snippet: {
          label: "verify.ts",
          language: "ts",
          code: `import { createHmac, timingSafeEqual } from "node:crypto";

export function isFromQRdx(rawBody: string, header: string, secret: string) {
  const parts = Object.fromEntries(
    header.split(",").map((part) => part.trim().split("=", 2)),
  );
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex");
  const received = Buffer.from(parts.v1 ?? "");
  return (
    received.length === expected.length &&
    timingSafeEqual(received, Buffer.from(expected))
  );
}`,
        },
      },
      {
        title: "Send a test",
        body: "Click Send test. QRdx sends a signed ping event and shows the response status.",
      },
    ],
    capabilities: [
      ...AUTOMATION_CAPABILITIES,
      {
        title: "REST Hooks API",
        description:
          "Tools can subscribe and unsubscribe on their own through /api/v1/hooks.",
      },
    ],
    keywords: ["http", "events", "callback", "rest hooks", "signature"],
    related: ["zapier", "make", "n8n"],
  },
  {
    slug: "zapier",
    name: "Zapier",
    tagline:
      "Start Zaps from QRdx scans, milestones and form responses with Webhooks by Zapier.",
    description: [
      "Use a Webhooks by Zapier “Catch Hook” trigger as a QRdx webhook endpoint and every event you pick starts your Zap: add form responses to a CRM, email your team at 1,000 scans, or log each scan.",
      "A scan.created delivery is one batch of up to 100 scans per minute, so use the data.scans line items to act on each scan.",
    ],
    kind: "guide",
    surface: "integrations",
    categories: ["automation"],
    logo: { type: "image", src: "/integrations/zapier.svg" },
    plan: "business",
    builtBy: "QRdx",
    website: "https://zapier.com",
    docs: "/docs/webhooks#zapier-make-and-n8n-rest-hooks",
    primaryAction: ADD_ENDPOINT,
    secondaryAction: WEBHOOK_DOCS,
    note: "Webhooks by Zapier is a premium Zapier app.",
    steps: [
      {
        title: "Create a Zap with a Catch Hook trigger",
        body: "In Zapier, pick Webhooks by Zapier as the trigger app and Catch Hook as the event, then copy the webhook URL it gives you.",
        snippet: {
          label: "It looks like this",
          language: "text",
          code: "https://hooks.zapier.com/hooks/catch/123456/abcdef/",
        },
      },
      EVENTS_STEP("Zapier"),
      {
        title: "Send a sample and test the trigger",
        body: "Submit your form or create a code so a real event arrives, then click Test trigger in Zapier and map the fields in your actions.",
      },
    ],
    capabilities: AUTOMATION_CAPABILITIES,
    keywords: ["zap", "no-code", "workflow", "catch hook", "crm"],
    related: ["make", "n8n", "google-sheets"],
  },
  {
    slug: "make",
    name: "Make",
    tagline:
      "Run Make scenarios on QRdx scans, milestones and form responses with a custom webhook.",
    description: [
      "Start a scenario with Make's Webhooks → Custom webhook module and add its address as a QRdx endpoint. Every event you pick runs the scenario, ready to route into thousands of apps.",
      "Payloads are JSON envelopes with an id, type, created_at and data, so Make can learn the structure from the first request.",
    ],
    kind: "guide",
    surface: "integrations",
    categories: ["automation"],
    logo: { type: "image", src: "/integrations/make.svg" },
    plan: "business",
    builtBy: "QRdx",
    website: "https://www.make.com",
    docs: "/docs/webhooks#zapier-make-and-n8n-rest-hooks",
    primaryAction: ADD_ENDPOINT,
    secondaryAction: WEBHOOK_DOCS,
    steps: [
      {
        title: "Add a Custom webhook trigger in Make",
        body: "Create a scenario, add Webhooks → Custom webhook, click Add and copy the webhook address.",
        snippet: {
          label: "It looks like this",
          language: "text",
          code: "https://hook.eu1.make.com/abcdefghijklmnop",
        },
      },
      EVENTS_STEP("Make"),
      {
        title: "Let Make learn the data structure",
        body: "Click Run once in Make, then trigger a real event in QRdx (submit your form or create a code). Make reads the fields so you can map them.",
      },
    ],
    capabilities: AUTOMATION_CAPABILITIES,
    keywords: ["integromat", "scenario", "no-code", "workflow", "webhook"],
    related: ["zapier", "n8n", "google-sheets"],
  },
  {
    slug: "n8n",
    name: "n8n",
    tagline:
      "Trigger n8n workflows from QRdx events with the Webhook node, on n8n Cloud or self-hosted.",
    description: [
      "Add a Webhook node set to POST and use its production URL as a QRdx endpoint. Each event starts the workflow with the full JSON payload, and a Code node can verify the signature.",
      "QRdx only delivers to public https:// addresses, so a self-hosted n8n needs a public domain with HTTPS.",
    ],
    kind: "guide",
    surface: "integrations",
    categories: ["automation"],
    logo: { type: "image", src: "/integrations/n8n.svg" },
    plan: "business",
    builtBy: "QRdx",
    website: "https://n8n.io",
    docs: "/docs/webhooks#zapier-make-and-n8n-rest-hooks",
    primaryAction: ADD_ENDPOINT,
    secondaryAction: WEBHOOK_DOCS,
    steps: [
      {
        title: "Add a Webhook node",
        body: "Set the HTTP method to POST and copy the Production URL.",
        snippet: {
          label: "It looks like this",
          language: "text",
          code: "https://your-n8n.example.com/webhook/qrdx-events",
        },
      },
      {
        title: "Activate the workflow",
        body: "The production URL only answers while the workflow is active.",
      },
      EVENTS_STEP("n8n"),
      {
        title: "Optional: verify the signature",
        body: "Read the X-QRdx-Signature header in a Code node and check it with your signing secret, as shown in the webhook docs.",
      },
    ],
    capabilities: AUTOMATION_CAPABILITIES,
    keywords: ["workflow", "self-hosted", "open source", "automation"],
    related: ["webhooks", "zapier", "make"],
  },
  {
    slug: "google-sheets",
    name: "Google Sheets",
    tagline:
      "Export scans and form responses to a new Google Sheet, and keep scans in sync.",
    description: [
      "Connect Google Sheets and export the scans of one code or every code to a new spreadsheet: time, code, country, city, device, OS, browser, referrer and language. Turn on Keep in sync and new scans are appended in batches, at most one request every five minutes, never one per scan.",
      "Form responses from a hosted page export the same way, one column per question. QRdx only reaches spreadsheets it creates (drive.file), and rows are written as plain text, so visitor input never runs as a formula.",
    ],
    kind: "connect",
    surface: "integrations",
    categories: ["automation"],
    logo: { type: "image", src: "/integrations/google-sheets.svg" },
    plan: "free",
    builtBy: "QRdx",
    website: "https://www.google.com/sheets/about/",
    primaryAction: {
      type: "link",
      label: "Connect Google Sheets",
      href: "/settings/integrations/google-sheets",
    },
    secondaryAction: {
      type: "link",
      label: "Or use a webhook",
      href: "/dashboard/webhooks",
    },
    steps: [
      {
        title: "Click Enable and choose your Google account",
        body: "Settings → Integrations → Google Sheets. This is a separate sign-in from Google Drive.",
      },
      {
        title: "Export scans",
        body: "Pick one code or all codes and click Export. The new sheet opens in Google Sheets.",
      },
      {
        title: "Keep it in sync (optional)",
        body: "Turn on Keep in sync and new scans are appended in batches. The last sync and any error show in settings.",
      },
      {
        title: "Export form responses",
        body: "On a page's Responses screen, click Export to Google Sheets.",
      },
    ],
    capabilities: [
      {
        title: "Scans to rows",
        description:
          "Time, code, country, city, device, OS, browser, referrer and language.",
      },
      {
        title: "Keep in sync",
        description:
          "New scans appended in batches, retried with backoff, never duplicated.",
      },
      {
        title: "Form responses",
        description: "One row per response, one column per question.",
      },
    ],
    keywords: ["spreadsheet", "excel", "rows", "export", "forms", "google"],
    related: ["hubspot", "webhooks", "zapier"],
  },
];
