import type {
  LinkCheckResult,
  LinkFinding,
  QrdxCodeInfo,
} from "@/components/scanner/link-check";
import {
  analyzeUrl,
  toDisplayHostname,
  URL_SIGNAL_LABELS,
  type UrlSignal,
} from "@/lib/safety/url-heuristics";
import type { WebRiskResult, WebRiskThreat } from "@/lib/safety/web-risk";
import type { ChainResult, ChainStop } from "./resolve";

const SIGNAL_SEVERITY: Record<UrlSignal, LinkFinding["severity"]> = {
  invalid: "danger",
  "dangerous-scheme": "danger",
  credentials: "danger",
  homoglyph: "danger",
  "ip-address": "warning",
  "private-network": "warning",
  "non-http": "info",
  shortener: "info",
};

const THREAT_MESSAGES: Record<WebRiskThreat, string> = {
  MALWARE: "Google Web Risk lists this site for spreading malware.",
  SOCIAL_ENGINEERING:
    "Google Web Risk lists this site for phishing or scams (social engineering).",
  UNWANTED_SOFTWARE: "Google Web Risk lists this site for unwanted software.",
};

const STOP_MESSAGES: Partial<Record<ChainStop, string>> = {
  "too-many-redirects":
    "This link passes through more redirects than we follow (5), so we couldn't see where it ends. Long redirect chains are common in scams.",
  loop: "This link redirects in a loop and never reaches a page.",
  timeout:
    "The website took too long to answer, so we couldn't see where the link ends up.",
  dns: "This website's address doesn't exist (the domain doesn't resolve).",
  tls: "The website's security certificate isn't valid. Your browser will likely warn you too.",
  network: "We couldn't connect to this website.",
  "blocked-address":
    "This link points to a private or local network address, which QRdx doesn't open from its servers.",
  "private-address":
    "This link points to a private or local network address, which QRdx doesn't open from its servers.",
  port: "This link uses an unusual port, so we didn't follow it.",
  "bad-location": "The website sent an invalid redirect.",
};

// Brand names often faked in phishing links, with the domains they really use.
const BRANDS: Record<string, string[]> = {
  amazon: ["amazon"],
  apple: ["apple", "icloud"],
  binance: ["binance"],
  chase: ["chase"],
  coinbase: ["coinbase"],
  dhl: ["dhl"],
  facebook: ["facebook", "fb"],
  fedex: ["fedex"],
  google: ["google", "youtube", "goo"],
  hsbc: ["hsbc"],
  icloud: ["icloud", "apple"],
  instagram: ["instagram"],
  linkedin: ["linkedin", "lnkd"],
  metamask: ["metamask"],
  microsoft: ["microsoft", "live", "office", "outlook", "microsoftonline"],
  netflix: ["netflix"],
  paypal: ["paypal"],
  usps: ["usps"],
  wellsfargo: ["wellsfargo"],
  whatsapp: ["whatsapp", "wa"],
};

const RISKY_DOWNLOADS =
  /\.(apk|xapk|exe|msi|scr|bat|cmd|ps1|vbs|jar|dmg|pkg|iso|mobileconfig)$/i;

/** "evil.example.co.uk" → "example" (good enough without the full PSL). */
function registrableLabel(hostname: string): string {
  const labels = hostname.split(".");
  const tld = labels.at(-1) ?? "";
  const second = labels.at(-2) ?? "";
  const isCountrySecondLevel =
    tld.length === 2 &&
    labels.length >= 3 &&
    /^(co|com|net|org|gov|edu|ac|or|ne|go)$/.test(second);
  return (isCountrySecondLevel ? labels.at(-3) : second) ?? "";
}

function brandImpersonation(hostname: string): string | null {
  const owner = registrableLabel(hostname);
  const tokens = hostname.split(/[.-]/);
  for (const [brand, domains] of Object.entries(BRANDS)) {
    if (tokens.includes(brand) && !domains.includes(owner)) return brand;
  }
  return null;
}

function hostLabel(hostname: string): string {
  const display = toDisplayHostname(hostname);
  return display === hostname ? hostname : `${display} (${hostname})`;
}

function qrdxFindings(qrdx: QrdxCodeInfo): LinkFinding[] {
  const findings: LinkFinding[] = [];
  switch (qrdx.status) {
    case "password":
      findings.push({
        severity: "info",
        code: "qrdx-password",
        message:
          "This QRdx code is password-protected, so its destination stays hidden until you enter the password.",
      });
      break;
    case "ended":
      findings.push({
        severity: "info",
        code: "qrdx-ended",
        message:
          "This campaign has ended, so the code now goes to the owner's fallback page or shows an 'ended' notice.",
      });
      break;
    case "inactive":
      findings.push({
        severity: "warning",
        code: "qrdx-inactive",
        message: "This QRdx code has been turned off and won't open a page.",
      });
      break;
    case "not-found":
      findings.push({
        severity: "warning",
        code: "qrdx-not-found",
        message: "This QRdx link doesn't belong to any QR code.",
      });
      break;
    case "active":
      break;
  }
  if (qrdx.hasRules && qrdx.status === "active") {
    findings.push({
      severity: "info",
      code: "qrdx-rules",
      message:
        "Where this code goes can depend on your device, location, language or the time. This is its default destination.",
    });
  }
  return findings;
}

