import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: "./vitest.setup.ts",
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/lib/codegen.ts"],
    },
  },
});
