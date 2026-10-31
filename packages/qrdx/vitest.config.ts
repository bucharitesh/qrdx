import type { ViteUserConfig } from "vitest/config";

const config: ViteUserConfig = {
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 30_000,
  },
};

export default config;
