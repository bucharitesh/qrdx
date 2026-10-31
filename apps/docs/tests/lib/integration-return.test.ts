// Where an integration's OAuth callback sends the browser back to: only a path
// on this site, never an open redirect (OWASP Unvalidated Redirects and
// Forwards). Browsers treat "\" like "/" and drop tabs and newlines, so those
// are rejected too, as is anything that only becomes "//host" once resolved.
import { describe, expect, it } from "vitest";
import {
  MAX_RETURN_PATH_LENGTH,
  returnUrl,
  safeReturnPath,
} from "@/lib/integration-return";

const SITE = "https://qrdx.dev/api/integrations/dub/callback?code=x&state=y";

describe("safeReturnPath", () => {
  it.each([
    ["/dashboard/codes?import=dub", "/dashboard/codes?import=dub"],
    ["/dashboard/codes?import=bitly", "/dashboard/codes?import=bitly"],
    ["/dashboard/codes?q=menu&import=dub", "/dashboard/codes?q=menu&import=dub"],
    ["/", "/"],
    ["/settings/integrations#dub", "/settings/integrations#dub"],
    // Dot segments resolve to a plain path on this site
    ["/dashboard/../dashboard/codes", "/dashboard/codes"],
    // Encoded slashes stay encoded: still one path on this site
    ["/%2F%2Fevil.com", "/%2F%2Fevil.com"],
  ])("keeps the same-site path %s", (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });

  it.each([
    // Other sites, in every spelling
    "https://evil.com",
    "http://evil.com/dashboard/codes",
    "javascript:alert(1)",
    "data:text/html,hi",
    "//evil.com",
    "//evil.com/dashboard/codes",
    "///evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "/dashboard\\..\\..\\evil.com",
    // Protocol-relative only after dot segments resolve
    "/.//evil.com",
    "/a/..//evil.com",
    // Whitespace and control characters browsers strip or reinterpret
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    " /dashboard/codes",
    "/dashboard codes",
    "/dash\u0000board",
    "/dash\u007fboard",
    // Not a path at all
    "dashboard/codes",
    "evil.com",
    "",
  ])("rejects %j", (input) => {
    expect(safeReturnPath(input)).toBeNull();
  });

  it("rejects anything that isn't a string", () => {
    for (const value of [null, undefined, 1, {}, ["/dashboard"], true]) {
      expect(safeReturnPath(value)).toBeNull();
    }
  });

  it("rejects paths longer than the cookie allows", () => {
    const path = `/dashboard/codes?q=${"a".repeat(MAX_RETURN_PATH_LENGTH)}`;
    expect(safeReturnPath(path)).toBeNull();
    expect(safeReturnPath(path.slice(0, MAX_RETURN_PATH_LENGTH))).toBe(
      path.slice(0, MAX_RETURN_PATH_LENGTH),
    );
  });
});

describe("returnUrl", () => {
  it("builds the redirect on the request's own origin", () => {
    const url = returnUrl("/dashboard/codes?import=dub", SITE);
    expect(url?.href).toBe("https://qrdx.dev/dashboard/codes?import=dub");
  });

  it("adds the callback's params without dropping the dialog's", () => {
    const url = returnUrl("/dashboard/codes?import=bitly", SITE, {
      connect_error: "access_denied",
    });
    expect(url?.origin).toBe("https://qrdx.dev");
    expect(url?.pathname).toBe("/dashboard/codes");
    expect(url?.searchParams.get("import")).toBe("bitly");
    expect(url?.searchParams.get("connect_error")).toBe("access_denied");
  });

  it("encodes param values instead of letting them rewrite the URL", () => {
    const url = returnUrl("/dashboard/codes?import=dub", SITE, {
      connect_error: "x&import=evil#//evil.com",
    });
    expect(url?.origin).toBe("https://qrdx.dev");
    expect(url?.searchParams.get("import")).toBe("dub");
    expect(url?.hash).toBe("");
  });

  it("returns null (fall back to Settings) for unsafe or missing paths", () => {
    for (const path of [
      null,
      undefined,
      "",
      "//evil.com",
      "/\\evil.com",
      "/.//evil.com",
      "https://evil.com/dashboard/codes",
    ]) {
      expect(returnUrl(path, SITE)).toBeNull();
    }
  });
});
