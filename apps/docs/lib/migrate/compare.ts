// "Move from <competitor>" on the compare pages: where the button points and
// the three steps. Client-safe. Steps stay within what the providers'
// help docs say (see lib/migrate/providers.ts for the sources' wording).

import { dashboardEntry } from "@/lib/workspace-paths";
import { API_PROVIDERS, FILE_PROVIDERS, type ProviderId } from "./providers";

export interface CompareMigration {
  kind: "api" | "file" | "static" | "library";
  /** Button target */
  href: string;
  label: string;
  steps: [string, string, string];
  /** Whether printed codes keep working, in one or two sentences */
  printed: string;
}

const importHref = (provider: ProviderId) =>
  dashboardEntry("codes", { import: provider });

function api(provider: "bitly", printed: string): CompareMigration {
  const { name } = API_PROVIDERS[provider];
  return {
    kind: "api",
    href: importHref(provider),
    label: `Move from ${name} to QRdx`,
    steps: [
      `Connect your ${name} account from Dashboard → Codes → Import.`,
      "Pick links and preview: links already imported or with an existing QRdx code are skipped.",
      "Import. Each link becomes a dynamic code with its title, tags, old link and original date in its notes.",
    ],
    printed,
  };
}

function file(
  provider: ProviderId,
  name: string,
  exportStep: string,
): CompareMigration {
  return {
    kind: "file",
    href: importHref(provider),
    label: `Move from ${name} to QRdx`,
    steps: [
      exportStep,
      "Upload the CSV to Dashboard → Codes → Import and check the column mapping.",
      "Preview and import. Download the mapping CSV of old link → new QRdx link.",
    ],
    printed: `${name} codes live on ${name}'s own domain, so QRdx can't change them: re-point each one to its new QRdx link (the mapping CSV lists them) and keep that account active until you reprint.`,
  };
}

function exportAsCsv(provider: ProviderId, name: string) {
  return file(provider, name, `Export your codes as CSV from ${name}.`);
}

function staticOnly(name: string): CompareMigration {
  return {
    kind: "static",
    href: importHref("csv"),
    label: "Make them dynamic in QRdx",
    steps: [
      "List the destinations of the codes you want to track in a spreadsheet and save it as CSV.",
      "Upload it to Dashboard → Codes → Import and check the columns.",
      "Preview and import: each row becomes an editable, tracked dynamic code.",
    ],
    printed: `${name} codes are static: they encode the destination itself and keep working without ${name}. Only new prints get QRdx's editing and scan analytics.`,
  };
}

function library(anchor: string, name: string): CompareMigration {
  return {
    kind: "library",
    href: `/docs/migrate#${anchor}`,
    label: "Switch guide",
    steps: [
      "Install qrdx: npm install qrdx.",
      `Replace the ${name} call with <QRCodeSVG value="…" /> and map your options (colors, patterns, logo).`,
      "Remove the old package. Codes already printed are static and keep working.",
    ],
    printed:
      "Nothing to migrate in a database: a library renders static codes, so every printed code keeps working.",
  };
}

const UNIQODE = FILE_PROVIDERS.uniqode.exportSteps[0] as string;
const QR_TIGER = FILE_PROVIDERS["qr-tiger"].exportSteps[0] as string;

// Dub has no compare page or import: it's a partner, with an integration.
export const COMPARE_MIGRATIONS: Record<string, CompareMigration> = {
  "bitly-qr": api(
    "bitly",
    "Printed codes can keep working: QRdx points each old Bitly link at its new code where your Bitly plan allows link redirects (5 a month on Core, more on higher plans; none on Free). Otherwise keep the Bitly links live until you reprint.",
  ),
  uniqode: file("uniqode", "Uniqode", UNIQODE),
  "qr-tiger": file("qr-tiger", "QR TIGER", QR_TIGER),
  "qr-code-generator-pro": file(
    "qr-code-generator-pro",
    "QR Code Generator PRO",
    "QR Code Generator PRO doesn't document a code-list export: list Name, Short URL and Destination URL for each code in a spreadsheet.",
  ),
  flowcode: file(
    "flowcode",
    "Flowcode",
    "Flowcode doesn't document a code-list export: reuse your bulk-create sheet, or list Name, Scan URL and Destination for each code.",
  ),
  "me-qr": file(
    "me-qr",
    "ME-QR",
    "ME-QR has no export: list Name, QR link and Destination URL for each code in a spreadsheet.",
  ),
  // Static types keep working; link and file codes go through its short links.
  "qrcode-ai": {
    ...file(
      "csv",
      "QR Code AI",
      "QR Code AI's public pages don't mention a code-list export: list Name, Short link and Destination URL for each code in a spreadsheet.",
    ),
    printed:
      "Wi-Fi, vCard and other static codes keep working without QR Code AI. Link, PDF and other dynamic codes go through its short links, which its FAQ says need Premium to stay active after the free trial: re-point each one to its new QRdx link (the mapping CSV lists them) and keep that account active until you reprint.",
  },
  // Neither advertises a code-list export (Pageloot's CSV export is scan
  // data), and both say codes stop on some plans, so the printed note says
  // when to keep the account.
  myqrcode: {
    ...file(
      "csv",
      "MyQRCode",
      "MyQRCode doesn't advertise a code-list export: list Name, QR link and Destination URL for each code in a spreadsheet.",
    ),
    printed:
      "MyQRCode's dynamic codes redirect through MyQRCode, so QRdx can't change them. Its terms say that when the trial ends without an upgrade, dynamic codes \"will no longer be scannable\", so keep a paid MyQRCode plan until you reprint.",
  },
  pageloot: {
    ...file(
      "csv",
      "Pageloot",
      "Pageloot doesn't advertise a code-list export (its CSV export is scan data): list Name, short link and Destination URL for each code in a spreadsheet.",
    ),
    printed:
      "Pageloot's dynamic codes redirect through Pageloot, so QRdx can't change them. For subscriptions, its pricing FAQ says codes \"will become inactive after your plan has expired\", so keep the plan until you reprint.",
  },
  hovercode: exportAsCsv("hovercode", "Hovercode"),
  scanova: exportAsCsv("scanova", "Scanova"),
  qrfy: exportAsCsv("csv", "QRFY"),
  "qr-code-chimp": exportAsCsv("csv", "QR Code Chimp"),
  "qr-verse": exportAsCsv("csv", "QR-Verse"),
  "qr-code-io": exportAsCsv("csv", "QR Code.io"),
  qrstuff: exportAsCsv("csv", "QRStuff"),
  "canva-qr": exportAsCsv("csv", "Canva"),
  "adobe-express": staticOnly("Adobe Express"),
  goqr: staticOnly("goQR.me"),
  // Mostly static codes, but some open a page or file LatestQR hosts.
  latestqr: {
    ...staticOnly("LatestQR"),
    printed:
      "Codes that encode your own link, Wi-Fi or payment details are static and keep working without LatestQR. Codes that open a page or file hosted on LatestQR depend on that copy staying online, so rebuild those in QRdx before you reprint.",
  },
  "qr-code-monkey": staticOnly("QR Code Monkey"),
  "qr-code-styling": library("from-qr-code-styling", "qr-code-styling"),
  "qrcode-react": library("from-qrcode-react", "qrcode.react"),
};

/** Every compare page gets a guide; unknown slugs fall back to the CSV import. */
export function compareMigration(slug: string, competitor: string) {
  return COMPARE_MIGRATIONS[slug] ?? exportAsCsv("csv", competitor);
}
