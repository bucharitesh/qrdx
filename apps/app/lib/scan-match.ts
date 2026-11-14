// Does a decoded QR code say what the editor encodes? The photo check
// (components/editor/photo-scan-dialog.tsx) passes the editor's value to the
// scan checker as `expected`, and the checker compares it with what it read
// from the photo. Pure, so the tests pin exactly what counts as a match.
//
// What counts as a match: the two texts are equal after matchKey.
// - Any text: leading and trailing whitespace is ignored and Windows line
//   endings count as \n. Everything else must be identical, case included,
//   because Wi-Fi names, passwords and other content are case-sensitive.
// - Web addresses (http and https): compared as parsed addresses. The scheme
//   and host ignore case, a default port (:80, :443) and an empty `?` or `#`
//   are dropped, and percent escapes ignore case (%2f = %2F). One trailing
//   slash on the path is ignored (acme.com/menu/ = acme.com/menu, and
//   acme.com = acme.com/). The path, query and fragment otherwise keep their
//   case and order, since servers treat /Menu and /menu as different pages.
//   http and https are different links, and so are www.acme.com and acme.com.

/** `text` as an http(s) address, or null. */
export function asWebLink(text: string): URL | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url : null;
}

const upperEscapes = (text: string) =>
  text.replace(/%[0-9a-f]{2}/gi, (hex) => hex.toUpperCase());

/** The form two texts are compared in (see the rules above). */
export function matchKey(text: string): string {
  const trimmed = text.replace(/\r\n?/g, "\n").trim();
  const url = asWebLink(trimmed);
  if (!url) return trimmed;
  const path =
    url.pathname.length > 1 && url.pathname.endsWith("/")
      ? url.pathname.slice(0, -1)
      : url.pathname;
  const auth =
    url.username || url.password
      ? `${url.username}${url.password ? `:${url.password}` : ""}@`
      : "";
  return upperEscapes(
    `${url.protocol}//${auth}${url.host}${path}${url.search}${url.hash}`,
  );
}

export interface DecodedMatch {
  /** The photo holds what the design encodes. */
  matches: boolean;
  /** The decoded text is an http(s) address. */
  decodedIsLink: boolean;
  /** The design's text is an http(s) address. */
  expectedIsLink: boolean;
}

/** Compares the text decoded from a photo with the text a design encodes. */
export function compareDecoded(
  decoded: string,
  expected: string,
): DecodedMatch {
  return {
    matches: matchKey(decoded) === matchKey(expected),
    decodedIsLink: asWebLink(decoded) !== null,
    expectedIsLink: asWebLink(expected) !== null,
  };
}
