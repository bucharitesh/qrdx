// The PDF block frames only PDFs QRdx stores; every other link gets the
// "Open PDF" button (lib/files/pdf-frame.ts).
import { describe, expect, it } from "vitest";
import { canFramePdf, isHostedPdfUrl } from "@/lib/files/pdf-frame";

const STORAGE = ["https://assets.qrdx.dev"];
const ID = "cmvwdh3f80000d2cfbvda2bl3";

describe("canFramePdf", () => {
  it("frames files uploaded to QRdx", () => {
    expect(canFramePdf({ type: "file", fileId: ID, name: "menu.pdf" })).toBe(
      true,
    );
  });

  it("frames PDF links into QRdx's public storage", () => {
    expect(
      canFramePdf(
        { type: "url", url: `https://assets.qrdx.dev/u-user1/${ID}/menu.pdf` },
        STORAGE,
      ),
    ).toBe(true);
    // The app's own stable file link (as the editor preview builds it).
    expect(isHostedPdfUrl(`/api/files/${ID}`, STORAGE)).toBe(true);
    expect(
      isHostedPdfUrl(`http://localhost:3000/api/files/${ID}`, STORAGE),
    ).toBe(true);
    // Sample PDFs the app ships for template demos.
    expect(
      isHostedPdfUrl(
        "http://localhost:3000/samples/product-guide.pdf",
        STORAGE,
      ),
    ).toBe(true);
    expect(isHostedPdfUrl("/samples/../api/x.pdf", STORAGE)).toBe(false);
  });

  it("never frames other sites, even when the link ends in .pdf", () => {
    for (const url of [
      "https://cdn.example/menu.pdf",
      "https://evil.example/login",
      "http://assets.qrdx.dev/u-user1/x/menu.pdf",
      "https://assets.qrdx.dev.evil.example/menu.pdf",
      "https://user:pass@assets.qrdx.dev/menu.pdf",
      "javascript:alert(1)",
      "data:application/pdf;base64,JVBERi0=",
    ]) {
      expect(canFramePdf({ type: "url", url }, STORAGE), url).toBe(false);
    }
  });

  it("never frames unchecked or quarantined storage objects, or non-PDFs", () => {
    for (const key of [
      `staging/u-user1/${ID}/menu.pdf`,
      `quarantine/abc/u-user1/${ID}/menu.pdf`,
      `u-user1/${ID}/photo.jpg`,
    ]) {
      expect(isHostedPdfUrl(`https://assets.qrdx.dev/${key}`, STORAGE)).toBe(
        false,
      );
    }
    expect(isHostedPdfUrl("/api/files/../../etc/passwd", STORAGE)).toBe(false);
    expect(isHostedPdfUrl("/api/other/route", STORAGE)).toBe(false);
  });

  it("frames nothing without a source", () => {
    expect(canFramePdf(null)).toBe(false);
    expect(canFramePdf(undefined)).toBe(false);
  });
});
