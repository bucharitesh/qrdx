import type { ViteUserConfig } from "vitest/config";

// *.dom.test.ts files run against frameworks' browser builds: solid-js and
// solid-js/web resolve to their server builds under Node's conditions, so
// these tests resolve with the "browser" condition, and solid-js is inlined
// so the test, the adapter and solid-js/web share one copy of it.
const DOM_TESTS = "tests/**/*.dom.test.{ts,tsx}";

const config: ViteUserConfig = {
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  test: {
    testTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: "qrdx",
          environment: "node",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: [DOM_TESTS],
        },
      },
      {
        extends: true,
        resolve: { conditions: ["browser"] },
        test: {
          name: "dom",
          include: [DOM_TESTS],
          environment: "jsdom",
          server: { deps: { inline: [/solid-js/] } },
        },
      },
    ],
  },
};

export default config;
