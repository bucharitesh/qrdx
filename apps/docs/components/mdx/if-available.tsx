import "server-only";

import defaultMdxComponents from "fumadocs-ui/mdx";
import type { ReactNode } from "react";
import {
  isFeatureAvailable,
  isPathAvailable,
} from "@/lib/feature-availability";
import type { FeatureId } from "@/lib/feature-availability-rules";
import { isIntegrationVisible } from "@/lib/integration-availability";

const H2 = defaultMdxComponents.h2;

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Docs content for a feature, page or integration this deployment may not
 * offer (lib/feature-availability-rules.ts): rendered only where it works.
 * A section heading goes in `title`, so the table of contents never links a
 * hidden section (such a section isn't listed in it either).
 */
export function IfAvailable({
  feature,
  path,
  integration,
  title,
  children,
}: {
  feature?: FeatureId;
  path?: string;
  integration?: string;
  title?: string;
  children: ReactNode;
}) {
  const shown =
    (!feature || isFeatureAvailable(feature)) &&
    (!path || isPathAvailable(path)) &&
    (!integration || isIntegrationVisible(integration));
  if (!shown) return null;
  return (
    <>
      {title && H2 && <H2 id={slugify(title)}>{title}</H2>}
      {children}
    </>
  );
}