export interface ReportInput {
  url: string;
  chain: ChainResult;
  qrdx: QrdxCodeInfo | null;
  /** Web Risk result per URL checked; null when no key is configured. */
  webRisk: Map<string, WebRiskResult> | null;
}

export function buildReport({
  url,
  chain,
  qrdx,
  webRisk,
}: ReportInput): LinkCheckResult {
  const findings: LinkFinding[] = [];
  const add = (finding: LinkFinding) => {
    if (
      !findings.some(
        (item) =>
          item.code === finding.code && item.message === finding.message,
      )
    ) {
      findings.push(finding);
    }
  };

  // Web Risk first: it is the strongest signal.
  const threats = new Set<WebRiskThreat>();
  for (const result of webRisk?.values() ?? []) {
    if (result.status === "threat") {
      for (const threat of result.threats) threats.add(threat);
    }
  }
  for (const threat of threats) {
    add({
      severity: "danger",
      code: `web-risk-${threat}`,
      message: THREAT_MESSAGES[threat],
    });
  }

  let previous: URL | null = null;
  for (const hop of chain.hops) {
    const analysis = analyzeUrl(hop.url);
    const host = analysis.hostname ? hostLabel(analysis.hostname) : null;
    for (const signal of analysis.signals) {
      add({
        severity: SIGNAL_SEVERITY[signal],
        code: signal,
        message: host
          ? `${URL_SIGNAL_LABELS[signal]}: ${host}.`
          : `${URL_SIGNAL_LABELS[signal]}.`,
      });
    }
    const parsed = analysis.url;
    if (parsed && analysis.hostname) {
      const brand = brandImpersonation(analysis.hostname);
      if (brand) {
        add({
          severity: "warning",
          code: "brand",
          message: `The address mentions "${brand}" but isn't on ${brand}'s own domain: ${hostLabel(analysis.hostname)}.`,
        });
      }
      if (/\.(zip|mov)$/.test(analysis.hostname)) {
        add({
          severity: "warning",
          code: "file-like-domain",
          message: `The domain ${analysis.hostname} looks like a file name.`,
        });
      }
      if (previous?.protocol === "https:" && parsed.protocol === "http:") {
        add({
          severity: "warning",
          code: "downgrade",
          message:
            "The link switches from a secure (https) to an insecure (http) connection on the way.",
        });
      }
    }
    previous = parsed;
  }

  const redirects = chain.hops.length - 1;
  if (redirects >= 3) {
    add({
      severity: "info",
      code: "redirects",
      message: `This link passes through ${redirects} redirects before the final page.`,
    });
  }

  // A private address is already explained by the "private-network" signal.
  const explained =
    chain.stop === "private-address" &&
    findings.some((finding) => finding.code === "private-network");
  if (chain.stop && !explained) {
    const message = STOP_MESSAGES[chain.stop];
    if (message)
      add({ severity: "warning", code: `stop-${chain.stop}`, message });
  }

  const finalUrl = chain.hidden ? null : chain.finalUrl;
  if (finalUrl && chain.complete) {
    try {
      const final = new URL(finalUrl);
      if (final.protocol === "http:") {
        add({
          severity: "warning",
          code: "insecure",
          message:
            "The final page isn't encrypted (http, not https). Don't enter passwords or payment details there.",
        });
      }
      if (RISKY_DOWNLOADS.test(final.pathname)) {
        add({
          severity: "warning",
          code: "download",
          message:
            "This link downloads a file that can install software. Only open it if you trust the source.",
        });
      }
    } catch {
      // analyzeUrl already reported an invalid URL.
    }
  }
  if (chain.finalStatus !== null && chain.finalStatus >= 400) {
    add({
      severity: "info",
      code: "http-error",
      message: `The final page answered with an error (HTTP ${chain.finalStatus}).`,
    });
  }

  if (qrdx) {
    for (const finding of qrdxFindings(qrdx)) add(finding);
  }

  const hasDanger = findings.some((finding) => finding.severity === "danger");
  const hasWarning = findings.some((finding) => finding.severity === "warning");
  const verdict = hasDanger
    ? "danger"
    : qrdx?.verified
      ? "verified"
      : hasWarning
        ? "caution"
        : "ok";

  const statuses = webRisk
    ? [...webRisk.values()].map((result) => result.status)
    : [];
  return {
    url,
    finalUrl,
    hops: chain.hops,
    complete: chain.complete,
    verdict,
    findings: findings.sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    ),
    webRisk: !webRisk
      ? "not-configured"
      : statuses.length === 0
        ? "not-checked"
        : statuses.includes("threat")
          ? "threat"
          : statuses.every((status) => status === "safe")
            ? "clean"
            : "unavailable",
    qrdx,
  };
}

const SEVERITY_ORDER: Record<LinkFinding["severity"], number> = {
  danger: 0,
  warning: 1,
  info: 2,
};
