// Friendly checks for the URL field: hard errors for things that can't be a
// web address, a soft warning for an unusual domain ending (likely a typo).

export type UrlCheck =
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "warning"; message: string; url: string; host: string }
  | { status: "ok"; url: string; host: string };

// Common generic endings. Every two-letter country ending is accepted too.
const COMMON_TLDS = new Set(
  (
    "com net org edu gov mil int info biz name pro mobi app dev io ai co me tv " +
    "xyz online site store shop tech blog cloud design page link live news " +
    "world today life space website agency studio digital media email team " +
    "tools works finance money health club art fun games global group guru " +
    "love ltd network one plus solutions systems services social support " +
    "academy africa asia bank band bar beauty bike bio blue build business " +
    "cafe camp capital care careers cash center chat city clinic coach codes " +
    "coffee college community company computer consulting cool dental " +
    "directory education energy engineering estate events exchange expert " +
    "express family farm fashion film fit fitness flowers food football " +
    "foundation gallery garden gift gold golf graphics green guide help " +
    "holdings home host hotel house how institute insure international " +
    "jobs kitchen land law lawyer legal limited loan market marketing mba " +
    "menu moda moe nyc paris partners party photo photography photos pics " +
    "pizza place plumbing press productions properties pub realty recipes " +
    "red rentals repair report rest restaurant run sale salon school science " +
    "security shoes show ski software solar style surf tax taxi tickets tips " +
    "tours town toys training travel university vet video vip vision wiki " +
    "wine work yoga zone gay lgbt eco app page new now mov zip foo gle goog " +
    "google amazon apple microsoft hiphop london berlin tokyo"
  ).split(/\s+/),
);

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i;

/** A real scheme ("https://", "mailto:"), not a host with a port ("example.com:8080"). */
function hasScheme(value: string): boolean {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return true;
  return (
    /^[a-z][a-z\d+.-]*:/i.test(value) && !/^[^:/?#]+:\d+(?:[/?#]|$)/.test(value)
  );
}

/** Adds https:// when the scheme is missing, as browsers do. */
export function withScheme(raw: string): string {
  const value = raw.trim();
  return hasScheme(value) ? value : `https://${value}`;
}

/**
 * The address as it should be encoded: punycode host (from URL), and no
 * trailing slash added to a bare domain the user typed without one.
 */
function toPayload(url: URL, typed: string): string {
  const bareOrigin =
    url.pathname === "/" &&
    !url.search &&
    !url.hash &&
    !/^[a-z][a-z\d+.-]*:\/\/[^/]*\/$/i.test(typed);
  return bareOrigin ? url.href.replace(/\/$/, "") : url.href;
}

export function checkUrl(raw: string): UrlCheck {
  const value = raw.trim();
  if (!value) return { status: "empty" };
  if (/\s/.test(value)) {
    return { status: "error", message: "Web addresses can't contain spaces." };
  }

  let url: URL;
  try {
    url = new URL(withScheme(value));
  } catch {
    return {
      status: "error",
      message: "This doesn't look like a web address.",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      status: "error",
      message: `Links must start with https:// (this one uses ${url.protocol}).`,
    };
  }

  const host = url.hostname.toLowerCase();
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
  if (!isIp && host !== "localhost") {
    const labels = host.split(".");
    if (labels.length < 2 || !labels.at(-1)) {
      return {
        status: "error",
        message: "Add a domain ending, like example.com.",
      };
    }
    if (!labels.every((label) => LABEL.test(label))) {
      return {
        status: "error",
        message: "Domains can only use letters, numbers and hyphens.",
      };
    }
    const tld = labels.at(-1) ?? "";
    const known =
      /^[a-z]{2}$/.test(tld) || tld.startsWith("xn--") || COMMON_TLDS.has(tld);
    if (!known) {
      return {
        status: "warning",
        message: `“.${tld}” isn't a common domain ending. Check for typos before you print.`,
        url: toPayload(url, withScheme(value)),
        host,
      };
    }
  }

  return { status: "ok", url: toPayload(url, withScheme(value)), host };
}
