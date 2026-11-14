// /qr-code-generator/pdf and /business-card (lib/qr-types-content-hosted.ts):
// codes that open a hosted page. Their slugs share the [type] route with the
// static types, their buttons start a real page type and template, and the
// limits they quote are the plan's.
import { describe, expect, it } from "vitest";
import { getTemplate } from "@/lib/landing/templates";
import { PLAN_LIMITS } from "@/lib/plans";
import { getQrType, QR_TYPE_SLUGS } from "@/lib/qr-types-content";
import {
  getHostedQrType,
  HOSTED_QR_TYPES,
  HOSTED_TYPE_SLUGS,
  hostedTypePath,
} from "@/lib/qr-types-content-hosted";
import { MAX_DESCRIPTION, MAX_TITLE } from "@/lib/seo-overrides";

describe("hosted QR code types", () => {
  it("don't clash with a static content type", () => {
    for (const slug of HOSTED_TYPE_SLUGS) {
      expect(QR_TYPE_SLUGS as readonly string[]).not.toContain(slug);
    }
    expect(getHostedQrType("constructor")).toBeUndefined();
    expect(hostedTypePath("pdf")).toBe("/qr-code-generator/pdf");
  });

  it.each(HOSTED_QR_TYPES.map((type) => [type.slug, type] as const))(
    "%s: fits the meta limits and starts a real page type and demo",
    (_slug, type) => {
      expect(type.title.length).toBeLessThanOrEqual(MAX_TITLE);
      expect(type.metaDescription.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
      const template = getTemplate(type.page);
      expect(template).toBeDefined();
      expect(template?.variants.map((variant) => variant.id)).toContain(
        type.demo,
      );
      for (const related of [type.compare.staticType, ...type.related]) {
        expect(getQrType(related), related).toBeDefined();
      }
    },
  );

  it("quotes the Free plan's own limits", () => {
    const free = PLAN_LIMITS.free;
    for (const type of HOSTED_QR_TYPES) {
      const answers = type.faqs.map((faq) => faq.answer).join(" ");
      expect(answers).toContain(`${free.landingPages} hosted pages`);
      expect(answers).toContain(`${free.dynamicCodes} dynamic codes`);
    }
    const pdf = getHostedQrType("pdf");
    expect(pdf?.metaDescription).toContain(
      `${free.maxFileBytes / 1024 / 1024} MB on Free`,
    );
  });

  it("are linked from the static type that does part of the job", () => {
    for (const type of HOSTED_QR_TYPES) {
      expect(getQrType(type.compare.staticType)?.hosted).toBe(type.slug);
    }
  });
});
