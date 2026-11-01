import "server-only";

import { listAuthorizedApps } from "@/lib/oauth-apps/authorized";
import type { ExportEntry } from "./archive";
import {
  exportQueries,
  FORM_RESPONSE_PAGE_SIZE,
  type RowCursor,
  SCAN_PAGE_SIZE,
  type ScanCursor,
} from "./queries";

/** Per-file caps, so one export stays a download rather than a project. */
export const MAX_SCAN_ROWS = 500_000;
export const MAX_FORM_RESPONSE_ROWS = 100_000;

export const EXPORT_INTRO = `QRdx data export

This archive holds the personal data QRdx keeps about your account: your
profile, how you sign in, and everything you created, in your personal
workspace and in teams. Content other team members created is theirs and is
not included. Files you uploaded are listed with their details; download the
files themselves from Files in the dashboard.

JSON files open in any text editor; CSV files open in a spreadsheet.`;

export const SCAN_COLUMNS = [
  "code_id",
  "code_slug",
  "scanned_at",
  "country",
  "region",
  "city",
  "device_type",
  "os",
  "browser",
  "referer",
  "language",
  "variant",
  "visitor_hash",
] as const;

const FORM_RESPONSE_COLUMNS = [
  "id",
  "page_id",
  "code_id",
  "submitted_at",
  "visitor_hash",
  "answers",
] as const;

