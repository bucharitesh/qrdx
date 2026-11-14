// A workspace logo's <img> only loads an https URL, a path on this site or a
// data:image/ URL (lib/workspace-logo.ts logoImageSrc). Anything else that
// got stored (a javascript: URL, plain http to another site, a
// protocol-relative URL) shows the initial letter instead.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceAvatar } from "@/components/workspaces/workspace-avatar";
import { logoImageSrc } from "@/lib/workspace-logo";

const UPLOAD_PATH = "/api/workspace-logos/org_1/abcdefghijklmnop.png";
const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("logoImageSrc", () => {
  it("keeps https URLs, paths on this site and data:image/ URLs", () => {
    expect(logoImageSrc("https://cdn.example.com/logo.png")).toBe(
      "https://cdn.example.com/logo.png",
    );
    expect(logoImageSrc(`https://qrdx.dev${UPLOAD_PATH}`)).toBe(
      `https://qrdx.dev${UPLOAD_PATH}`,
    );
    expect(logoImageSrc(UPLOAD_PATH)).toBe(UPLOAD_PATH);
    expect(logoImageSrc("/logo.png?v=2#x")).toBe("/logo.png?v=2#x");
    expect(logoImageSrc(PNG)).toBe(PNG);
    expect(logoImageSrc("DATA:image/webp;base64,UklGR")).toBe(
      "DATA:image/webp;base64,UklGR",
    );
  });

  it("turns an upload saved over plain http (local development) into its path", () => {
    expect(logoImageSrc(`http://localhost:3000${UPLOAD_PATH}`)).toBe(
      UPLOAD_PATH,
    );
  });

  it("refuses everything else", () => {
    for (const logo of [
      null,
      undefined,
      "",
      "javascript:alert(1)",
      "JavaScript:alert(document.domain)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "data:image",
      "vbscript:msgbox(1)",
      "blob:https://qrdx.dev/0d9f",
      "http://evil.example/logo.png",
      // http to a path that only looks like an upload
      "http://evil.example/api/workspace-logos/org_1/not-a-logo.svg",
      "http://evil.example/api/workspace-logos/org_1/abcdefghijklmnop.png/x",
      "ftp://evil.example/logo.png",
      "//evil.example/logo.png",
      "/\\evil.example/logo.png",
      "/\t/evil.example/logo.png",
      "logo.png",
      "https://",
    ]) {
      expect(logoImageSrc(logo), String(logo)).toBeNull();
    }
  });
});

describe("WorkspaceAvatar", () => {
  const html = (logo: string | null) =>
    renderToStaticMarkup(<WorkspaceAvatar logo={logo} name="Acme" />);

  it("renders a safe logo as an image", () => {
    expect(html("https://cdn.example.com/logo.png")).toContain(
      'src="https://cdn.example.com/logo.png"',
    );
    expect(html(`http://localhost:3000${UPLOAD_PATH}`)).toContain(
      `src="${UPLOAD_PATH}"`,
    );
  });

  it("shows the initial, with no image, for an unsafe logo", () => {
    for (const logo of [
      "javascript:alert(1)",
      "http://evil.example/logo.png",
      "//evil.example/logo.png",
      "data:text/html,<b>x</b>",
    ]) {
      const markup = html(logo);
      expect(markup, logo).not.toContain("<img");
      expect(markup, logo).toContain(">A</span>");
    }
  });
});
