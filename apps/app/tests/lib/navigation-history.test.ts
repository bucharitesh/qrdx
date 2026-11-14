import { describe, expect, it } from "vitest";
import { createNavigationHistory } from "@/lib/navigation-history";
import { handoffSource } from "@/lib/playground-links";

const ORIGIN = "https://qrdx.dev";
const sourceAfter = (pages: string[], current: string) => {
  const history = createNavigationHistory();
  for (const page of pages) history.record(page);
  const previous = history.previous(current);
  return handoffSource(previous ? `${ORIGIN}${previous}` : "", ORIGIN);
};

describe("navigation history", () => {
  it("names the page before the playground, whether or not the playground is recorded yet", () => {
    // Effects run children first, so the playground may ask before or after
    // the recorder has seen /playground.
    expect(sourceAfter(["/qr-codes-for/restaurants"], "/playground")).toBe(
      "qr-codes-for",
    );
    expect(
      sourceAfter(["/qr-codes-for/restaurants", "/playground"], "/playground"),
    ).toBe("qr-codes-for");
  });

  it("keeps the latest page only", () => {
    expect(
      sourceAfter(["/", "/compare/bitly-qr", "/playground"], "/playground"),
    ).toBe("compare");
    expect(
      sourceAfter(
        ["/playground", "/qr-code-generator/wifi", "/playground"],
        "/playground",
      ),
    ).toBe("qr-code-generator");
  });

  it("has nothing on the tab's first page, so the document's referrer decides", () => {
    expect(createNavigationHistory().previous("/playground")).toBeNull();
    const history = createNavigationHistory();
    history.record("/playground");
    expect(history.previous("/playground")).toBeNull();
  });

  it("records pathnames only, once per page", () => {
    const history = createNavigationHistory();
    history.record("/docs");
    history.record("/docs");
    history.record("https://evil.example/x");
    history.record("");
    expect(history.previous("/playground")).toBe("/docs");
    history.record("/blog/introducing-qrdx");
    expect(history.previous("/blog/introducing-qrdx")).toBe("/docs");
  });
});
