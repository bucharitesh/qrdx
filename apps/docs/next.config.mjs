import { config, withAnalyzer } from "@repo/next-config";
import { createMDX } from "fumadocs-mdx/next";

let nextConfig = {
  ...config,
  reactStrictMode: true,
  serverExternalPackages: [
    "ts-morph",
    "typescript",
    "oxc-transform",
    "twoslash",
    "shiki",
    "@takumi-rs/core",
  ],
  async rewrites() {
    return [
      {
        source: "/docs/:path*.mdx",
        destination: "/llms.mdx/:path*",
      },
    ];
  },
};

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

const withMDX = createMDX();

export default withAnalyzer(withMDX(config));
