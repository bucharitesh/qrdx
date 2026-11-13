import type { ViteUserConfig } from "vitest/config";

const config: ViteUserConfig = {
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    environment: "node",
    // Vitest keeps its module cache in node_modules/.vitest-cache at the
    // workspace root, shared by every package by default. The pre-push hook
    // runs several packages' tests at once and they cleared it under each
    // other (ENOTEMPTY), so each package keeps its own.
    fsModuleCachePath: `${import.meta.dirname}/node_modules/.vitest-cache`,
    include: ["tests/**/*.test.{ts,tsx}"],
    testTimeout: 30_000,
  },
};

export default config;