/** The files of one user's export, in archive order. */
export function exportEntries(userId: string): ExportEntry[] {
  const q = exportQueries(userId);

  async function* scanPages() {
    const codes = await q.scannedCodes;
    for (const code of codes) {
      let after: ScanCursor | null = null;
      while (true) {
        const rows = await q.scanPage(code.id, after);
        if (rows.length === 0) break;
        yield rows.map((row) => ({
          code_id: row.codeId,
          code_slug: code.slug,
          scanned_at: row.scannedAt,
          country: row.country,
          region: row.region,
          city: row.city,
          device_type: row.deviceType,
          os: row.os,
          browser: row.browser,
          referer: row.referer,
          language: row.language,
          variant: row.variant,
          visitor_hash: row.visitorHash,
        }));
        if (rows.length < SCAN_PAGE_SIZE) break;
        const last = rows[rows.length - 1];
        after = { scannedAt: last.scannedAt, id: last.id };
      }
    }
  }

  async function* formResponsePages() {
    let after: RowCursor | null = null;
    while (true) {
      const rows = await q.formResponsePage(after);
      if (rows.length === 0) break;
      yield rows.map((row) => ({
        id: row.id,
        page_id: row.pageId,
        code_id: row.codeId,
        submitted_at: row.createdAt,
        visitor_hash: row.visitorHash,
        answers: row.data,
      }));
      if (rows.length < FORM_RESPONSE_PAGE_SIZE) break;
      const last = rows[rows.length - 1];
      after = { createdAt: last.createdAt, id: last.id };
    }
  }

  async function* scansDailyPages() {
    yield (await q.scansDaily).map((row) => ({
      code_id: row.codeId,
      day: row.day,
      scans: row.scans,
    }));
  }

  return [
    {
      kind: "json",
      path: "profile.json",
      title: "Profile",
      description:
        "Your name, email address, profile picture and preferences, when the account was created, and whether your email address is verified.",
      load: async () => (await q.profile)[0] ?? null,
    },
    {
      kind: "json",
      path: "sign-in-methods.json",
      title: "Sign-in methods",
      description:
        "Google and GitHub accounts linked for signing in, with the permissions granted. Email codes need no linked account. Sign-in tokens are not included.",
      load: () => q.signInMethods,
    },
    {
      kind: "json",
      path: "sessions.json",
      title: "Sessions",
      description:
        "Your signed-in sessions: when each started and was last used, and the browser (user agent) and IP address it came from.",
      load: () => q.sessions,
    },
    {
      kind: "json",
      path: "codes.json",
      title: "Dynamic codes",
      description:
        "Every dynamic code you created: short link (slug), destination and fallback URLs, title, notes, design, folder, routing rules, UTM and pixel settings, schedule and scan limit. A code's password is never exported, only whether it has one. team_id is set for codes in a team.",
      load: () => q.codes,
    },
    {
      kind: "json",
      path: "code-tags.json",
      title: "Code tags",
      description: "Which tag (tags.json) is on which code (codes.json).",
      load: () => q.codeTags,
    },
    {
      kind: "json",
      path: "code-history.json",
      title: "Code edit history",
      description:
        "Earlier versions of your codes (destination, lifecycle, routing and design), oldest first.",
      load: () => q.codeVersions,
    },
    {
      kind: "csv",
      path: "scans.csv",
      title: "Scans",
      description:
        "One row per scan of your codes: time, approximate location (country, region, city), device, OS, browser, referring site, language and A/B variant. visitor_hash is a salted one-way hash that counts unique visitors per day; scanner IP addresses are never stored.",
      columns: SCAN_COLUMNS,
      pages: scanPages,
      maxRows: MAX_SCAN_ROWS,
      truncatedNote: `Only the first ${MAX_SCAN_ROWS.toLocaleString("en")} scans are in this file (oldest first, code by code). scans-daily.csv counts every scan; the code's Analytics page exports the rest as CSV.`,
    },
    {
      kind: "csv",
      path: "scans-daily.csv",
      title: "Scans per day",
      description: "Scans of each of your codes per day (UTC), every scan.",
      columns: ["code_id", "day", "scans"],
      pages: scansDailyPages,
      maxRows: Number.MAX_SAFE_INTEGER,
    },
    {
      kind: "json",
      path: "conversions.json",
      title: "Conversions",
      description:
        "Conversions (sign-ups, purchases, ...) reported for your codes through the API.",
      load: () => q.conversions,
    },
    {
      kind: "json",
      path: "pages.json",
      title: "Hosted pages",
      description:
        "Every hosted page you created, with its full content (blocks, text, links, form questions).",
      load: () => q.pages,
    },
    {
      kind: "json",
      path: "page-history.json",
      title: "Page edit history",
      description: "Earlier versions of your hosted pages, oldest first.",
      load: () => q.pageVersions,
    },
    {
      kind: "csv",
      path: "form-responses.csv",
      title: "Form responses",
      description:
        "Answers visitors submitted through forms on your hosted pages. answers holds each question and answer as JSON.",
      columns: FORM_RESPONSE_COLUMNS,
      pages: formResponsePages,
      maxRows: MAX_FORM_RESPONSE_ROWS,
      truncatedNote: `Only the first ${MAX_FORM_RESPONSE_ROWS.toLocaleString("en")} responses are in this file. Export the rest per page under Pages → Responses.`,
    },
    {
      kind: "json",
      path: "themes.json",
      title: "Themes",
      description: "Your saved QR themes (colors, patterns, logo settings).",
      load: () => q.themes,
    },
    {
      kind: "json",
      path: "brand-kits.json",
      title: "Brand kits",
      description: "Brand kits you created, with their logo and palette.",
      load: () => q.brandKits,
    },
    {
      kind: "json",
      path: "community.json",
      title: "Community",
      description:
        "Themes you published to the community gallery, and themes you liked.",
      load: async () => ({
        published: await q.communityThemes,
        liked: await q.themeLikes,
      }),
    },
    {
      kind: "json",
      path: "folders.json",
      title: "Folders",
      description: "Folders you created for codes.",
      load: () => q.folders,
    },
    {
      kind: "json",
      path: "tags.json",
      title: "Tags",
      description: "Tags you created for codes.",
      load: () => q.tags,
    },
    {
      kind: "json",
      path: "files.json",
      title: "Files",
      description:
        "Files you uploaded: name, type, size and SHA-256 checksum. The files themselves are not in this archive.",
      load: () => q.files,
    },
    {
      kind: "json",
      path: "domains.json",
      title: "Custom domains",
      description: "Custom domains you added for short links.",
      load: () => q.domains,
    },
    {
      kind: "json",
      path: "webhooks.json",
      title: "Webhooks",
      description:
        "Webhook endpoints you added and the events they receive. Signing secrets are not included.",
      load: () => q.webhooks,
    },
    {
      kind: "json",
      path: "notifications.json",
      title: "Notification settings",
      description:
        "Which alerts and digests you get, per workspace. Email addresses are included; Slack and Discord webhook URLs are not, as they work like passwords.",
      load: () => q.notificationSettings,
    },
    {
      kind: "json",
      path: "developer-apps.json",
      title: "Developer apps",
      description:
        "OAuth apps you registered under Settings → Developers. Client secrets are not included.",
      load: () => q.oauthApps,
    },
    {
      kind: "json",
      path: "authorized-apps.json",
      title: "Authorized apps",
      description:
        "Apps you allowed to use your account, with what they can do and when they last used it. Their tokens are not included.",
      load: async () =>
        (await listAuthorizedApps(userId)).map((app) => ({
          name: app.name,
          builtBy: app.builtBy,
          firstParty: app.firstParty,
          verified: app.verified,
          scopes: app.scopes,
          authorizedAt: app.authorizedAt,
          lastActiveAt: app.lastActiveAt,
        })),
    },
    {
      kind: "json",
      path: "integrations.json",
      title: "Integrations",
      description:
        "Services you connected (provider, status, permissions, dates). Credentials and tokens are never included.",
      load: () => q.integrations,
    },
    {
      kind: "json",
      path: "teams.json",
      title: "Teams",
      description:
        "Teams you belong to, your role in each and when you joined.",
      load: () => q.teams,
    },
    {
      kind: "json",
      path: "billing.json",
      title: "Subscription",
      description:
        "Your QRdx subscriptions and their status. Invoices and payment details are kept by Polar, our payment provider.",
      load: () => q.subscriptions,
    },
    {
      kind: "json",
      path: "ai-usage.json",
      title: "AI usage",
      description: "AI theme and art requests: model, token counts and time.",
      load: () => q.aiUsage,
    },
  ];
}
