import type { MetadataRoute } from "next";

// Only fetched on the docs site's own host (docs.qrdx.dev), which nobody
// should index: readers reach the docs through qrdx.dev, which proxies them
// here and answers /robots.txt from the main app. The pages' canonical links
// point at qrdx.dev either way.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
