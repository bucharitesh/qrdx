// lib/metadata.ts's baseUrl: absolute URLs (canonical, Open Graph, template
// and sample images) point at the dev server's own NEXT_PUBLIC_APP_URL in
// development, whatever its port, and production keeps its old rules.
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEV_BASE_URL, resolveBaseUrl } from "@/lib/metadata";

const none = {
  devAppUrl: undefined,
  appUrl: undefined,
  productionUrl: undefined,
};

describe("resolveBaseUrl", () => {
  it("is the dev server's NEXT_PUBLIC_APP_URL in development", () => {
    const url = resolveBaseUrl({
      ...none,
      nodeEnv: "development",
      devAppUrl: "http://localhost:3097",
      appUrl: "http://localhost:3097",
      productionUrl: "qrdx.dev",
    });
    expect(url.href).toBe("http://localhost:3097/");
  });

  it("falls back to localhost:3000 in development", () => {
    expect(DEV_BASE_URL).toBe("http://localhost:3000");
    for (const devAppUrl of [undefined, ""]) {
      expect(
        resolveBaseUrl({ ...none, nodeEnv: "development", devAppUrl }).href,
      ).toBe("http://localhost:3000/");
    }
  });

  it("keeps production's rules: Vercel's domain, then the app URL, then qrdx.dev", () => {
    for (const nodeEnv of ["production", "test", undefined]) {
      expect(
        resolveBaseUrl({
          ...none,
          nodeEnv,
          devAppUrl: "http://localhost:3097",
          appUrl: "https://preview.example.com",
          productionUrl: "qrdx.dev",
        }).href,
      ).toBe("https://qrdx.dev/");
      expect(
        resolveBaseUrl({
          ...none,
          nodeEnv,
          appUrl: "https://self-hosted.example.com",
        }).href,
      ).toBe("https://self-hosted.example.com/");
      expect(resolveBaseUrl({ ...none, nodeEnv }).href).toBe(
        "https://qrdx.dev/",
      );
    }
  });
});

describe("a dev server on another port", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("links canonical URLs, template photos and samples to itself", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3097");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.resetModules();
    const { baseUrl, createMetadata } = await import("@/lib/metadata");
    const { templateMediaUrl } = await import("@/lib/landing/templates/media");
    expect(baseUrl.origin).toBe("http://localhost:3097");
    expect(templateMediaUrl("cafe.webp")).toBe(
      "http://localhost:3097/images/templates/cafe.webp",
    );
    const metadata = createMetadata({ title: "Pricing", path: "/pricing" });
    expect(metadata.alternates?.canonical).toBe(
      "http://localhost:3097/pricing",
    );
  });

  it("stays on the production domain outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3097");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "qrdx.dev");
    vi.resetModules();
    const { baseUrl } = await import("@/lib/metadata");
    expect(baseUrl.href).toBe("https://qrdx.dev/");
  });
});
