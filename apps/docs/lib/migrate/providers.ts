// Providers QRdx can import dynamic codes and short links from. Client-safe:
// the import dialog, the API routes, the docs and the compare pages read it.

export const API_PROVIDER_IDS = [
  "dub",
  "bitly",
  "rebrandly",
  "short-io",
] as const;
export type ApiProviderId = (typeof API_PROVIDER_IDS)[number];

export const FILE_PROVIDER_IDS = [
  "qr-code-generator-pro",
  "uniqode",
  "flowcode",
  "qr-tiger",
  "me-qr",
  "tinyurl",
  "hovercode",
  "scanova",
  "csv",
] as const;
export type FileProviderId = (typeof FILE_PROVIDER_IDS)[number];

export type ProviderId = ApiProviderId | FileProviderId;

export interface ApiProviderCapabilities {
  /** Server-side search by title, link or destination */
  search: boolean;
  /** Filter the list by short-link domain */
  domainFilter: boolean;
  /** Filter the list by tag */
  tagFilter: boolean;
  /** Click counts come with the list */
  clicks: boolean;
  /** Old links can be pointed at their new QRdx links (and back, for undo) */
  updateDestination: boolean;
}

export interface ApiProvider {
  id: ApiProviderId;
  kind: "api";
  name: string;
  /** Slug of the integration that holds the encrypted token */
  integration: string;
  connect: "oauth" | "api_key";
  website: string;
  logo: string | null;
  /** Shared domains no customer owns, so their back-halves can't move */
  sharedDomains: string[];
  capabilities: ApiProviderCapabilities;
  /** Plan limits on editing destinations, in plain words */
  redirectLimits: string;
}

export interface FileProvider {
  id: FileProviderId;
  kind: "file";
  name: string;
  website: string | null;
  logo: string | null;
  /** How sure we are of the export (from the provider's help docs) */
  export: "documented" | "unverified" | "none";
  /** Where to get a file of codes, step by step */
  exportSteps: string[];
  /** How to point one old code at its new QRdx link */
  repointSteps: string[];
  /** Extra truth about old codes after the move */
  keepWorkingNote: string;
}

export type Provider = ApiProvider | FileProvider;

export const API_PROVIDERS: Record<ApiProviderId, ApiProvider> = {
  dub: {
    id: "dub",
    kind: "api",
    name: "Dub",
    integration: "dub",
    connect: "oauth",
    website: "https://dub.co",
    logo: "/integrations/dub-icon.svg",
    sharedDomains: ["dub.sh", "dub.link", "dub.co", "chatg.pt", "git.new"],
    capabilities: {
      search: true,
      domainFilter: true,
      tagFilter: false,
      clicks: true,
      updateDestination: true,
    },
    redirectLimits:
      "Dub lets you edit a link's destination on every plan, so all selected links can be updated.",
  },
  bitly: {
    id: "bitly",
    kind: "api",
    name: "Bitly",
    integration: "bitly",
    connect: "oauth",
    website: "https://bitly.com",
    logo: "/compare/bitly-qr.svg",
    sharedDomains: ["bit.ly", "j.mp", "bitly.is"],
    capabilities: {
      search: true,
      domainFilter: false,
      tagFilter: true,
      clicks: false,
      updateDestination: true,
    },
    redirectLimits:
      "Bitly counts each destination change as a link redirect: none on Free, 5 a month on Core, 20 on Growth and 110 on Premium. Links past your allowance are left unchanged.",
  },
  rebrandly: {
    id: "rebrandly",
    kind: "api",
    name: "Rebrandly",
    integration: "rebrandly",
    connect: "api_key",
    website: "https://www.rebrandly.com",
    logo: null,
    sharedDomains: ["rebrand.ly", "rb.gy"],
    capabilities: {
      search: false,
      domainFilter: true,
      tagFilter: false,
      clicks: true,
      updateDestination: true,
    },
    redirectLimits:
      "Rebrandly limits destination edits per month: none on Free, 10 on Essentials, 50 on Professional and 150 on Growth. Links past your allowance are left unchanged.",
  },
  "short-io": {
    id: "short-io",
    kind: "api",
    name: "Short.io",
    integration: "short-io",
    connect: "api_key",
    website: "https://short.io",
    logo: null,
    sharedDomains: ["short.gy", "shorturl.at"],
    capabilities: {
      search: false,
      domainFilter: true,
      tagFilter: true,
      clicks: false,
      updateDestination: true,
    },
    redirectLimits:
      "Short.io lets you edit destinations on every plan, so all selected links can be updated.",
  },
};

