import type { MetadataRoute } from "next";
import {
  AI_CRAWLERS,
  DISALLOW,
  SEARCH_CRAWLERS,
} from "@/lib/agents/robots-rules";
import { baseUrl } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: ["*", ...SEARCH_CRAWLERS, ...AI_CRAWLERS].map((userAgent) => ({
      userAgent,
      allow: "/",
      disallow: DISALLOW,
    })),
    sitemap: new URL("/sitemap.xml", baseUrl).toString(),
  };
}
