// Editor copy names only the providers this deployment offers, and a line
// whose list is empty is dropped.
import { describe, expect, it } from "vitest";
import {
  linkSourcesHint,
  listNames,
  sourcesHint,
} from "@/lib/availability-copy";
import { industries, placements } from "@/lib/seo-content";
import { topicForDeployment } from "@/lib/seo-content/availability";

const shortener = (name: string) => ({
  name,
  capability: "short-links" as const,
});
const picker = (name: string) => ({ name, capability: "files" as const });

describe("listNames", () => {
  it("joins one, two or more names", () => {
    expect(listNames([])).toBe("");
    expect(listNames(["Bitly"])).toBe("Bitly");
    expect(listNames(["Bitly", "Rebrandly"])).toBe("Bitly or Rebrandly");
    expect(listNames(["A", "B", "C"], "and")).toBe("A, B and C");
  });
});

describe("linkSourcesHint", () => {
  it("names every offered shortener and file picker", () => {
    expect(
      linkSourcesHint([
        shortener("Bitly"),
        shortener("Rebrandly"),
        shortener("Short.io"),
        picker("Dropbox"),
        picker("OneDrive"),
        picker("Box"),
        picker("Notion"),
      ]),
    ).toBe(
      "Shorten with Bitly, Rebrandly or Short.io, or pick a file from Dropbox, OneDrive, Box or Notion",
    );
  });

  it("names only what production offers", () => {
    expect(
      linkSourcesHint([
        shortener("Bitly"),
        shortener("Rebrandly"),
        shortener("Short.io"),
        picker("Dropbox"),
      ]),
    ).toBe(
      "Shorten with Bitly, Rebrandly or Short.io, or pick a file from Dropbox",
    );
  });

  it("drops the half with nothing in it, and the line when both are empty", () => {
    expect(linkSourcesHint([shortener("Bitly")])).toBe("Shorten with Bitly");
    expect(linkSourcesHint([picker("Dropbox")])).toBe(
      "Pick a file from Dropbox",
    );
    expect(linkSourcesHint([])).toBeNull();
  });
});

describe("sourcesHint", () => {
  it("names the offered sources, or drops the line", () => {
    expect(sourcesHint(["Stripe", "Shopify"])).toBe(
      "Pick from Stripe or Shopify",
    );
    expect(sourcesHint(["Cal.com"])).toBe("Pick from Cal.com");
    expect(sourcesHint([])).toBeNull();
  });
});

describe("industry and placement pages without custom domains", () => {
  const mentions =
    /\bcustom domains?\b|\bown domain\b|\bon your domain\b|\bdomain you own\b/i;
  const topics = [...industries.items, ...placements.items];

  it("keep everything where custom domains can be added", () => {
    for (const topic of topics) {
      expect(topicForDeployment(topic, { customDomains: true })).toBe(topic);
    }
  });

  it("never sell them in tips, FAQs, use cases or recommendations", () => {
    for (const topic of topics) {
      const shown = topicForDeployment(topic, { customDomains: false });
      const text = [
        ...shown.tips,
        ...shown.faqs.flatMap((faq) => [faq.question, faq.answer]),
        ...shown.useCases.flatMap((u) => [u.title, u.description]),
        ...shown.recommended.flatMap((r) => [
          r.why,
          "label" in r ? r.label : "",
        ]),
      ];
      for (const line of text) expect(line, topic.slug).not.toMatch(mentions);
      expect(shown.metaDescription, topic.slug).not.toMatch(/custom domain/i);
    }
  });

  it("keep the rest of a sentence list when one sentence mentions them", () => {
    const topic = industries.items.find((item) => item.slug === "real-estate");
    if (!topic) throw new Error("real-estate topic is missing");
    const shown = topicForDeployment(topic, { customDomains: false });
    expect(shown.recommended.length).toBe(topic.recommended.length);
    expect(shown.recommended.map((r) => r.why).join(" ")).toContain(
      "Repoint the same rider",
    );
  });
});
