// Canonical, hreflang and Open Graph URLs point at qrdx.dev, where readers
// reach the docs, never at the docs site's own domain.
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("baseUrl", () => {
  it("is NEXT_PUBLIC_APP_URL, whatever the project's own domain is", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://qrdx.dev");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "docs.qrdx.dev");
    const { baseUrl } = await import("@/lib/metadata");
    expect(baseUrl.origin).toBe("https://qrdx.dev");
  });

  it("is the main app's dev server under next dev", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { baseUrl } = await import("@/lib/metadata");
    expect(baseUrl.origin).toBe("http://localhost:3000");
  });
});