const SPREADSHEET_TIP =
  "Opened it in Excel or Google Sheets? Save or download it as CSV (comma-separated) before you upload.";

export const FILE_PROVIDERS: Record<FileProviderId, FileProvider> = {
  "qr-code-generator-pro": {
    id: "qr-code-generator-pro",
    kind: "file",
    name: "QR Code Generator PRO",
    website: "https://www.qr-code-generator.com",
    logo: null,
    export: "none",
    exportSteps: [
      "QR Code Generator PRO doesn't document an export of your code list. Make a spreadsheet with one row per code: Name, Short URL and Destination URL (copy them from the code details in your dashboard).",
      SPREADSHEET_TIP,
    ],
    repointSteps: [
      "Open the code in your QR Code Generator PRO dashboard, go to Details and click Edit.",
      "Replace the content URL with the code's new QRdx link and click Save changes.",
      "Many codes at once: select up to 500 codes (or a folder) and use the bulk update with a CSV of new URLs. The mapping CSV below has the new link for each old one.",
    ],
    keepWorkingNote:
      "Old codes only redirect while your QR Code Generator PRO subscription is active. Re-pointing them sends scans through QRdx now; reprint with the QRdx codes before you cancel.",
  },
  uniqode: {
    id: "uniqode",
    kind: "file",
    name: "Uniqode",
    website: "https://www.uniqode.com",
    logo: "/compare/uniqode.svg",
    export: "documented",
    exportSteps: [
      "In Uniqode, open QR Codes → Dynamic, select all codes, open the ⋯ menu and choose Export.",
      "Export runs per organization or folder, so repeat it for each one.",
      SPREADSHEET_TIP,
    ],
    repointSteps: [
      "Open the code in Uniqode and click Edit.",
      "Replace the website URL with the code's new QRdx link, click Next, then Save.",
    ],
    keepWorkingNote:
      "Old Uniqode (Beaconstac) codes only redirect while your Uniqode plan is active. Re-pointing them sends scans through QRdx now; reprint with the QRdx codes before you cancel.",
  },
  flowcode: {
    id: "flowcode",
    kind: "file",
    name: "Flowcode",
    website: "https://www.flowcode.com",
    logo: "/compare/flowcode.svg",
    export: "none",
    exportSteps: [
      "Flowcode doesn't document an export of your code list (its analytics export is scan data). If you created codes in bulk, reuse that spreadsheet; otherwise list Name, Scan URL and Destination for each code.",
      SPREADSHEET_TIP,
    ],
    repointSteps: [
      "In Flowcode, open Assets and pick the code.",
      "On the Overview tab, change the Destination to the code's new QRdx link and click Save.",
    ],
    keepWorkingNote:
      "Old Flowcodes only redirect while your Flowcode account keeps them active. Re-pointing them sends scans through QRdx now; reprint with the QRdx codes over time.",
  },
  "qr-tiger": {
    id: "qr-tiger",
    kind: "file",
    name: "QR TIGER",
    website: "https://www.qrcode-tiger.com",
    logo: "/compare/qr-tiger.svg",
    export: "documented",
    exportSteps: [
      "In QR TIGER, open the My Account menu, pick a QR category (for example URL) and click Download QR List.",
      "The list is per category, so repeat it for each category you use.",
      SPREADSHEET_TIP,
    ],
    repointSteps: [
      "In QR TIGER, go to My Account → Dashboard → URL and open the campaign.",
      "Click Edit, replace the URL with the code's new QRdx link and click Save.",
    ],
    keepWorkingNote:
      "Old QR TIGER codes only redirect while your QR TIGER plan keeps them active. Re-pointing them sends scans through QRdx now; reprint with the QRdx codes over time.",
  },
  "me-qr": {
    id: "me-qr",
    kind: "file",
    name: "ME-QR",
    website: "https://me-qr.com",
    logo: "/compare/me-qr.svg",
    export: "none",
    exportSteps: [
      "ME-QR doesn't offer an export of your code list. Make a spreadsheet with Name, QR link and Destination URL for each code from your ME-QR account.",
      SPREADSHEET_TIP,
    ],
    repointSteps: [
      "In your ME-QR account, open your QR codes list and edit the code.",
      "Replace its link with the code's new QRdx link and save.",
    ],
    keepWorkingNote:
      "Old ME-QR codes keep their ME-QR redirect (and any ads ME-QR shows). Re-pointing them sends scans through QRdx; reprint with the QRdx codes to drop ME-QR entirely.",
  },
  tinyurl: {
    id: "tinyurl",
    kind: "file",
    name: "TinyURL",
    website: "https://tinyurl.com",
    logo: null,
    export: "unverified",
    exportSteps: [
      "TinyURL lists CSV export as a paid-plan feature. Export your links as CSV from your TinyURL dashboard.",
      "No export on your plan? Make a spreadsheet with Alias (or TinyURL) and Long URL for each link.",
    ],
    repointSteps: [
      "In your TinyURL dashboard, open the link and edit its destination (a paid TinyURL plan is needed to edit destinations).",
      "Replace the long URL with the link's new QRdx link and save.",
    ],
    keepWorkingNote:
      "Old TinyURL links keep redirecting through TinyURL. Re-pointing them needs a paid TinyURL plan; reprint with the QRdx links over time.",
  },
  hovercode: {
    id: "hovercode",
    kind: "file",
    name: "Hovercode",
    website: "https://hovercode.com",
    logo: null,
    export: "unverified",
    exportSteps: [
      "Hovercode lists CSV exports on its Business plans. Export your codes as CSV from Hovercode.",
      "No export on your plan? Make a spreadsheet with Name, Short link and Destination for each code.",
    ],
    repointSteps: [
      "Open the code in Hovercode and edit its destination.",
      "Replace it with the code's new QRdx link and save.",
    ],
    keepWorkingNote:
      "Hovercode keeps its first 3 codes live on Free; others stop when a paid plan ends. Re-point them now and reprint with the QRdx codes over time.",
  },
  scanova: {
    id: "scanova",
    kind: "file",
    name: "Scanova",
    website: "https://scanova.io",
    logo: null,
    export: "unverified",
    exportSteps: [
      "Export your codes as CSV from Scanova (it emails a download link that works for 24 hours).",
      "If the file has no destination column, add one before you upload.",
    ],
    repointSteps: [
      "Open the code in Scanova and edit its content.",
      "Replace the URL with the code's new QRdx link and save.",
    ],
    keepWorkingNote:
      "Scanova's dynamic codes stop working when the plan ends. Re-point them now and reprint with the QRdx codes before you cancel.",
  },
  csv: {
    id: "csv",
    kind: "file",
    name: "Another provider (CSV)",
    website: null,
    logo: null,
    export: "unverified",
    exportSteps: [
      "Export your codes or links as CSV from your current provider, or make a spreadsheet with one row per code: name, old short link and destination URL.",
      SPREADSHEET_TIP,
    ],
    repointSteps: [
      "In your old provider, open each dynamic code and edit its destination.",
      "Replace it with the code's new QRdx link and save.",
    ],
    keepWorkingNote:
      "Old dynamic codes live on your old provider's domain, so they only keep working while that account keeps them active. Re-point them now and reprint with the QRdx codes over time.",
  },
};

