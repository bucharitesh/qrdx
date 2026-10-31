import type { MetadataRoute } from "next";
import { baseUrl } from "@/lib/metadata";

const crawlers = [
  "*",
  "Googlebot",
  "Bingbot",
  "GPTBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
  "anthropic-ai",
  "Applebot",
  "DuckDuckBot",
];

// Crawlers obey only their most specific group, so every group repeats the disallow list.
const disallow = [
  "/api/",
  "/admin",
  "/settings",
  "/oauth",
  "/dashboard",
  "/invite",
  "/q/",
  "/m/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: crawlers.map((userAgent) => ({ userAgent, allow: "/", disallow })),
    sitemap: new URL("/sitemap.xml", baseUrl).toString(),
  };
}
