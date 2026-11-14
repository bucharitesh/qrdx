import "server-only";

import type { FeatureId } from "@repo/availability";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { ReactNode } from "react";
import {
  isFeatureAvailable,
  isPathAvailable,
} from "@/lib/feature-availability";
import { isIntegrationVisible } from "@/lib/integration-availability";

const H2 = defaultMdxComponents.h2;

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Docs content for a feature, page or integration this deployment may not
 * offer (packages/availability/rules.ts): rendered only where it works.
 * A section heading goes in `title`, so the table of contents never links a
 * hidden section (such a section isn't listed in it either). Translations
 * keep the English anchor in `id`, so links to `#section` still land.
 * `unavailable` flips it: content that's only true until the feature is on.
 */
export function IfAvailable({
  feature,
  path,
  integration,
  unavailable = false,
  title,
  id,
  children,
}: {
  feature?: FeatureId;
  path?: string;
  integration?: string;
  /** Render only where the feature, page or integration is NOT offered. */
  unavailable?: boolean;
  title?: string;
  /** The heading's anchor, when it isn't the slug of `title`. */
  id?: string;
  children: ReactNode;
}) {
  const available =
    (!feature || isFeatureAvailable(feature)) &&
    (!path || isPathAvailable(path)) &&
    (!integration || isIntegrationVisible(integration));
  if (available === unavailable) return null;
  return (
    <>
      {title && H2 && <H2 id={id ?? slugify(title)}>{title}</H2>}
      {children}
    </>
  );
}