export function isApiProviderId(value: string): value is ApiProviderId {
  return (API_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isFileProviderId(value: string): value is FileProviderId {
  return (FILE_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isProviderId(value: string): value is ProviderId {
  return isApiProviderId(value) || isFileProviderId(value);
}

export function getProvider(id: ProviderId): Provider {
  return isApiProviderId(id) ? API_PROVIDERS[id] : FILE_PROVIDERS[id];
}

/** The name used in notes and folder names ("Imported from Bitly"). */
export function providerName(id: ProviderId): string {
  return id === "csv" ? "CSV" : getProvider(id).name;
}

export const defaultFolderName = (id: ProviderId) =>
  `Imported from ${providerName(id)}`;

/** `?import=<value>` → provider (accepts a few aliases, e.g. compare slugs). */
const ALIASES: Record<string, ProviderId> = {
  "bitly-qr": "bitly",
  shortio: "short-io",
  "short.io": "short-io",
  beaconstac: "uniqode",
  qrcodegenerator: "qr-code-generator-pro",
  "qr-code-generator": "qr-code-generator-pro",
  qrtiger: "qr-tiger",
  meqr: "me-qr",
  file: "csv",
};

export function parseProviderParam(value: string | null | undefined) {
  const key = value?.trim().toLowerCase();
  if (!key) return null;
  if (isProviderId(key)) return key;
  return ALIASES[key] ?? null;
}
