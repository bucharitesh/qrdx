import { config, withAnalyzer } from "@repo/next-config";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import { env } from "@/env";

type Rewrites = Awaited<ReturnType<NonNullable<NextConfig["rewrites"]>>>;
type RewritePhases = Required<Exclude<Rewrites, unknown[]>>;

// A plain array is shorthand for `afterFiles`.
const toRewritePhases = (rewrites: Rewrites = []): RewritePhases =>
  Array.isArray(rewrites)
    ? { beforeFiles: [], afterFiles: rewrites, fallback: [] }
    : {
        beforeFiles: rewrites.beforeFiles ?? [],
        afterFiles: rewrites.afterFiles ?? [],
        fallback: rewrites.fallback ?? [],
      };

let nextConfig: NextConfig = {
  ...config,
  // Opt-in for Docker / self-hosting: NEXT_OUTPUT=standalone pnpm build
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  reactStrictMode: true,
  // Logos are sent as data URLs (≤1MB file ≈ 1.37MB base64) through server actions.
  experimental: {
    ...config.experimental,
    serverActions: { bodySizeLimit: "2mb" },
  },
  serverExternalPackages: [
    "ts-morph",
    "typescript",
    "oxc-transform",
    "twoslash",
    "shiki",
    "@takumi-rs/core",
  ],
  // Keep the shared rewrites (PostHog /ingest proxy) alongside the docs ones.
  async rewrites() {
    const base = toRewritePhases(await config.rewrites?.());
    return {
      ...base,
      afterFiles: [
        ...base.afterFiles,
        {
          source: "/docs/:path*.mdx",
          destination: "/llms.mdx/:path*",
        },
      ],
    };
  },
};

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

const withMDX = createMDX();

export default withMDX(nextConfig);
