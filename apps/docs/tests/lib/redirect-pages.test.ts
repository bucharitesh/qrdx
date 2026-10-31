// What a visitor gets from a dynamic code that has ended or is gated: the
// right HTTP status (RFC 9110: 410 Gone for content that is permanently gone),
// a page that can't be indexed, cached or framed, and no way for a slug or
// owner-controlled text to inject markup (OWASP output encoding).
import { describe, expect, it } from "vitest";
import type { EndedReason } from "@/lib/redirect/lifecycle";
import {
  endedPage,
  escapeHtml,
  neutralPage,
  reportAbuseUrl,
} from "@/lib/redirect/pages";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("leaves other text, including unicode, untouched", () => {
    expect(escapeHtml("Café 😀 50% off")).toBe("Café 😀 50% off");
  });
});

describe("endedPage", () => {
  it.each<[EndedReason, number]>([
    ["expired", 410],
    ["scan-limit", 410],
    ["paused", 410],
    ["not-started", 403],
  ])("%s answers %i", async (reason, status) => {
    const response = endedPage(reason, "abc123");
    expect(response.status).toBe(status);
    const html = await response.text();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("Report abuse");
  });

  it("is never cached, indexed, framed or allowed to run scripts", () => {
    const { headers } = endedPage("expired");
    expect(headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(headers.get("Cache-Control")).toBe("no-store");
    expect(headers.get("X-Robots-Tag")).toBe("noindex");
    const csp = headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src/);
  });
});

describe("neutralPage", () => {
  it("escapes the title and a hostile slug in the report link", async () => {
    const html = await neutralPage({
      status: 200,
      title: "<img src=x onerror=alert(1)>",
      body: "<p>ok</p>",
      slug: '"><script>alert(1)</script>',
    }).text();
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });
});

describe("reportAbuseUrl", () => {
  it("prefills the slug as an encoded query parameter", () => {
    const url = new URL(reportAbuseUrl("a b&c"));
    expect(url.pathname).toBe("/report-abuse");
    expect(url.searchParams.get("slug")).toBe("a b&c");
  });

  it("links to the plain form without a slug", () => {
    expect(new URL(reportAbuseUrl()).search).toBe("");
  });
});
